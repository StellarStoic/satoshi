"""Collect regional retail groceries; reuse the site's Bitcoin/fiat history."""
from collections import defaultdict
import argparse
import calendar
from datetime import date, datetime, timedelta, timezone
import json
import itertools
import math
import time
from urllib.parse import urlencode

from collect import ROOT, atomic_json, reference_history
from living import request_json

FAO = 'https://fpma.fao.org/giews/v4/global/price_module/api/v1/'
COUNTRIES = {
    'ID': ('Asia', 'Indonesia', 'IDN', 'IDR', [
        ('rice', 'Rice', 'e8830e09-cde2-46ae-8fd7-916a1982b0e1'),
        ('flour', 'Flour', '7819292a-caeb-4e2b-8d8a-2fbf4eeadd02'),
    ]),
    'ZA': ('Africa', 'South Africa', 'ZAF', 'ZAR', [
        ('milk', 'Milk', '0491156d-1cce-4ca5-9f9c-cab0f5bbf189'),
        ('bread', 'Bread', '6c6cd999-ae01-41f7-aedf-3de4e5642164'),
        ('eggs', 'Eggs', 'dd3e7e9d-b944-4a08-a6a7-0cc8e0f1a4e3'),
        ('rice', 'Rice', '1e193601-a205-44ca-9ede-b3a7821f4c59'),
    ]),
    'SA': ('Middle East', 'Saudi Arabia', 'SAU', 'SAR', [
        ('milk', 'Milk', 'fdf688c1-2a7d-416a-b046-93c89b841c08'),
        ('bread', 'Bread', '043cf2ea-e6a6-4ede-be0b-086bc2aa4e32'),
        ('rice', 'Rice', '08eec304-c864-43c2-98a4-541af37456c8'),
    ]),
    'WS': ('Oceania', 'Samoa', 'WSM', 'WST', [
        ('rice', 'Rice', 'dee4bb30-e422-41c6-88b8-01bf7ec3239c'),
        ('sugar', 'Sugar', 'dd5fe471-bb2b-41d5-983c-13ad7fd770fe'),
    ]),
}
BLS_ITEMS = [
    ('milk', 'Milk', 'Whole milk', 'US gallon', 'APU0000709112'),
    ('bread', 'Bread', 'White pan bread', 'lb', 'APU0000702111'),
    ('eggs', 'Eggs', 'Grade A, large', 'dozen', 'APU0000708111'),
    ('flour', 'Flour', 'White, all-purpose flour', 'lb', 'APU0000701111'),
]
ONS_ITEMS = [
    ('milk', 'Milk', 'Pasteurised milk', 'UK pint', 'cznt'),
    ('bread', 'Bread', 'White sliced loaf', '800 g loaf', 'czoh'),
    ('sugar', 'Sugar', 'Granulated sugar', 'kg', 'cznn'),
]
CSO_ITEMS = [
    ('milk', 'Milk', 'Full fat milk', '2 litres', '10850', '10630'),
    ('bread', 'Bread', 'White sliced loaf', '800 g loaf', '11020', '10040'),
    ('flour', 'Flour', 'White self-raising flour', '2 kg', '11150', '10020'),
    ('sugar', 'Sugar', 'White granulated sugar', 'kg', '11190', '11150'),
]


def get_json(url):
    for attempt in range(3):
        try:
            return request_json(url)
        except (OSError, ValueError):
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def paginated(url):
    rows, visited = [], set()
    while url:
        if not url.startswith(FAO) or url in visited:
            raise ValueError('Invalid FAO pagination')
        visited.add(url)
        data = get_json(url)
        rows.extend(data['results'])
        url = data.get('next')
    return rows


def annual_prices(points, field='price_value'):
    """Only twelve distinct, positive monthly observations make a full year."""
    monthly = defaultdict(dict)
    for point in points:
        day = date.fromisoformat(point['date'][:10])
        value = point.get(field)
        if day.year < 2010 or day.year >= datetime.now(timezone.utc).year:
            continue
        if not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
            continue
        key = str(day.year)
        if day.month in monthly[key] and monthly[key][day.month] != value:
            raise ValueError('Conflicting duplicate monthly prices')
        monthly[key][day.month] = value
    return {year: sum(months.values()) / 12 for year, months in monthly.items() if len(months) == 12}


def annual_reference(daily, years):
    result = {}
    for year in years:
        start, end = date(int(year), 1, 1), date(int(year) + 1, 1, 1)
        values = [daily.get((start + timedelta(days=i)).isoformat()) for i in range((end - start).days)]
        observed = [value for value in values if value is not None]
        if any(not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0 for value in observed):
            raise ValueError('Invalid daily Bitcoin price')
        result[year] = sum(observed) / len(observed) if observed else None
    return result


def add_conversions(country, usd_reference):
    currency = country['currency']
    path = ROOT / f'historical_data/currencies/satoshi_hist_data_{currency}.csv'
    if currency == 'USD':
        local = usd_reference
    elif path.exists():
        local = annual_reference(reference_history(path), country['years'])
    else:
        local = {}
    for item in country['items']:
        item['btcPrices'] = {}
        for year, price in item['prices'].items():
            if local.get(year):
                value = price / local[year]
            elif usd_reference.get(year) and item.get('usdPrices', {}).get(year):
                value = item['usdPrices'][year] / usd_reference[year]
            else:
                value = None
            item['btcPrices'][year] = value
    country['conversionSource'] = 'Existing Bitcoin/fiat history; FAO USD prices where local FX is unavailable'


def fao_country(code):
    region, name, iso3, currency, selections = COUNTRIES[code]
    metadata = {row['uuid']: row for row in paginated(FAO + 'FpmaSerie/?' + urlencode({'iso3_country_codes': iso3, 'price_types_ids': 12}))}
    items = []
    for item_id, label, uuid in selections:
        meta = metadata[uuid]
        if meta['price_type'] != 'RETAIL' or meta['currency'] != currency or meta['market_name'] != 'National Average':
            raise ValueError(f'Unexpected series definition: {uuid}')
        records = paginated(FAO + 'FpmaSeriePrice/?' + urlencode({'uuid__in': uuid, 'periodicity': 'monthly'}))
        points = next(row['datapoints'] for row in records if row['uuid'] == uuid)
        prices = annual_prices(points)
        if '2010' not in prices or len(prices) < 2:
            raise ValueError(f'Incomplete 2010 history: {name} {label}')
        items.append({'id': item_id, 'name': label, 'description': meta['commodity_name'],
                      'unit': meta['measure_unit_label'], 'series': uuid, 'prices': prices,
                      'usdPrices': annual_prices(points, 'price_value_dollar'),
                      'originalSource': meta['source_name'], 'originalSourceUrl': meta['source_url']})
    years = sorted(set.union(*(set(item['prices']) for item in items)))
    return {'schemaVersion': 1, 'country': code, 'countryName': name, 'region': region,
            'currency': currency, 'years': years, 'items': items, 'market': 'National average',
            'source': 'FAO / national statistics', 'sourceUrl': 'https://fpma.fao.org/',
            'fetchedAt': datetime.now(timezone.utc).isoformat()}


def us_country():
    items = []
    end = datetime.now(timezone.utc).year - 1
    for item_id, name, description, unit, series in BLS_ITEMS:
        points = []
        # Unregistered BLS calls allow at most ten years per request.
        for first in range(2010, end + 1, 10):
            url = f'https://api.bls.gov/publicAPI/v2/timeseries/data/{series}?' + urlencode({'startyear': first, 'endyear': min(first + 9, end)})
            response = get_json(url)
            if response['status'] != 'REQUEST_SUCCEEDED' or response.get('message'):
                raise ValueError(f'BLS response: {response.get("message")}')
            rows = next(row['data'] for row in response['Results']['series'] if row['seriesID'] == series)
            for row in rows:
                if row['period'] not in [f'M{i:02}' for i in range(1, 13)] or row['value'] == '-':
                    continue
                points.append({'date': f'{row["year"]}-{row["period"][1:]}-01', 'price_value': float(row['value'])})
        prices = annual_prices(points)
        if '2010' not in prices:
            raise ValueError(f'BLS missing 2010: {series}')
        items.append({'id': item_id, 'name': name, 'description': description, 'unit': unit, 'series': series, 'prices': prices})
    return {'schemaVersion': 1, 'country': 'US', 'countryName': 'United States', 'region': 'US',
            'currency': 'USD', 'years': sorted(set.union(*(set(item['prices']) for item in items))),
            'items': items, 'market': 'US city average', 'source': 'BLS',
            'sourceUrl': 'https://www.bls.gov/cpi/factsheets/average-prices.htm',
            'fetchedAt': datetime.now(timezone.utc).isoformat()}


def preserve_history(old, new):
    if not old:
        return
    current = {item['id']: item for item in new['items']}
    for item in old['items']:
        if item['id'] not in current or not {year for year in item['prices'] if int(year) >= 2010}.issubset(current[item['id']]['prices']):
            raise ValueError('Provider returned truncated grocery history')


def ons_prices(dataset):
    if dataset['description']['unit'].lower() != 'pence' or 'ave price' not in dataset['description']['title'].lower():
        raise ValueError('Expected ONS average prices in pence, not an index')
    points = []
    months = {name: index for index, name in enumerate(calendar.month_name) if name}
    for row in dataset['months']:
        if not row['value']:
            continue
        points.append({'date': f'{row["year"]}-{months[row["month"]]:02}-01', 'price_value': float(row['value']) / 100})
    return annual_prices(points)


def uk_country():
    items = []
    for item_id, name, description, unit, series in ONS_ITEMS:
        url = f'https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/{series}/mm23'
        prices = ons_prices(get_json(url + '/data'))
        if '2010' not in prices:
            raise ValueError(f'ONS missing 2010: {series}')
        items.append({'id': item_id, 'name': name, 'description': description, 'unit': unit,
                      'series': series.upper(), 'prices': prices, 'originalSourceUrl': url})
    return european_country('GB', 'United Kingdom', 'GBP', 'ONS',
                            'https://www.ons.gov.uk/economy/inflationandpriceindices', items)


def cso_monthly(dataset, item_codes):
    axes = []
    for name in dataset['id']:
        index = dataset['dimension'][name]['category']['index']
        axes.append(sorted(index, key=index.get) if isinstance(index, dict) else index)
    stat = dataset['dimension']['STATISTIC']['category']
    if any(unit['label'] != 'Euro' for unit in stat['unit'].values()):
        raise ValueError('Expected CSO prices in euros')
    item_axis = next(name for name in dataset['id'] if name not in ('STATISTIC', 'TLIST(M1)'))
    result = {code: [] for code in item_codes}
    for offset, coordinates in enumerate(itertools.product(*axes)):
        key = dict(zip(dataset['id'], coordinates))
        code = key[item_axis]
        if code not in result:
            continue
        month = key['TLIST(M1)']
        values = dataset['value']
        value = values[offset] if isinstance(values, list) else values.get(str(offset))
        result[code].append({'date': f'{month[:4]}-{month[4:6]}-01', 'price_value': value})
    return result


def ireland_country():
    base = 'https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/'
    old = cso_monthly(get_json(base + 'CPM04/JSON-stat/2.0/en'), [item[4] for item in CSO_ITEMS])
    current = cso_monthly(get_json(base + 'CPM12/JSON-stat/2.0/en'), [item[5] for item in CSO_ITEMS])
    items = []
    for item_id, name, description, unit, old_code, new_code in CSO_ITEMS:
        # Identical package definitions; the archive supplies 2009-2011 only.
        points = [point for point in old[old_code] if point['date'] < '2012-01-01']
        points += [point for point in current[new_code] if point['date'] >= '2012-01-01']
        prices = annual_prices(points)
        if '2010' not in prices or '2012' not in prices:
            raise ValueError(f'Incomplete Irish archive/current series: {name}')
        items.append({'id': item_id, 'name': name, 'description': description, 'unit': unit,
                      'series': f'CPM04:{old_code};CPM12:{new_code}', 'prices': prices})
    return european_country('IE', 'Ireland', 'EUR', 'CSO Ireland', 'https://data.cso.ie/table/CPM12', items)


def european_country(code, name, currency, source, url, items):
    return {'schemaVersion': 1, 'country': code, 'countryName': name, 'region': 'EU' if code == 'IE' else 'Europe (non-EU)',
            'currency': currency, 'years': sorted(set.union(*(set(item['prices']) for item in items))),
            'items': items, 'market': 'National average', 'source': source, 'sourceUrl': url,
            'fetchedAt': datetime.now(timezone.utc).isoformat()}


def eu_country():
    url = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_aind?' + urlencode({
        'geo': 'EU27_2020', 'coicop': 'CP01', 'unit': 'INX_A_AVG', 'sinceTimePeriod': 2010})
    dataset = get_json(url)
    if dataset['id'][-1] != 'time' or any(size != 1 for size in dataset['size'][:-1]):
        raise ValueError('Unexpected Eurostat food-index dimensions')
    index = dataset['dimension']['time']['category']['index']
    values = dataset['value']
    annual = {year: values.get(str(offset)) for year, offset in index.items()
              if 2010 <= int(year) < datetime.now(timezone.utc).year}
    expected = {str(year) for year in range(2010, datetime.now(timezone.utc).year)}
    if set(annual) != expected or any(not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0 for value in annual.values()):
        raise ValueError('Incomplete EU food-inflation history')
    item = {'id': 'basket', 'name': 'Grocery basket', 'description': 'EUR 100 in 2010, tracked with food inflation',
            'unit': 'reference basket', 'image': 'bread', 'series': 'prc_hicp_aind/CP01/EU27_2020/INX_A_AVG',
            'prices': {year: 100 * value / annual['2010'] for year, value in annual.items()}}
    country = european_country('EU', 'European Union', 'EUR', 'Eurostat',
                               'https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_aind/default/table', [item])
    country.update(region='EU', market='EU-27, including Slovenia and Ireland',
                   note='Illustrative EUR 100 basket in 2010, tracked with EU food and non-alcoholic beverage inflation. Not an observed retail basket price.')
    return country


def main():
    collectors = {'US': us_country, 'GB': uk_country, 'IE': ireland_country, 'EU': eu_country}
    codes = ['US', *COUNTRIES, 'GB', 'IE', 'EU']
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--countries', nargs='+', choices=codes, help='Refresh selected countries; retain other snapshots')
    parser.add_argument('--recalculate', action='store_true', help='Reuse grocery snapshots and recalculate BTC equivalents')
    args = parser.parse_args()
    selected = args.countries
    output = ROOT / 'historical_data/generated/living-regions.json'
    previous = json.loads(output.read_text())['countries'] if output.exists() else []
    old = {country['country']: country for country in previous}
    btc = json.loads((ROOT / 'historical_data/generated/USD.json').read_text())
    years = [str(year) for year in range(2010, datetime.now(timezone.utc).year)]
    usd = annual_reference({day: 1 / value for day, value in btc['data']}, years)
    countries, failures = [], []
    slovenia = json.loads((ROOT / 'historical_data/generated/living-SI.json').read_text())
    slovenia.update(region='EU', market='National average')
    countries.append(slovenia)
    for code in codes:
        if selected and code not in selected and code in old:
            countries.append(old[code])
            continue
        try:
            country = old[code] if args.recalculate else collectors[code]() if code in collectors else fao_country(code)
            country['years'] = [year for year in country['years'] if int(year) >= 2010]
            for item in country['items']:
                for field in ('prices', 'usdPrices', 'btcPrices'):
                    if field in item:
                        item[field] = {year: value for year, value in item[field].items() if int(year) >= 2010}
            preserve_history(old.get(code), country)
            add_conversions(country, usd)
            countries.append(country)
            print(f'{country["countryName"]}: {len(country["items"])} groceries, {country["years"][0]}-{country["years"][-1]}', flush=True)
        except Exception as error:
            failures.append(code)
            print(f'{code}: {error}; retaining previous dataset', flush=True)
            if code in old:
                countries.append(old[code])
    if {country['country'] for country in countries} != {'SI', *codes}:
        raise ValueError('Initial publication requires all configured countries')
    atomic_json(output, {'schemaVersion': 1, 'countries': countries, 'refreshFailures': failures})
    if failures:
        raise SystemExit('Some grocery sources failed; previous country snapshots retained')


if __name__ == '__main__':
    main()
