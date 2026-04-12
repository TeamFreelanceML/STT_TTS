"""
main.py
-------
Story Narration TTS API — FastAPI application entry point.

Routes:
    POST /narrate              Synthesize a full story narration
    GET  /voices               List all 7 available client voice profiles
    GET  /audio/{filename}     Serve a generated WAV file
    GET  /health               Engine readiness check
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from engines.tts import BritishTTSEngine
from models.tts_models import StoryNarrationRequest, StoryNarrationResponse
from services.story_tts_service import (
    AUDIO_CACHE_DIR,
    KokoroModelNotReadyError,
    list_all_voice_profiles,
    narrate_story,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
application_logger = logging.getLogger("story_tts_api")

tts_engine_instance: BritishTTSEngine | None = None

# Common phrases pre-synthesized on startup so first real requests hit cache instantly.
_PREWARM_TEXTS = [
    "It is the first warm day of spring.",
    "Once upon a time.",
    "The end.",
    "Well done!",
    "Try again.",
    "Good job!",
    "Let us begin.",
]
_PREWARM_VOICES = ["bm_daniel", "bf_lily", "am_puck", "bm_lewis", "bf_alice",
                   "bf_isabella", "am_echo"]


@asynccontextmanager
async def application_lifespan(app: FastAPI):
    global tts_engine_instance

    application_logger.info("Initialising BritishTTSEngine…")
    event_loop = asyncio.get_event_loop()
    tts_engine_instance = await event_loop.run_in_executor(None, BritishTTSEngine)
    application_logger.info("BritishTTSEngine ready — Kokoro model loading in background.")

    AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # Cache warming — pre-synthesize common phrases for all voices in background.
    # Zero latency on repeated requests once warm.
    for _voice_key in _PREWARM_VOICES:
        tts_engine_instance.prewarm(_PREWARM_TEXTS, voice_key=_voice_key)
    application_logger.info(
        "Cache warming started: %d voices × %d phrases.",
        len(_PREWARM_VOICES), len(_PREWARM_TEXTS),
    )

    yield

    application_logger.info("Shutting down BritishTTSEngine.")
    tts_engine_instance = None


story_narration_app = FastAPI(
    title       = "Story Narration TTS API",
    version     = "2.0.0",
    description = (
        "Narrate full stories with paragraph → chunk → word alignment. "
        "7 unique solo Kokoro voices: 2 kid, 2 young, 2 adult, 1 expressive narrator."
    ),
    lifespan    = application_lifespan,
)

AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
story_narration_app.mount(
    "/audio",
    StaticFiles(directory=str(AUDIO_CACHE_DIR)),
    name="audio_cache",
)


@story_narration_app.post(
    "/narrate",
    response_model       = StoryNarrationResponse,
    summary              = "Synthesize a full story narration",
    response_description = "Merged WAV audio URL + full paragraph → chunk → word alignment tree",
)
async def narrate_story_endpoint(
    narration_request: StoryNarrationRequest,
) -> StoryNarrationResponse:
    if tts_engine_instance is None:
        raise HTTPException(status_code=503, detail="TTS engine is not ready. Please retry.")

    application_logger.info(
        "Narration request | story_id=%s voice=%s wpm=%s delimiter=%r paragraphs=%d",
        narration_request.story.id,
        narration_request.voice.voice_id,
        narration_request.speech_config.wpm,
        narration_request.speech_config.chunk_delimiter,
        len(narration_request.text.story_text),
    )

    try:
        narration_response = await narrate_story(narration_request, tts_engine_instance)
    except KokoroModelNotReadyError as model_error:
        application_logger.error("Kokoro model not ready: %s", model_error)
        raise HTTPException(
            status_code = 503,
            detail      = (
                f"{model_error} "
                "Download kokoro-v1.0.onnx and voices-v1.0.bin into the engines/ folder "
                "then restart the server."
            ),
        ) from model_error
    except Exception as synthesis_error:
        application_logger.exception("Narration failed: %s", synthesis_error)
        raise HTTPException(status_code=500, detail=f"Narration error: {synthesis_error}") from synthesis_error

    application_logger.info(
        "Narration complete | story_id=%s duration_ms=%d url=%s",
        narration_request.story.id,
        narration_response.audio.duration_ms,
        narration_response.audio.url,
    )
    return narration_response


@story_narration_app.get("/voices", summary="List all available voice profiles")
async def list_voices_endpoint() -> JSONResponse:
    voice_profiles = list_all_voice_profiles()
    return JSONResponse(content={
        "voices": voice_profiles,
        "total":  len(voice_profiles),
        "categories": {
            "kid":        [v["client_voice_id"] for v in voice_profiles if v["category"] == "kid"],
            "young":      [v["client_voice_id"] for v in voice_profiles if v["category"] == "young"],
            "adult":      [v["client_voice_id"] for v in voice_profiles if v["category"] == "adult"],
            "expressive": [v["client_voice_id"] for v in voice_profiles if v["category"] == "expressive"],
        },
    })


@story_narration_app.get("/audio/{audio_filename}", summary="Download a generated narration WAV file")
async def serve_audio_file_endpoint(audio_filename: str) -> FileResponse:
    safe_filename   = Path(audio_filename).name
    audio_file_path = AUDIO_CACHE_DIR / safe_filename
    if not audio_file_path.exists() or not audio_file_path.is_file():
        raise HTTPException(status_code=404, detail=f"Audio file not found: {safe_filename}")
    return FileResponse(path=str(audio_file_path), media_type="audio/wav", filename=safe_filename)


@story_narration_app.get("/health", summary="Engine readiness check")
async def health_check_endpoint() -> JSONResponse:
    engine_ready = tts_engine_instance is not None
    return JSONResponse(content={
        "status":          "ok" if engine_ready else "degraded",
        "engine_ready":    engine_ready,
        "audio_cache_dir": str(AUDIO_CACHE_DIR.resolve()),
    })


app = story_narration_app