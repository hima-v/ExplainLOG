"""GET /api/embeddings — all 12,149 flagged sessions for the UMAP scatter.

We pull cluster_id from clusters.parquet rather than embeddings.parquet since
that's where HDBSCAN labels live. One join, loaded once on page mount."""
from fastapi import APIRouter

from data.loader import get_db
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
    return [
        EmbeddingPoint(
            block_id=r[0],
            umap_x=r[1],
            umap_y=r[2],
            final_score=r[3],
            cluster_id=int(r[4]),
        )
        for r in rows
    ]
