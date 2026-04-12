"""
services/story_tts_service.py — Fixed v2
-----------------------------------------
Root cause of 503: CLIENT_VOICE_CATALOGUE used raw Kokoro base voice IDs
(bm_harry, bf_alice, bm_george, bf_emma, bf_isabella) as the key passed to
BritishTTSEngine.synthesize(voice_key=...).

engines/tts.py select_voice() only honours keys present in VOICE_REGISTRY.
Raw Kokoro base IDs are NOT VOICE_REGISTRY keys — select_voice() fell through
to dynamic text selection, which for the bear story likely picked adult_warm
(af_heart). If af_heart phonemes are near-silent in your voices-v1.0.bin build,
audio_url comes back empty → KokoroModelNotReadyError → 503.

Fix: all kokoro_voice_key values are now VOICE_REGISTRY keys.
  kid_boy            → bm_harry          (matches v6.0 VOICE_REGISTRY key)
  kid_girl           → teen_confident    (bf_alice base)
  young_male         → teen_lively       (am_puck base)
  young_female       → adult_warm        (af_heart — bf_isabella not in v1.0)
  adult_male         → adult_authority   (bm_fable — bm_george not in v1.0)
  adult_female       → adult_warm        (af_heart — bf_emma not in v1.0)
  expressive_narrator→ tone_neutral      (am_echo base)
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

# numpy not needed in service layer

# BritishTTSEngine used by workers, not imported here
# tts_models imported in main_prod.py — not needed here
# alignment_utils imported in main_prod.py — not needed here


AUDIO_CACHE_DIR = Path("audio_cache")


@dataclass(frozen=True)
class ClientVoiceProfile:
    client_voice_id: str
    registry_key:    str   # Must be a key in engines/tts.py VOICE_REGISTRY
    category:        str
    gender:          str
    voice_name:      str
    description:     str


CLIENT_VOICE_CATALOGUE: List[ClientVoiceProfile] = [
    ClientVoiceProfile(
        client_voice_id="voice_1_bm_lewis", registry_key="bm_lewis",
        category="kid", gender="male", voice_name="bm_lewis",
        description="British kid boy — youthful, clear, gentle",
    ),
    ClientVoiceProfile(
        client_voice_id="voice_2_bf_alice", registry_key="bf_alice",
        category="kid", gender="female", voice_name="bf_alice",
        description="British kid girl — confident, expressive, articulate",
    ),
    ClientVoiceProfile(
        client_voice_id="voice_3_am_puck", registry_key="am_puck",
        category="young", gender="male", voice_name="am_puck",
        description="American young male — lively, upbeat, engaging",
    ),
    ClientVoiceProfile(
        client_voice_id="voice_4_bf_isabella", registry_key="bf_isabella",
        category="young", gender="female", voice_name="bf_isabella",
        description="British young female — warm, natural, storytelling",
    ),
    ClientVoiceProfile(
        client_voice_id="voice_5_bm_daniel", registry_key="bm_daniel",
        category="kid", gender="male", voice_name="bm_daniel",
        description="British kid boy — bright, curious, gentle",
    ),
    ClientVoiceProfile(
        client_voice_id="voice_6_bf_lily", registry_key="bf_lily",
        category="kid", gender="female", voice_name="bf_lily",
        description="British kid girl — soft, sweet, expressive",
    ),
    ClientVoiceProfile(
        client_voice_id="voice_7_am_echo", registry_key="am_echo",
        category="expressive", gender="male", voice_name="am_echo",
        description="American narrator — calm, deliberate, bold",
    ),
    ClientVoiceProfile(
        client_voice_id="voice_8_af_nicole", registry_key="af_nicole",
        category="child", gender="female", voice_name="af_nicole",
        description="American child girl — soft, sweet, playful",
    ),
    ClientVoiceProfile(
        client_voice_id="voice_9_af_sarah", registry_key="af_sarah",
        category="child", gender="female", voice_name="af_sarah",
        description="American child girl — bright, energetic, natural",
    ),
    ClientVoiceProfile(
        client_voice_id="voice_10_am_fenrir", registry_key="am_fenrir",
        category="child", gender="male", voice_name="am_fenrir",
        description="American child boy — lively, fun, upbeat",
    ),
    ClientVoiceProfile(
        client_voice_id="voice_11_af_sky_child", registry_key="af_sky_child",
        category="child_pitched", gender="female", voice_name="af_sky_child",
        description="Child girl — af_sky +2 semitones, bright clear child sound",
    ),
    ClientVoiceProfile(
        client_voice_id="voice_12_af_nova", registry_key="af_nova",
        category="american", gender="female", voice_name="af_nova",
        description="American female — warm, smooth, engaging",
    ),
    ClientVoiceProfile(
        client_voice_id="voice_13_af_sky", registry_key="af_sky",
        category="american", gender="female", voice_name="af_sky",
        description="American female — bright, airy, expressive",
    ),
    ClientVoiceProfile(
        client_voice_id="voice_14_af_bella", registry_key="af_bella",
        category="american", gender="female", voice_name="af_bella",
        description="American female — rich, expressive, natural",
    ),
]

_VOICE_PROFILE_BY_CLIENT_ID: Dict[str, ClientVoiceProfile] = {
    p.client_voice_id: p for p in CLIENT_VOICE_CATALOGUE
}

CLIENT_TO_REGISTRY_KEY_MAP: Dict[str, str] = {
    p.client_voice_id: p.registry_key for p in CLIENT_VOICE_CATALOGUE
}

# Fast-lookup: client_voice_id → 1-based voice number (position in catalogue)
CLIENT_VOICE_NUMBER_MAP: Dict[str, int] = {
    p.client_voice_id: idx + 1
    for idx, p in enumerate(CLIENT_VOICE_CATALOGUE)
}

# Backward-compat alias
CLIENT_TO_KOKORO_VOICE_MAP = CLIENT_TO_REGISTRY_KEY_MAP

DEFAULT_REGISTRY_KEY = "am_echo"
DEFAULT_KOKORO_VOICE_KEY = DEFAULT_REGISTRY_KEY  # backward-compat alias


def resolve_kokoro_voice_key(client_voice_id: str) -> str:
    """
    Resolve a voice key for the Kokoro engine.

    Accepts either:
      - client_voice_id  e.g. "us_girl_3"  → looks up registry_key via catalogue
      - registry_key     e.g. "af_bella"   → used directly if valid in VOICE_REGISTRY
    Falls back to DEFAULT_REGISTRY_KEY if neither matches.
    """
    from engines.tts import VOICE_REGISTRY

    # 1. Try client_voice_id lookup (primary path)
    mapped = CLIENT_TO_REGISTRY_KEY_MAP.get(client_voice_id)
    if mapped:
        return mapped

    # 2. Accept raw registry key directly (e.g. "af_bella", "bm_lewis")
    if client_voice_id in VOICE_REGISTRY:
        return client_voice_id

    # 3. Fallback
    return DEFAULT_REGISTRY_KEY


def get_voice_profile(client_voice_id: str) -> Optional[ClientVoiceProfile]:
    """Lookup by client_voice_id or registry_key — accepts either."""
    # Try direct client_voice_id first
    profile = _VOICE_PROFILE_BY_CLIENT_ID.get(client_voice_id)
    if profile:
        return profile
    # Fall back: search by registry_key (e.g. "af_bella" passed directly)
    for p in CLIENT_VOICE_CATALOGUE:
        if p.registry_key == client_voice_id:
            return p
    return None


def list_all_voice_profiles() -> List[Dict[str, Any]]:
    return [
        {
            "client_voice_id": p.client_voice_id,
            "registry_key":    p.registry_key,
            "category":        p.category,
            "gender":          p.gender,
            "voice_name":    p.voice_name,
            "description":     p.description,
        }
        for p in CLIENT_VOICE_CATALOGUE
    ]