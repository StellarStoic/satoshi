# Observed EU living costs

`living.html` compares 2010 with the latest complete calendar year, using reported consumer prices rather than inflation-index examples. The snapshot currently covers every year from 2010 through 2025. All 26 current EU members that were members on 1 January 2010 have the same three items. Croatia and the UK are excluded.

## Actual price sources

| Item | Displayed quantity | Source and calculation |
| --- | --- | --- |
| Electricity | 100 kWh | Eurostat `nrg_pc_204`, household consumption band 2,500-4,999 kWh/year, EUR/kWh, all taxes included. Arithmetic mean of the two half-year prices, multiplied by 100. |
| Petrol, Euro-super 95 | 1 litre | European Commission Weekly Oil Bulletin, prices with taxes. Arithmetic mean of the available weekly EUR/1,000-litre pump prices divided by 1,000. |
| Automotive diesel | 1 litre | Same Commission workbook and calculation, diesel column. |

Sources: [Eurostat electricity](https://ec.europa.eu/eurostat/databrowser/view/nrg_pc_204/default/table?lang=en) and [Commission Weekly Oil Bulletin](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en).

These are averages of reported national prices, not quotes for a particular provider or filling station. Electricity's 100 kWh is a fixed comparison quantity, not an average household bill or a low-consumption tariff. Both half-years are required. Fuel requires at least 48 positive weekly observations covering all 12 months of each year. Missing weekly reports are excluded, never filled; observation counts are published. These calculated annual means are not official consumption-weighted annual averages. National fuel-reporting methods may vary, as documented on the source page.

Prices are nominal EUR amounts, including taxes. They already reflect the price changes that occurred; no additional inflation multiplier or general-inflation deflator is applied. Source EUR conversions are retained for non-euro countries. No made-up 2010 baselines, quality-adjusted HICP extrapolations, farm-gate prices or wholesale commodity prices are presented as actual retail costs.

Groceries, rent, cars, computers, internet and mobile services are removed from the comparison. We have not verified consistent observed consumer-price series for those items across all 26 countries over the required years. The selection is deliberately smaller rather than filling those gaps with indices.

## Bitcoin comparison

The existing daily USD Bitcoin reference combines the Bitcoinity archive and subsequent Yahoo Finance BTC-USD history. Frankfurter supplies ECB USD/EUR rates. Available daily EUR/BTC prices are averaged arithmetically per year, then each annual item price is divided by that average. FX rates carry over non-publication days; missing BTC prices do not. The 2010 BTC history starts on 17 July. Minimum daily coverage and year-end checks reject truncated reference years.

Three comparisons are displayed:

- **Category inflation:** the selected item's observed EUR price change, not a category HICP estimate.
- **Inflation (EU):** buying power lost, `(1 - EU index(2010) / EU index(latest)) * 100`. This is not the percentage rise in prices: a 50% price rise means a 33.3% loss of buying power. The EUR100 example uses `100 * latest index / 2010 index`.
- **BTC buying-power increase:** `(old BTC cost / new BTC cost - 1) * 100`. Growth can exceed 100%. The old BTC cost-reduction percentage and multiplier are no longer displayed.

The EU benchmark uses Eurostat `prc_hicp_ainr`, annual average index, `coicop18=TOTAL`, `geo=EU27_2020`. It represents overall EU consumer prices, not the selected country's inflation or an exchange-rate measure. Its EU-27 scope is distinct from the 26 eligible countries in the item selector. It stays the same when country/item changes and never alters actual item prices. All comparison years must be present before publication. The current 2010-2025 indices imply a 29.97% loss of buying power and EUR142.80 required for a EUR100 starting basket.

For example, a fall from 50 BTC to 10 BTC is an 80% cost reduction, but one BTC buys five times as much: a 400% purchasing-power increase. This is purchasing power for the selected item and quantity, not a separate investment-return measure.

## Refresh and offline use

GitHub Actions runs `tools/history/living_eu.py` after the market-history refresh. The collector downloads Eurostat electricity data, the Commission fuel workbook and Frankfurter FX data. `openpyxl` parses the Excel workbook using named columns, validates units, and maps Commission `GR` to Eurostat `EL`.

Only completed calendar years are requested. All countries, all three items and all annual BTC references must pass validation before an atomic write to `historical_data/generated/living-EU-observed.json` (schema 3). Failures retain the last complete observed-price snapshot and produce a workflow warning. A new year is published only when complete data has arrived for every required series.

```sh
pip install -r tools/history/requirements.txt
python tools/history/living_eu.py
python -m unittest discover -s tools/history -p 'test_*.py'
node --test tests/living.test.mjs
```

`--electricity-json`, `--fuel-xlsx`, `--fx-json` and `--inflation-json` support replaying downloaded source files. The page, observed snapshot (including EU inflation) and two category photos are precached for offline use. Legacy index-based and regional snapshots are no longer loaded by the page or refreshed by Actions. The new filename and schema prevent an old inflation example from being accepted as an observed price.
