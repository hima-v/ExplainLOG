# ExplainLOG — Interactive Visual Analytics for HDFS Log Anomaly Triage

ExplainLOG is a visual analytics dashboard that helps site reliability 
engineers understand failure patterns in Hadoop (HDFS) logs without 
reading raw text. It combines unsupervised anomaly detection, 
interactive coordinated views, and LLM-generated cluster explanations 
in a single interface.

The system detects anomalous block sessions using an LSTM autoencoder, 
groups them into semantic failure clusters using HDBSCAN, and explains 
each cluster in plain English using Llama 3.1 8B running locally via 
Ollama. Four coordinated views — a D3.js timeline, a Deck.gl UMAP 
scatter plot, a session table with color-coded event chips, and an LLM 
explanation panel — are linked via a shared state store so any 
interaction updates all views simultaneously.

## Tech Stack

- **ML Pipeline**: Python, Polars, PyTorch, scikit-learn, UMAP, HDBSCAN
- **Backend**: FastAPI, DuckDB, Ollama (Llama 3.1 8B)
- **Frontend**: React 18, TypeScript, Vite, D3.js, Deck.gl, Zustand

---

## Project Structure

```
ExplainLOG/
├── pipeline/          # ML pipeline (steps 1-6)
├── backend/           # FastAPI server
├── frontend/          # React dashboard
├── data/              # Dataset files go here (see Dataset Setup)
├── precache.py        # Pre-caches LLM explanations before demo
├── checkscores.py     # Utility to inspect anomaly score distributions
└── requirements.txt
```

---

## Dataset Setup

ExplainLOG uses the **HDFS LogHub v1** dataset. The raw files are not 
included in this repository due to size.

**Download from Zenodo:**
```
https://zenodo.org/records/8196385 → download HDFS_v1.zip
```

Extract and place these four files into `data/`:
```
anomaly_label.csv
event_traces.csv
event_matrix.csv
log_templates.csv
```

---

## Installation and Setup

### Prerequisites

- Python 3.10 or higher
- Node.js 18 or higher
- [Ollama](https://ollama.com/download) — install from their website

### 1. Clone the repository

```bash
git clone https://github.com/hima-v/ExplainLOG.git
cd ExplainLOG
```

### 2. Create a Python virtual environment

```bash
python -m venv .venv

# On Windows:
.venv\Scripts\Activate.ps1

# On macOS/Linux:
source .venv/bin/activate
```

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 4. Pull the LLM model

```bash
ollama pull llama3.1:8b
```

This downloads approximately 4.9 GB. Wait for it to complete.

### 5. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

---

## Running the ML Pipeline

Run this once after placing the dataset files in `data/`. It takes 
approximately 20 minutes on a CPU-only machine.

```bash
python -m pipeline.run_all
```

This produces all required Parquet files in `data/processed/`. You do 
not need to re-run the pipeline unless you change the data or parameters.

---

## Execution

You need three terminals running simultaneously. Start them in this order.

### Terminal 1 — Ollama (LLM server)

```bash
ollama serve
```

Leave this running. On Windows, Ollama may start automatically after 
installation. If you see `address already in use`, it is already 
running — skip this step.

### Terminal 2 — Backend

```bash
cd backend

# activate your virtual environment if not already active
# Windows: ..\.venv\Scripts\Activate.ps1
# macOS/Linux: source ../.venv/bin/activate

uvicorn main:app --reload --port 8000
```

Wait until you see `Application startup complete.`

API documentation available at: `http://localhost:8000/docs`

### Terminal 3 — Frontend

```bash
cd frontend
npm run dev
```

Wait until you see `Local: http://localhost:5173/`

Open `http://localhost:5173` in your browser.

---

## Pre-caching LLM Explanations (Run before first use)

The first LLM call per cluster takes ~50 seconds on CPU. Run this once 
with the backend already running to pre-cache all 8 cluster explanations:

```bash
# in a new terminal, from the repo root
python precache.py
```

This takes approximately 7 minutes total. After it finishes, all 
explanations load in under 100ms from disk cache.

---

## Using the Dashboard

1. **Timeline** — drag to brush a time window; the scatter plot dims 
   points outside the selection
2. **UMAP Scatter** — click any colored cluster to select it
3. **Session Table** — shows individual block sessions for the selected 
   cluster with color-coded event chips (blue = normal, red = exception)
4. **LLM Explain** — shows a plain-language explanation of the selected 
   cluster's failure pattern; use Confirm/Reject to record your feedback

---

## Known Limitations

- First LLM explanation per cluster takes ~50 seconds on CPU (instant 
  after pre-caching)
- Some UMAP clusters overlap visually because dimensionality reduction 
  from 29D to 2D loses some separation
- The timeline uses synthetic hourly binning since raw HDFS timestamps 
  are not directly available in the pre-parsed dataset files
