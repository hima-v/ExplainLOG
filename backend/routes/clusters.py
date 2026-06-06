"""GET /api/clusters and GET /api/clusters/{id}/sessions.

Cluster summaries come from the precomputed JSON (cheap, just read + validate).
Sessions are joined live in DuckDB so we never materialize 575k rows in Python."""
import json

from fastapi import APIRouter, HTTPException, Path

import config
from data.loader import get_db, get_reverse_cluster_map
from schemas import ClusterSummary, SessionRow

router = APIRouter()
VALID_MERGED_CLUSTER_IDS = {-1, 0, 3, 5, 6, 7, 8, 14}


@router.get("/api/clusters", response_model=list[ClusterSummary])
async def get_clusters():
    with open(config.CLUSTER_SUMMARY_JSON) as f:
        data = json.load(f)
    # pydantic validates each object against the schema on the way out
    return [ClusterSummary(**c) for c in data]


@router.get("/api/clusters/{cluster_id}/sessions", response_model=list[SessionRow])
async def get_cluster_sessions(cluster_id: int = Path(ge=-1)):
    if cluster_id not in VALID_MERGED_CLUSTER_IDS:
        raise HTTPException(status_code=404, detail="cluster not found")

    con = get_db()
    rev_map = get_reverse_cluster_map()
    geo_ids = rev_map.get(cluster_id, [cluster_id])
    placeholders = ",".join("?" * len(geo_ids))
    rows = con.execute(
        f"""
        SELECT s.block_id, s.event_sequence, s.seq_length,
               sc.final_score, s.is_anomaly
        FROM clusters c
        JOIN sessions s ON s.block_id = c.block_id
        JOIN scored   sc ON sc.block_id = c.block_id
        WHERE c.cluster_id IN ({placeholders})
        ORDER BY sc.final_score DESC
        """,
        geo_ids,
    ).fetchall()

    return [
        SessionRow(
            block_id=r[0],
            event_sequence=list(r[1]),  # duckdb hands back a list for the parquet list[str]
            seq_length=int(r[2]),
            final_score=r[3],
            is_anomaly=bool(r[4]),
        )
        for r in rows
    ]
