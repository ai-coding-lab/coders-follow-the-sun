#!/usr/bin/env python3
"""Aggregate geocoded events into 24h × spatial-bin counts for frontend."""
import os, json, collections

ROOT = os.path.join(os.path.dirname(__file__), "..")
INP = os.path.join(ROOT, "data", "geocoded.jsonl")
LOC_MAP = os.path.join(ROOT, "data", "location-map.json")
OUT_24H = os.path.join(ROOT, "src", "data", "activity-24h.json")
OUT_TOP = os.path.join(ROOT, "src", "data", "top-cities.json")

# Spatial bin = 1 degree resolution
BIN = 1.0
# Time bin = 10 minutes (144 bins per day)
MIN_PER_BIN = 10
BINS_PER_DAY = 24 * 60 // MIN_PER_BIN

def main():
    os.makedirs(os.path.dirname(OUT_24H), exist_ok=True)

    # (time_bin, lat_bin, lon_bin) -> count
    grid = collections.defaultdict(int)
    # location_key (rounded) -> {lat,lon,label,count}
    city_totals = collections.defaultdict(lambda: {"lat":0,"lon":0,"label":"","count":0})

    total = 0
    with open(INP) as f:
        for line in f:
            try:
                r = json.loads(line)
            except Exception:
                continue
            total += 1
            tbin = (r["h"] * 60 + r["m"]) // MIN_PER_BIN
            lat_b = round(r["lat"] / BIN) * BIN
            lon_b = round(r["lon"] / BIN) * BIN
            grid[(tbin, lat_b, lon_b)] += 1
            ck = (lat_b, lon_b)
            city_totals[ck]["lat"] = lat_b
            city_totals[ck]["lon"] = lon_b
            city_totals[ck]["count"] += 1

    # Label top cities from location-map
    with open(LOC_MAP) as f:
        loc_map = json.load(f)
    label_lookup = {}
    for loc, g in loc_map.items():
        k = (round(g["lat"]/BIN)*BIN, round(g["lon"]/BIN)*BIN)
        if k not in label_lookup:
            label_lookup[k] = g["label"]
    for ck, v in city_totals.items():
        v["label"] = label_lookup.get(ck, "")

    # Emit 24h data as flat arrays for compactness
    # For each time bin, list of [lat, lon, count]
    frames = []
    by_tbin = collections.defaultdict(list)
    for (tbin, lat, lon), c in grid.items():
        by_tbin[tbin].append([lat, lon, c])
    for t in range(BINS_PER_DAY):
        frames.append(by_tbin.get(t, []))

    out = {
        "min_per_bin": MIN_PER_BIN,
        "bins_per_day": BINS_PER_DAY,
        "total_events": total,
        "frames": frames,
    }
    with open(OUT_24H, "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",",":"))
    sz = os.path.getsize(OUT_24H)
    print(f"Wrote {OUT_24H} ({sz//1024}KB, {total} events, {BINS_PER_DAY} frames)", flush=True)

    # Top cities
    top = sorted(city_totals.values(), key=lambda v: -v["count"])[:200]
    with open(OUT_TOP, "w") as f:
        json.dump(top, f, ensure_ascii=False, separators=(",",":"))
    print(f"Wrote {OUT_TOP} (top {len(top)} cities)", flush=True)

if __name__ == "__main__":
    main()
