from datetime import date, timedelta
import unittest

from living import annual_btc_eur, decode_prices, ITEMS


class LivingTests(unittest.TestCase):
    def test_empty_years_have_no_reference(self):
        self.assertEqual(annual_btc_eur({}, {}, ['2009', '2010', '2011']), {'2009': None, '2010': None, '2011': None})

    def test_all_days_and_fx_forward_fill(self):
        start = date(2024, 1, 1)
        btc = {(start + timedelta(days=i)).isoformat(): 1 / 10000 for i in range(366)}
        self.assertEqual(annual_btc_eur(btc, {'2023-12-29': 0.9}, ['2024']), {'2024': 9000})
        del btc['2024-03-01']
        self.assertEqual(annual_btc_eur(btc, {'2023-12-29': 0.9}, ['2024']), {'2024': 9000})

    def test_partial_year_averages_prices_not_reciprocals(self):
        self.assertEqual(annual_btc_eur({'2010-07-17': 1 / 10, '2010-07-18': 1 / 30},
                                      {'2010-07-16': 0.5}, ['2010']), {'2010': 10})

    def test_json_stat_dimension_order(self):
        codes = list(ITEMS)
        dimensions = {'LETO': {'category': {'index': {'2018': 0, '2019': 1}}},
                      'IZDELKI IN STORITVE': {'category': {'index': {code: i for i, code in enumerate(codes)}}}}
        result = decode_prices({'id': ['LETO', 'IZDELKI IN STORITVE'], 'dimension': dimensions,
                                'value': list(range(1, 13))})
        self.assertEqual(result[codes[0]], {'2018': 1, '2019': 7})


if __name__ == '__main__':
    unittest.main()
