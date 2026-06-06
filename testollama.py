import urllib.request
import json

data = json.dumps(
    {
        "model": "llama3.1:8b",
        "system": "respond only in JSON",
        "prompt": 'return this exact JSON object: {"test": "ok"}',
        "stream": False,
        "format": "json",
    }
).encode()

req = urllib.request.Request(
    "http://localhost:11434/api/generate",
    data=data,
    headers={"Content-Type": "application/json"},
)

resp = urllib.request.urlopen(req, timeout=60)
result = json.loads(resp.read())
print("response:", result["response"])
print("done:", result["done"])
