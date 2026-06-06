"""GET /api/embeddings — all 12,149 flagged sessions for the UMAP scatter.

We pull cluster_id from clusters.parquet rather than embeddings.parquet since
that's where HDBSCAN labels live. One join, loaded once on page mount."""
from fastapi import APIRouter

from data.loader import get_cluster_map, get_db
from schemas import EmbeddingPoint

router = APIRouter()


@router.get("/api/embeddings", response_model=list[EmbeddingPoint])
async def get_embeddings():
    con = get_db()
    rows = con.execute(
        """
        SELECT c.block_id, c.umap_x, c.umap_y, c.final_score, c.cluster_id
        FROM clusters c
        """
    ).fetchall()
    cluster_map = get_cluster_map()
    return [
        EmbeddingPoint(
            block_id=r[0],
            umap_x=float(r[1]),
            umap_y=float(r[2]),
            final_score=float(r[3]),
            cluster_id=cluster_map.get(int(r[4]), -1),
        )
        for r in rows
    ]
