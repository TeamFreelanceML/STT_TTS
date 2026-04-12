import logging
import os
import subprocess
import tempfile


logger = logging.getLogger("AIJudge.AudioPreprocess")


def trim_trailing_silence(audio_path: str) -> str:
    """Trim only trailing silence while preserving the original speech timing."""
    trimmed_path = tempfile.NamedTemporaryFile(delete=False, suffix=".webm").name

    ffmpeg_cmd = [
        "ffmpeg",
        "-y",
        "-i",
        audio_path,
        "-af",
        "areverse,silenceremove=start_periods=1:start_silence=0.5:start_threshold=-45dB,areverse",
        "-c:a",
        "libopus",
        trimmed_path,
    ]

    try:
        logger.info("[PHASE 0.5] Trimming trailing silence before transcription...")
        completed = subprocess.run(
            ffmpeg_cmd,
            capture_output=True,
            text=True,
            check=False,
        )

        if completed.returncode != 0:
            logger.warning("[PHASE 0.5] Trailing silence trim failed. Falling back to original audio.")
            logger.warning(completed.stderr.strip())
            if os.path.exists(trimmed_path):
                os.remove(trimmed_path)
            return audio_path

        if not os.path.exists(trimmed_path) or os.path.getsize(trimmed_path) == 0:
            logger.warning("[PHASE 0.5] Trimmed file invalid. Falling back to original audio.")
            if os.path.exists(trimmed_path):
                os.remove(trimmed_path)
            return audio_path

        logger.info("[PHASE 0.5] Trailing silence trimmed successfully.")
        return trimmed_path
    except Exception as exc:
        logger.warning(f"[PHASE 0.5] Trailing silence trim errored: {exc}. Falling back to original audio.")
        if os.path.exists(trimmed_path):
            os.remove(trimmed_path)
        return audio_path


def cleanup_temp_paths(*paths: str) -> None:
    for cleanup_path in set(paths):
        if not cleanup_path or not os.path.exists(cleanup_path):
            continue
        try:
            logger.info(f"[*] Lifecycle: Attempting deletion of temp file: {cleanup_path}")
            os.remove(cleanup_path)
        except Exception as cleanup_err:
            logger.warning(f"[CLEANUP WARNING] Could not delete temp file '{cleanup_path}': {cleanup_err}")
            logger.info("[*] This is likely a temporary Windows file lock from FFmpeg/Whisper. Data flow will continue.")
