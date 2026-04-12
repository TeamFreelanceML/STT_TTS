# ─────────────────────────────────────────────────────────────────────────────
# Dockerfile — Story Narration TTS API
# ─────────────────────────────────────────────────────────────────────────────

# Production Base: Python 3.11-slim (minimal attack surface, fast boot)
FROM python:3.11-slim

# ── 1. Create Non-Root Service Account ──────────────────────────────────────────
# Enterprise security best practice: Never run web servers as root.
RUN groupadd -r appgroup && useradd -r -s /bin/false -g appgroup appuser

# ── 2. System dependencies ──────────────────────────────────────────────────────
# - libsndfile1 / ffmpeg: Required for audio processing (.wav manipulation)
# - espeak-ng: CRITICAL for Kokoro phonemizer duration ratio mathematics
# - curl: For Docker Healthcheck probing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    espeak-ng \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ── 3. Working directory ────────────────────────────────────────────────────────
WORKDIR /app

# ── 4. Model Weights & Dependencies (Automatic Download) ───────────────────────
# We download during build so the image is self-contained. 
# This bypasses Windows volume mount permission/0kb issues.
COPY download_models.py .
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools && \
    pip install --no-cache-dir huggingface_hub && \
    python download_models.py && \
    rm download_models.py && \
    pip install --no-cache-dir -r requirements.txt

# ── 5. Copy Application Source Code ───────────────────────────────────────────
COPY engines/         engines/
COPY services/        services/
COPY workers/         workers/
COPY models/          models/
COPY utils/           utils/
COPY scripts/         scripts/
COPY main_prod.py     .
COPY run_prod.py      .

# ── 6. Create Directories & Set Permissions ───────────────────────────────────
# The appuser needs explicit rw permissions to the audio cache folder.
RUN mkdir -p audio_cache && \
    chown -R appuser:appgroup /app/audio_cache /app/engines && \
    chmod -R 755 /app/engines

# ── 7. Environment Variables ──────────────────────────────────────────────────
ENV REDIS_URL=redis://redis:6379/0
ENV PORT=8001
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# ── 8. Switch to Secure User ──────────────────────────────────────────────────
USER appuser

# ── 9. Expose API Port ────────────────────────────────────────────────────────
EXPOSE 8001

# ── 10. Auto-healing Healthcheck ──────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# ── 11. Entrypoint ────────────────────────────────────────────────────────────
CMD ["python", "run_prod.py"]