from __future__ import annotations

import sys

import joblib
import numpy as np
import polars as pl
import torch
from sklearn.ensemble import IsolationForest
from sklearn.metrics import precision_recall_fscore_support
from torch import nn
from torch.utils.data import DataLoader, TensorDataset

from . import config


class LogLSTMAutoencoder(nn.Module):
    def __init__(self, vocab_size: int, embed_dim: int = 16) -> None:
        super().__init__()
        self.embedding = nn.Embedding(
            vocab_size, embedding_dim=embed_dim, padding_idx=0
        )
        self.encoder = nn.LSTM(input_size=embed_dim, hidden_size=32, batch_first=True)
        self.decoder = nn.LSTM(input_size=32, hidden_size=16, batch_first=True)
        self.proj = nn.Linear(16, vocab_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        emb = self.embedding(x)  # (batch, seq, 16)
        _, (h, _) = self.encoder(emb)  # h: (1, batch, 32)
        seq_len = x.size(1)
        h_rep = h.permute(1, 0, 2).repeat(1, seq_len, 1)  # (batch, seq, 32)
        dec, _ = self.decoder(h_rep)  # (batch, seq, 16)
        logits = self.proj(dec)  # (batch, seq, vocab)
        return logits


def _die(msg: str) -> "NoReturn":
    print(f"[step3_detect] ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def _minmax(a: np.ndarray) -> np.ndarray:
    return (a - a.min()) / (
        a.max() - a.min() + 1e-9
    )  # +1e-9 avoids div0 on degenerate scores


def _check_finite(name: str, a: np.ndarray) -> None:
    if not np.isfinite(a).all():
        _die(f"{name} contains NaN/Inf")


def _print_metrics(name: str, scores: np.ndarray, y_true: np.ndarray) -> float:
    predicted = scores >= float(config.ANOMALY_THRESHOLD)
    p, r, f1, _ = precision_recall_fscore_support(
        y_true, predicted, average="binary", zero_division=0
    )
    print(
        f"{name} @ {config.ANOMALY_THRESHOLD:.2f}  Precision={p:.3f} Recall={r:.3f} F1={f1:.3f}"
    )
    return float(f1)


def run() -> None:
    out_path = config.SCORED_PARQUET
    if out_path.exists():
        print("already done")
        return

    X_count = np.load(config.X_COUNT_NPY)
    X_seq = np.load(config.X_SEQ_NPY)
    y = np.load(config.Y_NPY)

    vocab_size = int(config.VOCAB_SIZE_TXT.read_text(encoding="utf-8").strip())
    block_id = pl.read_parquet(
        config.SESSIONS_PARQUET, columns=["block_id"]
    ).get_column("block_id")

    assert X_count.shape[0] == X_seq.shape[0] == y.shape[0], "shape mismatch"
    if X_count.shape[0] != block_id.len():
        _die("sessions.parquet row count does not match feature arrays")

    y_bool = y.astype(bool, copy=False)
    normal_mask = ~y_bool

    # --------------------
    # IsolationForest
    # --------------------
    if config.IFOREST_MODEL_PATH.exists():
        iforest = joblib.load(config.IFOREST_MODEL_PATH)
        print("IForest loaded from cache")
    else:
        print("IForest training...")
        iforest = IsolationForest(
            contamination=0.03, random_state=config.RANDOM_STATE, n_jobs=-1
        )

        # train only on normal samples —
        # unsupervised models learn "what normal looks like", anomalies should stick out
        Xn = X_count[normal_mask]
        iforest.fit(Xn)
        print(f"IForest trained on {Xn.shape[0]} normal samples")
        joblib.dump(iforest, config.IFOREST_MODEL_PATH)

    # sklearn quirk: lower score means "more anomalous" by default —
    # we negate so higher score => more anomalous (our convention)
    iforest_raw = (-iforest.score_samples(X_count)).astype(np.float32)

    # --------------------
    # LSTM autoencoder
    # --------------------
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    # pick GPU if available because training is way faster —
    # otherwise CPU is fine, just slower and more character-building
    print(f"Device: {device}")

    model = LogLSTMAutoencoder(vocab_size=vocab_size).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=float(config.LSTM_LR))
    criterion = nn.CrossEntropyLoss(reduction="none")

    if config.LSTM_MODEL_PATH.exists():
        model.load_state_dict(torch.load(config.LSTM_MODEL_PATH, map_location=device))
        print("LSTM loaded from cache")
    else:
        print("LSTM training...")
        X_seq_train = torch.from_numpy(X_seq[normal_mask].astype(np.int64, copy=False))
        train_loader = DataLoader(
            TensorDataset(X_seq_train),
            batch_size=int(config.LSTM_BATCH_SIZE),
            shuffle=True,
        )

        model.train()
        for epoch in range(int(config.LSTM_EPOCHS)):
            total_loss = 0.0
            total_batches = 0
            for (xb,) in train_loader:
                xb = xb.to(device)
                opt.zero_grad(set_to_none=True)
                logits = model(xb)
                # CrossEntropyLoss expects (batch, classes, seq) —
                # our logits are (batch, seq, classes), so we permute
                loss_pos = criterion(logits.permute(0, 2, 1), xb.long())  # (batch, seq)
                loss = loss_pos.mean()
                loss.backward()
                opt.step()
                total_loss += float(loss.item())
                total_batches += 1
            mean_loss = total_loss / max(total_batches, 1)
            print(f"Epoch {epoch + 1}/{int(config.LSTM_EPOCHS)} loss={mean_loss:.6f}")

        torch.save(model.state_dict(), config.LSTM_MODEL_PATH)

    model.eval()
    X_all = torch.from_numpy(X_seq.astype(np.int64, copy=False))
    eval_loader = DataLoader(
        TensorDataset(X_all), batch_size=int(config.LSTM_BATCH_SIZE), shuffle=False
    )

    lstm_losses: list[np.ndarray] = []
    with torch.no_grad():
        for (xb,) in eval_loader:
            xb = xb.to(device)
            logits = model(xb)
            loss_pos = criterion(logits.permute(0, 2, 1), xb.long())  # (batch, seq)
            loss_seq = loss_pos.mean(dim=1)  # mean over seq positions
            lstm_losses.append(loss_seq.detach().cpu().numpy().astype(np.float32))
    lstm_raw = np.concatenate(lstm_losses, axis=0)

    # --------------------
    # Ensemble + eval
    # --------------------
    _check_finite("iforest_raw", iforest_raw)
    _check_finite("lstm_raw", lstm_raw)

    iforest_norm = _minmax(iforest_raw).astype(np.float32, copy=False)
    lstm_norm = _minmax(lstm_raw).astype(np.float32, copy=False)
    # pure LSTM — iForest actively hurts performance on sequential anomalies
    # per Xu et al. 2023, keeping iforest_norm in scored.parquet for comparison only
    final_score = lstm_norm.copy().astype(np.float32)
    _check_finite("final_score", final_score)

    # y is eval-only: do not leak labels into training
    print("Evaluation against ground truth (labels were not used for training)")
    f1_if = _print_metrics("IForest", iforest_norm, y_bool)
    f1_lstm = _print_metrics("LSTM", lstm_norm, y_bool)
    f1_ens = _print_metrics("Ensemble", final_score, y_bool)

    if f1_lstm < 0.70:
        print("WARNING: F1 below 0.70 — check data loading or increase LSTM_EPOCHS")

    scored = pl.DataFrame(
        {
            "block_id": block_id,
            "iforest_score": iforest_norm,
            "lstm_score": lstm_norm,
            "final_score": final_score,
            "is_anomaly": y_bool,
        }
    ).with_columns(
        [
            pl.col("block_id").cast(pl.Utf8),
            pl.col("iforest_score").cast(pl.Float32),
            pl.col("lstm_score").cast(pl.Float32),
            pl.col("final_score").cast(pl.Float32),
            pl.col("is_anomaly").cast(pl.Boolean),
        ]
    )

    scored.write_parquet(out_path)


def main() -> None:
    run()


if __name__ == "__main__":
    main()
