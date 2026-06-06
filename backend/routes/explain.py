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
VALID_MERGED_CLUSTER_IDS = {-1, 0, 3, 5, 6, 7, 8, 14}


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
    if cluster_id not in VALID_MERGED_CLUSTER_IDS:
        raise HTTPException(status_code=404, detail="cluster not found")

    summary = _load_summary(cluster_id)
    key = cache.cache_key(summary)

    async def gen():
        print(f"[SSE] starting stream for cluster {cluster_id}")
        cached = cache.get(key)
        if cached is not None:
            yield _sse(cached)  # whole thing in one shot — already validated JSON
            return

        buf = []
        async for chunk in client.stream_explanation(summary):
            buf.append(chunk)
            full = "".join(buf)
            print(f"[SSE] sending delta, total length: {len(full)}")
            yield _sse(json.dumps({"delta": chunk}))

        full = "".join(buf)
        print(f"[SSE] stream complete, full response: {full[:300]}")

        try:
            parsed = json.loads(full)  # only cache if it parsed cleanly

            # coerce pattern to string if model returned wrong type
            if isinstance(parsed.get("pattern"), list):
                parsed["pattern"] = " ".join(
                    str(list(d.values())[0]) for d in parsed["pattern"] 
                    if isinstance(d, dict)
                )
            elif isinstance(parsed.get("pattern"), dict):
                parsed["pattern"] = str(parsed["pattern"])

            # coerce next_steps to list if model returned a string
            if isinstance(parsed.get("next_steps"), str):
                parsed["next_steps"] = [parsed["next_steps"]]

            full = json.dumps(parsed)
            print(f"[SSE] parsed successfully, keys: {list(parsed.keys())}")
            cache.put(key, full)
        except json.JSONDecodeError as e:
            print(f"[SSE] JSON parse failed: {e}")
            print(f"[SSE] raw response was: {full}")
            pass
        yield _sse(full)  # final consolidated payload the frontend parses

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
