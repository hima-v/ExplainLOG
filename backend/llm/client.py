"""LLM client abstraction. One env var (LLM_BACKEND) picks Ollama (local, default)
or Gemini (free-tier fallback). Both expose the same async token generator so the
SSE route doesn't care which one is live."""
import json
from typing import AsyncGenerator

import httpx

import config
from llm import prompts


async def stream_explanation(summary: dict) -> AsyncGenerator[str, None]:
    """Yields text chunks as the model produces them. If the backend is
    unreachable we yield the fallback JSON as a single chunk instead."""
    try:
        if config.LLM_BACKEND == "gemini":
            async for chunk in _stream_gemini(summary):
                yield chunk
        else:
            async for chunk in _stream_ollama(summary):
                yield chunk
    except (httpx.HTTPError, httpx.ConnectError, OSError):
        # demo must never crash — hand back the precomputed fallback
        yield json.dumps(prompts.fallback(summary))


async def _stream_ollama(summary: dict) -> AsyncGenerator[str, None]:
    payload = {
        "model": config.OLLAMA_MODEL,
        "system": prompts.SYSTEM_PROMPT,
        "prompt": prompts.build_prompt(summary),
        "stream": True,
        "format": "json",  # ollama constrains output to valid JSON for us
        "options": {"temperature": 0.2},
    }
    url = f"{config.OLLAMA_HOST}/api/generate"
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", url, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                obj = json.loads(line)
                if obj.get("response"):
                    yield obj["response"]
                if obj.get("done"):
                    break


async def _stream_gemini(summary: dict) -> AsyncGenerator[str, None]:
    # streamGenerateContent with SSE; we forward only the text parts
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{config.GEMINI_MODEL}:streamGenerateContent"
        f"?alt=sse&key={config.GEMINI_API_KEY}"
    )
    payload = {
        "systemInstruction": {"parts": [{"text": prompts.SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": prompts.build_prompt(summary)}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream("POST", url, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                body = line[len("data:"):].strip()
                if not body or body == "[DONE]":
                    continue
                obj = json.loads(body)
                for cand in obj.get("candidates", []):
                    for part in cand.get("content", {}).get("parts", []):
                        if "text" in part:
                            yield part["text"]
