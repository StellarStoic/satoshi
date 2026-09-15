import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from datetime import date, timedelta

from collect import ASSETS, atomic_json, convert, reference_history, validate, main, publish_reference


class CollectorTests(unittest.TestCase):
    def test_conversion_and_missing_dates(self):
        rows = convert({'2020-01-01': 200, '2020-01-02': 300}, {'2020-01-01': 10000}, 1)
        self.assertEqual(rows, [['2020-01-01', 0.02]])

    def test_cents(self):
        self.assertEqual(convert({'2020-01-01': 500}, {'2020-01-01': 10000}, 0.01),
                         [['2020-01-01', 0.0005]])
        self.assertEqual(ASSETS['ZCF'][2], 0.01)
        self.assertNotIn('TNX', ASSETS)

    def test_invalid_prices(self):
        self.assertEqual(convert({'a': -1, 'b': float('nan'), 'c': 2}, {'a': 1, 'b': 1, 'c': 0}, 1), [])
        with self.assertRaises(ValueError):
            validate([])

    def test_truncation_guard(self):
        old = {'data': [['2020-01-01', 1], ['2020-01-02', 2]]}
        with self.assertRaises(ValueError):
            validate([['2020-01-02', 2]], old)
        with self.assertRaises(ValueError):
            validate([['2020-01-01', 1], ['2020-01-01', 2]])
        validate(old['data'], old)

    def test_reference_and_atomic_output(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'ref.csv'
            path.write_text('Time,a,b\n2020-01-01 00:00:00 UTC,10,20\n2020-01-02 00:00:00 UTC,,30\n')
            self.assertEqual(reference_history(path), {'2020-01-01': 15, '2020-01-02': 30})
            out = Path(folder) / 'data.json'
            atomic_json(out, {'data': [1]})
            self.assertEqual(json.loads(out.read_text()), {'data': [1]})
            self.assertFalse(out.with_suffix('.tmp').exists())

    def test_failed_refresh_keeps_previous_file(self):
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'GCF.json'
            original = '{"data":[["2010-07-19",1],["' + yesterday + '",2]]}'
            target.write_text(original)
            with patch('sys.argv', ['collect.py', '--assets', 'GCF', '--output', folder]), \
                 patch('collect.reference_history', return_value={'2010-07-19': 1}), \
                 patch('collect.download', return_value={yesterday: 100}), \
                 patch('collect.time.sleep'):
                main()
            self.assertEqual(target.read_text(), original)
            self.assertIn('GCF', json.loads((Path(folder) / 'status.json').read_text())['failed'])

    def test_reference_is_published_in_correct_direction_and_cannot_shrink(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            publish_reference(output, {'2026-01-01': 100000, '2026-01-02': 50000}, '2026-01-01')
            original = (output / 'USD.json').read_text()
            dataset = json.loads(original)
            self.assertEqual(dataset['data'], [['2026-01-01', 0.00001], ['2026-01-02', 0.00002]])
            with self.assertRaises(ValueError):
                publish_reference(output, {'2026-01-02': 50000}, '2026-01-01')
            self.assertEqual((output / 'USD.json').read_text(), original)


if __name__ == '__main__':
    unittest.main()
