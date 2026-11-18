# ExplainLOG: Human-in-the-Loop Log Anomaly Triage

**A visual analytics dashboard for debugging distributed system logs.** PyTorch · FastAPI · DuckDB · Ollama · React · D3.js · Deck.gl

<p align="center">
  <img src="docs/screenshots/1794963891369_Screenshot%202026-06-05%20224418.png" alt="ExplainLOG dashboard" width="720">
</p>

Anomaly detectors can tell an engineer *that* something broke. They rarely say *what kind* of failure it was or where to look next, so engineers end up grepping through raw logs. ExplainLOG closes that gap. It scans 11.2M Hadoop (HDFS) log lines, flags anomalous sessions with an LSTM autoencoder, groups them into 8 failure types, and explains each one in plain English with a locally hosted LLM. Engineers stay in the loop: they explore through four linked views and confirm or reject every explanation.

Built for ECS 273 (Visual Analytics) at UC Davis, Apr to Jun 2026.

**[▶ Watch the demo](https://www.youtube.com/watch?v=kryHn7lxNOA)** · **[Read the project report (PDF)](docs/explainlog-visual-analytics.pdf)**

### At a glance

| | |
|---|---|
| **Scale** | 11.2M log lines, 575,061 sessions, 12,149 flagged |
| **Detection** | 0.71 F1 (LSTM autoencoder) vs. 0.09 (Isolation Forest) |
| **Latency** | API responses under 100ms; cached LLM explanations 50s → under 100ms |
| **Rendering** | 12,149 points at 60fps with WebGL |
| **User study** | 17 of 20 ratings found explanations useful |
| **Footprint** | Runs on a laptop (i5, 16 GB RAM, no GPU), no cloud dependencies |

## Results

| Detector | Precision | Recall | F1 |
|---|---|---|---|
| Isolation Forest (baseline) | 0.046 | 0.740 | 0.087 |
| **LSTM autoencoder** | **0.841** | **0.607** | **0.705** |

- **Clustering:** 12,149 flagged sessions grouped into 8 distinct failure types (down from 235 noisy micro-clusters), silhouette score 0.258.
- **Explanations:** in a 10-person study, 17 of 20 ratings confirmed the LLM explanations were useful. All 3 rejections pointed to the same gap (generic next steps for mixed clusters), which shows the feedback loop catching real weaknesses.

## System Design and Architecture

ExplainLOG separates **offline computation** from **online serving**, so nothing expensive runs while an engineer is clicking around.

```
OFFLINE  ·  runs once, ~20 min on CPU
  HDFS logs (11.2M lines, 575K sessions)
    → Load + validate      Polars, join and label checks
    → Featurize            event sequences (len 50) + 29-dim count vectors
    → Detect               LSTM autoencoder, Isolation Forest baseline  → 12,149 flagged
    → Reduce + cluster     UMAP to 2D, HDBSCAN + signature merging      → 8 failure groups
    → Write artifacts      Parquet + JSON
                                   │
ONLINE  ·  interactive, data queries under 100ms
  FastAPI ── DuckDB views over Parquet (no inference on the request path)
    ├─ REST   /clusters  /clusters/{id}/sessions  /embeddings  /timeline
    ├─ SSE    /clusters/{id}/explain ── disk cache ──▶ Ollama | Gemini
    └─ POST   /feedback ──▶ feedback.jsonl
                                   │
  React + TypeScript dashboard, one shared Zustand store
    Timeline (D3) · Scatter (Deck.gl, WebGL) · Session table · Explain panel
```

### Key design decisions

- **Precompute, then serve.** The ML pipeline writes Parquet artifacts once. FastAPI queries them through DuckDB views, so there's no model inference on the request path and API latency stays under 100ms no matter how big the dataset is.
- **Cache the slow part.** A cold LLM call takes about 50s on CPU. Explanations are cached on disk, keyed by a SHA-256 fingerprint of each cluster's event signature and size bucket, so repeat requests return in under 100ms. A pre-cache script warms all 8 groups before a demo.
- **Stream instead of block.** On a cache miss, tokens stream to the browser over Server-Sent Events, so the user sees progress right away. SSE was chosen over WebSockets because the data only flows one way.
- **Swappable LLM backend.** Ollama (local, default) and Gemini (hosted fallback) sit behind one async streaming interface, picked by an environment variable. Local by default keeps infrastructure logs on the machine.
- **Structured, validated output.** The model is constrained to JSON (summary, pattern, likely cause, severity, next steps), validated before caching, with a rule-based fallback if the model is unreachable.
- **WebGL where the DOM breaks down.** SVG slows down past about 5K nodes, so the scatter plot uses Deck.gl to keep 12,149 points at 60fps.
- **One shared state store.** Linking and brushing works through a single Zustand store, so one interaction updates every view at once.
- **Human feedback as data.** Confirm/Reject is appended to a JSONL log that doubles as a labeled evaluation set. It already surfaced which clusters need better prompts.

### Why an LSTM autoencoder

HDFS failures show up in the *order* of events, not their counts. `E22 → E5 → E7` and `E22 → E5 → E26` have the same counts but end differently. The LSTM learns normal sequences and flags sessions it can't reconstruct. Isolation Forest only sees count vectors, which is why it flags almost half the dataset and gets 0.046 precision.

## Demo

<p align="center">
  <a href="https://www.youtube.com/watch?v=kryHn7lxNOA"><img src="https://img.youtube.com/vi/kryHn7lxNOA/hqdefault.jpg" alt="ExplainLOG demo video" width="480"></a>
</p>

## Screenshots

**Timeline + UMAP scatter.** Brushing a 16-hour window filters the scatter plot. Each dot is a flagged session, colored by failure cluster, with hover details.

<p align="center">
  <img src="docs/screenshots/1794963891369_Screenshot%202026-06-05%20224019.png" alt="Timeline and scatter" width="420">
</p>

**Cluster detail + LLM explanation.** Top event templates, the cluster's score distribution against 558K normal sessions, and the explanation with severity and Confirm/Reject.

<p align="center">
  <img src="docs/screenshots/1794963891369_Screenshot%202026-06-05%20224039.png" alt="Cluster detail and LLM explanation" width="560">
</p>

**Spotting a burst.** Anomalies climb sharply in the last hours of the 38-hour trace. Brushing just that window narrows every other view to it.

<p align="center">
  <img src="docs/screenshots/1794963906539_Screenshot%202026-06-05%20223716.png" alt="Timeline brush on the anomaly spike" width="520">
</p>

## Failure Groups Found


| Cluster | Sessions | Dominant events | Failure type |
|---|---|---|---|
| 0 | 939 | E5, E22, E7 | receiveBlock exception |
| 3 | 183 | E5, E22, E26 | completion variant |
| 5 | 523 | E4, E5, E22 | block delete |
| 6 | 1,394 | E26, E5, E21 | incomplete replication |
| 7 | 216 | E5, E26, E21 | replication variant |
| 8 | 1,738 | E26, E5, E11 | PacketResponder failure |
| 14 | 1,568 | E3, E26, E5 | served block anomaly |
| −1 | 5,588 | mixed | noise |

## Tech Stack

| Layer | Tools |
|---|---|
| ML pipeline | Python, Polars, PyTorch, scikit-learn, UMAP, HDBSCAN |
| Backend | FastAPI, DuckDB, Pydantic, httpx, Server-Sent Events |
| LLM | Llama 3.1 8B via Ollama (default), Gemini API (fallback) |
| Frontend | React 18, TypeScript, Vite, D3.js, Deck.gl, Zustand, TanStack Table/Virtual, Tailwind |

## Using the Dashboard

1. **Timeline:** drag to brush a time window. Points outside the window dim in the scatter plot.
2. **Scatter plot:** click a cluster to select it.
3. **Session table:** sessions in the selected cluster as color-coded event chips (blue = normal, red = exception), with a pinned normal session for comparison.
4. **Explain panel:** the LLM's read on the failure pattern, likely cause, severity, and next steps. Use Confirm or Reject to record feedback.

## Team

- **[Hima Verma](https://github.com/hima-v):** ML pipeline, FastAPI backend, LLM integration
- **Priyanka Ramachandran:** frontend

## Project Structure

```
ExplainLOG/
├── pipeline/          # ML pipeline (steps 1-6)
├── backend/           # FastAPI server, LLM client, cache, routes
├── frontend/          # React dashboard
├── docs/              # Project report and screenshots
├── data/              # Dataset files go here (see Dataset Setup)
├── precache.py        # Pre-caches LLM explanations
├── checkscores.py     # Inspects anomaly score distributions
└── requirements.txt
```

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- [Ollama](https://ollama.com/download) (or a Gemini API key, see below)

### Dataset Setup

ExplainLOG uses the **HDFS LogHub v1** dataset ([source](https://people.iiis.tsinghua.edu.cn/~weixu/sospdata.html)): 11.2M log lines from a 200-node Hadoop cluster over 38 hours, with public ground-truth labels. It is publicly available and we use the author's pre-processed files directly. The files are too large for this repo, so download them from the [Box folder](https://ucdavis.box.com/s/61h8m8alh2pk4db89tiezhsqfl015l8g) and place these four in `data/`:

```
anomaly_label.csv
event_traces.csv
event_matrix.csv
log_templates.csv
```

### Install

```bash
git clone https://github.com/hima-v/ExplainLOG.git
cd ExplainLOG

python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

ollama pull llama3.1:8b        # ~4.9 GB

cd frontend && npm install && cd ..
```

### Run the ML Pipeline (once)

Takes about 20 minutes on CPU and writes Parquet files to `data/processed/`. Only re-run it if the data or parameters change.

```bash
python -m pipeline.run_all
```

### Start the App

Run each in its own terminal, in this order.

```bash
# 1. LLM server (skip if Ollama is already running)
ollama serve

# 2. Backend (from repo root, with venv active)
cd backend
uvicorn main:app --reload --port 8000
# API docs: http://localhost:8000/docs

# 3. Frontend
cd frontend
npm run dev
# open http://localhost:5173
```

### Pre-cache Explanations (recommended)

The first explanation per cluster takes about 50 seconds on CPU. With the backend running, this warms all 8 groups in about 7 minutes. After that, explanations load from disk in under 100ms.

```bash
python precache.py
```

### Using Gemini Instead of Ollama

Set these before starting the backend:

```bash
LLM_BACKEND=gemini
GEMINI_API_KEY=your_key_here
```

## Known Limitations and Next Steps

- Recall is 0.607, so about 40% of true anomalies are missed. Per-cluster thresholds or longer training would help.
- The LLM gives generic next steps for clusters with mixed event signatures. Prompting with a full representative session instead of top-5 template counts should make those more specific.
- Some clusters overlap in the scatter plot because projecting 29 dimensions to 2 loses separation.
- The timeline uses synthetic hourly bins because the pre-parsed dataset does not include raw timestamps.
