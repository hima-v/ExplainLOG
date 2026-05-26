from __future__ import annotations

import sys

import numpy as np
import polars as pl
import hdbscan
from sklearn.metrics import silhouette_score

from . import config


def run() -> None:
    out_path = config.CLUSTERS_PARQUET
    if out_path.exists():
        print("already done")
        return

    df = pl.read_parquet(config.EMBEDDINGS_PARQUET)
    needed = {"block_id", "umap_x", "umap_y", "final_score", "is_anomaly"}
    missing = sorted(needed - set(df.columns))
    if missing:
        print(f"[step5_cluster] ERROR: embeddings.parquet missing columns: {missing}", file=sys.stderr)
        sys.exit(1)

    coords = df.select(["umap_x", "umap_y"]).to_numpy()

    # hdbscan > k-means here because we don't want to guess k upfront —
    # it finds clusters naturally + labels true weirdos as -1 noise
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=int(config.HDBSCAN_MIN_CLUSTER_SIZE),
        min_samples=int(config.HDBSCAN_MIN_SAMPLES),
    )
    cluster_labels = clusterer.fit_predict(coords).astype(np.int32)

    # keep noise points (-1) instead of dropping them —
    # gray dots on the scatter are still useful: "uncategorized anomalies"
    n_noise = int((cluster_labels == -1).sum())
    clusters = sorted(set(cluster_labels.tolist()) - {-1})
    n_clusters = len(clusters)
    print(f"Clusters found (excluding noise): {n_clusters}")
    print(f"Noise points (cluster_id == -1): {n_noise}")

    mask = cluster_labels != -1
    if mask.sum() >= 2 and n_clusters >= 2:
        score = float(silhouette_score(coords[mask], cluster_labels[mask]))
        print(f"Silhouette score (non-noise): {score:.4f}")
    else:
        print("Silhouette score (non-noise): n/a (need >=2 clusters)")

    if n_clusters < 2:
        print("WARNING: fewer than 2 clusters — lower HDBSCAN_MIN_CLUSTER_SIZE in config")

    out = df.with_columns(pl.Series("cluster_id", cluster_labels).cast(pl.Int32))
    out.write_parquet(out_path)

def main() -> None:
    run()

if __name__ == "__main__":
    main()

