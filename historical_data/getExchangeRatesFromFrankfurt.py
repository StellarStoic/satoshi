import requests
import pandas as pd
from datetime import datetime
from tqdm import tqdm
import os
import time

# ---------- Configuration ----------
BASE_FILE = "historical_data/bitcoinity_data_USD.csv"    # the reference USD file
OUTPUT_FOLDER = "historical_data/converted_history"
START_DATE = "2010-07-17"                # your requested start date
BASE_CURRENCY = "USD"
MAX_DAYS_PER_QUERY = 90                  # Frankfurt API range limit
# ------------------------------------

FRANKFURT_API = "https://api.frankfurter.app"

os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# ---------- 1. Load BTC/USD history ----------
print("📘 Loading base USD price history…")
usd_df = pd.read_csv(BASE_FILE)
usd_df.rename(columns=lambda x: x.strip(), inplace=True)
usd_df["Time"] = pd.to_datetime(usd_df["Time"], utc=True)
# Average across columns (ignoring NaNs) to get one USD price per day
price_columns = [c for c in usd_df.columns if c != "Time"]
usd_df["USD_Price"] = usd_df[price_columns].mean(axis=1, skipna=True)
usd_df = usd_df[["Time", "USD_Price"]].dropna().sort_values("Time")
usd_df = usd_df[usd_df["Time"] >= START_DATE]

# ---------- 2. Get full currency list ----------
print("🌍 Fetching list of available currencies from Frankfurt API…")
resp = requests.get(f"{FRANKFURT_API}/currencies")
resp.raise_for_status()
currencies = sorted(resp.json().keys())  # returns dict {code:name}
currencies.remove(BASE_CURRENCY)  # exclude USD itself
print(f"✅ {len(currencies)} currencies found")

# ---------- 3. Helper to download historical FX data ----------
def get_fx_history(target_currency: str) -> pd.DataFrame:
    """Fetch complete USD→target historical rates as DataFrame(date,rate)"""
    start = datetime.strptime(START_DATE, "%Y-%m-%d").date()
    end = datetime.utcnow().date()

    all_rates = {}
    cursor = start
    while cursor < end:
        # Split into 90‑day chunks (Frankfurter range limit)
        end_chunk = min(end, cursor.replace(day=28))  # monthly step
        url = f"{FRANKFURT_API}/{cursor}..{end_chunk}?from=USD&to={target_currency}"
        for _ in range(3):
            try:
                r = requests.get(url, timeout=10)
                if r.status_code == 200:
                    data = r.json().get("rates", {})
                    for day, vals in data.items():
                        all_rates[day] = vals[target_currency]
                    break
                elif r.status_code == 429:
                    print("⏳ Rate limited; sleeping 5 s…")
                    time.sleep(5)
            except Exception as e:
                print("⚠️ Retrying", e)
                time.sleep(2)
        # advance roughly one month
        month = cursor.month + 3
        year = cursor.year + month // 12
        month = month % 12 or 12
        cursor = cursor.replace(year=year, month=month, day=1)
        if cursor.day != 1:
            cursor = cursor.replace(day=1)

    if not all_rates:
        raise ValueError(f"No data for {target_currency}")

    fx_df = pd.DataFrame(
        [{"Date": pd.to_datetime(d), "Rate": rate} for d, rate in all_rates.items()]
    ).sort_values("Date")
    fx_df["Date"] = fx_df["Date"].dt.tz_localize("UTC")
    return fx_df

# ---------- 4. Build CSV for each currency ----------
def build_currency_file(curr: str):
    """Create one file satoshi_hist_data_{curr}.csv"""
    try:
        fx_df = get_fx_history(curr)
    except Exception as e:
        print(f"❌ Skipping {curr}: {e}")
        return

    # align FX to our BTC dates (forward‑fill previous rate)
    merged = pd.merge_asof(
        usd_df.sort_values("Time"),
        fx_df.rename(columns={"Date": "Time"}).sort_values("Time"),
        on="Time",
        direction="backward"
    )

    merged["Price_Local"] = merged["USD_Price"] * merged["Rate"]

    out = merged[["Time", "Price_Local"]].copy()
    out.columns = ["Time", "satoshi.si"]
    out["Time"] = out["Time"].dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    out.to_csv(f"{OUTPUT_FOLDER}/satoshi_hist_data_{curr}.csv", index=False)
    print(f"💾 Saved {curr} → {len(out)} rows")

# ---------- 5. Run ----------
for curr in tqdm(currencies, desc="Converting currencies"):
    build_currency_file(curr)

print("\n✅ All available currencies processed into ", OUTPUT_FOLDER)