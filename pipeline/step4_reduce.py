from __future__ import annotations

import time

import numpy as np
import polars as pl
import umap

from . import config


def run() -> None:
    out_path = config.EMBEDDINGS_PARQUET
    if out_path.exists():
        print("already done")
        return

    scored = pl.read_parquet(config.SCORED_PARQUET).select(
        ["block_id", "final_score", "is_anomaly"]
    )
    X_count = np.load(config.X_COUNT_NPY)

    flagged = scored.select(
        (pl.col("final_score") >= float(config.ANOMALY_THRESHOLD)).alias("flagged")
    ).get_column("flagged")

    # UMAP on all 575K makes a useless hairball plot —
    # triage only cares about anomalies; normals are just visual noise
    flagged_mask = flagged.to_numpy()
    n_flagged = int(flagged.sum())
    print(f"Flagged sessions: {n_flagged}")

    X_flagged = X_count[flagged_mask]

    reducer = umap.UMAP(
        n_neighbors=int(config.UMAP_N_NEIGHBORS),
        min_dist=float(config.UMAP_MIN_DIST),
        random_state=int(config.RANDOM_STATE),  # UMAP is nondeterministic without it
        metric="euclidean",  # 29-d count vectors: euclidean is solid; cosine is more for sparse high-d
    )

    t0 = time.time()
    embedding = reducer.fit_transform(X_flagged)
    dt = time.time() - t0
    print(f"UMAP runtime: {dt:.2f}s")

    # shape mismatch here would silently scramble block_ids vs points —
    # absolutely not the vibe
    assert embedding.shape[0] == n_flagged, "embedding/flagged mismatch"
    assert embedding.shape[1] == 2, "UMAP must produce 2D embedding"

    flagged_df = scored.filter(flagged)
    out = pl.DataFrame(
        {
            "block_id": flagged_df.get_column("block_id"),
            "umap_x": embedding[:, 0].astype(np.float32),
            "umap_y": embedding[:, 1].astype(np.float32),
            "final_score": flagged_df.get_column("final_score").to_numpy().astype(np.float32),
            "is_anomaly": flagged_df.get_column("is_anomaly"),
        }
    ).with_columns(
        [
            pl.col("block_id").cast(pl.Utf8),
            pl.col("umap_x").cast(pl.Float32),
            pl.col("umap_y").cast(pl.Float32),
            pl.col("final_score").cast(pl.Float32),
            pl.col("is_anomaly").cast(pl.Boolean),
        ]
    )

    out.write_parquet(out_path)


def main() -> None:
    run()


if __name__ == "__main__":
    main()

