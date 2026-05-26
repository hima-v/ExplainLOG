from __future__ import annotations

import sys

import numpy as np
import polars as pl

from . import config


def _die(msg: str) -> "NoReturn":
    print(f"[step2_featurize] ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def run() -> None:
    out_count = config.X_COUNT_NPY
    out_seq = config.X_SEQ_NPY
    out_y = config.Y_NPY
    out_vocab = config.VOCAB_SIZE_TXT

    if out_count.exists() and out_seq.exists() and out_y.exists():
        print("already done")
        return

    df = pl.read_parquet(config.SESSIONS_PARQUET)
    needed = {"event_sequence", "is_anomaly"}
    if not needed.issubset(df.columns):
        _die(
            f"sessions.parquet missing required columns: {sorted(needed - set(df.columns))}"
        )

    # we produce TWO feature types because the models are built different —
    # IForest is tree-ish and likes fixed count vectors; LSTM is sequence-ish and wants ordered ints
    e_cols = [c for c in df.columns if c.startswith("E")]
    if not e_cols:
        _die('no "E*" columns found for X_count (expected E1..E29 counts)')

    # only keep integer-ish event count columns so we don't accidentally ingest garbage
    int_types = {
        pl.Int8,
        pl.Int16,
        pl.Int32,
        pl.Int64,
        pl.UInt8,
        pl.UInt16,
        pl.UInt32,
        pl.UInt64,
    }
    e_cols = [c for c in e_cols if df.schema.get(c) in int_types]
    if not e_cols:
        _die('no integer "E*" columns found for X_count')

    X_count = df.select(e_cols).to_numpy().astype(np.float32, copy=False)

    y = (
        df.select(pl.col("is_anomaly").cast(pl.Boolean))
        .to_numpy()
        .reshape(-1)
        .astype(bool, copy=False)
    )

    seq_series = df.get_column("event_sequence")
    max_len = int(config.MAX_SEQ_LEN)

    n = df.height
    X_seq = np.zeros((n, max_len), dtype=np.int32)
    vocab_max = 0

    # right-padding is standard for log sequences —
    # we want the model to see the START of the sequence first, not a wall of zeros
    for i, seq in enumerate(seq_series.to_list()):
        if seq is None:
            _die(f"null event_sequence at row {i}")
        if not isinstance(seq, list):
            _die(f"event_sequence must be a list at row {i}, got {type(seq)}")

        ints: list[int] = []
        for tok in seq:
            if tok is None:
                continue
            s = str(tok)
            if not s.startswith("E"):
                continue
            try:
                v = int(s[1:])
            except ValueError:
                continue
            if v > vocab_max:
                vocab_max = v
            ints.append(v)

        if not ints:
            continue

        ints = ints[:max_len]
        X_seq[i, : len(ints)] = np.asarray(ints, dtype=np.int32)

    vocab_size = int(vocab_max + 1)

    print(f"X_count shape: {X_count.shape} dtype={X_count.dtype}")
    print(f"X_seq shape:   {X_seq.shape} dtype={X_seq.dtype}")
    print(f"y shape:       {y.shape} dtype={y.dtype}")
    print(f"vocab_size:    {vocab_size}")

    config.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    # saving vocab_size separately because the LSTM embedding layer needs it at init time —
    # we have to know this *before* building the model
    out_vocab.write_text(f"{vocab_size}\n", encoding="utf-8")

    np.save(out_count, X_count)
    np.save(out_seq, X_seq)
    np.save(out_y, y)


def main() -> None:
    run()


if __name__ == "__main__":
    main()
