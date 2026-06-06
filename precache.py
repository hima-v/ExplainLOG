import urllib.request
import time

clusters = [-1, 0, 3, 5, 6, 7, 8, 14]

print("Pre-caching LLM explanations for all 8 clusters...")
print("This takes ~7 minutes on CPU. Do not close this window.\n")

for cid in clusters:
    print(f"Cluster {cid}... ", end="", flush=True)
    start = time.time()
    try:
        req = urllib.request.Request(
            f"http://localhost:8000/api/clusters/{cid}/explain"
        )
        resp = urllib.request.urlopen(req, timeout=120)
        resp.read()
        elapsed = time.time() - start
        print(f"done in {elapsed:.0f}s")
    except Exception as e:
        print(f"FAILED: {e}")

print("\nAll clusters cached.")
print("Every explain request is now instant from disk cache.")
print("You only need to run this once — cache survives restarts.")
