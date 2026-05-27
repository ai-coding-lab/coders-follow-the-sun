#!/usr/bin/env python3
"""Download GH Archive hourly files for 2012-2014 summer solstice ±7 days."""
import os, sys, urllib.request, time

_opener = urllib.request.build_opener()
_opener.addheaders = [("User-Agent", "Mozilla/5.0 (compatible; coders-follow-the-sun/1.0)")]
urllib.request.install_opener(_opener)
from datetime import date, timedelta

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
os.makedirs(OUT_DIR, exist_ok=True)

# Summer solstice ±7 days = Jun 14-27 (14 days)
YEARS = [2012, 2013, 2014]
START_MONTH, START_DAY = 6, 14
NUM_DAYS = 14

def iter_files():
    for y in YEARS:
        d0 = date(y, START_MONTH, START_DAY)
        for i in range(NUM_DAYS):
            d = d0 + timedelta(days=i)
            for h in range(24):
                yield f"{d.year}-{d.month:02d}-{d.day:02d}-{h}"

def main():
    files = list(iter_files())
    print(f"Total files: {len(files)}", flush=True)
    for i, stem in enumerate(files):
        out = os.path.join(OUT_DIR, f"{stem}.json.gz")
        if os.path.exists(out) and os.path.getsize(out) > 0:
            continue
        url = f"https://data.gharchive.org/{stem}.json.gz"
        try:
            urllib.request.urlretrieve(url, out)
            sz = os.path.getsize(out)
            if i % 50 == 0 or i == len(files)-1:
                print(f"[{i+1}/{len(files)}] {stem} ({sz//1024}KB)", flush=True)
        except Exception as e:
            print(f"FAIL {stem}: {e}", flush=True)
        time.sleep(0.05)
    print("Download complete.", flush=True)

if __name__ == "__main__":
    main()
