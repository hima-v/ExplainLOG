"""FastAPI entrypoint. Mounts every route, wires CORS for the Vite dev server,
and warms the DuckDB views on startup so the first request isn't slow."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from data.loader import get_db
from routes import timeline, embeddings, clusters, explain, feedback


@asynccontextmanager
async def lifespan(app: FastAPI):
    # touch the DB once so views are created before the first real request
    get_db().execute("SELECT 1")
    yield


app = FastAPI(title="ExplainLOG API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(timeline.router)
app.include_router(embeddings.router)
app.include_router(clusters.router)
app.include_router(explain.router)
app.include_router(feedback.router)


@app.get("/health")
async def health():
    return {"ok": True}
