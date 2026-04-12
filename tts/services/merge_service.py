"""
services/merge_service.py
-------------------------
Merge individual chunk WAV files into a single final narration WAV.

Used by the API after all Celery chunk tasks complete.
Cached by job_id so repeat polls return immediately.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Dict, Optional

import numpy as np

logger = logging.getLogger(__name__)

from utils.config import settings

SAMPLE_RATE       = 24_000
INTER_CHUNK_MS    = settings.INTER_CHUNK_MS
INTER_PARA_MS     = settings.INTER_PARA_MS
SILENCE_DTYPE     = np.float32


def _make_silence(duration_ms: int) -> np.ndarray:
    samples = int(SAMPLE_RATE * duration_ms / 1000)
    return np.zeros(samples, dtype=SILENCE_DTYPE)


def _load_wav(audio_url: str, cache_dir: Path) -> Optional[np.ndarray]:
    """Load a WAV file from the audio cache. Returns None on failure."""
    if not audio_url:
        return None
    filename  = Path(audio_url).name
    wav_path  = cache_dir / filename
    if not wav_path.exists():
        logger.warning("WAV not found for merge: %s", filename)
        return None
    try:
        import soundfile as sf
        samples, _ = sf.read(str(wav_path), dtype="float32")
        return samples
    except Exception as e:
        logger.error("Failed to load WAV %s: %s", filename, e)
        return None


def _merge_audio_segments_sync(
    segments:  List[Dict],
    job_id:    str,
) -> str:
    """
    Merge a list of audio segments into one WAV file.

    Args:
        segments:  List of {"audio_url": str, "duration_ms": int}
        job_id:    Used to name the merged output file.

    Returns:
        URL of the merged WAV file, e.g. "/audio/merged_<job_id>.wav"
        Returns "" if no valid segments found.
    """
    from services.story_tts_service import AUDIO_CACHE_DIR

    merged_filename = f"merged_{job_id}.wav"
    merged_path     = AUDIO_CACHE_DIR / merged_filename
    merged_url      = f"/audio/{merged_filename}"

    # Return cached merge
    if merged_path.exists():
        return merged_url

    all_samples: List[np.ndarray] = []

    for idx, segment in enumerate(segments):
        chunk_samples = _load_wav(segment.get("audio_url", ""), AUDIO_CACHE_DIR)

        if chunk_samples is not None:
            all_samples.append(chunk_samples.astype(SILENCE_DTYPE))
        else:
            # Insert silence placeholder matching expected duration
            duration_ms = segment.get("duration_ms", 500)
            all_samples.append(_make_silence(duration_ms))

        if idx < len(segments) - 1:
            if segment.get("is_last_in_para", False):
                all_samples.append(_make_silence(INTER_PARA_MS))
            else:
                chunk_text = segment.get("chunk_text", "").strip()
                if chunk_text.endswith(","):
                    all_samples.append(_make_silence(150))
                elif chunk_text.endswith((".", "?", "!")):
                    all_samples.append(_make_silence(450))
                else:
                    all_samples.append(_make_silence(INTER_CHUNK_MS))

    if not all_samples:
        logger.error("No audio segments to merge for job %s", job_id)
        return ""

    merged_samples = np.concatenate(all_samples)

    try:
        import soundfile as sf
        import tempfile, os
        fd, tmp = tempfile.mkstemp(dir=str(AUDIO_CACHE_DIR), suffix=".wav.tmp")
        os.close(fd)
        sf.write(tmp, merged_samples.astype(np.float32), SAMPLE_RATE,
                 subtype="PCM_16", format="WAV")
        os.replace(tmp, str(merged_path))
        logger.info(
            "Merged %d segments → %s (%.1fs)",
            len(segments), merged_filename, len(merged_samples) / SAMPLE_RATE,
        )
        return merged_url
    except Exception as e:
        logger.error("Merge failed for job %s: %s", job_id, e)
        return ""


async def merge_audio_segments(
    segments: List[Dict],
    job_id:   str,
) -> str:
    """Async wrapper — runs blocking merge in thread executor."""
    import asyncio
    return await asyncio.to_thread(_merge_audio_segments_sync, segments, job_id)