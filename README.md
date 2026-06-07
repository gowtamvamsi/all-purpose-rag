# 🧠 All Purpose RAG

A full-stack **Retrieval Augmented Generation (RAG)** application that lets you upload documents, process them with OCR, and query them using local or cloud LLMs.

![Tech Stack](https://img.shields.io/badge/Next.js-14-black?logo=next.js) ![FastAPI](https://img.shields.io/badge/FastAPI-0.110-green?logo=fastapi) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-blue?logo=postgresql) ![Ollama](https://img.shields.io/badge/Ollama-Llama3-orange)

## ✨ Features

- 📄 **Multi-format document ingestion** — PDF, DOCX, PPTX, CSV, TXT, images
- 🔍 **OCR support** — Tesseract fallback for scanned/image-based PDFs
- 🧩 **Semantic search** — pgvector embeddings for similarity search
- 💬 **Streaming RAG conversations** — with source citations and page numbers
- 🤖 **Multi-model LLM support** — Llama 3 (Ollama), Gemini, Anthropic Claude
- 🌐 **Bulk URL import** — scrape and import PDFs from any webpage
- 📁 **Project-based organization** — separate knowledge bases per project
- ⚡ **Async processing** — Celery + Redis worker pipeline

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.11 |
| Database | PostgreSQL + pgvector |
| Queue | Celery + Redis |
| OCR | pdfplumber + Tesseract |
| LLMs | Ollama (local), Gemini, Anthropic |
| Auth | JWT |

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL with pgvector extension
- Redis
- Tesseract OCR: `brew install tesseract`
- Ollama: [ollama.ai](https://ollama.ai) with `ollama pull llama3`

### Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Copy and fill in your environment variables
cp .env.example .env

# Initialize the database
python init_db.py

# Start the API server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# In a separate terminal, start the Celery worker
celery -A workers.celery_app worker --loglevel=info --concurrency=6
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

See [`backend/.env.example`](backend/.env.example) for all required variables:

```env
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/ragdb
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
GEMINI_API_KEY=           # Optional — for Gemini models
ANTHROPIC_API_KEY=        # Optional — for Claude models
OPENAI_API_KEY=           # Optional — for OpenAI models
```

## 📖 Usage

1. **Create a project** — organizes your documents into separate knowledge bases
2. **Upload documents** — drag & drop files or import from a URL
3. **Wait for processing** — Celery workers extract and embed text chunks
4. **Chat** — ask questions and get answers with source citations

## 🏗 Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Next.js UI │────▶│  FastAPI     │────▶│  PostgreSQL      │
│  (port 3000)│     │  (port 8000) │     │  + pgvector      │
└─────────────┘     └──────┬───────┘     └─────────────────┘
                           │
                    ┌──────▼───────┐     ┌─────────────────┐
                    │  Redis Queue │────▶│  Celery Workers  │
                    └──────────────┘     │  (OCR + Embed)   │
                                         └─────────────────┘
```

## 📄 License

MIT
