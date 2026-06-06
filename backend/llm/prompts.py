"""System prompt + per-cluster user prompt builder, plus a hardcoded fallback
per cluster so the demo never crashes if Ollama is down."""

SYSTEM_PROMPT = """You are an expert site reliability engineer 
analyzing clusters of HDFS log anomalies.

You must respond ONLY with valid JSON. No explanation outside the JSON.
Use exactly these fields with exactly these types:

{
  "summary": "string — one sentence describing the failure",
  "pattern": "string — 2-3 sentences describing the event sequence pattern",
  "likely_cause": "string — 2-3 sentences with root cause hypotheses", 
  "severity": "low" or "medium" or "high",
  "next_steps": ["string", "string", "string"]
}

ALL values must be strings or arrays of strings.
pattern must be a plain string sentence, NOT an array or object.
severity must be exactly one of: low, medium, high
severity must follow these rules:
- "low": cluster avg_score < 0.15 AND sessions < 500
- "medium": cluster avg_score 0.15-0.30 OR sessions 500-1500
- "high": cluster avg_score > 0.30 OR sessions > 1500 OR
          contains exception events (E7, E21, E23, E25)
next_steps must be an array of 2-4 short action strings.
Do not add any extra fields."""


def build_prompt(summary: dict) -> str:
    events = "\n".join(
        f"  - {e['event_id']} (x{e['count']}): {e['template']}"
        for e in summary["top_5_events"]
    )
    return (
        f"Cluster {summary['cluster_id']}\n"
        f"Sessions: {summary['size']}\n"
        f"Average anomaly score: {summary['avg_score']:.3f}\n"
        f"Anomaly rate: {summary['anomaly_rate']:.2f}\n"
        f"Top event templates:\n{events}\n\n"
        "Explain this failure cluster as JSON."
    )


def fallback(summary: dict) -> dict:
    """Used when the LLM backend is unreachable. Generic but honest — built from
    the summary numbers we already have so it isn't obviously a stub."""
    top = summary["top_5_events"][0] if summary["top_5_events"] else None
    top_desc = f"{top['event_id']} ({top['template']})" if top else "an unknown event"
    sev = "high" if summary["anomaly_rate"] >= 0.8 else "medium"
    return {
        "summary": f"Cluster of {summary['size']} sessions dominated by {top_desc}.",
        "pattern": (
            f"These sessions share a recurring sequence centered on {top_desc}. "
            f"The cluster has an average score of {summary['avg_score']:.3f}."
        ),
        "likely_cause": (
            "Automatic explanation is unavailable (LLM backend offline). "
            "Inspect the top event templates and sample blocks to diagnose."
        ),
        "severity": sev,
        "next_steps": [
            "Open a few sample blocks and read their raw event sequence",
            "Check datanode logs around the dominant event template",
            "Compare against a known-good session of similar length",
        ],
    }
