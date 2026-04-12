# 🎙️ TTS-V1: Enterprise Text-to-Speech Engine & Active Reader

**TTS-V1** is an end-to-end, production-grade Text-to-Speech narration pipeline and interactive reading dashboard. Designed by `TeamFreelanceML`, this architecture strictly separates high-performance audio synthesis from a dynamic, real-time React web application capable of mapping phonemic word-timers flawlessly to a user-facing visual interface.

---

## 🚀 Features

- **High-Fidelity AI Audio:** Powered by the lightweight, ultra-fast `Kokoro ONNX` model.
- **NLP Text Normalization:** Built-in Python scripts automatically expand abbreviations, currencies, and numbers to ensure bulletproof TTS parsing.
- **Intelligent Auto-Chunking:** Automatically slices giant Wikipedia-sized text blocks dynamically using sentence boundaries (`.?!`) via strict string alignment math.
- **Dynamic Rest Pauses:** The merging engine automatically detects commas `,` vs periods `.` and injects human-like 150ms and 450ms breathing delays.
- **Perfect UI Sync Tracking:** Emits `start_ms` and `end_ms` for every single synthesized word, mathematically ensuring the React UI highlights never drift relative to the audio.
- **Next.js Admin Dashboard:** A gorgeous client-facing dashboard to view synthesized stories, monitor Redis job statuses, and test the Active Reader word synchronization in real-time.

---

## 🛠️ Architecture

- **Backend:** FastAPI (Python 3.10+) ⚡
- **Engine:** Kokoro V1.0 (ONNX Runtime) 🧠
- **Queue System:** Celery Worker + Redis 📦
- **Frontend Dashboard:** Next.js (App Router), React, Tailwind CSS 🎨

---

## 📥 Getting Started

### 1. Download the AI Voice Weights
Because GitHub disables files larger than 100MB, the massive Kokoro AI voice models are excluded from version control. 

To fetch the weights instantly, simply run our automated Python downloader which securely retrieves the `kokoro-v1.0.onnx` and `voices-v1.0.bin` files directly into your project:

```bash
python scripts/download_models.py
```

### 2. Start the Backend Infrastructure
Make sure Docker Desktop is open. Then boot the Python Backend, the Celery Task Routers, and the Redis Cache using the unified Docker file.

```bash
docker-compose up --build
```
*(The API will launch strictly on `http://localhost:8000`)*

### 3. Start the Next.js Admin Panel
Open a new terminal and initialize the stunning React dashboard UI.

```bash
cd admin-panel
npm install
npm run dev
```

Navigate to `http://localhost:3000` to interact with your stunning new platform!

---

## 📝 Usage
Upload your text dynamically from the Next.js `Narrate` tab. The backend will physically chunk your text into optimal chunks, synthesize individual `.wav` files via Kokoro simultaneously via parallel Celery shards, merge them with dynamic breath delays in `merge_service.py`, and beam the audio + word timestamps straight back to the Dashboard for instantaneous live preview!
