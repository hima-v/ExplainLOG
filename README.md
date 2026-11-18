# ExplainLOG: Visual Analytics for HDFS Log Anomaly Triage

![ExplainLOG dashboard](docs/screenshots/1794963891369_Screenshot%202026-06-05%20224418.png)

Anomaly detectors can tell an engineer *that* something broke. They rarely say *what kind* of failure it was or where to look next, so engineers end up grepping through raw logs. ExplainLOG closes that gap. It scans 575K Hadoop (HDFS) block sessions, flags the anomalous ones with an LSTM autoencoder, groups them into failure patterns, and explains each pattern in plain English with a locally hosted LLM. Four linked views let an operator go from overview to a single session without reading log lines.

Built for ECS 273 (Visual Analytics) at UC Davis. **[Read the project report (PDF)](docs/explainlog-visual-analytics.pdf)**

## Results

| Detector | Precision | Recall | F1 |
|---|---|---|---|
| Isolation Forest (baseline) | 0.046 | 0.740 | 0.087 |
| **LSTM autoencoder** | **0.841** | **0.607** | **0.705** |

- **Detection:** the LSTM autoencoder reaches F1 0.705 with 0.841 precision, about 8x the Isolation Forest baseline. HDFS failures show up in the *order* of events, not their counts, and a count-based model can't see that.
- **Clustering:** 12,149 flagged sessions grouped into 8 distinct failure types (down from 235 noisy micro-clusters), silhouette score 0.258.
- **Explanations:** in a 10-person study, 17 of 20 ratings confirmed the LLM explanations were useful. All 3 rejections pointed to the same gap (generic next steps for mixed clusters), which shows the feedback loop catching real weaknesses.
- **Hardware:** everything runs on a consumer laptop (Intel i5, 16 GB RAM, no GPU) with no cloud dependencies.

## Highlights

- **Baseline comparison.** The LSTM autoencoder learns normal event sequences and scores sessions by reconstruction error. An Isolation Forest on 29-dim event count vectors is kept as a baseline to show why sequence order matters.
- **Failure pattern discovery.** UMAP projects flagged sessions to 2D and HDBSCAN clusters them without a preset k. Clusters are merged by their top-3 event signature into named failure groups, and true outliers stay in a noise group instead of being forced into a cluster.
- **Fast by design.** The pipeline runs once and writes Parquet files. FastAPI reads them through DuckDB views, so no model inference happens during interaction and API responses stay under 100ms.
- **Streaming LLM explanations.** Llama 3.1 8B (via Ollama) returns structured JSON (summary, pattern, likely cause, severity, next steps), streamed to the browser over Server-Sent Events. Running locally keeps infrastructure logs on-machine.
- **Cold start from ~50s to under 100ms.** A SHA-256 disk cache keyed on each cluster's event signature and size bucket, plus a pre-cache script, makes every explanation instant during exploration.
- **Swappable LLM backend.** One environment variable switches between Ollama and the Gemini API behind the same async streaming interface.
- **WebGL rendering.** Deck.gl draws all 12,149 points at 60fps, where SVG starts to slow down past roughly 5K nodes.
- **Human in the loop.** Linking and brushing across views, plus Confirm/Reject on each explanation. Feedback is logged to append-only JSONL that doubles as a labeled evaluation set.

## Screenshots

**Timeline + UMAP scatter.** Brushing a 16-hour window filters the scatter plot. Each dot is a flagged session, colored by failure cluster, with hover details.

![Timeline and scatter](docs/screenshots/1794963891369_Screenshot%202026-06-05%20224019.png)

**Cluster detail + LLM explanation.** Top event templates, the cluster's score distribution against 558K normal sessions, and the explanation with severity and Confirm/Reject.

![Cluster detail and LLM explanation](docs/screenshots/1794963891369_Screenshot%202026-06-05%20224039.png)

**Spotting a burst.** Anomalies climb sharply in the last hours of the 38-hour trace. Brushing just that window narrows every other view to it.

![Timeline brush on the anomaly spike](docs/screenshots/1794963906539_Screenshot%202026-06-05%20223716.png)

## How It Works

```
HDFS LogHub: 11.2M log lines, 575,061 block sessions, 2.9% labeled anomalous
   │
   ├─ 1. Load + validate      Polars, join and label checks
   ├─ 2. Featurize            event sequences (len 50) + 29-dim count vectors
   ├─ 3. Detect               LSTM autoencoder (+ Isolation Forest baseline)
   │                          → 12,149 sessions flagged
   ├─ 4. Reduce               UMAP to 2D (74s on CPU)
   ├─ 5. Cluster              HDBSCAN + signature merging → 8 failure groups
   └─ 6. Summarize            top event templates per cluster
            │
            ▼
   FastAPI + DuckDB  ──SSE──▶  React dashboard  ◀──▶  Ollama / Gemini
```

### Failure groups found

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
