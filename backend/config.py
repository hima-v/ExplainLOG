"""Central path + setting config. Everything else imports from here so we never
hardcode a Windows path somewhere deep in a route handler."""
from pathlib import Path
import os

# backend/ -> explainlog/  so data/ sits next to backend/, not inside it
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"
PROCESSED = DATA_DIR / "processed"
LLM_CACHE_DIR = DATA_DIR / "llm_cache"
FEEDBACK_FILE = DATA_DIR / "feedback.jsonl"

SESSIONS_PARQUET = PROCESSED / "sessions.parquet"
SCORED_PARQUET = PROCESSED / "scored.parquet"
EMBEDDINGS_PARQUET = PROCESSED / "embeddings.parquet"
CLUSTERS_PARQUET = PROCESSED / "clusters.parquet"
CLUSTER_SUMMARY_JSON = PROCESSED / "cluster_summary.json"

# one env var flips the whole LLM backend; default to local Ollama (zero cost)
LLM_BACKEND = os.getenv("LLM_BACKEND", "ollama")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-lite")

CORS_ORIGINS = ["http://localhost:5173"]
TIMELINE_BINS = 38  # dataset spans ~38 hours (Nov 9-11 2008)
