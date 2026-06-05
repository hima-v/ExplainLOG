"""GET /api/clusters/{id}/explain — SSE stream of the LLM explanation.

Cache hit: replay the stored JSON in one event (instant). Cache miss: stream
tokens from the model as they arrive, accumulate, then write to cache so the
next hit is free. StreamingResponse, not WebSocket — the contract says SSE."""
import json

from fastapi import APIRouter, HTTPException, Path
from fastapi.responses import StreamingResponse

import config
from llm import cache, client, prompts

router = APIRouter()


def _load_summary(cluster_id: int) -> dict:
    with open(config.CLUSTER_SUMMARY_JSON) as f:
        data = json.load(f)
    for c in data:
        if c["cluster_id"] == cluster_id:
            return c
    raise HTTPException(status_code=404, detail=f"unknown cluster {cluster_id}")


def _sse(data: str) -> str:
    return f"data: {data}\n\n"


@router.get("/api/clusters/{cluster_id}/explain")
async def explain(cluster_id: int = Path(ge=-1)):
    summary = _load_summary(cluster_id)
    key = cache.cache_key(summary)

    async def gen():
        cached = cache.get(key)
        if cached is not None:
            yield _sse(cached)  # whole thing in one shot — already validated JSON
            return

        buf = []
        async for chunk in client.stream_explanation(summary):
            buf.append(chunk)
            yield _sse(json.dumps({"delta": chunk}))

        full = "".join(buf)
        try:
            json.loads(full)  # only cache if it parsed cleanly
            cache.put(key, full)
        except json.JSONDecodeError:
            pass
        yield _sse(full)  # final consolidated payload the frontend parses

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
