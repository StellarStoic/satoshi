from datetime import date, timedelta
import unittest
from unittest.mock import patch

from living_regions import annual_prices, annual_reference, preserve_history, ons_prices, eu_country


class RegionalLivingTests(unittest.TestCase):
    def test_eu_reference_basket_and_missing_index(self):
        from datetime import datetime, timezone
        years = [str(year) for year in range(2010, datetime.now(timezone.utc).year)]
        dataset = {'id': ['geo', 'time'], 'size': [1, len(years)],
                   'dimension': {'time': {'category': {'index': {year: i for i, year in enumerate(years)}}}},
                   'value': {str(i): 80 + i for i in range(len(years))}}
        with patch('living_regions.get_json', return_value=dataset):
            country = eu_country()
            self.assertEqual(country['region'], 'EU')
            self.assertEqual(country['items'][0]['prices']['2010'], 100)
            self.assertEqual(country['items'][0]['prices']['2011'], 101.25)
            del dataset['value']['3']
            with self.assertRaises(ValueError):
                eu_country()

    def test_ons_converts_pence_to_pounds(self):
        import calendar
        data = {'description': {'unit': 'Pence', 'title': 'RPI: Ave price - Milk'},
                'months': [{'year': '2010', 'month': calendar.month_name[m], 'value': '44'} for m in range(1, 13)]}
        self.assertAlmostEqual(ons_prices(data)['2010'], 0.44)
        data['description']['unit'] = 'Index'
        with self.assertRaises(ValueError):
            ons_prices(data)

    def test_complete_months_only(self):
        points = [{'date': f'2010-{month:02}-01', 'price_value': month} for month in range(1, 13)]
        self.assertEqual(annual_prices(points), {'2010': 6.5})
        self.assertEqual(annual_prices(points[:-1]), {})
        self.assertEqual(annual_prices(points + [points[0]]), {'2010': 6.5})
        with self.assertRaises(ValueError):
            annual_prices(points + [{'date': '2010-01-01', 'price_value': 20}])
        points[-1]['price_value'] = float('nan')
        self.assertEqual(annual_prices(points), {})

    def test_reference_does_not_interpolate_gaps(self):
        start = date(2012, 1, 1)
        daily = {(start + timedelta(days=i)).isoformat(): 10 for i in range(366)}
        self.assertEqual(annual_reference(daily, ['2009', '2012']), {'2009': None, '2012': 10})
        del daily['2012-02-29']
        self.assertEqual(annual_reference(daily, ['2012']), {'2012': 10})
        self.assertEqual(annual_reference({'2010-07-17': 10, '2010-07-18': 30}, ['2010']), {'2010': 20})

    def test_shrinking_history_rejected(self):
        old = {'items': [{'id': 'milk', 'prices': {'2010': 1, '2011': 2}}]}
        preserve_history(old, old)
        with self.assertRaises(ValueError):
            preserve_history(old, {'items': [{'id': 'milk', 'prices': {'2010': 2}}]})


if __name__ == '__main__':
    unittest.main()
