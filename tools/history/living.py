"""Publish SURS annual living costs with period-matched BTC/EUR references."""
from datetime import date, timedelta, datetime, timezone
import itertools
import json
import math
from pathlib import Path
from urllib.request import Request, urlopen

from collect import ROOT, atomic_json

API = 'https://pxweb.stat.si/SiStatData/api/v1/en/Data/0411005S.px'
ARCHIVE_API = 'https://pxweb.stat.si/SiStatData/api/v1/en/Data/0411002S.px'
# Historical eggs are per piece; milk was a different, lower-fat product.
ARCHIVE = {
    '16110': ('0114102000', 1, 'UHT milk, 1.4-1.6% fat'),
    '20220': ('0111301000', 1, 'White bread, type 500'),
    '16000': ('0114701000', 10, '10 hen eggs'),
    '12010': ('0116103000', 1, 'Apples'),
    '90090': ('0411090090', 1, 'Non-profit rental'),
    '73070': ('0711173070', 1, 'Renault Clio'),
}
ITEMS = {
    '0114102000': ('milk', 'Milk', 'UHT whole milk', 'litre'),
    '0111301000': ('bread', 'Bread', 'White bread', 'kg'),
    '0114701000': ('eggs', 'Eggs', 'Pack of 10', 'pack'),
    '0116103000': ('apples', 'Apples', 'Apples', 'kg'),
    '0411090090': ('rent', 'Rent', 'Non-profit rental', 'm² / month'),
    '0711173070': ('car', 'New car', 'Renault Clio', 'car'),
}


def request_json(url, payload=None):
    data = json.dumps(payload).encode() if payload else None
    request = Request(url, data=data, headers={'Content-Type': 'application/json', 'User-Agent': 'satoshi.si living-cost-collector'})
    with urlopen(request, timeout=60) as response:
        return json.load(response)


def decode_prices(dataset, codes=ITEMS):
    axes = []
    for name in dataset['id']:
        index = dataset['dimension'][name]['category']['index']
        axes.append(sorted(index, key=index.get) if isinstance(index, dict) else index)
    result = {code: {} for code in codes}
    values = dataset['value']
    for offset, coordinates in enumerate(itertools.product(*axes)):
        key = dict(zip(dataset['id'], coordinates))
        value = values[offset] if isinstance(values, list) else values.get(str(offset))
        code = key['IZDELKI IN STORITVE']
        if code in result and isinstance(value, (int, float)) and math.isfinite(value) and value > 0:
            result[code][key['LETO']] = value
    if any(not prices for prices in result.values()):
        raise ValueError('SURS returned an empty item series')
    return result


def annual_btc_eur(btc_per_usd, fx, years):
    result = {}
    for year in years:
        start, end = date(int(year), 1, 1), date(int(year) + 1, 1, 1)
        earlier = [day for day in fx if day <= start.isoformat()]
        rate = fx[max(earlier)] if earlier else None
        values = []
        cursor = start
        while cursor < end:
            day = cursor.isoformat()
            rate = fx.get(day, rate)
            btc = btc_per_usd.get(day)
            if btc is not None:
                if rate is None or not math.isfinite(rate) or rate <= 0 or not math.isfinite(btc) or btc <= 0:
                    raise ValueError(f'Invalid BTC or FX reference on {day}')
                values.append(rate / btc)
            cursor += timedelta(days=1)
        if not values:
            result[year] = None
            continue
        average = sum(values) / len(values)
        if not math.isfinite(average) or average <= 0:
            raise ValueError('Invalid annual BTC/EUR average')
        result[year] = average
    return result


def main():
    metadata = request_json(API)
    years = next(v['values'] for v in metadata['variables'] if v['code'] == 'LETO')
    years = [year for year in years if 2018 <= int(year) < datetime.now(timezone.utc).year]
    payload = {'query': [
        {'code': 'IZDELKI IN STORITVE', 'selection': {'filter': 'item', 'values': list(ITEMS)}},
        {'code': 'MERITVE', 'selection': {'filter': 'item', 'values': ['1']}},
        {'code': 'LETO', 'selection': {'filter': 'item', 'values': years}},
    ], 'response': {'format': 'json-stat2'}}
    prices = decode_prices(request_json(API, payload))
    archive_years = [str(year) for year in range(2010, 2018)]
    archive_payload = {'query': [
        {'code': 'IZDELKI IN STORITVE', 'selection': {'filter': 'item', 'values': list(ARCHIVE)}},
        {'code': 'MERITVE', 'selection': {'filter': 'item', 'values': ['1']}},
        {'code': 'LETO', 'selection': {'filter': 'item', 'values': archive_years}},
    ], 'response': {'format': 'json-stat2'}}
    archived = decode_prices(request_json(ARCHIVE_API, archive_payload), ARCHIVE)
    for code, (current, multiplier, _) in ARCHIVE.items():
        if set(archived[code]) != set(archive_years):
            raise ValueError(f'Incomplete archived series: {code}')
        prices[current].update({year: round(value * multiplier, 4) for year, value in archived[code].items()})
    common = sorted(set.intersection(*(set(series) for series in prices.values())))
    if len(common) < 2:
        raise ValueError('At least two comparable years required')
    fx_data = request_json(f'https://api.frankfurter.dev/v1/{int(common[0])-1}-12-01..{common[-1]}-12-31?base=USD&symbols=EUR')
    fx = {day: row['EUR'] for day, row in fx_data['rates'].items()}
    reference = json.loads((ROOT / 'historical_data/generated/USD.json').read_text())
    btc = dict(reference['data'])
    annual = annual_btc_eur(btc, fx, common)
    output = ROOT / 'historical_data/generated/living-SI.json'
    if output.exists():
        old = json.loads(output.read_text())
        if not {year for year in old['years'] if int(year) >= 2010}.issubset(common):
            raise ValueError('SURS history shrank; keeping previous dataset')
    atomic_json(output, {
        'schemaVersion': 1, 'country': 'SI', 'countryName': 'Slovenia', 'currency': 'EUR',
        'years': common, 'btcEurAnnual': annual,
        'items': [{'id': info[0], 'name': info[1], 'description': info[2], 'unit': info[3],
                   'archiveDescription': next(old[2] for old in ARCHIVE.values() if old[0] == code),
                   'foodSeriesBreak': info[0] in ('milk', 'bread', 'eggs', 'apples'),
                   'series': code, 'prices': {year: prices[code][year] for year in common}}
                  for code, info in ITEMS.items()],
        'source': 'SURS', 'sourceUrl': 'https://pxweb.stat.si/SiStatData/pxweb/en/Data/-/0411005S.px',
        'archiveSourceUrl': 'https://pxweb.stat.si/SiStatData/pxweb/en/Data/-/0411002S.px',
        'seriesBreakYear': 2018,
        'fetchedAt': datetime.now(timezone.utc).isoformat(),
        'method': 'SURS annual retail averages / arithmetic annual BTC-EUR reference; not observed BTC retail quotes',
        'btcSource': reference['btcSource'], 'fxSource': 'Frankfurter',
    })
    print(f'Living costs: {len(ITEMS)} items, {common[0]}-{common[-1]}')


if __name__ == '__main__':
    main()
