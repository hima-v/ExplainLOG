from __future__ import annotations

import sys

import polars as pl

from . import config


def _die(msg: str) -> "NoReturn":
    print(f"[step1_load] ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def _warn(msg: str) -> None:
    print(f"[step1_load] WARN: {msg}", file=sys.stderr)


def _require_cols(df: pl.DataFrame, required: list[str], df_name: str) -> None:
    missing = [c for c in required if c not in df.columns]
    if missing:
        _die(f"{df_name} missing columns: {missing}")


def _load_csv(path, name: str) -> pl.DataFrame:
    # polars > pandas here because it's faster + more memory-friendly —
    # big csvs should not be a character-building exercise
    try:
        return pl.read_csv(path)
    except Exception as e:  # noqa: BLE001
        _die(f"failed reading {name} at {path}: {e}")


def run() -> None:
    out_path = config.SESSIONS_PARQUET
    if out_path.exists():
        print("already done, pass --force to rerun")
        return

    config.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    labels = _load_csv(config.RAW_ANOMALY_LABEL_CSV, "anomaly_label.csv")
    traces = _load_csv(config.RAW_EVENT_TRACES_CSV, "event_traces.csv")
    matrix = _load_csv(config.RAW_EVENT_MATRIX_CSV, "event_matrix.csv")

    _require_cols(labels, ["BlockId", "Label"], "anomaly_label.csv")
    _require_cols(traces, ["BlockId", "Features", "TimeInterval", "Latency"], "event_traces.csv")

    traces = traces.select(["BlockId", "Features", "TimeInterval", "Latency"])

    matrix_event_cols = [c for c in matrix.columns if c.startswith("E") and c[1:].isdigit()]
    _require_cols(matrix, ["BlockId", *matrix_event_cols], "event_matrix.csv")
    matrix = matrix.select(["BlockId", *matrix_event_cols])

    labels = labels.rename({"BlockId": "block_id"})
    traces = traces.rename({"BlockId": "block_id"})
    matrix = matrix.rename({"BlockId": "block_id"})

    # (A) No null BlockIds anywhere
    for df, name in [
        (labels, "anomaly_label.csv"),
        (traces, "event_traces.csv"),
        (matrix, "event_matrix.csv"),
    ]:
        if df.get_column("block_id").null_count() != 0:
            _die(f"{name} has null BlockId values")

    # (B) All BlockIds in anomaly_label exist in event_traces (warn if not)
    missing_in_traces = (
        labels.select("block_id")
        .unique()
        .join(traces.select("block_id").unique(), on="block_id", how="anti")
        .height
    )
    if missing_in_traces:
        _warn(
            f"{missing_in_traces} BlockIds in anomaly_label.csv are missing from event_traces.csv"
        )

    labels = labels.with_columns(
        pl.when(pl.col("Label") == "Anomaly")
        .then(True)
        .when(pl.col("Label") == "Normal")
        .then(False)
        .otherwise(None)
        .alias("is_anomaly")
    ).select(["block_id", "is_anomaly"])

    if labels.get_column("is_anomaly").null_count() != 0:
        _die('Label column must be exactly "Normal" or "Anomaly" (found other values)')

    sessions = traces.join(labels, on="block_id", how="left")
    if sessions.get_column("is_anomaly").null_count() != 0:
        _die(
            "some sessions in event_traces.csv did not get a label after join (every session must have a label)"
        )

    sessions = sessions.with_columns(
        # parsing "[E5,E22,E7]" -> ["E5", "E22", "E7"] —
        # downstream LSTM wants integer arrays, so list-shaped data is the right starting point
        pl.col("Features")
        .cast(pl.Utf8)
        .str.strip_chars()
        .str.strip_chars("[]")
        .str.replace_all(r"\s+", "")
        .str.split(",")
        .alias("event_sequence")
    ).drop("Features")

    if sessions.get_column("event_sequence").null_count() != 0:
        _die("some sessions have null EventSequence values")

    sessions = sessions.with_columns(
        pl.col("event_sequence").list.len().cast(pl.Int32).alias("seq_length")
    )

    event_cols = [c for c in matrix.columns if c != "block_id"]
    if not event_cols:
        _die("event_matrix.csv has no event count columns (expected E1..E29)")

    # (C) event_matrix has no negative values (count matrix cannot be negative)
    min_count = matrix.select(
        pl.min_horizontal(pl.exclude("block_id")).min().alias("min_count")
    ).item()
    if min_count < 0:
        _die(f"event_matrix.csv has negative values (min={min_count})")

    matrix = matrix.with_columns([pl.col(c).cast(pl.Int32) for c in event_cols])
    sessions = sessions.join(matrix, on="block_id", how="left")

    missing_counts = sessions.select(
        pl.any_horizontal(pl.col(event_cols).is_null()).any().alias("has_missing")
    ).item()
    if bool(missing_counts):
        _die(
            "some sessions did not get event_matrix counts after join (missing BlockId in event_matrix.csv?)"
        )

    sessions = sessions.select(
        [
            pl.col("block_id").cast(pl.Utf8),
            pl.col("event_sequence").cast(pl.List(pl.Utf8)),
            pl.col("seq_length").cast(pl.Int32),
            pl.col("TimeInterval").cast(pl.Utf8),
            pl.col("Latency").cast(pl.Int64),
            pl.col("is_anomaly").cast(pl.Boolean),
            *[pl.col(c).cast(pl.Int32) for c in event_cols],
        ]
    )

    # (D) is_anomaly column has exactly 2 unique values
    n_unique = sessions.select(pl.col("is_anomaly").n_unique()).item()
    if n_unique != 2:
        _die(f"is_anomaly must have exactly 2 unique values, found {n_unique}")

    anomaly_count = sessions.select(
        pl.col("is_anomaly").sum().alias("anomaly_count")
    ).item()
    total = sessions.height
    anomaly_rate = float(anomaly_count) / float(total) if total else 0.0

    # (E) Anomaly rate is between 1% and 10% — sanity check for joins
    # wrong join = wrong rate = wrong everything, so we fail fast here
    if not (0.01 <= anomaly_rate <= 0.10):
        _die(
            f"anomaly rate {anomaly_rate:.4%} is outside [1%, 10%] — likely a join/key mismatch"
        )

    seq_stats = sessions.select(
        [
            pl.col("seq_length").min().alias("min_len"),
            pl.col("seq_length").max().alias("max_len"),
            pl.col("seq_length").mean().alias("avg_len"),
        ]
    ).row(0)
    min_len, max_len, avg_len = seq_stats

    print(f"Total sessions loaded: {total}")
    print(f"Anomalies: {anomaly_count} ({anomaly_rate * 100:.2f}%)")
    print(f"Unique event types found: {len(event_cols)}")
    print(
        f"Sequence length (min/max/avg): {min_len} / {max_len} / {float(avg_len):.2f}"
    )

    # parquet is columnar + compresses well —
    # basically the adult version of csv
    sessions.write_parquet(out_path)


# run_all.py calls main() on every step — keeping naming consistent
def main() -> None:
    run()


if __name__ == "__main__":
    main()
