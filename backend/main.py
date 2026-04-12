from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import shutil
import tempfile
import uvicorn
import logging
import traceback
import json

# Module imports
from audio_preprocess_service import cleanup_temp_paths, trim_trailing_silence
from evaluation_service import EvaluationService
from whisper_engine import WhisperEngine
from evaluator import ReadingEvaluator
from timing_utils import TimingCollector
from transcription_service import TranscriptionService

# ---------------------------------------------------------------------------
# Logging System Setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger("AIJudge")

# ---------------------------------------------------------------------------
# FastAPI "Judge" Service
# ---------------------------------------------------------------------------

app = FastAPI(title="Sherpa-Judge Evaluation API", version="2.0.1")
MODEL_NAME = os.getenv("STT_MODEL_NAME", "base")
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))

# SECURITY: Permissive CORS for Local Testing Phase
logger.info("[STARTUP] Applying Global CORS Policy (origins=[*])")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

# ENGINE INITIALIZATION
logger.info(f"[STARTUP] Initializing Whisper Neural Engine ({MODEL_NAME})...")
engine = WhisperEngine(model_name=MODEL_NAME)
transcription_service = TranscriptionService(engine)

logger.info("[STARTUP] Initializing Custom Reading Evaluator...")
evaluator = ReadingEvaluator(similarity_threshold=0.6)
evaluation_service = EvaluationService(evaluator)

@app.post("/evaluate")
async def evaluate_reading(
    audio: UploadFile = File(...),
    expected_text: str = Form(...),
    helper_skipped_words: str | None = Form(None),
):
    logger.info(f"[HANDSHAKE] Request Received: '{audio.filename}'")
    timings = TimingCollector()
    
    if not audio.filename:
        logger.error("[HANDSHAKE] REJECTED: Filename missing.")
        raise HTTPException(status_code=400, detail="No audio file uploaded.")

    # Generate a temporary path to store the incoming stream
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
        temp_path = temp_audio.name
        transcribe_path = temp_path
        try:
            logger.info(f"[*] Stream-writing audio to: {temp_path}")
            shutil.copyfileobj(audio.file, temp_audio)
            
            # Close the file handle explicitly before passing to Whisper
            temp_audio.close()
            
            # Check if file was actually written and has content
            file_size = os.path.getsize(temp_path)
            if file_size == 0:
                logger.error("[PHASE 0] File occupies zero bytes. Transcription aborted.")
                raise HTTPException(status_code=422, detail="Empty audio file provided.")

            with timings.measure("preprocess_ms"):
                transcribe_path = trim_trailing_silence(temp_path)
            transcribe_size = os.path.getsize(transcribe_path)
            
            # --- PHASE 1: WHISPER INFERENCE ---
            logger.info(f"[PHASE 1] Entering Neural Transcription ({transcribe_size} bytes)...")
            try:
                with timings.measure("transcribe_ms"):
                    whisper_words = transcription_service.transcribe(transcribe_path)
                logger.info(f"[PHASE 1] Transcription Complete. {len(whisper_words)} words alignment detected.")
            except Exception as e:
                logger.error(f"[PHASE 1] [CRITICAL] Whisper engine failed: {str(e)}")
                logger.error(traceback.format_exc())
                raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
            
            with timings.measure("evaluate_ms"):
                parsed_helper_skips = []
                if helper_skipped_words:
                    try:
                        candidate = json.loads(helper_skipped_words)
                        if isinstance(candidate, list):
                            parsed_helper_skips = candidate
                    except json.JSONDecodeError:
                        logger.warning("[PHASE 2] helper_skipped_words payload was invalid JSON. Ignoring.")
                results = evaluation_service.evaluate(
                    expected_text,
                    whisper_words,
                    helper_skipped_words=parsed_helper_skips,
                )
            
            # Metadata injection
            results["filename"] = audio.filename
            results["timing"] = timings.as_dict()
            results.setdefault("metadata", {})
            results["metadata"]["processing_time_ms"] = results["timing"]["total_ms"]
            
            logger.info("[PHASE 3] [SUCCESS] Evaluation result generated.")
            return results

        except HTTPException as he:
            # Re-raise known errors
            raise he
        except Exception as e:
            logger.error(f"[CRITICAL] Backend Process Crash: {str(e)}")
            logger.error(traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")
        
        finally:
            cleanup_temp_paths(temp_path, transcribe_path)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "judge-api-v2.0.1", "model": f"whisper-{MODEL_NAME}"}

if __name__ == "__main__":
    logger.info(f"[DAEMON] AI Judge Server waking up on Port {API_PORT}...")
    uvicorn.run(app, host=API_HOST, port=API_PORT)
