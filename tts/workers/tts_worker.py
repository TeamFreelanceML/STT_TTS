"""
workers/tts_worker.py
---------------------
Celery worker — synthesizes individual chunks only.

The story orchestration (dispatching + assembling) is done by the FastAPI
endpoint directly using asyncio. This avoids the Celery anti-pattern of
calling result.get() inside a task.

Start workers:
    # Windows dev
    celery -A workers.tts_worker worker --concurrency=1 --loglevel=info --pool=solo --hostname=worker1@%h
    # (run_prod.py starts all workers automatically)

    # Linux production
    celery -A workers.tts_worker worker --concurrency=4 --pool=prefork --loglevel=info
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, Optional

from celery import Celery
from celery.signals import worker_process_init
from kombu import Queue
from utils.config import settings

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# CELERY APP
# ─────────────────────────────────────────────────────────────────────────────

REDIS_URL = settings.REDIS_URL

celery_app = Celery("tts_worker", broker=REDIS_URL, backend=REDIS_URL)

celery_app.conf.update(
    task_serializer            = "json",
    result_serializer          = "json",
    accept_content             = ["json"],
    task_acks_late             = True,
    task_reject_on_worker_lost = True,
    worker_prefetch_multiplier = 1,
    result_expires             = 3600,
    task_soft_time_limit       = 60,
    task_time_limit            = 90,
    task_queues = (
        Queue("high",   routing_key="high"),
        Queue("normal", routing_key="normal"),
        Queue("low",    routing_key="low"),
    ),
    task_default_queue         = "normal",
    worker_max_tasks_per_child = 200,
    broker_heartbeat           = 0,     # Disable heartbeat to prevent 'drift' warnings during long AI inference
)

# ─────────────────────────────────────────────────────────────────────────────
# PER-WORKER MODEL — one Kokoro instance per worker process
# ─────────────────────────────────────────────────────────────────────────────

_engine: Optional[Any] = None
_engine_lock = __import__('threading').Lock()   # guards lazy init in _get_engine()


@worker_process_init.connect
def _init_worker(**kwargs) -> None:
    global _engine
    try:
        from engines.tts import BritishTTSEngine
        _engine = BritishTTSEngine()
        _engine._model_ready_event.wait(timeout=60)
        logger.info("Worker PID=%d: Kokoro model ready", os.getpid())
    except Exception as e:
        logger.error("Worker PID=%d: Engine init failed: %s", os.getpid(), e)
        _engine = None


def _get_engine() -> Any:
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:   # double-checked locking
                from engines.tts import BritishTTSEngine
                _engine = BritishTTSEngine()
                _engine._model_ready_event.wait(timeout=60)
    return _engine


# ─────────────────────────────────────────────────────────────────────────────
# TASK: SYNTHESIZE ONE CHUNK
# ─────────────────────────────────────────────────────────────────────────────

@celery_app.task(
    bind                = True,
    name                = "tts.synthesize_chunk",
    max_retries         = 2,
    default_retry_delay = 3,
    queue               = "normal",
)
def synthesize_chunk_task(
    self,
    chunk_text:  str,
    voice_key:   str,
    target_wpm:  int,
    chunk_id:    str,
    para_id:     int,
    chunk_index: int,
) -> Dict[str, Any]:
    """
    Synthesize a single text chunk. Returns result dict with audio_url,
    duration_ms, word_timestamps, and metadata.
    """
    t0 = time.perf_counter()
    try:
        engine = _get_engine()
        result = engine.synthesize(
            text       = chunk_text,
            voice_key  = voice_key,
            custom_wpm = target_wpm,
        )
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "synthesize_chunk | chunk_id=%s voice=%s words=%d elapsed=%dms worker=%d",
            chunk_id, voice_key, len(chunk_text.split()), elapsed_ms, os.getpid(),
        )
        return {
            "chunk_id":        chunk_id,
            "para_id":         para_id,
            "chunk_index":     chunk_index,
            "chunk_text":      chunk_text,
            "audio_url":       result.get("audio_url", ""),
            "duration_ms":     result.get("duration_ms", 0),
            "word_timestamps": result.get("word_timestamps", []),
            "worker_pid":      os.getpid(),
            "elapsed_ms":      elapsed_ms,
        }
    except Exception as exc:
        raise self.retry(exc=exc)