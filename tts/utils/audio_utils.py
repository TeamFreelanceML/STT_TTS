"""
utils/audio_utils.py
--------------------
Low-level audio helpers for the Story Narration TTS pipeline.

All audio is represented as float32 numpy arrays at 24 kHz mono.
Public API (used by story_tts_service.py):

    load_wav_file(path)                    → (samples, sample_rate)
    save_wav_file(samples, path, sr)       → None
    make_silence_array(duration_ms, sr)    → np.ndarray
    concat_audio_segments(segments)        → np.ndarray
    audio_duration_ms(samples, sr)         → int
    ms_to_sample_count(ms, sr)             → int
    sample_count_to_ms(samples, sr)        → int
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Tuple

import numpy as np
import soundfile as sf

# ─────────────────────────────────────────────────────────────────────────────
# AUDIO CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

SAMPLE_RATE: int = 24_000

# Silence injected between consecutive narration chunks within a paragraph
INTER_CHUNK_PAUSE_MS: int = 300

# Silence injected between paragraphs
INTER_PARAGRAPH_PAUSE_MS: int = 600


# ─────────────────────────────────────────────────────────────────────────────
# UNIT CONVERSION
# ─────────────────────────────────────────────────────────────────────────────

def ms_to_sample_count(duration_ms: int, sample_rate: int = SAMPLE_RATE) -> int:
    """Convert a duration in milliseconds to the equivalent sample count."""
    return int((duration_ms / 1000.0) * sample_rate)


def sample_count_to_ms(sample_count: int, sample_rate: int = SAMPLE_RATE) -> int:
    """Convert a sample count to the equivalent duration in milliseconds."""
    return int((sample_count / sample_rate) * 1000)


# ─────────────────────────────────────────────────────────────────────────────
# FILE I/O
# ─────────────────────────────────────────────────────────────────────────────

def load_wav_file(file_path: str) -> Tuple[np.ndarray, int]:
    """
    Load a WAV file from disk as a float32 mono array.

    Multi-channel files are mixed down to mono by averaging channels.

    Args:
        file_path: Absolute or relative path to the .wav file.

    Returns:
        Tuple of (audio_samples: float32 np.ndarray, sample_rate: int).
    """
    audio_data, sample_rate = sf.read(file_path, dtype="float32", always_2d=False)

    if audio_data.ndim > 1:
        # Mix down to mono
        audio_data = audio_data.mean(axis=1)

    return audio_data.astype(np.float32), sample_rate


def save_wav_file(
    audio_samples: np.ndarray,
    output_path: str,
    sample_rate: int = SAMPLE_RATE,
) -> None:
    """
    Save a float32 audio array to a 16-bit PCM WAV file.

    Parent directories are created automatically if they do not exist.

    Args:
        audio_samples: float32 numpy array of audio samples.
        output_path:   Destination file path (should end with .wav).
        sample_rate:   Sample rate in Hz (default: 24 000).
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    sf.write(output_path, audio_samples, sample_rate, subtype="PCM_16")


# ─────────────────────────────────────────────────────────────────────────────
# SILENCE GENERATION
# ─────────────────────────────────────────────────────────────────────────────

def make_silence_array(
    duration_ms: int,
    sample_rate: int = SAMPLE_RATE,
) -> np.ndarray:
    """
    Generate a float32 zero array representing silence of the given duration.

    Args:
        duration_ms:  Length of the silence in milliseconds.
        sample_rate:  Sample rate in Hz.

    Returns:
        float32 numpy array of zeros with length = ms_to_sample_count(duration_ms).
    """
    num_samples = ms_to_sample_count(duration_ms, sample_rate)
    return np.zeros(num_samples, dtype=np.float32)


# ─────────────────────────────────────────────────────────────────────────────
# AUDIO MERGING
# ─────────────────────────────────────────────────────────────────────────────

def concat_audio_segments(audio_segments: List[np.ndarray]) -> np.ndarray:
    """
    Concatenate a list of float32 audio arrays into one contiguous array.

    Silence padding and ordering are the caller's responsibility.
    Returns an empty float32 array if the input list is empty.

    Args:
        audio_segments: Ordered list of float32 audio arrays.

    Returns:
        Single float32 numpy array containing all segments in order.
    """
    if not audio_segments:
        return np.array([], dtype=np.float32)

    return np.concatenate(audio_segments, axis=0).astype(np.float32)


# ─────────────────────────────────────────────────────────────────────────────
# DURATION
# ─────────────────────────────────────────────────────────────────────────────

def audio_duration_ms(
    audio_samples: np.ndarray,
    sample_rate: int = SAMPLE_RATE,
) -> int:
    """
    Return the duration of an audio array in milliseconds.

    Args:
        audio_samples: float32 numpy array of audio samples.
        sample_rate:   Sample rate in Hz.

    Returns:
        Duration in milliseconds (integer).
    """
    return sample_count_to_ms(len(audio_samples), sample_rate)