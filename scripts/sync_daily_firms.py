import os
import sys
import urllib.request
import urllib.parse
import pandas as pd
from datetime import datetime, timezone

# 1. Configuration
MAP_KEY = os.environ.get("NASA_FIRMS_MAP_KEY")
if not MAP_KEY:
    # Try reading from .env if running locally
    env_file = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_file):
        with open(env_file, "r") as f:
            for line in f:
                if line.startswith("NASA_FIRMS_MAP_KEY="):
                    MAP_KEY = line.strip().split("=", 1)[1]

if not MAP_KEY:
    print("Error: NASA_FIRMS_MAP_KEY is not set.")
    sys.exit(1)

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "..", "public", "data", "daily_firms_recent.csv")
os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

TARGET_REGIONS = [
    {"name": "India / South Asia", "bbox": "68,8,97,37", "source": "VIIRS_NOAA20_NRT", "days": 2},
    {"name": "United States", "bbox": "-125,24,-66,50", "source": "VIIRS_NOAA20_NRT", "days": 2},
    {"name": "Australia", "bbox": "112,-44,154,-10", "source": "VIIRS_NOAA20_NRT", "days": 2},
]

print(f"[{datetime.now(timezone.utc).isoformat()}] Starting Daily NASA FIRMS Ingestion...")

dfs = []
for r in TARGET_REGIONS:
    url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{r['source']}/{r['bbox']}/{r['days']}"
    print(f"Fetching {r['name']} ({r['source']}, {r['days']} days)...")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PyroLens-DailySync/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            df = pd.read_csv(resp)
            if not df.empty and "latitude" in df.columns:
                print(f"  -> Received {len(df)} records for {r['name']}")
                dfs.append(df)
            else:
                print(f"  -> No fire detections returned for {r['name']}")
    except Exception as e:
        print(f"  -> Warning: Failed to fetch {r['name']}: {e}")

if not dfs:
    print("No data fetched from any region. Exiting.")
    sys.exit(0)

new_data = pd.concat(dfs, ignore_index=True)

# 2. Merge with existing cumulative file if present
dedup_keys = [col for col in ["latitude", "longitude", "acq_date", "acq_time", "satellite"] if col in new_data.columns]

if os.path.exists(OUTPUT_FILE):
    try:
        existing_df = pd.read_csv(OUTPUT_FILE)
        combined = pd.concat([existing_df, new_data], ignore_index=True)
    except Exception as e:
        print(f"Warning reading existing file, replacing: {e}")
        combined = new_data
else:
    combined = new_data

# 3. Deduplicate
before_len = len(combined)
combined.drop_duplicates(subset=dedup_keys, keep="last", inplace=True)
after_len = len(combined)
print(f"Deduplication: {before_len} -> {after_len} rows ({before_len - after_len} duplicates dropped)")

# 4. Keep rolling window of last 30 days to keep file light and within browser safety limit
if "acq_date" in combined.columns:
    combined["acq_date_dt"] = pd.to_datetime(combined["acq_date"], errors="coerce")
    max_date = combined["acq_date_dt"].max()
    if pd.notnull(max_date):
        cutoff = max_date - pd.Timedelta(days=30)
        combined = combined[combined["acq_date_dt"] >= cutoff].copy()
    combined.drop(columns=["acq_date_dt"], inplace=True)

# 5. Sort chronologically
if "acq_date" in combined.columns:
    combined.sort_values(by=["acq_date", "acq_time"], ascending=[False, False], inplace=True)

# 6. Save updated file
combined.to_csv(OUTPUT_FILE, index=False)
file_size_kb = os.path.getsize(OUTPUT_FILE) / 1024
print(f"Successfully saved {len(combined)} active fire hotspots to {OUTPUT_FILE} ({file_size_kb:.1f} KB)")
