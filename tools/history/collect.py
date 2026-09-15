"""Generate versioned BTC/unit history; never modify the legacy CSV archive."""
import argparse
import csv
from datetime import date, datetime, timezone
import json
import math
from pathlib import Path
import time
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
ASSETS = json.loads(Path(__file__).with_name('assets.json').read_text())


def reference_history(path):
    result = {}
    with path.open() as stream:
        for row in csv.DictReader(stream):
            values = [float(value) for key, value in row.items() if key != 'Time' and value]
            values = [value for value in values if math.isfinite(value) and value > 0]
            if values:
                result[row['Time'][:10]] = sum(values) / len(values)
    if not result:
        raise ValueError('Empty legacy BTC reference')
    return result


def download(symbol, end, expected_currency='USD'):
    import yfinance as yf
    for attempt in range(3):
        try:
            ticker = yf.Ticker(symbol)
            frame = ticker.history(start='2010-07-17', end=end, interval='1d',
                                   auto_adjust=False, back_adjust=False, actions=False,
                                   repair=False, timeout=30, raise_errors=True)
            if frame.empty:
                raise ValueError(f'Empty history: {symbol}')
            metadata = ticker.get_history_metadata()
            if metadata.get('currency') != expected_currency:
                raise ValueError(f'Unexpected quote currency for {symbol}: {metadata.get("currency")}')
            result = {}
            for stamp, row in frame.iterrows():
                high, low = float(row['High']), float(row['Low'])
                # Preserve exchange-local session dates, as in the original converter.
                day = stamp.date().isoformat()
                if day < end and math.isfinite(high) and math.isfinite(low) and high >= low:
                    midpoint = (high + low) / 2
                    if midpoint > 0:
                        result[day] = midpoint
            if not result:
                raise ValueError(f'No positive midpoints: {symbol}')
            return result
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** (attempt + 1))


def convert(asset, btc, multiplier):
    return [[day, asset[day] * multiplier / btc[day]] for day in sorted(asset.keys() & btc.keys())
            if math.isfinite(asset[day]) and math.isfinite(btc[day]) and asset[day] > 0 and btc[day] > 0]


def validate(rows, previous=None):
    if not rows or any(not math.isfinite(value) or value <= 0 for _, value in rows):
        raise ValueError('Empty or invalid converted history')
    days = [day for day, _ in rows]
    if days != sorted(set(days)):
        raise ValueError('Duplicate or unordered dates')
    if previous:
        old = previous['data']
        if days[0] > old[0][0] or days[-1] < old[-1][0] or len(rows) < len(old):
            raise ValueError('Provider returned truncated history; keeping previous dataset')


def atomic_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, separators=(',', ':'), allow_nan=False) + '\n')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--assets', nargs='+', choices=sorted(ASSETS))
    parser.add_argument('--output', type=Path, default=ROOT / 'historical_data/generated')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    end = datetime.now(timezone.utc).date().isoformat()
    btc = reference_history(ROOT / 'historical_data/currencies/satoshi_hist_data_USD.csv')
    cutoff = max(btc)
    fresh_btc = download('BTC-USD', end)
    if (date.fromisoformat(end) - date.fromisoformat(max(fresh_btc))).days > 3:
        raise ValueError('BTC reference is stale; no datasets updated')
    btc.update({day: value for day, value in fresh_btc.items() if day > cutoff})
    failures, successful = {}, []
    for code in args.assets or ASSETS:
        symbol, unit, multiplier, kind = ASSETS[code]
        try:
            asset = download(symbol, end, 'USX' if multiplier == 0.01 else 'USD')
            rows = convert(asset, btc, multiplier)
            target = args.output / f'{code}.json'
            previous = json.loads(target.read_text()) if target.exists() else None
            validate(rows, previous)
            if (date.fromisoformat(end) - date.fromisoformat(rows[-1][0])).days > 10:
                raise ValueError('Asset data is stale; keeping previous dataset')
            payload = {
                'schemaVersion': 1, 'asset': code, 'symbol': symbol, 'unit': unit, 'kind': kind,
                'denomination': 'BTC/unit', 'source': 'Yahoo Finance via yfinance',
                'sourceUrl': f'https://finance.yahoo.com/quote/{quote(symbol, safe="")}/history/',
                'btcSource': f'Bitcoinity exchange average through {cutoff}; Yahoo BTC-USD midpoint thereafter',
                'btcLegacyThrough': cutoff, 'quoteToUsdMultiplier': multiplier,
                'method': '(High + Low) / 2; auto_adjust=False; matching calendar dates; no forward-fill',
                'refreshedAt': datetime.now(timezone.utc).isoformat(),
                'firstObservation': rows[0][0], 'lastObservation': rows[-1][0], 'data': rows
            }
            atomic_json(target, payload)
            successful.append(code)
            print(f'{code}: {len(rows)} observations through {rows[-1][0]}', flush=True)
        except Exception as error:
            failures[code] = str(error)
            print(f'WARNING {code}: {error}', flush=True)
        time.sleep(1)
    atomic_json(args.output / 'status.json', {
        'attemptedAt': datetime.now(timezone.utc).isoformat(), 'updated': successful, 'failed': failures
    })
    if not successful:
        raise RuntimeError('No asset updated')


if __name__ == '__main__':
    main()
