import polars as pl
import numpy as np
from sklearn.metrics import precision_recall_fscore_support

df = pl.read_parquet("data/processed/scored.parquet")
y_true = df["is_anomaly"].to_numpy()
lstm = df["lstm_score"].to_numpy()
iforest = df["iforest_score"].to_numpy()

print("=== LSTM alone sweep ===")
for t in [0.01, 0.02, 0.05, 0.10, 0.15, 0.20]:
    predicted = lstm >= t
    p, r, f1, _ = precision_recall_fscore_support(
        y_true, predicted, average="binary", zero_division=0
    )
    print(f"t={t:.2f}  P={p:.3f}  R={r:.3f}  F1={f1:.3f}  flagged={predicted.sum()}")

print()
print("=== IForest alone sweep ===")
for t in [0.01, 0.02, 0.05, 0.10, 0.15, 0.20]:
    predicted = iforest >= t
    p, r, f1, _ = precision_recall_fscore_support(
        y_true, predicted, average="binary", zero_division=0
    )
    print(f"t={t:.2f}  P={p:.3f}  R={r:.3f}  F1={f1:.3f}  flagged={predicted.sum()}")
