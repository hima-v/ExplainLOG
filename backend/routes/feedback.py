"""POST /api/feedback — appends an SRE's confirm/reject to feedback.jsonl.

Append-only jsonl keeps it dead simple: no DB, no locking headaches for a
single-user demo, and the file doubles as a labeled-eval set later."""
import json
from datetime import datetime, timezone

from fastapi import APIRouter

import config
from schemas import FeedbackIn, FeedbackOut

router = APIRouter()


@router.post("/api/feedback", response_model=FeedbackOut)
async def post_feedback(fb: FeedbackIn):
    config.FEEDBACK_FILE.parent.mkdir(parents=True, exist_ok=True)
    record = fb.model_dump()
    record["ts"] = datetime.now(timezone.utc).isoformat()
    with open(config.FEEDBACK_FILE, "a") as f:
        f.write(json.dumps(record) + "\n")
    return FeedbackOut(ok=True)
