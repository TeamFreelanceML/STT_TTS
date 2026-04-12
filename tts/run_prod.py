#!/usr/bin/env python3
"""
run_prod.py
-----------
Production startup script.
Starts Redis check, then Celery workers + API server.

Core allocation strategy (Linux / Oracle Cloud):
    8-core  →  6 Celery  + 2 Uvicorn  (recommended)
    4-core  →  3 Celery  + 1 Uvicorn
    2-core  →  1 Celery  + 1 Uvicorn

    Celery workers do the heavy Kokoro synthesis (CPU-bound).
    Uvicorn workers handle async HTTP dispatch (I/O-bound).
    Always reserve at least 1 core for OS + Redis overhead.

Usage:
    # Linux / Oracle Cloud (auto-detects cores)
    python run_prod.py

    # Force specific allocation
    python run_prod.py --workers 6 --api-workers 2

    # Windows dev
    python run_prod.py --windows
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
import signal

# Ensure the project root is in the search path for robust imports in production/docker
project_root = os.path.dirname(os.path.abspath(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from utils.config import settings


def check_redis() -> bool:
    """Check Redis is reachable before starting workers."""
    try:
        import redis
        r = redis.Redis.from_url(settings.REDIS_URL)
        r.ping()
        print(f"[OK] Redis connected to {settings.REDIS_URL}")
        return True
    except Exception as e:
        print(f"[ERROR] Redis not reachable on {settings.REDIS_URL}: {e}")
        return False


def check_models() -> bool:
    """Explicitly verify Kokoro AI models are present and readable."""
    from pathlib import Path
    
    m_path = Path(settings.KOKORO_MODEL_PATH)
    v_path = Path(settings.KOKORO_VOICES_PATH)
    
    missing = []
    if not m_path.exists():
        missing.append(f"Model missing: {m_path}")
    elif m_path.is_dir():
        missing.append(f"Model is a DIRECTORY (Docker mount error): {m_path}")
    elif m_path.stat().st_size < 1_000_000:
        missing.append(f"Model too small/corrupt: {m_path} ({m_path.stat().st_size} bytes)")
    elif not os.access(m_path, os.R_OK):
        missing.append(f"Model not readable (Permissions): {m_path}")

    if not v_path.exists():
        missing.append(f"Voices missing: {v_path}")
    elif v_path.is_dir():
        missing.append(f"Voices is a DIRECTORY (Docker mount error): {v_path}")
    elif v_path.stat().st_size < 1_000_000:
        missing.append(f"Voices too small/corrupt: {v_path} ({v_path.stat().st_size} bytes)")
    elif not os.access(v_path, os.R_OK):
        missing.append(f"Voices not readable (Permissions): {v_path}")

    if missing:
        print("\n" + "!" * 60)
        print(" [CRITICAL] AI MODEL LOAD FAILURE")
        print("!" * 60)
        for m in missing:
            print(f" - {m}")
        print("\n [FIX] Ensure you ran 'python scripts/download_models.py' on the host.")
        print(" [FIX] If using Docker on Windows, ensure the files are not empty/dirs.")
        print("!" * 60 + "\n")
        return False
    
    print(f"[OK] AI models verified: {m_path.name}, {v_path.name}")
    return True


def get_worker_count() -> int:
    """Return optimal Celery worker count based on CPU cores.

    Allocation table:
        cores=2  → 1 celery + 1 uvicorn
        cores=4  → 3 celery + 1 uvicorn
        cores=8  → 6 celery + 2 uvicorn  ← Oracle Cloud A1.Flex free tier
        cores=16 → 12 celery + 2 uvicorn

    Rule: reserve 2 cores for uvicorn + OS on 4+ core machines.
    """
    cpu_count = os.cpu_count() or 2
    if cpu_count <= 2:
        workers = 1
    elif cpu_count <= 4:
        workers = cpu_count - 1      # 4 cores → 3 celery
    else:
        workers = cpu_count - 2      # 8 cores → 6 celery, 16 → 14
    print(f"[INFO] CPU cores: {cpu_count} | Celery workers: {workers} | Reserved for API+OS: {cpu_count - workers}")
    return workers


def get_api_worker_count(celery_workers: int) -> int:
    """Return optimal uvicorn worker count.

    API workers handle async dispatch only (very lightweight).
    2 is enough for most loads. Increase only if /narrate poll
    becomes the bottleneck.
    """
    cpu_count = os.cpu_count() or 2
    if cpu_count <= 2:
        return 1
    return 2   # 2 uvicorn workers is sufficient for async dispatch


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--windows", action="store_true",
                        help="Use Windows-compatible Celery pool (solo)")
    parser.add_argument("--workers", type=int, default=0,
                        help="Number of Celery workers (default: auto)")
    parser.add_argument("--api-workers", type=int, default=0,
                        help="Number of Uvicorn API workers (default: auto)")
    parser.add_argument("--port", type=int, default=8001,
                        help="API server port")
    parser.add_argument("--warmup", type=int, default=0,
                        help="Seconds to wait for Kokoro model load (default: auto)")
    args = parser.parse_args()

    if not check_redis():
        sys.exit(1)

    if not check_models():
        sys.exit(1)

    worker_count     = args.workers or get_worker_count()
    port             = args.port
    is_windows       = args.windows or sys.platform == "win32"
    api_worker_count = args.api_workers or (1 if is_windows else get_api_worker_count(worker_count))

    # ARM (Oracle Cloud A1) first boot Kokoro load can take 15-25s
    # x86 typically 5-10s. Auto-detect, allow override.
    import platform
    is_arm = platform.machine().lower() in ("aarch64", "arm64", "armv7l")
    default_warmup   = 20 if is_arm else 10
    warmup_seconds   = args.warmup or default_warmup

    processes = []

    # ── Start Celery workers ──────────────────────────────────────────────────
    if is_windows:
        # Windows: solo pool (no fork support), one process per worker
        for i in range(worker_count):
            cmd = [
                sys.executable, "-m", "celery",
                "-A", "workers.tts_worker",
                "worker",
                "--concurrency=1",
                "--pool=solo",
                "--loglevel=info",
                f"--hostname=worker{i+1}@%h",
                "--queues=high,normal,low",
            ]
            print(f"[START] Celery worker {i+1}/{worker_count}")
            p = subprocess.Popen(cmd)
            processes.append(p)
            time.sleep(1)   # Stagger startup to avoid model load race
    else:
        # Linux / Oracle Cloud ARM: prefork pool
        # Each forked worker calls worker_process_init → loads its own Kokoro instance
        # This is safe because model load happens AFTER fork, not before.
        cmd = [
            sys.executable, "-m", "celery",
            "-A", "workers.tts_worker",
            "worker",
            f"--concurrency={worker_count}",
            "--pool=prefork",
            "--loglevel=info",
            "--queues=high,normal,low",
            "--optimization=fair",
            "--without-gossip",       # reduce Redis chatter on cloud
            "--without-mingle",       # skip worker sync on startup (faster boot)
            "--without-heartbeat",    # reduce broker load (enable if monitoring needed)
        ]
        print(f"[START] Celery prefork pool (concurrency={worker_count})")
        p = subprocess.Popen(cmd)
        processes.append(p)

    # ARM Kokoro model load is slower — wait long enough for all workers to be ready
    # If warmup is too short, first requests hit uninitialized workers → 503
    print(f"[WAIT] Waiting {warmup_seconds}s for Kokoro model load ({'ARM' if is_arm else 'x86'})...")
    time.sleep(warmup_seconds)

    # ── Start FastAPI server ──────────────────────────────────────────────────
    api_cmd = [
        sys.executable, "-m", "uvicorn",
        "main_prod:app",
        "--host", "0.0.0.0",
        "--port", str(port),
        "--workers", str(api_worker_count),
        "--loop", "uvloop",           # faster event loop (Linux/ARM)
        "--http", "httptools",        # faster HTTP parser
        "--timeout-keep-alive", "30",
    ] if not is_windows else [
        sys.executable, "-m", "uvicorn",
        "main_prod:app",
        "--host", "0.0.0.0",
        "--port", str(port),
        "--workers", "1",
        "--reload",
    ]

    print(f"[START] API server on port {port} (uvicorn workers={api_worker_count})")
    api_proc = subprocess.Popen(api_cmd)
    processes.append(api_proc)

    cpu_count = os.cpu_count() or 2
    print(f"\n{'='*55}")
    print(f"  Story TTS API  →  http://0.0.0.0:{port}")
    print(f"  Platform       →  {'ARM' if is_arm else 'x86'} | {cpu_count} cores")
    print(f"  Celery workers →  {worker_count}  (TTS synthesis)")
    print(f"  API workers    →  {api_worker_count}  (HTTP dispatch)")
    print(f"  Docs           →  http://localhost:{port}/docs")
    print(f"  Health         →  http://localhost:{port}/health")
    print(f"{'='*55}\n")
    def shutdown_all(signum=None, frame=None):
        print(f"\n[STOP] Signal {signum} received. Shutting down...")
        for p in processes:
            p.terminate()
        for p in processes:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        print("[DONE] All processes stopped")
        sys.exit(0)

    # Register for both Ctrl+C and SIGTERM (docker stop)
    signal.signal(signal.SIGINT,  shutdown_all)
    signal.signal(signal.SIGTERM, shutdown_all)

    try:
        print("Story TTS Live | Press Ctrl+C to stop\n")
        # Keep main thread alive while subprocesses run
        while True:
            all_alive = True
            for p in processes:
                if p.poll() is not None:
                    print(f"[CRITICAL] Process {p.pid} exited early (code {p.returncode})")
                    all_alive = False
            if not all_alive:
                shutdown_all(signum="PROCESS_EXIT")
            time.sleep(5)
    except Exception as e:
        print(f"[CRITICAL] Startup error: {e}")
        shutdown_all()


if __name__ == "__main__":
    main()