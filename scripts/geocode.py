#!/usr/bin/env python3
"""Geocode location strings using GeoNames cities1000 gazetteer."""
import os, json, sys, re, unicodedata, collections

ROOT = os.path.join(os.path.dirname(__file__), "..")
CITIES_FILE = os.path.join(ROOT, "data", "cities1000.txt")
EXTRACTED = os.path.join(ROOT, "data", "extracted.jsonl")
OUT = os.path.join(ROOT, "data", "geocoded.jsonl")
LOC_MAP_OUT = os.path.join(ROOT, "data", "location-map.json")

COUNTRY_CODE_TO_LATLON = {
    # capital lat/lon, used when only country mentioned
    "US": (38.90, -77.04, "United States"),
    "GB": (51.51, -0.13, "United Kingdom"),
    "UK": (51.51, -0.13, "United Kingdom"),
    "DE": (52.52, 13.40, "Germany"),
    "FR": (48.86, 2.35, "France"),
    "JP": (35.68, 139.69, "Japan"),
    "CN": (39.91, 116.40, "China"),
    "IN": (28.61, 77.21, "India"),
    "BR": (-15.79, -47.88, "Brazil"),
    "RU": (55.75, 37.62, "Russia"),
    "CA": (45.42, -75.69, "Canada"),
    "AU": (-35.31, 149.12, "Australia"),
    "NL": (52.37, 4.89, "Netherlands"),
    "SE": (59.33, 18.06, "Sweden"),
    "NO": (59.91, 10.74, "Norway"),
    "FI": (60.17, 24.93, "Finland"),
    "DK": (55.68, 12.57, "Denmark"),
    "PL": (52.23, 21.01, "Poland"),
    "ES": (40.42, -3.70, "Spain"),
    "IT": (41.90, 12.49, "Italy"),
    "KR": (37.57, 126.98, "South Korea"),
    "TW": (25.03, 121.57, "Taiwan"),
    "HK": (22.32, 114.17, "Hong Kong"),
    "SG": (1.35, 103.82, "Singapore"),
    "MX": (19.43, -99.13, "Mexico"),
    "AR": (-34.60, -58.38, "Argentina"),
    "CH": (46.95, 7.45, "Switzerland"),
    "AT": (48.21, 16.37, "Austria"),
    "BE": (50.85, 4.35, "Belgium"),
    "IE": (53.35, -6.26, "Ireland"),
    "PT": (38.72, -9.14, "Portugal"),
    "GR": (37.98, 23.73, "Greece"),
    "CZ": (50.09, 14.42, "Czech Republic"),
    "HU": (47.50, 19.04, "Hungary"),
    "RO": (44.43, 26.10, "Romania"),
    "UA": (50.45, 30.52, "Ukraine"),
    "BY": (53.90, 27.57, "Belarus"),
    "IL": (31.78, 35.22, "Israel"),
    "TR": (39.93, 32.86, "Turkey"),
    "ID": (-6.21, 106.85, "Indonesia"),
    "TH": (13.75, 100.50, "Thailand"),
    "VN": (21.03, 105.85, "Vietnam"),
    "PH": (14.60, 120.98, "Philippines"),
    "MY": (3.14, 101.69, "Malaysia"),
    "ZA": (-25.75, 28.19, "South Africa"),
    "NG": (9.08, 7.40, "Nigeria"),
    "EG": (30.05, 31.25, "Egypt"),
    "NZ": (-41.29, 174.78, "New Zealand"),
    "CL": (-33.45, -70.67, "Chile"),
    "CO": (4.71, -74.07, "Colombia"),
    "PE": (-12.05, -77.04, "Peru"),
    "VE": (10.48, -66.90, "Venezuela"),
    "IR": (35.69, 51.39, "Iran"),
    "PK": (33.69, 73.05, "Pakistan"),
    "BD": (23.81, 90.41, "Bangladesh"),
    "SA": (24.71, 46.68, "Saudi Arabia"),
    "AE": (24.47, 54.37, "UAE"),
}

COUNTRY_NAME_TO_CC = {
    "united states": "US", "usa": "US", "u.s.a.": "US", "u.s.": "US", "america": "US",
    "united kingdom": "GB", "great britain": "GB", "england": "GB", "uk": "GB",
    "germany": "DE", "deutschland": "DE",
    "france": "FR",
    "japan": "JP", "日本": "JP",
    "china": "CN", "中国": "CN",
    "india": "IN", "brazil": "BR", "brasil": "BR",
    "russia": "RU", "россия": "RU",
    "canada": "CA", "australia": "AU",
    "netherlands": "NL", "the netherlands": "NL", "holland": "NL",
    "sweden": "SE", "norway": "NO", "finland": "FI", "denmark": "DK",
    "poland": "PL", "polska": "PL",
    "spain": "ES", "españa": "ES", "italy": "IT", "italia": "IT",
    "south korea": "KR", "korea": "KR", "taiwan": "TW", "hong kong": "HK",
    "singapore": "SG", "mexico": "MX", "argentina": "AR",
    "switzerland": "CH", "austria": "AT", "belgium": "BE", "ireland": "IE",
    "portugal": "PT", "greece": "GR", "czech republic": "CZ", "czechia": "CZ",
    "hungary": "HU", "romania": "RO", "ukraine": "UA", "belarus": "BY",
    "israel": "IL", "turkey": "TR", "indonesia": "ID", "thailand": "TH",
    "vietnam": "VN", "philippines": "PH", "malaysia": "MY",
    "south africa": "ZA", "nigeria": "NG", "egypt": "EG",
    "new zealand": "NZ", "chile": "CL", "colombia": "CO", "peru": "PE",
    "iran": "IR", "pakistan": "PK", "bangladesh": "BD",
    "saudi arabia": "SA", "uae": "AE",
}

ALIASES = {
    "nyc": ("New York", "US"),
    "ny": ("New York", "US"),
    "sf": ("San Francisco", "US"),
    "sfo": ("San Francisco", "US"),
    "la": ("Los Angeles", "US"),
    "bay area": ("San Francisco", "US"),
    "silicon valley": ("San Jose", "US"),
    "東京": ("Tokyo", "JP"),
    "tokyo, japan": ("Tokyo", "JP"),
    "москва": ("Moscow", "RU"),
}

def norm(s):
    s = unicodedata.normalize("NFKC", s).lower().strip()
    s = re.sub(r"[​‌‍﻿]", "", s)
    s = re.sub(r"[^\w\s,\-]", " ", s, flags=re.UNICODE)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def load_cities():
    """Return (city_index, ascii_index). Both map normalized name → (lat, lon, country_code, population)."""
    by_name = {}
    print(f"Loading cities from {CITIES_FILE}...", flush=True)
    with open(CITIES_FILE, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 15:
                continue
            name = parts[1]
            ascii_name = parts[2]
            alt_names = parts[3]
            lat = float(parts[4])
            lon = float(parts[5])
            cc = parts[8]
            try:
                pop = int(parts[14]) if parts[14] else 0
            except Exception:
                pop = 0
            entry = (lat, lon, cc, pop, name)
            for n in [name, ascii_name] + (alt_names.split(",") if alt_names else []):
                k = norm(n)
                if not k:
                    continue
                # keep highest-population entry
                if k not in by_name or by_name[k][3] < pop:
                    by_name[k] = entry
    print(f"Loaded {len(by_name)} city aliases", flush=True)
    return by_name

def geocode_location(loc, cities):
    """Return (lat, lon, label) or None."""
    n = norm(loc)
    if not n:
        return None
    # alias check
    if n in ALIASES:
        city, cc = ALIASES[n]
        k = norm(city)
        if k in cities:
            lat, lon, _, _, name = cities[k]
            return (lat, lon, name)
    # exact city match
    if n in cities:
        lat, lon, _, _, name = cities[n]
        return (lat, lon, name)
    # split on comma — try first part as city
    parts = [p.strip() for p in n.split(",") if p.strip()]
    if parts:
        first = parts[0]
        if first in ALIASES:
            city, cc = ALIASES[first]
            k = norm(city)
            if k in cities:
                lat, lon, _, _, name = cities[k]
                return (lat, lon, name)
        if first in cities:
            lat, lon, _, _, name = cities[first]
            return (lat, lon, name)
        # last part as country
        if len(parts) >= 2:
            last = parts[-1]
            if last in COUNTRY_NAME_TO_CC:
                cc = COUNTRY_NAME_TO_CC[last]
                if cc in COUNTRY_CODE_TO_LATLON:
                    lat, lon, label = COUNTRY_CODE_TO_LATLON[cc]
                    # prefer first part if it's a city not in gazetteer; otherwise use country
                    return (lat, lon, label)
    # country-only
    if n in COUNTRY_NAME_TO_CC:
        cc = COUNTRY_NAME_TO_CC[n]
        if cc in COUNTRY_CODE_TO_LATLON:
            return COUNTRY_CODE_TO_LATLON[cc][:2] + (COUNTRY_CODE_TO_LATLON[cc][2],)
    return None

def main():
    cities = load_cities()
    # First pass: build unique loc → coord map
    print("Counting unique locations...", flush=True)
    loc_counts = collections.Counter()
    with open(EXTRACTED) as f:
        for line in f:
            try:
                rec = json.loads(line)
                loc_counts[rec["l"]] += 1
            except Exception:
                continue
    print(f"Unique locations: {len(loc_counts)}, total events: {sum(loc_counts.values())}", flush=True)

    loc_map = {}
    hits = 0
    miss_examples = []
    for loc, n in loc_counts.most_common():
        g = geocode_location(loc, cities)
        if g:
            loc_map[loc] = {"lat": g[0], "lon": g[1], "label": g[2]}
            hits += n
        elif len(miss_examples) < 30:
            miss_examples.append((loc, n))

    total = sum(loc_counts.values())
    print(f"Geocoded events: {hits}/{total} ({100*hits/max(total,1):.1f}%)", flush=True)
    print(f"Geocoded unique locations: {len(loc_map)}/{len(loc_counts)}", flush=True)
    print(f"Top unmatched examples:", flush=True)
    for loc, n in miss_examples:
        print(f"  {n:>6}  {loc!r}", flush=True)

    with open(LOC_MAP_OUT, "w") as f:
        json.dump(loc_map, f, ensure_ascii=False)
    print(f"Wrote location map to {LOC_MAP_OUT}", flush=True)

    # Second pass: emit geocoded events
    print("Writing geocoded events...", flush=True)
    with open(EXTRACTED) as f, open(OUT, "w") as out:
        for line in f:
            try:
                rec = json.loads(line)
            except Exception:
                continue
            g = loc_map.get(rec["l"])
            if not g:
                continue
            out.write(json.dumps({"h": rec["h"], "m": rec["m"], "lat": g["lat"], "lon": g["lon"]}) + "\n")
    print("Done.", flush=True)

if __name__ == "__main__":
    main()
