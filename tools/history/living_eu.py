"""Publish observed EU consumer energy prices, with annual BTC equivalents."""
import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import time
from io import BytesIO
from urllib.request import Request, urlopen

from openpyxl import load_workbook

from collect import ROOT, atomic_json
from living import annual_btc_eur, request_json

API = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/nrg_pc_204?currency=EUR&tax=I_TAX&nrg_cons=KWH2500-4999&sinceTimePeriod=2010'
FUEL_URL = 'https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx'
FUEL_SOURCE = 'https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en'
ELECTRICITY_SOURCE = 'https://ec.europa.eu/eurostat/databrowser/view/nrg_pc_204/default/table?lang=en'
INFLATION_API = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_ainr?unit=INX_A_AVG&geo=EU27_2020&coicop18=TOTAL&sinceTimePeriod=2010'
# Current members that were already EU members on 1 January 2010.
COUNTRIES = {
    'AT': 'Austria', 'BE': 'Belgium', 'BG': 'Bulgaria', 'CY': 'Cyprus',
    'CZ': 'Czechia', 'DK': 'Denmark', 'EE': 'Estonia', 'FI': 'Finland',
    'FR': 'France', 'DE': 'Germany', 'EL': 'Greece', 'HU': 'Hungary',
    'IE': 'Ireland', 'IT': 'Italy', 'LV': 'Latvia', 'LT': 'Lithuania',
    'LU': 'Luxembourg', 'MT': 'Malta', 'NL': 'Netherlands', 'PL': 'Poland',
    'PT': 'Portugal', 'RO': 'Romania', 'SK': 'Slovakia', 'SI': 'Slovenia',
    'ES': 'Spain', 'SE': 'Sweden',
}
ITEM_IDS = ('electricity', 'petrol', 'diesel')


def positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def fetch_json(url):
    for attempt in range(3):
        try:
            return request_json(url)
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def observation(dataset, **coordinates):
    """Resolve JSON-stat row-major offsets without depending on dimension order."""
    offset = 0
    for name, size in zip(dataset['id'], dataset['size']):
        index = dataset['dimension'][name]['category']['index']
        if isinstance(index, list):
            index = {code: i for i, code in enumerate(index)}
        position = index.get(coordinates[name])
        if position is None:
            return None
        offset = offset * size + position
    values = dataset['value']
    value = values[offset] if isinstance(values, list) else values.get(str(offset))
    return value if positive(value) else None


def fuel_history(stream, years):
    workbook = load_workbook(stream, read_only=True, data_only=True)
    try:
        rows = list(workbook['Prices with taxes'].values)
    finally:
        workbook.close()
    header, units = rows[0], rows[2]
    columns = {}
    for country in COUNTRIES:
        code = 'GR' if country == 'EL' else country
        for item, product in [('petrol', 'euro95'), ('diesel', 'diesel')]:
            column = header.index(f'{code}_price_with_tax_{product}')
            if str(units[column]).strip() != '1000 l':
                raise ValueError('Unexpected fuel price unit')
            columns[country, item] = column
    result = {key: {year: {} for year in years} for key in columns}
    for row in rows[3:]:
        day = row[0]
        if not isinstance(day, datetime) or str(day.year) not in years:
            continue
        year = str(day.year)
        for key, column in columns.items():
            value = row[column]
            if positive(value):
                observations = result[key][year]
                stamp = day.date().isoformat()
                if stamp in observations:
                    raise ValueError(f'Duplicate fuel observation: {key}/{stamp}')
                observations[stamp] = value / 1000
    for key, history in result.items():
        for year, observations in history.items():
            months = {day[5:7] for day in observations}
            if len(observations) < 48 or len(months) != 12:
                raise ValueError(f'Incomplete fuel year: {key}/{year}')
    return result


def inflation_history(dataset, years):
    indices = {year: observation(dataset, freq='A', unit='INX_A_AVG', coicop18='TOTAL',
                                 geo='EU27_2020', time=year) for year in years}
    if any(value is None for value in indices.values()):
        raise ValueError('Incomplete EU inflation history; keeping previous snapshot')
    return {'geo': 'EU27_2020', 'series': 'TOTAL', 'indices': indices,
            'source': 'Eurostat',
            'sourceUrl': 'https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_ainr/default/table?lang=en'}


def build_bundle(dataset, fuel, annual, last_year):
    years = [str(y) for y in range(2010, last_year + 1)]
    if len(years) < 2 or any(not positive(annual.get(y)) for y in years):
        raise ValueError('Incomplete annual BTC/EUR history; keeping previous snapshot')
    countries = []
    for code, name in COUNTRIES.items():
        rates = {}
        for year in years:
            semesters = [observation(dataset, freq='S', siec='E7000', nrg_cons='KWH2500-4999', unit='KWH',
                                      tax='I_TAX', currency='EUR', geo=code, time=f'{year}-S{half}') for half in (1, 2)]
            if any(value is None for value in semesters):
                raise ValueError(f'Incomplete electricity year: {code}/{year}')
            rates[year] = sum(semesters) / 2
        items = [{
            'id': 'electricity', 'name': 'Electricity', 'quantity': 100, 'unit': '100 kWh',
            'image': 'img/living/electricity.jpg',
            'description': 'Household tariff, including taxes. Annual use: 2,500-4,999 kWh.',
            'priceBasis': 'observed', 'source': 'Eurostat', 'sourceUrl': ELECTRICITY_SOURCE,
            'unitPrices': rates, 'prices': {year: value * 100 for year, value in rates.items()},
            'observationCounts': {year: 2 for year in years},
        }]
        for item_id, title in [('petrol', 'Petrol (95 octane)'), ('diesel', 'Diesel')]:
            history = fuel[code, item_id]
            rates = {}
            for year in years:
                observations = history[year]
                if len(observations) < 48 or len({day[5:7] for day in observations}) != 12 or not all(positive(value) for value in observations.values()):
                    raise ValueError(f'Incomplete fuel year: {code}/{item_id}/{year}')
                rates[year] = sum(observations.values()) / len(observations)
            items.append({
                'id': item_id, 'name': title, 'quantity': 1, 'unit': '1 litre',
                'image': 'img/living/fuel.jpg', 'description': 'Reported pump prices, including duties and taxes.',
                'priceBasis': 'observed', 'source': 'European Commission', 'sourceUrl': FUEL_SOURCE,
                'unitPrices': rates, 'prices': rates.copy(),
                'observationCounts': {year: len(history[year]) for year in years},
            })
        countries.append({'code': code, 'name': name, 'items': items})
    return {
        'schemaVersion': 3, 'priceBasis': 'observed', 'currency': 'EUR', 'baseYear': '2010', 'years': years,
        'countries': countries, 'btcEurAnnual': {y: annual[y] for y in years},
        'method': 'Nominal reported consumer prices including taxes. Electricity: arithmetic mean of both half-years in EUR/kWh, multiplied by 100 kWh. Fuels: arithmetic mean of available weekly EUR/1000-litre prices, divided by 1000. No HICP extrapolation, invented starting costs or additional inflation adjustment.',
        'btcMethod': 'Arithmetic mean of available daily EUR/BTC observations; 2010 begins 17 July. FX is carried forward over non-publication days, BTC is not.',
        'fetchedAt': datetime.now(timezone.utc).isoformat(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--electricity-json', type=Path, help='Previously downloaded Eurostat electricity response')
    parser.add_argument('--fuel-xlsx', type=Path, help='Previously downloaded Commission fuel workbook')
    parser.add_argument('--fx-json', type=Path, help='Previously downloaded Frankfurter response')
    parser.add_argument('--inflation-json', type=Path, help='Previously downloaded EU all-items HICP response')
    args = parser.parse_args()
    last_year = datetime.now(timezone.utc).year - 1
    dataset = json.loads(args.electricity_json.read_text()) if args.electricity_json else fetch_json(API)
    years = [str(y) for y in range(2010, last_year + 1)]
    if args.fuel_xlsx:
        fuel = fuel_history(args.fuel_xlsx, years)
    else:
        request = Request(FUEL_URL, headers={'User-Agent': 'satoshi.si living-cost-collector'})
        with urlopen(request, timeout=120) as response:
            fuel = fuel_history(BytesIO(response.read()), years)
    fx_data = json.loads(args.fx_json.read_text()) if args.fx_json else fetch_json(f'https://api.frankfurter.dev/v1/2009-12-01..{last_year}-12-31?base=USD&symbols=EUR')
    if fx_data.get('base') != 'USD':
        raise ValueError('Unexpected FX base currency')
    reference = json.loads((ROOT / 'historical_data/generated/USD.json').read_text())
    btc = dict(reference['data'])
    # A few absent observations are acceptable; a truncated year is not.
    for year in range(2010, last_year + 1):
        days = sorted(day for day in btc if day.startswith(str(year)))
        if len(days) < (160 if year == 2010 else 350) or days[-1] < f'{year}-12-28':
            raise ValueError(f'BTC history is incomplete for {year}')
    years = [str(y) for y in range(2010, last_year + 1)]
    fx = {day: row['EUR'] for day, row in fx_data['rates'].items()}
    if max(fx) < f'{last_year}-12-24':
        raise ValueError('FX history is incomplete')
    annual = annual_btc_eur(btc, fx, years)
    bundle = build_bundle(dataset, fuel, annual, last_year)
    inflation = json.loads(args.inflation_json.read_text()) if args.inflation_json else fetch_json(INFLATION_API)
    bundle['euInflation'] = inflation_history(inflation, years)
    bundle['btcSource'] = reference['btcSource']
    bundle['fxSource'] = 'Frankfurter / ECB'
    output = ROOT / 'historical_data/generated/living-EU-observed.json'
    if output.exists():
        previous = json.loads(output.read_text())
        if not set(previous['years']).issubset(bundle['years']):
            raise ValueError('History shrank; keeping previous snapshot')
    atomic_json(output, bundle)
    print(f'Observed EU living costs: {len(COUNTRIES)} countries, {len(ITEM_IDS)} items, 2010-{last_year}')


if __name__ == '__main__':
    main()
