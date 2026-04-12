# TeamFreelanceML / STT_TTS

A production-grade, Unified Speech-to-Text (STT) and Text-to-Speech (TTS) Monorepo. This repository provides a complete end-to-end solution for guided reading, real-time highlighting, and pedagogical evaluation.

---

## 🚀 Key Features

### 1. Real-Time Highlighting (STT)
- **Neural Engine**: Uses `Sherpa-ONNX` (WASM) for sub-100ms word-level tracking.
- **Resilient**: Handles children's speech and background noise via local inference.
- **Guided Experience**: Context-aware blurring of non-active passage text.

### 2. Deep-Report Evaluation
- **Whisper Inference**: Uses OpenAI's Whisper `base` for high-accuracy session transcription.
- **Pedagogical Metrics**: Detailed scoring of Accuracy, Fluency (WCPM), and Chunking.
- **Error Analysis**: Detects wrong words, skips, repetitions, and extra words.

### 3. Production TTS (Kokoro)
- **Engine**: FastAPI-based orchestration of the Kokoro ONNX model.
- **Pre-warming**: Intelligent caching to ensure zero-latency word-level help.
- **Admin Dashboard**: Dedicated panel for managing voices and system stats.

---

## 🏗️ Architecture

```text
TeamFreelanceML/STT_TTS
├── frontend/          # Next.js 16 App (Guided Reading UI)
├── backend/           # FastAPI Evaluation Service (Whisper)
├── tts/               # FastAPI Narration Service (Kokoro)
│   └── admin-panel/   # Next.js Management Dashboard
└── docker-compose.yml # Unified Orchestration
```

---

## 🛠️ Quick Start (Production)

### 1. Requirements
- Docker & Docker Compose
- Windows (WSL2 recommended), Linux, or macOS

### 2. Launching the Stack
Clone the repository and run:
```bash
docker compose up --build
```
The system will automatically download all required neural weights (~1GB) during the build phase.

### 3. Accessing Services
- **Main Reader**: [http://localhost:3000](http://localhost:3000)
- **Production Backend**: [http://localhost:8000](http://localhost:8000)
- **TTS Generator**: [http://localhost:8001](http://localhost:8001)
- **Admin Dashboard**: [http://localhost:8002](http://localhost:8002)

---

## 🔒 Security & Performance
- **COOP/COEP Headers**: Enforced to enable `SharedArrayBuffer` for the neural highlighter.
- **Unified Stream**: Shared microphone architecture prevents hardware resource conflicts.
- **Internal Proxying**: All service discovery is handled via internal Docker networking—no static IPs required.

---

## 📜 Repository Structure & Audit
This code has undergone a **System Engineering Audit** to ensure it is battery-included and production-ready. 
- **Relative Pathing**: Every asset (WASM, Models) is addressed via relative paths inside the container.
- **Reverse Proxy**: Next.js serves as the entry point, routing requests to internal containers securely.

Developed by **Antigravity** for **TeamFreelanceML**.
