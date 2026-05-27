#!/usr/bin/env python3
"""Parse downloaded GH Archive files, extract (utc_hour, location) for events with actor.location."""
import os, json, gzip, glob, sys
from datetime import datetime, timezone

ROOT = os.path.join(os.path.dirname(__file__), "..")
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "extracted.jsonl")

def parse_ts_to_utc_hour(ts):
    """GH Archive 2012-2014 uses ISO8601 with -07:00 offset. Convert to UTC hour."""
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        dt_utc = dt.astimezone(timezone.utc)
        return dt_utc.hour, dt_utc.minute
    except Exception:
        return None, None

CODING_EVENT_TYPES = {
    "PushEvent",
    "PullRequestEvent",
    "PullRequestReviewCommentEvent",
    "CommitCommentEvent",
}

def main():
    files = sorted(glob.glob(os.path.join(RAW, "*.json.gz")))
    print(f"Files to process: {len(files)}", flush=True)
    total = 0
    kept = 0
    loc_seen = {}
    with open(OUT, "w") as out:
        for i, fp in enumerate(files):
            try:
                with gzip.open(fp, "rt", encoding="utf-8", errors="replace") as f:
                    for line in f:
                        total += 1
                        try:
                            e = json.loads(line)
                        except Exception:
                            continue
                        if e.get("type") not in CODING_EVENT_TYPES:
                            continue
                        loc = (e.get("actor_attributes") or {}).get("location")
                        if not loc:
                            continue
                        loc = loc.strip()
                        if not loc or len(loc) > 80:
                            continue
                        ts = e.get("created_at")
                        if not ts:
                            continue
                        h, m = parse_ts_to_utc_hour(ts)
                        if h is None:
                            continue
                        out.write(json.dumps({"h": h, "m": m, "l": loc}, ensure_ascii=False) + "\n")
                        kept += 1
                        loc_seen[loc] = loc_seen.get(loc, 0) + 1
            except Exception as e:
                print(f"FAIL {fp}: {e}", flush=True)
            if (i + 1) % 100 == 0:
                print(f"  [{i+1}/{len(files)}] total_events={total} with_loc={kept} unique_locs={len(loc_seen)}", flush=True)
    print(f"Done. total={total} kept={kept} unique_locations={len(loc_seen)}", flush=True)

if __name__ == "__main__":
    main()
