"""SHA-keyed disk cache. Key is a fingerprint of the cluster's shape (top event
templates + a coarse size bucket), so semantically identical clusters reuse a
cached explanation instead of re-hitting the model."""
import hashlib
import json
from pathlib import Path

import config


def cache_key(summary: dict) -> str:
    fingerprint = {
        "templates": sorted(e["event_id"] for e in summary["top_5_events"]),
        "size_bucket": summary["size"] // 100,  # buckets of 100 — small drift still hits cache
    }
    return hashlib.sha256(
        json.dumps(fingerprint, sort_keys=True).encode()
    ).hexdigest()


def _path(key: str) -> Path:
    return config.LLM_CACHE_DIR / f"{key}.txt"


def get(key: str) -> str | None:
    p = _path(key)
    return p.read_text() if p.exists() else None


def put(key: str, value: str) -> None:
    config.LLM_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _path(key).write_text(value)
