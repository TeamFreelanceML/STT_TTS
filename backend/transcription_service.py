import logging

from whisper_engine import WhisperEngine


logger = logging.getLogger("AIJudge.TranscriptionService")


class TranscriptionService:
    def __init__(self, engine: WhisperEngine):
        self.engine = engine

    def transcribe(self, audio_path: str) -> list[dict]:
        logger.info("[PHASE 1] Dispatching audio to transcription engine...")
        return self.engine.transcribe(audio_path)
