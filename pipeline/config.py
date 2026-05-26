from __future__ import annotations

from pathlib import Path

# locking random state so our results dont change every run —
# important for reproducibility in the paper
RANDOM_STATE = 42

# capping sequence length keeps models fast + comparable —
# long tails are usually noise anyway
MAX_SEQ_LEN = 50

# 0.5 did not work well, so we set it to 0.15
ANOMALY_THRESHOLD = 0.10

# decent default neighborhood size for global-ish structure —
# too small gets twitchy, too big gets blurry
UMAP_N_NEIGHBORS = 15

# small min_dist keeps clusters visually tight —
# we want "oh that's a blob" not "vibes"
UMAP_MIN_DIST = 0.1

# 30-ish avoids tiny meme-clusters —
# we only want clusters with enough mass to summarize
HDBSCAN_MIN_CLUSTER_SIZE = 175

# 10 is a sane density cutoff for stability —
# fewer samples tends to hallucinate micro-clusters
HDBSCAN_MIN_SAMPLES = 25

# quick training budget for iteration speed —
# crank later when we're sure the pipeline isn't cursed
LSTM_EPOCHS = 5
LSTM_BATCH_SIZE = 512
LSTM_LR = 1e-3

PROJECT_ROOT = Path(__file__).resolve().parents[1]

DATA_DIR = PROJECT_ROOT / "data"
RAW_ANOMALY_LABEL_CSV = DATA_DIR / "anomaly_label.csv"
RAW_EVENT_TRACES_CSV = DATA_DIR / "event_traces.csv"
RAW_EVENT_MATRIX_CSV = DATA_DIR / "event_matrix.csv"
RAW_LOG_TEMPLATES_CSV = DATA_DIR / "log_templates.csv"

PROCESSED_DIR = DATA_DIR / "processed"

SESSIONS_PARQUET = PROCESSED_DIR / "sessions.parquet"
X_COUNT_NPY = PROCESSED_DIR / "X_count.npy"
X_SEQ_NPY = PROCESSED_DIR / "X_seq.npy"
Y_NPY = PROCESSED_DIR / "y.npy"
VOCAB_SIZE_TXT = PROCESSED_DIR / "vocab_size.txt"
SCORED_PARQUET = PROCESSED_DIR / "scored.parquet"
EMBEDDINGS_PARQUET = PROCESSED_DIR / "embeddings.parquet"
CLUSTERS_PARQUET = PROCESSED_DIR / "clusters.parquet"
CLUSTER_SUMMARY_PARQUET = PROCESSED_DIR / "cluster_summary.parquet"
CLUSTER_SUMMARY_JSON = PROCESSED_DIR / "cluster_summary.json"
IFOREST_MODEL_PATH = PROJECT_ROOT / "models" / "iforest.joblib"

PROCESSED_LABELS_PARQUET = PROCESSED_DIR / "anomaly_label.parquet"
PROCESSED_EVENT_TRACES_PARQUET = PROCESSED_DIR / "event_traces.parquet"
PROCESSED_EVENT_MATRIX_PARQUET = PROCESSED_DIR / "event_matrix.parquet"
PROCESSED_LOG_TEMPLATES_PARQUET = PROCESSED_DIR / "log_templates.parquet"

LSTM_MODEL_PATH = PROJECT_ROOT / "models" / "lstm.pt"
