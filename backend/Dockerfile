FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir "pip<25" "setuptools<81" wheel packaging
RUN pip install --no-cache-dir --no-build-isolation openai-whisper==20231117
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the Whisper model so it's baked into the image
RUN python -c "import whisper; whisper.load_model('base')"

COPY . .

EXPOSE 8000

CMD ["python", "main.py"]
