"""
engines/tts.py — Kokoro TTS v1.0  |  Production-Hardened v6.3
==============================================================

v6.1 changes (voice registry update):
  - Removed adult voices bm_george and bf_emma.
  - Added two new kid voices: bm_daniel (kid_boy_2) and bf_lily (kid_girl_2).
  - bm_harry renamed to bm_lewis (correct voice key for voices-v1.0.bin).
  - DEFAULT_VOICE_KEY updated to "am_echo".
  - Per-voice locks added: different voices synthesize concurrently.
  - _validate_voice_registry() updated for new 7-voice set.

13 selected solo voices:
  ┌────────────────┬───────┬────────┬───────┬────────────────────────────────────┐
  │ Voice key      │ Gender│ Accent │ Speed │ Character                          │
  ├────────────────┼───────┼────────┼───────┼────────────────────────────────────┤
  │ bm_lewis       │ M     │ en-gb  │ 1.28  │ Kid boy — fast, bright, energetic  │
  │ bf_alice       │ F     │ en-gb  │ 1.20  │ Kid girl — bold, clear, energetic  │
  │ am_puck        │ M     │ en-us  │ 1.08  │ Young male — lively, upbeat        │
  │ bf_isabella    │ F     │ en-gb  │ 0.96  │ Young female — soft, measured      │
  │ bm_daniel      │ M     │ en-gb  │ 1.15  │ Kid boy 2 — bright, curious        │
  │ bf_lily        │ F     │ en-gb  │ 1.05  │ Kid girl 2 — soft, sweet           │
  │ am_echo        │ M     │ en-us  │ 0.84  │ Expressive narrator — deliberate   │
  │ af_nova        │ F     │ en-us  │ 1.10  │ American girl — warm, smooth       │
  │ af_sky         │ F     │ en-us  │ 1.15  │ American girl — bright, airy       │
  │ af_bella       │ F     │ en-us  │ 0.95  │ American girl — rich, expressive   │
  └────────────────┴───────┴────────┴───────┴────────────────────────────────────┘
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import threading
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from utils.config import settings
import numpy as np

try:
    import soundfile as _sf
    _SOUNDFILE_AVAILABLE = True
except ImportError:
    _SOUNDFILE_AVAILABLE = False

logger = logging.getLogger(__name__)
_ENGINE_DIR = Path(__file__).parent


# ─────────────────────────────────────────────────────────────────────────────
# ENGINE CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class KokoroEngineConfig:
    """
    Immutable configuration constants for the Kokoro TTS engine.
    All values are tuned for 24 kHz mono PCM output.
    """
    # Audio
    SAMPLE_RATE: int            = 24_000
    WAV_HEADER_BYTES: int       = 44
    MAX_AUDIO_SAMPLES: int      = 24_000 * 600      # 10 minutes hard cap

    # Cache
    CACHE_VERSION: str          = "v6.8"            # bumped — INTER_CHUNK_MS 400→250, MIN_WORD_MS 30→80
    CACHE_MAX_AGE_DAYS: int     = 7                 # WAV files older than this are deleted on startup
    CACHE_MAX_SIZE_MB: int      = 2048              # 2GB hard cap — deletes oldest files if exceeded
    CACHE_DIR_ENV: str          = "KOKORO_CACHE_DIR"

    # Model file resolution
    MODEL_PATH_ENV: str         = "KOKORO_MODEL_PATH"
    VOICES_PATH_ENV: str        = "KOKORO_VOICES_PATH"
    DEFAULT_MODEL_FILENAME: str = "kokoro-v1.0.onnx"
    DEFAULT_VOICES_FILENAME: str= "voices-v1.0.bin"
    MODEL_LOAD_TIMEOUT_S: int   = 30

    # Speed / rate clamping
    SYNTHESIS_SPEED_MIN: float  = 0.5
    SYNTHESIS_SPEED_MAX: float  = 2.0
    RATE_MULTIPLIER_MIN: float  = 0.5
    RATE_MULTIPLIER_MAX: float  = 1.5

    # Word timestamp quality
    MIN_WORD_DURATION_MS: int   = 80    # aligned with MIN_WORD_MS in main_prod.py
    MIN_WORD_GAP_MS: int        = 20
    SENTENCE_FINAL_WORD_BOOST: float = 1.3

    # Fallback WPM (used when synthesis fails)
    FALLBACK_WPM: int           = 160
    FALLBACK_MIN_DURATION_MS: int = 500

    # VAD (energy-based timestamp alignment)
    VAD_FRAME_MS: int           = 5
    VAD_MIN_SPEECH_SEGMENT_MS: int  = 25
    VAD_MIN_SILENCE_GAP_MS: int     = 20
    VAD_ONSET_ENERGY_RATIO: float   = 0.08
    VAD_OFFSET_ENERGY_RATIO: float  = 0.50
    VAD_MIN_SEGMENT_TO_WORD_RATIO: float = 0.6
    VAD_MAX_SEGMENT_TO_WORD_RATIO: float = 2.5
    VAD_P95_ENERGY_FLOOR: float     = 1e-6

    # Espeak phoneme alignment
    ESPEAK_SUBPROCESS_TIMEOUT_S: int    = 6
    ESPEAK_CENTISECOND_THRESHOLD: int   = 15
    ESPEAK_CENTISECOND_MULTIPLIER: int  = 10

    # Input validation
    MAX_INPUT_CHARS: int        = 4_000
    MAX_INPUT_WORDS: int        = 500

    # Amplitude normalisation
    SILENT_AMPLITUDE_THRESHOLD: float  = 1e-6
    LOW_AMPLITUDE_THRESHOLD: float     = 0.05
    TARGET_NORMALISED_AMPLITUDE: float = 0.85


ENGINE_CONFIG = KokoroEngineConfig()


# ─────────────────────────────────────────────────────────────────────────────
# VOICE REGISTRY — 7 SOLO VOICES ONLY
# ─────────────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class SoloVoiceDefinition:
    """
    Defines a single pure Kokoro base voice.
    No blend field — every voice is a solo model voice with zero mixing.
    """
    kokoro_voice_id: str    # Kokoro model's internal voice identifier
    display_label: str      # Human-readable name
    description: str        # Character and use-case summary
    gender: str             # "M" or "F"
    language_code: str      # BCP-47 language tag used by Kokoro (e.g. "en-gb")
    synthesis_speed: float  # Base synthesis speed multiplier
    target_wpm: int         # WPM rate this speed was tuned for
    pitch_shift_semitones: float = 0.0  # 0=none; +2/+3 = child voice effect


# 7 unique pure solo Kokoro base voices.
# Selected for maximum acoustic differentiation across:
#   accent (en-gb vs en-us), gender, speed, timbre, and register.
VOICE_REGISTRY: Dict[str, SoloVoiceDefinition] = {

    # ── Kid voices ────────────────────────────────────────────────────────────

    "bm_lewis": SoloVoiceDefinition(
        kokoro_voice_id = "bm_lewis",
        display_label   = "Lewis",
        description     = "Kid boy — British, fast, bright and energetic",
        gender          = "M",
        language_code   = "en-gb",
        synthesis_speed = 1.28,     # Fastest voice — maximum youthful energy
        target_wpm      = 170,

    ),

    "bf_alice": SoloVoiceDefinition(
        kokoro_voice_id = "bf_alice",
        display_label   = "Alice",
        description     = "Kid girl — British, bold, clear and expressive",
        gender          = "F",
        language_code   = "en-gb",
        synthesis_speed = 1.20,     # Kid girl — energetic and expressive
        target_wpm      = 168,

    ),

    # ── Young voices (mid-fast speeds → lively but not child-like) ───────────

    "am_puck": SoloVoiceDefinition(
        kokoro_voice_id = "am_puck",
        display_label   = "Puck",
        description     = "Young male — American, lively, upbeat and casual",
        gender          = "M",
        language_code   = "en-us",
        synthesis_speed = 1.08,     # American accent clearly differentiates from bf_alice (en-gb)
        target_wpm      = 160,
    ),

    "bf_isabella": SoloVoiceDefinition(
        kokoro_voice_id = "bf_isabella",
        display_label   = "Isabella",
        description     = "Young female — British, soft, warm and articulate",
        gender          = "F",
        language_code   = "en-gb",
        synthesis_speed = 0.96,     # Slower than bf_alice (1.20) — clearly more measured
        target_wpm      = 160,
    ),

    # ── Kid voices 2 (additional variety) ────────────────────────────────────

    "bm_daniel": SoloVoiceDefinition(
        kokoro_voice_id = "bm_daniel",
        display_label   = "Daniel",
        description     = "Kid boy 2 — British, bright, curious and gentle",
        gender          = "M",
        language_code   = "en-gb",
        synthesis_speed = 1.15,     # Between bm_lewis (1.28) and am_puck (1.08)
        target_wpm      = 165,

    ),

    "bf_lily": SoloVoiceDefinition(
        kokoro_voice_id = "bf_lily",
        display_label   = "Lily",
        description     = "Kid girl 2 — British, soft, sweet and expressive",
        gender          = "F",
        language_code   = "en-gb",
        synthesis_speed = 1.05,     # Softer and slightly slower than bf_alice (1.20)
        target_wpm      = 158,

    ),

    # ── Expressive narrator (slowest speed → maximum weight and expression) ───

    "am_echo": SoloVoiceDefinition(
        kokoro_voice_id = "am_echo",
        display_label   = "Echo",
        description     = (
            "Expressive narrator — American, calm, deliberate and bold. "
            "Designed for high-impact moments: reactions (Oops! / Correct! / Well done!), "
            "welcome messages, prompts, and UI moments where expression matters most."
        ),
        gender          = "M",
        language_code   = "en-us",
        synthesis_speed = 0.84,     # Slowest of all 7 — maximum deliberateness and punch
        target_wpm      = 160,
    ),

    # ── Child-like voices (af_nicole, af_sarah, am_fenrir — best kid sound) ────

    "af_nicole": SoloVoiceDefinition(
        kokoro_voice_id = "af_nicole",
        display_label   = "Nicole",
        description     = "Child girl — American, soft, sweet and youthful",
        gender          = "F",
        language_code   = "en-us",
        synthesis_speed = 1.20,
        target_wpm      = 160,

    ),

    "af_sarah": SoloVoiceDefinition(
        kokoro_voice_id = "af_sarah",
        display_label   = "Sarah",
        description     = "Child girl — American, clear, bright and playful",
        gender          = "F",
        language_code   = "en-us",
        synthesis_speed = 1.20,
        target_wpm      = 160,

    ),

    "am_fenrir": SoloVoiceDefinition(
        kokoro_voice_id = "am_fenrir",
        display_label   = "Fenrir",
        description     = "Child boy — American, energetic, lively and fun",
        gender          = "M",
        language_code   = "en-us",
        synthesis_speed = 1.20,
        target_wpm      = 160,
    ),

    # ── Pitched child voices (+3 semitones — truest child sound) ─────────────

    "af_sky_child": SoloVoiceDefinition(
        kokoro_voice_id       = "af_sky",       # af_sky — brightest, clearest female in v1.0
        display_label         = "Nicole Child",
        description           = "Child girl — af_sky +2 semitones, bright clear child sound",
        gender                = "F",
        language_code         = "en-us",
        synthesis_speed       = 1.20,
        target_wpm            = 160,
        pitch_shift_semitones = 2.0,            # +2 — natural child feel without chipmunk
    ),

    # ── American female voices ────────────────────────────────────────────────

    "af_nova": SoloVoiceDefinition(
        kokoro_voice_id = "af_nova",
        display_label   = "Nova",
        description     = "American female — warm, smooth and engaging",
        gender          = "F",
        language_code   = "en-us",
        synthesis_speed = 1.10,
        target_wpm      = 160,
    ),

    "af_sky": SoloVoiceDefinition(
        kokoro_voice_id = "af_sky",
        display_label   = "Sky",
        description     = "American female — bright, airy and upbeat",
        gender          = "F",
        language_code   = "en-us",
        synthesis_speed = 1.15,
        target_wpm      = 162,
    ),

    "af_bella": SoloVoiceDefinition(
        kokoro_voice_id = "af_bella",
        display_label   = "Bella",
        description     = "American female — rich, expressive and natural",
        gender          = "F",
        language_code   = "en-us",
        synthesis_speed = 0.95,
        target_wpm      = 158,
    ),
}

# Default fallback voice when an unknown voice key is requested
DEFAULT_VOICE_KEY = "am_echo"

# Flat dict for external consumers (e.g. API /voices endpoint)
VOICES: Dict[str, dict] = {
    key: {
        "id":          voice.kokoro_voice_id,
        "label":       voice.display_label,
        "desc":        voice.description,
        "gender":      voice.gender,
        "lang":        voice.language_code,
        "speed":       voice.synthesis_speed,
        "target_wpm":  voice.target_wpm,
    }
    for key, voice in VOICE_REGISTRY.items()
}

# Keep old name for any external code that imported DEFAULT_VOICE
DEFAULT_VOICE = DEFAULT_VOICE_KEY


# ─────────────────────────────────────────────────────────────────────────────
# VOICE REGISTRY VALIDATION
# ─────────────────────────────────────────────────────────────────────────────

def _validate_voice_registry() -> None:
    """
    Validate the 7-voice solo registry at import time.

    Checks:
    1. All 7 expected voice keys are present.
    2. bm_lewis (kid) and bm_daniel (kid2) speeds differ by >= 0.10.
    3. am_echo (expressive) and am_puck (young) speeds differ by >= 0.20.
    4. bf_alice (kid) and bf_lily (kid2) speeds differ by >= 0.09.
    5. No voice has synthesis_speed outside [SPEED_MIN, SPEED_MAX].
    6. No voice has a blank kokoro_voice_id.

    Raises ValueError on any violation.
    """
    required_voice_keys = {
        "bm_lewis", "bf_alice",       # kids
        "am_puck",  "bf_isabella",    # young
        "bm_daniel","bf_lily",        # kid extras
        "am_echo",                    # expressive narrator
        "af_nova",  "af_sky", "af_bella",  # american female
        "af_nicole","af_sarah","am_fenrir", # child voices
        "af_sky_child",                       # pitched child voice
    }

    validation_errors: List[str] = []

    # Check all required voices are registered
    missing_voices = required_voice_keys - set(VOICE_REGISTRY.keys())
    if missing_voices:
        validation_errors.append(f"Missing required voice keys: {sorted(missing_voices)}")

    def get_speed(voice_key: str) -> Optional[float]:
        voice = VOICE_REGISTRY.get(voice_key)
        return voice.synthesis_speed if voice else None

    # Speed differentiation checks
    lewis_speed  = get_speed("bm_lewis")
    daniel_speed = get_speed("bm_daniel")
    if lewis_speed and daniel_speed:
        delta = abs(lewis_speed - daniel_speed)
        if delta < 0.10:
            validation_errors.append(
                f"bm_lewis ({lewis_speed}) and bm_daniel ({daniel_speed}) "
                f"are too similar — speed delta {delta:.2f} must be >= 0.10"
            )

    echo_speed = get_speed("am_echo")
    puck_speed = get_speed("am_puck")
    if echo_speed and puck_speed:
        delta = abs(echo_speed - puck_speed)
        if delta < 0.20:
            validation_errors.append(
                f"am_echo ({echo_speed}) and am_puck ({puck_speed}) "
                f"are too similar — speed delta {delta:.2f} must be >= 0.20"
            )

    alice_speed = get_speed("bf_alice")
    lily_speed  = get_speed("bf_lily")
    if alice_speed and lily_speed:
        delta = abs(alice_speed - lily_speed)
        if delta < 0.09:
            validation_errors.append(
                f"bf_alice ({alice_speed}) and bf_lily ({lily_speed}) "
                f"are too similar — speed delta {delta:.2f} must be >= 0.09"
            )

    # Individual voice sanity checks
    for voice_key, voice_def in VOICE_REGISTRY.items():
        if not voice_def.kokoro_voice_id:
            validation_errors.append(f"{voice_key}: kokoro_voice_id is blank")
        if not (ENGINE_CONFIG.SYNTHESIS_SPEED_MIN
                <= voice_def.synthesis_speed
                <= ENGINE_CONFIG.SYNTHESIS_SPEED_MAX):
            validation_errors.append(
                f"{voice_key}: synthesis_speed {voice_def.synthesis_speed} is outside "
                f"[{ENGINE_CONFIG.SYNTHESIS_SPEED_MIN}, {ENGINE_CONFIG.SYNTHESIS_SPEED_MAX}]"
            )

    if validation_errors:
        raise ValueError(
            "VOICE REGISTRY VALIDATION FAILED:\n  " + "\n  ".join(validation_errors)
        )

    logger.info(
        "Voice registry OK: %d voices | cache_version=%s",
        len(VOICE_REGISTRY),
        ENGINE_CONFIG.CACHE_VERSION,
    )


_validate_voice_registry()


# ─────────────────────────────────────────────────────────────────────────────
# PATH HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_model_file_path() -> str:
    return str(settings.KOKORO_MODEL_PATH)


def _resolve_voices_file_path() -> str:
    return str(settings.KOKORO_VOICES_PATH)


def _resolve_audio_cache_dir() -> Path:
    return settings.AUDIO_CACHE_DIR


# ─────────────────────────────────────────────────────────────────────────────
# KEYED LOCK (per-cache-file concurrency control)
# ─────────────────────────────────────────────────────────────────────────────

class _PerKeyMutex:
    """
    Per-key mutual exclusion lock pool.

    Ensures that concurrent synthesis requests for the same cache key
    block each other (only one synthesizes; the rest read the cached result).
    Keys are reference-counted and removed from the pool when no longer held.
    """

    def __init__(self) -> None:
        self._lock_registry: Dict[str, Tuple[threading.Lock, int]] = {}
        self._registry_guard = threading.Lock()

    def _acquire(self, cache_key: str) -> None:
        with self._registry_guard:
            existing_lock, ref_count = self._lock_registry.get(
                cache_key, (threading.Lock(), 0)
            )
            self._lock_registry[cache_key] = (existing_lock, ref_count + 1)
        existing_lock.acquire()

    def _release(self, cache_key: str) -> None:
        with self._registry_guard:
            if cache_key not in self._lock_registry:
                return
            existing_lock, ref_count = self._lock_registry[cache_key]
            if ref_count <= 1:
                del self._lock_registry[cache_key]
            else:
                self._lock_registry[cache_key] = (existing_lock, ref_count - 1)
        existing_lock.release()

    class _LockContext:
        def __init__(self, mutex: "_PerKeyMutex", cache_key: str) -> None:
            self._mutex     = mutex
            self._cache_key = cache_key

        def __enter__(self) -> "_PerKeyMutex._LockContext":
            self._mutex._acquire(self._cache_key)
            return self

        def __exit__(self, *_) -> None:
            self._mutex._release(self._cache_key)

    def __call__(self, cache_key: str) -> "_PerKeyMutex._LockContext":
        return self._LockContext(self, cache_key)


_per_key_synthesis_mutex = _PerKeyMutex()


# ─────────────────────────────────────────────────────────────────────────────
# TEXT NORMALISATION
# ─────────────────────────────────────────────────────────────────────────────

def _normalise_input_text(raw_text: str) -> str:
    """
    Normalise and validate raw input text before synthesis.

    Steps:
    - Unicode NFC normalisation
    - Collapse internal whitespace
    - Enforce character and word count limits

    Raises TypeError if input is not a string.
    Raises ValueError if input exceeds configured limits.
    """
    if not isinstance(raw_text, str):
        raise TypeError(f"text must be str, got {type(raw_text).__name__}")

    from utils.text_normalizer import normalize_tts_text
    
    # 1. Expand abbreviations and symbols
    expanded = normalize_tts_text(raw_text)

    # 2. Enforce NFC
    normalised = unicodedata.normalize("NFC", expanded).strip()
    normalised = re.sub(r"\s+", " ", normalised)

    if len(normalised) > ENGINE_CONFIG.MAX_INPUT_CHARS:
        raise ValueError(
            f"Input text exceeds {ENGINE_CONFIG.MAX_INPUT_CHARS} characters "
            f"(got {len(normalised)})"
        )

    word_count = len(normalised.split())
    if word_count > ENGINE_CONFIG.MAX_INPUT_WORDS:
        raise ValueError(
            f"Input text exceeds {ENGINE_CONFIG.MAX_INPUT_WORDS} words "
            f"(got {word_count})"
        )

    return normalised


# ─────────────────────────────────────────────────────────────────────────────
# SYLLABLE COUNTING (for weighted timestamp fallback)
# ─────────────────────────────────────────────────────────────────────────────

_VOWEL_CLUSTER_RE = re.compile(r"[aeiouy]+", re.IGNORECASE)


def _count_syllables(word: str) -> int:
    """Estimate syllable count of a single word using vowel cluster heuristics."""
    stripped = re.sub(r"[^a-zA-Z]", "", word).lower()
    if not stripped:
        return 1
    syllable_count = len(_VOWEL_CLUSTER_RE.findall(stripped))
    if stripped.endswith("e") and syllable_count > 1:
        syllable_count -= 1
    return max(1, syllable_count)


# ─────────────────────────────────────────────────────────────────────────────
# TIMESTAMP FINALISATION
# ─────────────────────────────────────────────────────────────────────────────

def _finalise_word_timestamps(
    word_timestamp_list: List[dict],
    total_audio_duration_ms: int,
) -> List[dict]:
    """
    Enforce monotonicity, minimum durations, and duration cap on word timestamps.
    """
    min_dur = ENGINE_CONFIG.MIN_WORD_DURATION_MS
    
    for index, word_entry in enumerate(word_timestamp_list):
        word_entry["start_ms"] = max(0, int(word_entry["start_ms"]))
        
        # 1. ENFORCE MINIMUM DURATION
        # Even if the VAD thinks the word was 40ms, we force it to at least min_dur
        word_entry["end_ms"] = max(
            word_entry["start_ms"] + min_dur,
            int(word_entry["end_ms"]),
        )

        # 2. ENFORCE MONOTONICITY (No overlapping words)
        if index > 0:
            previous_end_ms = word_timestamp_list[index - 1]["end_ms"]
            if word_entry["start_ms"] < previous_end_ms:
                word_entry["start_ms"] = previous_end_ms
                
            # Re-ensure duration after potentially shifting start
            word_entry["end_ms"] = max(
                word_entry["end_ms"],
                word_entry["start_ms"] + min_dur,
            )

        # 3. CAP TO AUDIO LENGTH
        word_entry["start_ms"] = min(word_entry["start_ms"], total_audio_duration_ms)
        word_entry["end_ms"]   = min(word_entry["end_ms"],   total_audio_duration_ms)

    if word_timestamp_list:
        word_timestamp_list[-1]["end_ms"] = total_audio_duration_ms

    return word_timestamp_list


def _distribute_word_durations(
    word_list: List[str],
    raw_duration_ms_list: List[int],
    total_duration_ms: int,
) -> List[dict]:
    """
    Scale raw per-word duration proportions to fit exactly total_duration_ms.
    """
    assert len(word_list) == len(raw_duration_ms_list)

    raw_total_ms = sum(raw_duration_ms_list)
    if raw_total_ms <= 0:
        equal_duration = max(
            ENGINE_CONFIG.MIN_WORD_DURATION_MS,
            total_duration_ms // max(len(word_list), 1),
        )
        raw_duration_ms_list = [equal_duration] * len(word_list)
        raw_total_ms = sum(raw_duration_ms_list)

    result: List[dict] = []
    cursor_ms   = 0
    allocated_ms = 0

    for position, (word, raw_duration) in enumerate(zip(word_list, raw_duration_ms_list)):
        if position == len(word_list) - 1:
            scaled_duration = max(
                ENGINE_CONFIG.MIN_WORD_DURATION_MS,
                total_duration_ms - allocated_ms,
            )
        else:
            scaled_duration = max(
                ENGINE_CONFIG.MIN_WORD_DURATION_MS,
                int(raw_duration / raw_total_ms * total_duration_ms + 0.5),
            )

        result.append({
            "word":     word,
            "start_ms": cursor_ms,
            "end_ms":   cursor_ms + scaled_duration,
        })
        cursor_ms    += scaled_duration
        allocated_ms += scaled_duration

    return result


# ─────────────────────────────────────────────────────────────────────────────
# ESPEAK PHONEME-BASED TIMESTAMP ALIGNMENT
# ─────────────────────────────────────────────────────────────────────────────

def _find_espeak_binary() -> Optional[str]:
    return shutil.which("espeak-ng") or shutil.which("espeak")


_ESPEAK_BINARY: Optional[str] = _find_espeak_binary()


def _parse_espeak_phoneme_output(phoneme_output: str) -> List[int]:
    """
    Parse espeak --pho output and return a list of per-word durations in ms.
    """
    per_word_durations: List[int] = []
    current_word_duration_ms: int = 0
    all_raw_durations: List[int]  = []

    output_lines = phoneme_output.splitlines()

    for line in output_lines:
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        phoneme_symbol = parts[0]
        if phoneme_symbol.startswith("_") or phoneme_symbol in ("pau", ""):
            continue
        try:
            raw_value = int(parts[1])
            if raw_value > 0:
                all_raw_durations.append(raw_value)
        except (ValueError, IndexError):
            continue

    if all_raw_durations:
        median_raw_duration = sorted(all_raw_durations)[len(all_raw_durations) // 2]
        unit_multiplier = (
            ENGINE_CONFIG.ESPEAK_CENTISECOND_MULTIPLIER
            if median_raw_duration <= ENGINE_CONFIG.ESPEAK_CENTISECOND_THRESHOLD
            else 1
        )
    else:
        unit_multiplier = 1

    for line in output_lines:
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if not parts:
            continue
        phoneme_symbol = parts[0]
        if phoneme_symbol.startswith("_") or phoneme_symbol in ("pau", ""):
            if current_word_duration_ms > 0:
                per_word_durations.append(current_word_duration_ms)
            current_word_duration_ms = 0
        else:
            try:
                raw_value = int(parts[1]) if len(parts) >= 2 else 0
            except (ValueError, IndexError):
                raw_value = 0
            current_word_duration_ms += raw_value * unit_multiplier

    if current_word_duration_ms > 0:
        per_word_durations.append(current_word_duration_ms)

    return per_word_durations


def _interpolate_espeak_durations_to_word_count(
    espeak_word_durations: List[int],
    target_word_count: int,
) -> Optional[List[int]]:
    """
    Interpolate espeak word durations when its count doesn't match the text word count.
    """
    espeak_count = len(espeak_word_durations)
    if espeak_count == target_word_count:
        return espeak_word_durations
    if espeak_count == 0:
        return None

    total_duration = sum(espeak_word_durations)
    if total_duration <= 0:
        return None

    interpolated = [
        espeak_word_durations[min(int(i / target_word_count * espeak_count), espeak_count - 1)]
        for i in range(target_word_count)
    ]
    interpolated_total = sum(interpolated)
    if interpolated_total <= 0:
        return None

    return [
        int(duration * total_duration / interpolated_total + 0.5)
        for duration in interpolated
    ]


def _build_espeak_word_timestamps(
    input_text: str,
    actual_audio_duration_ms: int,
    language_code: str = "en-gb",
) -> Optional[List[dict]]:
    """
    Attempt to generate word timestamps using espeak phoneme alignment.
    """
    if not _ESPEAK_BINARY:
        return None

    word_list = input_text.split()
    if not word_list:
        return None

    try:
        espeak_process = subprocess.Popen(
            [_ESPEAK_BINARY, "-v", language_code, "-q", "--pho", input_text],
            stdout       = subprocess.PIPE,
            stderr       = subprocess.PIPE,
            text         = True,
            encoding     = "utf-8",
            errors       = "replace",
            start_new_session = True,
        )
        try:
            stdout_output, _ = espeak_process.communicate(
                timeout=ENGINE_CONFIG.ESPEAK_SUBPROCESS_TIMEOUT_S
            )
        except subprocess.TimeoutExpired:
            try:
                import signal
                os.killpg(os.getpgid(espeak_process.pid), signal.SIGKILL)
            except OSError:
                espeak_process.kill()
            espeak_process.communicate()
            return None

        if espeak_process.returncode != 0 or not stdout_output.strip():
            return None

    except OSError:
        return None

    raw_word_durations = _parse_espeak_phoneme_output(stdout_output)
    if not raw_word_durations:
        return None

    aligned_durations = _interpolate_espeak_durations_to_word_count(
        raw_word_durations, len(word_list)
    )
    if aligned_durations is None:
        return None

    return _finalise_word_timestamps(
        _distribute_word_durations(word_list, aligned_durations, actual_audio_duration_ms),
        actual_audio_duration_ms,
    )


# ─────────────────────────────────────────────────────────────────────────────
# VAD ENERGY-BASED TIMESTAMP ALIGNMENT
# ─────────────────────────────────────────────────────────────────────────────

def _build_vad_word_timestamps(
    audio_samples: np.ndarray,
    input_text: str,
) -> Optional[List[dict]]:
    """
    Attempt to generate word timestamps using voice activity detection (VAD).
    """
    word_list = input_text.split()
    word_count = len(word_list)
    if word_count == 0:
        return None

    if len(audio_samples) > ENGINE_CONFIG.MAX_AUDIO_SAMPLES:
        audio_samples = audio_samples[:ENGINE_CONFIG.MAX_AUDIO_SAMPLES]

    frame_sample_size = max(
        1, int(ENGINE_CONFIG.SAMPLE_RATE * ENGINE_CONFIG.VAD_FRAME_MS / 1000)
    )
    total_frames = len(audio_samples) // frame_sample_size
    total_audio_duration_ms = int(len(audio_samples) / ENGINE_CONFIG.SAMPLE_RATE * 1000)

    if total_frames < 2:
        return None

    frame_matrix = (
        audio_samples[:total_frames * frame_sample_size]
        .reshape(total_frames, frame_sample_size)
        .astype(np.float64, copy=False)
    )
    frame_rms_energy = np.sqrt(np.mean(frame_matrix ** 2, axis=1))

    p95_energy = float(np.percentile(frame_rms_energy, 95))
    if p95_energy < ENGINE_CONFIG.VAD_P95_ENERGY_FLOOR:
        return None

    onset_threshold  = p95_energy * ENGINE_CONFIG.VAD_ONSET_ENERGY_RATIO
    offset_threshold = onset_threshold * ENGINE_CONFIG.VAD_OFFSET_ENERGY_RATIO

    speech_mask = np.zeros(total_frames, dtype=bool)
    is_in_speech = False
    for frame_index, rms_value in enumerate(frame_rms_energy):
        if not is_in_speech and rms_value > onset_threshold:
            is_in_speech = True
        elif is_in_speech and rms_value < offset_threshold:
            is_in_speech = False
        speech_mask[frame_index] = is_in_speech

    raw_speech_segments: List[List[int]] = []
    segment_active = False
    segment_start_frame = 0
    for frame_index in range(total_frames):
        if speech_mask[frame_index] and not segment_active:
            segment_active      = True
            segment_start_frame = frame_index
        elif not speech_mask[frame_index] and segment_active:
            segment_active = False
            raw_speech_segments.append([
                segment_start_frame * ENGINE_CONFIG.VAD_FRAME_MS,
                frame_index         * ENGINE_CONFIG.VAD_FRAME_MS,
            ])
    if segment_active:
        raw_speech_segments.append([
            segment_start_frame * ENGINE_CONFIG.VAD_FRAME_MS,
            total_frames        * ENGINE_CONFIG.VAD_FRAME_MS,
        ])

    merged_segments: List[List[int]] = []
    for segment in raw_speech_segments:
        if (merged_segments
                and (segment[0] - merged_segments[-1][1])
                < ENGINE_CONFIG.VAD_MIN_SILENCE_GAP_MS):
            merged_segments[-1][1] = segment[1]
        else:
            merged_segments.append(segment)

    valid_segments = [
        (start_ms, end_ms)
        for start_ms, end_ms in merged_segments
        if (end_ms - start_ms) >= ENGINE_CONFIG.VAD_MIN_SPEECH_SEGMENT_MS
    ]
    segment_count = len(valid_segments)

    if segment_count == 0:
        return None

    segment_to_word_ratio = segment_count / word_count
    if not (ENGINE_CONFIG.VAD_MIN_SEGMENT_TO_WORD_RATIO
            <= segment_to_word_ratio
            <= ENGINE_CONFIG.VAD_MAX_SEGMENT_TO_WORD_RATIO):
        return None

    word_syllable_counts = [_count_syllables(word) for word in word_list]

    if segment_count == word_count:
        return _finalise_word_timestamps(
            [
                {"word": word, "start_ms": seg_start, "end_ms": seg_end}
                for word, (seg_start, seg_end) in zip(word_list, valid_segments)
            ],
            total_audio_duration_ms,
        )

    if segment_count > word_count:
        result: List[dict] = []
        segment_index = 0
        total_syllables = sum(word_syllable_counts) or 1
        for word_index, (word, syllable_count) in enumerate(
            zip(word_list, word_syllable_counts)
        ):
            remaining_words    = word_count - word_index
            remaining_segments = segment_count - segment_index
            segments_to_take = max(
                1,
                min(
                    max(1, round(syllable_count / total_syllables * segment_count)),
                    remaining_segments - remaining_words + 1,
                ),
            )
            word_segments = valid_segments[segment_index: segment_index + segments_to_take]
            segment_index += segments_to_take
            result.append({
                "word":     word,
                "start_ms": word_segments[0][0],
                "end_ms":   word_segments[-1][1],
            })
        return _finalise_word_timestamps(result, total_audio_duration_ms)

    result2: List[dict] = []
    word_index = 0
    for segment_position, (seg_start, seg_end) in enumerate(valid_segments):
        remaining_segments = segment_count - segment_position
        remaining_words    = word_count - word_index
        words_in_segment   = max(1, remaining_words - (remaining_segments - 1))
        if segment_position == segment_count - 1:
            words_in_segment = remaining_words

        segment_words     = word_list[word_index: word_index + words_in_segment]
        segment_syllables = word_syllable_counts[word_index: word_index + words_in_segment]
        total_segment_syllables = sum(segment_syllables) or 1
        word_index += words_in_segment
        cursor_ms = seg_start

        for word, syllable_count in zip(segment_words, segment_syllables):
            word_duration = max(
                ENGINE_CONFIG.MIN_WORD_DURATION_MS,
                int(syllable_count / total_segment_syllables * (seg_end - seg_start)),
            )
            result2.append({
                "word":     word,
                "start_ms": cursor_ms,
                "end_ms":   cursor_ms + word_duration,
            })
            cursor_ms += word_duration

        if result2:
            result2[-1]["end_ms"] = seg_end

    return _finalise_word_timestamps(result2, total_audio_duration_ms)


# ─────────────────────────────────────────────────────────────────────────────
# PHONEME-WEIGHTED TIMESTAMP FALLBACK
# ─────────────────────────────────────────────────────────────────────────────

_COMMON_FUNCTION_WORDS: frozenset = frozenset({
    "the", "a", "an", "of", "to", "in", "on", "at", "by", "as", "is", "it",
    "its", "was", "were", "be", "been", "has", "have", "had", "and", "but",
    "or", "for", "not", "do", "did", "so", "if", "he", "she", "we", "they",
    "i", "my", "his", "her", "our", "who", "what", "how", "when", "this",
    "that", "from", "with", "than", "then", "into", "upon", "once", "there",
    "here", "now", "just", "him", "them", "one", "two", "three", "both",
    "each", "all",
})

_PHONEME_COMPLEXITY_PATTERNS: Tuple[Tuple[str, float], ...] = (
    ("(tion|sion)", 3.5),
    ("(ee|ea)",     3.8),
    ("(oo)",        3.8),
    ("(ou|ow)",     4.0),
    ("(ai|ay)",     3.8),
    ("(oi|oy)",     4.0),
    ("(ie|igh)",    4.0),
    ("(ar)",        3.5),
    ("(or|ore)",    3.5),
    ("(er|ir|ur)",  2.5),
)

_VOWEL_PATTERN_STRIP_RE = re.compile(
    r"(tion|sion|ee|ea|oo|ou|ow|ai|ay|oi|oy|ie|igh|ar|or|ore|er|ir|ur)"
)


def _compute_phoneme_complexity_weight(word: str) -> float:
    clean_word = re.sub(r"[^a-zA-Z']", "", word).lower()
    if not clean_word:
        return 1.0

    if clean_word in _COMMON_FUNCTION_WORDS:
        return max(1.0, _count_syllables(word) * 1.2 + len(clean_word) * 0.3)

    complexity_weight = 0.0
    for pattern, pattern_value in _PHONEME_COMPLEXITY_PATTERNS:
        complexity_weight += len(re.findall(pattern, clean_word)) * pattern_value

    remaining_phonemes = _VOWEL_PATTERN_STRIP_RE.sub("", clean_word)
    complexity_weight += len(re.findall(r"[aeiouy]", remaining_phonemes)) * 2.5
    complexity_weight += len(re.findall(r"[bcdfghjklmnpqrstvwxyz]", clean_word)) * 0.8

    return max(1.0, complexity_weight)


def _build_phoneme_weighted_timestamps(
    input_text: str,
    total_audio_duration_ms: int,
) -> List[dict]:
    """
    Generate word timestamps using phoneme complexity weighting.
    Final fallback when both espeak and VAD alignment fail.
    """
    word_list = input_text.split()
    if not word_list:
        return []

    complexity_weights = [_compute_phoneme_complexity_weight(w) for w in word_list]
    complexity_weights[-1] *= ENGINE_CONFIG.SENTENCE_FINAL_WORD_BOOST

    total_weight = sum(complexity_weights) or 1.0
    raw_durations = [
        max(ENGINE_CONFIG.MIN_WORD_DURATION_MS, int(w / total_weight * total_audio_duration_ms))
        for w in complexity_weights
    ]

    return _finalise_word_timestamps(
        _distribute_word_durations(word_list, raw_durations, total_audio_duration_ms),
        total_audio_duration_ms,
    )


# ─────────────────────────────────────────────────────────────────────────────
# TIMESTAMP DISPATCHER
# ─────────────────────────────────────────────────────────────────────────────

def _detect_leading_silence_ms(samples: np.ndarray, sample_rate: int, threshold: float = 0.01) -> int:
    """Detect the amount of leading silence in ms using a windowed RMS check."""
    if len(samples) == 0:
        return 0
    
    # Large windows (10ms) for stability on ONNX outputs
    window_size = int(sample_rate * 0.01) 
    for i in range(0, len(samples), window_size):
        window = samples[i : i + window_size]
        if len(window) == 0:
            break
        rms = np.sqrt(np.mean(window**2))
        if rms > threshold:
            return int((i / sample_rate) * 1000)
    return 0

def build_word_timestamps(
    audio_samples: np.ndarray,
    input_text: str,
    language_code: str = "en-gb",
) -> List[dict]:
    """
    Build word-level timestamps using the best available method.

    Priority chain:
    1. espeak phoneme alignment  (most accurate, requires espeak-ng/espeak)
    2. VAD energy alignment      (good accuracy on clean speech, no dependency)
    3. Phoneme-weighted fallback (pure heuristic, always succeeds)
    """
    word_list         = input_text.split()
    audio_duration_ms = int(len(audio_samples) / ENGINE_CONFIG.SAMPLE_RATE * 1000)
    
    # Premium Sync: Detect leading silence to prevent "fast" highlights
    offset_ms = _detect_leading_silence_ms(audio_samples, ENGINE_CONFIG.SAMPLE_RATE)
    effective_duration = max(100, audio_duration_ms - offset_ms)

    # 1. Espeak Priority
    espeak_timestamps = _build_espeak_word_timestamps(input_text, effective_duration, language_code)
    if espeak_timestamps and len(espeak_timestamps) == len(word_list):
        # Apply offset
        for w in espeak_timestamps:
            w["start_ms"] += offset_ms
            w["end_ms"]   += offset_ms
        return espeak_timestamps

    # 2. VAD Priority (VAD already respects silence, but we check if we need extra offset)
    vad_timestamps = _build_vad_word_timestamps(audio_samples, input_text)
    if vad_timestamps and len(vad_timestamps) == len(word_list):
        return vad_timestamps

    # 3. Heuristic Fallback
    fallback = _build_phoneme_weighted_timestamps(input_text, effective_duration)
    for w in fallback:
        w["start_ms"] += offset_ms
        w["end_ms"]   += offset_ms
    return fallback


# ─────────────────────────────────────────────────────────────────────────────
# CACHE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _compute_cache_file_path(
    kokoro_voice_id: str,
    synthesis_speed: float,
    input_text: str,
) -> Path:
    cache_key_string = (
        f"{ENGINE_CONFIG.CACHE_VERSION}:{kokoro_voice_id}:{synthesis_speed:.4f}:{input_text}"
    )
    file_hash = hashlib.sha256(cache_key_string.encode("utf-8")).hexdigest()
    return _resolve_audio_cache_dir() / f"{file_hash}.wav"


def _read_wav_duration_ms(wav_file_path: Path) -> int:
    if _SOUNDFILE_AVAILABLE:
        try:
            import soundfile as sf
            return int(sf.info(str(wav_file_path)).duration * 1000)
        except Exception:
            pass
    try:
        file_size_bytes = wav_file_path.stat().st_size
        raw_audio_bytes = max(0, file_size_bytes - ENGINE_CONFIG.WAV_HEADER_BYTES)
        return max(
            ENGINE_CONFIG.MIN_WORD_DURATION_MS,
            int(raw_audio_bytes / (ENGINE_CONFIG.SAMPLE_RATE * 2) * 1000),
        )
    except OSError:
        return 3000


def _write_wav_atomically(audio_samples: np.ndarray, target_path: Path) -> bool:
    if not _SOUNDFILE_AVAILABLE:
        return False

    temp_file_path: Optional[Path] = None
    try:
        import soundfile as sf
        fd, temp_path_str = tempfile.mkstemp(
            dir=str(target_path.parent), suffix=".wav.tmp"
        )
        temp_file_path = Path(temp_path_str)
        os.close(fd)
        sf.write(
            str(temp_file_path),
            audio_samples.astype(np.float32),
            ENGINE_CONFIG.SAMPLE_RATE,
            subtype="PCM_16",
            format="WAV",
        )
        os.replace(str(temp_file_path), str(target_path))
        return True
    except Exception as write_error:
        logger.error("Atomic WAV write failed for %s: %s", target_path.name, write_error)
        if temp_file_path is not None:
            try:
                temp_file_path.unlink(missing_ok=True)
            except OSError:
                pass
        return False


def _read_wav_samples(wav_file_path: Path) -> Optional[np.ndarray]:
    if not _SOUNDFILE_AVAILABLE:
        return None
    try:
        import soundfile as sf
        audio_data, _ = sf.read(str(wav_file_path), dtype="float32")
        return audio_data
    except Exception:
        return None


def _write_timestamps_sidecar(cache_wav_path: Path, word_timestamps: List[dict]) -> None:
    sidecar_path: Path   = cache_wav_path.with_suffix(".wts.json")
    temp_file_path: Optional[Path] = None
    try:
        fd, temp_path_str = tempfile.mkstemp(
            dir=str(sidecar_path.parent), suffix=".wts.tmp"
        )
        temp_file_path = Path(temp_path_str)
        os.close(fd)
        temp_file_path.write_text(
            json.dumps(word_timestamps, separators=(",", ":")),
            encoding="utf-8",
        )
        os.replace(str(temp_file_path), str(sidecar_path))
    except Exception as write_error:
        logger.warning("Timestamp sidecar write failed: %s", write_error)
        if temp_file_path is not None:
            try:
                temp_file_path.unlink(missing_ok=True)
            except OSError:
                pass


def _read_timestamps_sidecar(
    cache_wav_path: Path,
    expected_word_count: int,
) -> Optional[List[dict]]:
    sidecar_path = cache_wav_path.with_suffix(".wts.json")
    if not sidecar_path.exists():
        return None
    try:
        parsed_data = json.loads(sidecar_path.read_text(encoding="utf-8"))
        if not isinstance(parsed_data, list) or len(parsed_data) != expected_word_count:
            return None
        return parsed_data
    except (json.JSONDecodeError, OSError):
        return None


# ─────────────────────────────────────────────────────────────────────────────
# WPM → SYNTHESIS SPEED CONVERSION
# ─────────────────────────────────────────────────────────────────────────────

def convert_wpm_to_synthesis_speed(
    requested_wpm: int,
    voice_key: str,
) -> float:
    voice_def = VOICE_REGISTRY.get(voice_key, VOICE_REGISTRY[DEFAULT_VOICE_KEY])
    scaled_speed = (
        round(float(requested_wpm)) / max(1, voice_def.target_wpm)
        * voice_def.synthesis_speed
    )
    return round(
        max(ENGINE_CONFIG.SYNTHESIS_SPEED_MIN,
            min(ENGINE_CONFIG.SYNTHESIS_SPEED_MAX, scaled_speed)),
        4,
    )


# Keep old name for backward compatibility
wpm_to_speed = convert_wpm_to_synthesis_speed


# ─────────────────────────────────────────────────────────────────────────────
# KOKORO TTS ENGINE
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
# AUDIO CACHE CLEANUP
# ─────────────────────────────────────────────────────────────────────────────

def _cleanup_audio_cache(cache_dir: Path) -> None:
    """
    Remove stale WAV and sidecar files from the audio cache.

    Rules:
      1. Delete any file older than CACHE_MAX_AGE_DAYS (default 7 days)
      2. If total cache size > CACHE_MAX_SIZE_MB (default 2GB),
         delete oldest files first until under the limit.

    Called once in a background thread on engine startup.
    Safe to run concurrently — only deletes, never reads/writes active files.
    """
    import time

    if not cache_dir.exists():
        return

    now         = time.time()
    max_age_s   = ENGINE_CONFIG.CACHE_MAX_AGE_DAYS * 86_400
    max_bytes   = ENGINE_CONFIG.CACHE_MAX_SIZE_MB * 1024 * 1024
    deleted     = 0
    freed_bytes = 0

    # Step 1: delete files older than max age
    for f in cache_dir.iterdir():
        if f.is_file() and (now - f.stat().st_mtime) > max_age_s:
            try:
                size = f.stat().st_size
                f.unlink()
                deleted     += 1
                freed_bytes += size
            except OSError:
                pass

    # Step 2: if still over size cap, delete oldest first
    all_files = sorted(
        [f for f in cache_dir.iterdir() if f.is_file()],
        key=lambda f: f.stat().st_mtime
    )
    total_bytes = sum(f.stat().st_size for f in all_files)

    for f in all_files:
        if total_bytes <= max_bytes:
            break
        try:
            size         = f.stat().st_size
            f.unlink()
            total_bytes -= size
            deleted     += 1
            freed_bytes += size
        except OSError:
            pass

    if deleted:
        logger.info(
            "Cache cleanup: removed %d files, freed %.1fMB",
            deleted, freed_bytes / (1024 * 1024)
        )
    else:
        logger.debug("Cache cleanup: nothing to remove")


# ─────────────────────────────────────────────────────────────────────────────
# PITCH SHIFT UTILITY
# ─────────────────────────────────────────────────────────────────────────────

def _pitch_shift(samples: np.ndarray, semitones: float, sample_rate: int) -> np.ndarray:
    """
    Pitch shift audio samples by N semitones without changing duration.

    Algorithm: resample trick
      1. Resample to N/ratio samples  → higher pitch + shorter length
      2. Resample back to N samples   → restores original duration

    Quality: clean for +1 to +6 semitones. Good enough for child voice effect.
    No new dependencies — uses scipy.signal.resample (pulled in by numpy ecosystem).

    Args:
        samples:   float32 mono audio array
        semitones: semitones to shift up (positive = higher pitch)
        sample_rate: audio sample rate (unused in resample trick, kept for API clarity)

    Returns:
        float32 array, same length as input
    """
    if semitones == 0.0:
        return samples

    from scipy.signal import resample as scipy_resample

    ratio      = 2.0 ** (semitones / 12.0)   # e.g. +3 semitones = 1.1892
    n_original = len(samples)
    n_shifted  = int(round(n_original / ratio))  # shorter = higher pitch

    # Step 1: compress to raise pitch
    shifted    = scipy_resample(samples, n_shifted)
    # Step 2: stretch back to original length
    restored   = scipy_resample(shifted, n_original)

    return restored.astype(np.float32)


class BritishTTSEngine:
    """
    Production Kokoro ONNX TTS Engine (v6.1 — solo voices, per-voice locks).

    Thread-safe: synthesis is guarded by per-voice locks — different voices
    can synthesize concurrently; same voice serializes.

    Public API:
        synthesize(text, voice_key, rate, custom_wpm)              -> dict
        synthesize_with_timestamps(text, voice_key, rate, wpm)     -> dict
        get_voices()                                               -> List[dict]
        prewarm(texts, voice_key, rate)                            -> None

    Return dict schema:
        {
            "audio_url":       str,          "/audio/<hash>.wav" or "" on failure
            "duration_ms":     int,
            "word_timestamps": List[dict],   each: {word, start_ms, end_ms}
        }
    """

    def __init__(self) -> None:
        self._kokoro_model: Optional[object]  = None
        # Per-voice locks: different voices run concurrently, same voice serializes
        self._voice_locks: dict = {vk: threading.Lock() for vk in VOICE_REGISTRY}

        # Start cache cleanup in background — runs once on startup, non-blocking
        threading.Thread(
            target = _cleanup_audio_cache,
            args   = (_resolve_audio_cache_dir(),),
            daemon = True,
            name   = "cache-cleanup",
        ).start()
        self._model_ready_event               = threading.Event()
        self._model_load_error: Optional[str] = None

        threading.Thread(
            target = self._load_kokoro_model,
            daemon = True,
            name   = "kokoro-model-loader",
        ).start()

    # ── Model loading ─────────────────────────────────────────────────────────

    def _load_kokoro_model(self) -> None:
        """Load the Kokoro ONNX model in a background thread."""
        try:
            from kokoro_onnx import Kokoro  # type: ignore

            model_path  = _resolve_model_file_path()
            voices_path = _resolve_voices_file_path()

            # Fail fast with a clear error if model files are missing
            if not Path(model_path).exists():
                raise FileNotFoundError(
                    f"Kokoro model not found: {model_path}\n"
                    "Download kokoro-v1.0.onnx and place it in the engines/ folder."
                )
            if not Path(voices_path).exists():
                raise FileNotFoundError(
                    f"Voices file not found: {voices_path}\n"
                    "Download voices-v1.0.bin and place it in the engines/ folder."
                )

            self._kokoro_model = Kokoro(model_path, voices_path)
            logger.info(
                "Kokoro model loaded | espeak=%s | voices=%d",
                "available" if _ESPEAK_BINARY else "unavailable",
                len(VOICE_REGISTRY),
            )
        except Exception as load_error:
            self._model_load_error = str(load_error)
            logger.error("Kokoro model load failed: %s", load_error)
        finally:
            self._model_ready_event.set()

    # ── Public API ────────────────────────────────────────────────────────────

    def synthesize(
        self,
        text: str,
        voice_key: str              = DEFAULT_VOICE_KEY,
        rate: float                 = 1.0,
        custom_wpm: Optional[int]   = None,
    ) -> dict:
        return self._execute_synthesis(text, voice_key, rate, custom_wpm)

    def synthesize_with_timestamps(
        self,
        text: str,
        voice_key: str              = DEFAULT_VOICE_KEY,
        rate: float                 = 1.0,
        custom_wpm: Optional[int]   = None,
    ) -> dict:
        return self._execute_synthesis(text, voice_key, rate, custom_wpm)

    def get_voices(self) -> List[dict]:
        return [
            {
                "key":         voice_key,
                "label":       voice_def.display_label,
                "desc":        voice_def.description,
                "gender":      voice_def.gender,
                "lang":        voice_def.language_code,
                "speed":       voice_def.synthesis_speed,
                "target_wpm":  voice_def.target_wpm,
            }
            for voice_key, voice_def in VOICE_REGISTRY.items()
        ]

    def prewarm(
        self,
        texts: List[str],
        voice_key: str  = DEFAULT_VOICE_KEY,
        rate: float     = 1.0,
    ) -> None:
        def _run_prewarm() -> None:
            if not self._model_ready_event.wait(ENGINE_CONFIG.MODEL_LOAD_TIMEOUT_S):
                return
            for prewarm_text in texts:
                try:
                    self._execute_synthesis(prewarm_text, voice_key, rate, None)
                except Exception as prewarm_error:
                    logger.warning(
                        "Prewarm failed for text %r: %s",
                        prewarm_text[:40],
                        prewarm_error,
                    )

        threading.Thread(
            target = _run_prewarm,
            daemon = True,
            name   = "kokoro-prewarm",
        ).start()

    # ── Internal synthesis pipeline ───────────────────────────────────────────

    def _build_fallback_response(self, input_text: str) -> dict:
        word_list   = input_text.split() if input_text else []
        word_count  = max(1, len(word_list))
        duration_ms = max(
            ENGINE_CONFIG.FALLBACK_MIN_DURATION_MS,
            int(word_count / ENGINE_CONFIG.FALLBACK_WPM * 60_000),
        )
        return {
            "audio_url":       "",
            "duration_ms":     duration_ms,
            "word_timestamps": (
                _build_phoneme_weighted_timestamps(input_text, duration_ms)
                if word_list else []
            ),
        }

    def _calculate_synthesis_speed(
        self,
        voice_definition: SoloVoiceDefinition,
        rate_multiplier: float,
        custom_wpm: Optional[int],
        registry_key: Optional[str] = None,
    ) -> float:
        if custom_wpm and custom_wpm > 0:
            # Use registry_key for lookup so af_sky_child uses its own target_wpm
            lookup_key = registry_key if registry_key else voice_definition.kokoro_voice_id
            return convert_wpm_to_synthesis_speed(custom_wpm, lookup_key)

        clamped_rate = max(
            ENGINE_CONFIG.RATE_MULTIPLIER_MIN,
            min(ENGINE_CONFIG.RATE_MULTIPLIER_MAX, rate_multiplier),
        )
        return round(
            max(ENGINE_CONFIG.SYNTHESIS_SPEED_MIN,
                min(ENGINE_CONFIG.SYNTHESIS_SPEED_MAX,
                    voice_definition.synthesis_speed * clamped_rate)),
            4,
        )

    @staticmethod
    def _normalise_audio_amplitude(
        audio_samples: np.ndarray,
        voice_id: str,
    ) -> Optional[np.ndarray]:
        max_amplitude = float(np.max(np.abs(audio_samples)))

        if max_amplitude < ENGINE_CONFIG.SILENT_AMPLITUDE_THRESHOLD:
            logger.error(
                "Completely silent audio for voice=%s (max_amp=%.2e) — discarding",
                voice_id, max_amplitude,
            )
            return None

        if max_amplitude < ENGINE_CONFIG.LOW_AMPLITUDE_THRESHOLD:
            logger.warning(
                "Low amplitude audio for voice=%s (max_amp=%.4f) — normalising to %.2f peak",
                voice_id, max_amplitude, ENGINE_CONFIG.TARGET_NORMALISED_AMPLITUDE,
            )
            return (
                audio_samples / max_amplitude * ENGINE_CONFIG.TARGET_NORMALISED_AMPLITUDE
            ).astype(np.float32)

        return audio_samples

    def _execute_synthesis(
        self,
        input_text: str,
        voice_key: str,
        rate_multiplier: float,
        custom_wpm: Optional[int],
    ) -> dict:
        # ── Input validation ─────────────────────────────────────────────────
        if not input_text or not input_text.strip():
            return {"audio_url": "", "duration_ms": 0, "word_timestamps": []}

        try:
            normalised_text = _normalise_input_text(input_text)
        except (TypeError, ValueError) as validation_error:
            logger.warning("Text validation failed: %s", validation_error)
            return self._build_fallback_response(str(input_text)[:200])

        word_list = normalised_text.split()
        if not word_list:
            return {"audio_url": "", "duration_ms": 0, "word_timestamps": []}

        # ── Voice resolution ─────────────────────────────────────────────────
        resolved_voice_key = voice_key if voice_key in VOICE_REGISTRY else DEFAULT_VOICE_KEY
        voice_definition   = VOICE_REGISTRY[resolved_voice_key]
        synthesis_speed    = self._calculate_synthesis_speed(
            voice_definition, rate_multiplier, custom_wpm, registry_key=resolved_voice_key
        )

        # ── Cache lookup (first check — no lock) ─────────────────────────────
        cache_file_path = _compute_cache_file_path(
            voice_definition.kokoro_voice_id, synthesis_speed, normalised_text
        )
        cache_key_stem = cache_file_path.stem

        if cache_file_path.exists():
            cached_timestamps = _read_timestamps_sidecar(cache_file_path, len(word_list))
            audio_duration_ms = _read_wav_duration_ms(cache_file_path)
            if cached_timestamps is None:
                audio_samples     = _read_wav_samples(cache_file_path)
                cached_timestamps = (
                    build_word_timestamps(
                        audio_samples,
                        normalised_text,
                        voice_definition.language_code,
                    )
                    if audio_samples is not None
                    else _build_phoneme_weighted_timestamps(normalised_text, audio_duration_ms)
                )
                _write_timestamps_sidecar(cache_file_path, cached_timestamps)
            return {
                "audio_url":       f"/audio/{cache_file_path.name}",
                "duration_ms":     audio_duration_ms,
                "word_timestamps": cached_timestamps,
            }

        # ── Per-key lock → synthesis ──────────────────────────────────────────
        with _per_key_synthesis_mutex(cache_key_stem):

            # Double-checked locking
            if cache_file_path.exists():
                cached_timestamps = _read_timestamps_sidecar(cache_file_path, len(word_list))
                audio_duration_ms = _read_wav_duration_ms(cache_file_path)
                if cached_timestamps is None:
                    audio_samples     = _read_wav_samples(cache_file_path)
                    cached_timestamps = (
                        build_word_timestamps(
                            audio_samples,
                            normalised_text,
                            voice_definition.language_code,
                        )
                        if audio_samples is not None
                        else _build_phoneme_weighted_timestamps(
                            normalised_text, audio_duration_ms
                        )
                    )
                    _write_timestamps_sidecar(cache_file_path, cached_timestamps)
                return {
                    "audio_url":       f"/audio/{cache_file_path.name}",
                    "duration_ms":     audio_duration_ms,
                    "word_timestamps": cached_timestamps,
                }

            # Wait for model
            if not self._model_ready_event.wait(ENGINE_CONFIG.MODEL_LOAD_TIMEOUT_S):
                logger.error("Kokoro model load timed out after %ds", ENGINE_CONFIG.MODEL_LOAD_TIMEOUT_S)
                return self._build_fallback_response(normalised_text)
            if self._kokoro_model is None:
                logger.error("Kokoro model unavailable: %s", self._model_load_error)
                return self._build_fallback_response(normalised_text)

            logger.info(
                "Synthesizing | voice=%s speed=%.4f words=%d text=%r",
                voice_definition.kokoro_voice_id,
                synthesis_speed,
                len(word_list),
                normalised_text[:60],
            )

            # ── Kokoro synthesis call ─────────────────────────────────────────
            try:
                _vlock = self._voice_locks.get(resolved_voice_key, threading.Lock())
                with _vlock:
                    raw_audio_samples, _sample_rate = self._kokoro_model.create(
                        normalised_text,
                        voice = voice_definition.kokoro_voice_id,
                        speed = synthesis_speed,
                        lang  = voice_definition.language_code,
                    )
            except Exception as synthesis_error:
                logger.error("Kokoro synthesis failed: %s", synthesis_error)
                return self._build_fallback_response(normalised_text)

            if raw_audio_samples is None or len(raw_audio_samples) == 0:
                logger.error("Kokoro returned empty audio for voice=%s", voice_definition.kokoro_voice_id)
                return self._build_fallback_response(normalised_text)

            if len(raw_audio_samples) > ENGINE_CONFIG.MAX_AUDIO_SAMPLES:
                raw_audio_samples = raw_audio_samples[:ENGINE_CONFIG.MAX_AUDIO_SAMPLES]

            normalised_samples = self._normalise_audio_amplitude(
                raw_audio_samples, voice_definition.kokoro_voice_id
            )
            if normalised_samples is None:
                return self._build_fallback_response(normalised_text)

            # ── Pitch shift (child / kid voices) ──────────────────────────────
            shift_st = voice_definition.pitch_shift_semitones
            if shift_st:
                normalised_samples = _pitch_shift(
                    normalised_samples, shift_st, ENGINE_CONFIG.SAMPLE_RATE
                )
                logger.debug(
                    "Pitch shift applied | voice=%s semitones=+%.1f",
                    voice_definition.kokoro_voice_id, shift_st,
                )

            # ── Cache write ───────────────────────────────────────────────────
            write_succeeded = _write_wav_atomically(normalised_samples, cache_file_path)
            audio_duration_ms = int(
                len(normalised_samples) / ENGINE_CONFIG.SAMPLE_RATE * 1000
            )
            word_timestamps = build_word_timestamps(
                normalised_samples,
                normalised_text,
                voice_definition.language_code,
            )

            if not write_succeeded:
                return {
                    "audio_url":       "",
                    "duration_ms":     audio_duration_ms,
                    "word_timestamps": word_timestamps,
                }

            _write_timestamps_sidecar(cache_file_path, word_timestamps)

            logger.info(
                "Synthesis complete | file=%s duration_ms=%d words=%d",
                cache_file_path.name,
                audio_duration_ms,
                len(word_timestamps),
            )
            return {
                "audio_url":       f"/audio/{cache_file_path.name}",
                "duration_ms":     audio_duration_ms,
                "word_timestamps": word_timestamps,
            }


# ─────────────────────────────────────────────────────────────────────────────
# BACKWARD COMPATIBILITY ALIAS
# ─────────────────────────────────────────────────────────────────────────────

CoquiTTSEngine = BritishTTSEngine