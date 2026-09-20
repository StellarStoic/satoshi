from datetime import datetime
from io import BytesIO
import json
import unittest
from unittest.mock import patch

from openpyxl import Workbook
from collect import ROOT
from living_eu import COUNTRIES, ITEM_IDS, build_bundle, fuel_history, observation, inflation_history


class ObservedLivingTests(unittest.TestCase):
    def electricity(self):
        axes = {'time': ['2010-S1', '2010-S2', '2011-S1', '2011-S2'], 'geo': ['EL'],
                'unit': ['KWH'], 'siec': ['E7000'], 'nrg_cons': ['KWH2500-4999'],
                'tax': ['I_TAX'], 'currency': ['EUR'], 'freq': ['S']}
        return {'id': list(axes), 'size': [len(values) for values in axes.values()],
                'dimension': {name: {'category': {'index': dict(zip(values, range(len(values))))}} for name, values in axes.items()},
                'value': {'0': 0.1, '1': 0.2, '2': 0.3, '3': 0.4}}

    def workbook(self, missing_month=False, duplicate=False, wrong_unit=False):
        book = Workbook()
        sheet = book.active
        sheet.title = 'Prices with taxes'
        sheet.append(['Consumer prices', 'GR_price_with_tax_euro95', 'GR_price_with_tax_diesel'])
        sheet.append(['', 'Petrol', 'Diesel'])
        sheet.append(['Date', 'l' if wrong_unit else '1000 l', '1000 l'])
        for year in (2010, 2011):
            for month in range(1, 12 if missing_month else 13):
                for day in (1, 8, 15, 22):
                    sheet.append([datetime(year, month, day), 1500, 1200])
        if duplicate:
            sheet.append([datetime(2010, 1, 1), 1500, 1200])
        stream = BytesIO()
        book.save(stream)
        stream.seek(0)
        return stream

    @patch('living_eu.COUNTRIES', {'EL': 'Greece'})
    def test_real_units_averages_and_greek_country_mapping(self):
        fuel = fuel_history(self.workbook(), ['2010', '2011'])
        result = build_bundle(self.electricity(), fuel, {'2010': 1, '2011': 5}, 2011)
        electricity, petrol, diesel = result['countries'][0]['items']
        self.assertAlmostEqual(electricity['prices']['2010'], 15)
        self.assertAlmostEqual(electricity['prices']['2011'], 35)
        self.assertEqual(petrol['prices']['2010'], 1.5)
        self.assertAlmostEqual(diesel['prices']['2011'], 1.2)
        self.assertEqual(result['schemaVersion'], 3)
        self.assertEqual(result['priceBasis'], 'observed')

    @patch('living_eu.COUNTRIES', {'EL': 'Greece'})
    def test_missing_month_duplicate_or_wrong_unit_rejects_workbook(self):
        for kwargs in [{'missing_month': True}, {'duplicate': True}, {'wrong_unit': True}]:
            with self.assertRaises(ValueError):
                fuel_history(self.workbook(**kwargs), ['2010', '2011'])

    @patch('living_eu.COUNTRIES', {'EL': 'Greece'})
    def test_missing_electricity_semester_or_btc_prevents_partial_publish(self):
        fuel = fuel_history(self.workbook(), ['2010', '2011'])
        electricity = self.electricity()
        del electricity['value']['1']
        with self.assertRaises(ValueError):
            build_bundle(electricity, fuel, {'2010': 1, '2011': 5}, 2011)
        with self.assertRaises(ValueError):
            build_bundle(self.electricity(), fuel, {'2010': None, '2011': 5}, 2011)

    def test_json_stat_dense_values_and_reordered_dimensions(self):
        data = self.electricity()
        data['value'] = [0.1, 0.2, 0.3, 0.4]
        coordinates = {name: next(iter(data['dimension'][name]['category']['index'])) for name in data['id']}
        self.assertEqual(observation(data, **coordinates), 0.1)
        self.assertIsNone(observation(data, **{**coordinates, 'geo': 'HR'}))

    def test_published_coverage(self):
        data = json.loads((ROOT / 'historical_data/generated/living-EU-observed.json').read_text())
        self.assertEqual(set(COUNTRIES), {country['code'] for country in data['countries']})
        self.assertEqual(len(COUNTRIES), 26)
        self.assertNotIn('HR', COUNTRIES)
        self.assertNotIn('GB', COUNTRIES)
        self.assertEqual(set(data['euInflation']['indices']), set(data['years']))
        for country in data['countries']:
            self.assertEqual(tuple(item['id'] for item in country['items']), ITEM_IDS)
            for item in country['items']:
                self.assertEqual(set(item['prices']), set(data['years']))
                self.assertNotIn('baseline', item)
                for year in data['years']:
                    self.assertGreater(item['prices'][year], 0)
                    self.assertAlmostEqual(item['prices'][year], item['quantity'] * item['unitPrices'][year])

    def test_inflation_requires_all_years_and_correct_aggregate(self):
        axes = {'geo': ['EU27_2020'], 'coicop18': ['TOTAL'], 'freq': ['A'],
                'unit': ['INX_A_AVG'], 'time': ['2010', '2011']}
        dataset = {'id': list(axes), 'size': [len(values) for values in axes.values()],
                   'dimension': {name: {'category': {'index': values}} for name, values in axes.items()},
                   'value': {'0': 70, '1': 100}}
        self.assertEqual(inflation_history(dataset, ['2010', '2011'])['indices'], {'2010': 70, '2011': 100})
        with self.assertRaises(ValueError):
            inflation_history(dataset, ['2010', '2011', '2012'])
        dataset['dimension']['geo']['category']['index'] = ['EA20']
        with self.assertRaises(ValueError):
            inflation_history(dataset, ['2010', '2011'])


if __name__ == '__main__':
    unittest.main()
