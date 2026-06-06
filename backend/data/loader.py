"""DuckDB connection singleton. The trick here: DuckDB scans parquet straight off
disk, so we get SQL over 575k rows without ever pulling them into pandas/Polars."""
import json
from functools import lru_cache
from pathlib import Path

import duckdb

import config


@lru_cache(maxsize=1)
def get_db() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(":memory:")
    # one CREATE VIEW per execute — duckdb only binds params on the last statement
    # of a batch, so we run them separately. paths come from config, never user input.
    views = {
        "sessions": config.SESSIONS_PARQUET,
        "scored": config.SCORED_PARQUET,
        "embeddings": config.EMBEDDINGS_PARQUET,
        "clusters": config.CLUSTERS_PARQUET,
    }
    for name, path in views.items():
        # CREATE VIEW can't take bound params in duckdb. path is from config, not
        # user input, so interpolation is safe; we escape quotes just to be tidy.
        safe = str(path).replace("'", "''")
        con.execute(f"CREATE VIEW {name} AS SELECT * FROM read_parquet('{safe}')")
    return con


@lru_cache(maxsize=1)
def get_cluster_map() -> dict[int, int]:
    # geometric cluster_id -> merged cluster_id
    # loaded once, used by embeddings and sessions routes
    processed = getattr(config, "PROCESSED", Path(config.CLUSTERS_PARQUET).parent)
    raw = json.loads((processed / "cluster_map.json").read_text())
    return {int(k): int(v) for k, v in raw.items()}


@lru_cache(maxsize=1)
def get_reverse_cluster_map() -> dict[int, list[int]]:
    fwd = get_cluster_map()
    rev: dict[int, list[int]] = {}
    for geo, merged in fwd.items():
        rev.setdefault(merged, []).append(geo)
    return rev
