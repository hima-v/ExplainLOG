"""Pydantic models for every request/response shape. Field names match the
frontend api/client.ts contract exactly — rename anything here and a view breaks."""
from typing import Literal
from pydantic import BaseModel, Field


class TimelineBin(BaseModel):
    hour: int
    timestamp: str
    anomaly_count: int
    total_count: int


class EmbeddingPoint(BaseModel):
    block_id: str
    umap_x: float
    umap_y: float
    final_score: float
    cluster_id: int


class TopEvent(BaseModel):
    event_id: str
    count: int
    template: str


class ClusterSummary(BaseModel):
    cluster_id: int
    size: int
    avg_score: float
    anomaly_rate: float
    top_5_events: list[TopEvent]
    sample_blocks: list[str]


class SessionRow(BaseModel):
    block_id: str
    event_sequence: list[str]
    seq_length: int
    final_score: float
    is_anomaly: bool


class Explanation(BaseModel):
    summary: str
    pattern: str
    likely_cause: str
    severity: Literal["low", "medium", "high"]
    next_steps: list[str]


class FeedbackIn(BaseModel):
    cluster_id: int = Field(ge=0)
    label: Literal["confirm", "reject"]
    note: str = ""


class FeedbackOut(BaseModel):
    ok: bool
