from __future__ import annotations

import json
import random
import sys
from collections import Counter

import numpy as np
import polars as pl

from . import config


def run() -> None:
    out_parquet = config.CLUSTER_SUMMARY_PARQUET
    out_json = config.CLUSTER_SUMMARY_JSON
    if out_parquet.exists() and out_json.exists():
        print("already done")
        return

    clusters = pl.read_parquet(config.CLUSTERS_PARQUET)
    sessions = pl.read_parquet(config.SESSIONS_PARQUET, columns=["block_id", "event_sequence"])
    templates = pl.read_csv(config.RAW_LOG_TEMPLATES_CSV)

    needed_c = {"block_id", "cluster_id", "final_score", "is_anomaly", "umap_x", "umap_y"}
    missing_c = sorted(needed_c - set(clusters.columns))
    if missing_c:
        print(f"[step6_summarize] ERROR: clusters.parquet missing columns: {missing_c}", file=sys.stderr)
        sys.exit(1)
    if "event_sequence" not in sessions.columns:
        print("[step6_summarize] ERROR: sessions.parquet missing event_sequence", file=sys.stderr)
        sys.exit(1)
    if not {"EventId", "EventTemplate"}.issubset(templates.columns):
        print("[step6_summarize] ERROR: log_templates.csv missing EventId/EventTemplate", file=sys.stderr)
        sys.exit(1)

    template_lookup = dict(zip(templates["EventId"].to_list(), templates["EventTemplate"].to_list()))

    df = clusters.join(sessions, on="block_id", how="left")
    if df.get_column("event_sequence").null_count() != 0:
        print("[step6_summarize] ERROR: some clusters rows missing event_sequence after join", file=sys.stderr)
        sys.exit(1)

    random.seed(int(config.RANDOM_STATE))  # same 3 sample blocks every run — demo reproducibility

    summaries: list[dict] = []

    cluster_ids = df.get_column("cluster_id").unique().sort().to_list()
    for cid in cluster_ids:
        sub = df.filter(pl.col("cluster_id") == cid)
        size = int(sub.height)
        avg_score = float(sub.get_column("final_score").mean())
        anomaly_rate = float(sub.get_column("is_anomaly").mean())

        sequences = sub.get_column("event_sequence").to_list()
        counts: Counter[str] = Counter()
        for seq in sequences:
            for ev in seq:
                if ev is None:
                    continue
                counts[str(ev)] += 1

        top_5 = []
        for ev, c in counts.most_common(5):
            top_5.append({"event_id": ev, "count": int(c), "template": template_lookup.get(ev, "")})

        blocks = sub.get_column("block_id").to_list()
        sample_blocks = random.sample(blocks, k=min(3, len(blocks))) if blocks else []

        summaries.append(
            {
                "cluster_id": int(cid),
                "size": size,
                "avg_score": avg_score,
                "anomaly_rate": anomaly_rate,
                "top_5_events": top_5,
                "sample_blocks": sample_blocks,
            }
        )

    original_n = len(summaries)
    noise = [s for s in summaries if int(s["cluster_id"]) == -1]
    non_noise = [s for s in summaries if int(s["cluster_id"]) != -1]

    grouped: dict[tuple[str, ...], list[dict]] = {}
    for s in non_noise:
        sig = tuple(e["event_id"] for e in s["top_5_events"][:3])
        grouped.setdefault(sig, []).append(s)

    merged: list[dict] = []
    for sig, group in grouped.items():
        if not group:
            continue

        group = sorted(group, key=lambda x: int(x["cluster_id"]))
        largest = max(group, key=lambda x: int(x["size"]))

        total_size = int(sum(int(g["size"]) for g in group))
        avg_score = float(
            sum(float(g["avg_score"]) * int(g["size"]) for g in group) / max(total_size, 1)
        )
        anomaly_rate = float(
            sum(float(g["anomaly_rate"]) * int(g["size"]) for g in group) / max(total_size, 1)
        )

        blocks: list[str] = []
        for g in group:
            blocks.extend(list(g.get("sample_blocks", [])))
        sample_blocks = (
            random.sample(blocks, k=min(3, len(blocks))) if blocks else []
        )

        merged.append(
            {
                "cluster_id": int(min(int(g["cluster_id"]) for g in group)),
                "size": total_size,
                "avg_score": avg_score,
                "anomaly_rate": anomaly_rate,
                "top_5_events": largest["top_5_events"],
                "sample_blocks": sample_blocks,
            }
        )

    summaries = noise + sorted(merged, key=lambda x: int(x["cluster_id"]))
    print(f"Merged {original_n} clusters into {len(summaries)} groups")

    # JSON is for the LLM prompt builder —
    # way easier than loading parquet just to format strings
    out_json.write_text(json.dumps(summaries, indent=2), encoding="utf-8")

    # parquet is still nice for analytics + joins downstream
    summary_rows = []
    for s in summaries:
        summary_rows.append(
            {
                "cluster_id": s["cluster_id"],
                "size": s["size"],
                "avg_score": s["avg_score"],
                "anomaly_rate": s["anomaly_rate"],
                "top_5_events": json.dumps(s["top_5_events"]),
                "sample_blocks": json.dumps(s["sample_blocks"]),
            }
        )
    pl.DataFrame(summary_rows).with_columns(
        [
            pl.col("cluster_id").cast(pl.Int32),
            pl.col("size").cast(pl.Int32),
            pl.col("avg_score").cast(pl.Float32),
            pl.col("anomaly_rate").cast(pl.Float32),
            pl.col("top_5_events").cast(pl.Utf8),
            pl.col("sample_blocks").cast(pl.Utf8),
        ]
    ).write_parquet(out_parquet)

    print("cluster_id | size | avg_score | top 3 events")
    for s in summaries:
        top3 = ", ".join([e["event_id"] for e in s["top_5_events"][:3]])
        print(f'{s["cluster_id"]:>10} | {s["size"]:>4} | {s["avg_score"]:.3f} | {top3}')

def main() -> None:
    run()

if __name__ == "__main__":
    main()

