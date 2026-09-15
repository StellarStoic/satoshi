# Historical Market Data

## Sources and Method

The recovered `get_from_yfinance.py` and `convert_yfinance_csvs.py` established the original process: Yahoo Finance OHLC data, a daily `(High + Low) / 2` asset midpoint, and a same-calendar-date join to a BTC/USD exchange average. The old files store **asset units per BTC**, not BTC per unit. The chart previously divided 100 million by that value to display sats.

The replacement collector is `tools/history/collect.py`. Its symbol, unit, quote-to-USD multiplier, and instrument-type registry is `tools/history/assets.json`.

- Asset data: [Yahoo Finance](https://finance.yahoo.com/), accessed with pinned [yfinance](https://github.com/ranaroussi/yfinance).
- BTC history: the existing `historical_data/currencies/satoshi_hist_data_USD.csv`, documented as [Bitcoinity](https://data.bitcoinity.org/markets/price/all/USD) exchange data. Available numeric exchange columns are equally weighted, including `others`, matching the original converter.
- BTC extension: Yahoo `BTC-USD` daily high/low midpoints, used **only after** the last date in the legacy BTC reference. Each generated dataset records this source boundary. This is a methodological break, not a claim that the two benchmarks are identical.
- Asset midpoint: `(High + Low) / 2`, with `auto_adjust=False`, `back_adjust=False`, and `repair=False` explicitly set. Yahoo's underlying historical conventions still apply; this is not a total-return series. The original unpinned script did not establish its adjustment setting, so new results are kept separate.
- US-cent quotes (`USX`) are divided by 100 before conversion. Unexpected quote currencies are rejected rather than silently assumed to be USD.
- Dates use the asset's exchange-local session date and BTC's reference date. These are daily comparisons, not synchronized intraday valuations. Only dates with both observations are retained; no weekend forward-fill or invented pre-listing prices.
- Today's UTC date is excluded. Non-finite, zero, and negative midpoints are omitted. Consequently negative commodity observations are not represented; the logarithmic chart cannot show them.

```text
BTC per unit = asset midpoint in USD / BTC reference in USD
sats per unit = BTC per unit * 100,000,000
```

## Instrument Meaning

Commodity symbols ending in `=F` are Yahoo futures series, not spot prices or the price of an entire contract. Their units are explicit in the registry; changing contracts and roll effects can affect history. ETFs, including bond ETFs, are priced per share, not per ounce or per bond face value.

Index series are index-level comparisons divided by BTC/USD, not executable prices for a purchasable index unit. `^TNX` is a yield percentage and is excluded: dividing a yield by BTC/USD does not produce a meaningful asset price.

## Generated Data and Failure Handling

`historical_data/generated/ASSET.json` stores dated BTC/unit values plus the ticker, sources, units, method, observation range, and successful refresh timestamp. The collector does not alter original CSVs. A full-history refresh allows provider revisions to appear without joining incompatible adjusted series incrementally.

Each asset is validated and written through an atomic replacement. An empty, stale, or truncated response leaves its previous generated file intact. Individual failures appear in `status.json` and the workflow summary; a failed BTC reference or a run with no successful asset fails the job. Partial success can publish alongside older files, whose own timestamps remain unchanged.

The chart prefers generated non-fiat history and falls back to the legacy CSV when unavailable. It labels legacy data as unverified and shows sources and refresh dates for generated history. Axes and tooltips display BTC per unit; internal chart calculations retain sats for compatibility. JSON exports include both denominations.

Fiat CSVs remain on the existing pipeline and are **not refreshed by this workflow**. The generated history does not silently rewrite their source or methodology. All historical CSVs remain available for comparison.

## Run Locally

Use Python 3.11 or newer with virtual-environment support:

```sh
python3.11 -m venv /tmp/satoshi-history-venv
/tmp/satoshi-history-venv/bin/pip install -r tools/history/requirements.txt
/tmp/satoshi-history-venv/bin/python -m unittest discover -s tools/history -p 'test_*.py'
/tmp/satoshi-history-venv/bin/python tools/history/collect.py
```

For a small download check without touching site data:

```sh
/tmp/satoshi-history-venv/bin/python tools/history/collect.py --assets AAPL GCF ZCF --output /tmp/satoshi-history-check
```

No Python runtime or API credentials are needed in visitors' browsers. The collector uses Yahoo's public endpoints; availability and throttling are outside our control. Data-use permission is the site owner's responsibility and was confirmed by the owner for this integration.

## Enable GitHub Automation

1. Commit and push the collector, generated files, and `.github/workflows/history.yml` to the default branch.
2. Enable Actions and allow the workflow to write repository contents. Branch protection must permit its bot commits; otherwise use a dedicated publication branch/workflow policy.
3. Under **Settings > Pages**, choose **GitHub Actions** as the publishing source. Preserve the custom domain and HTTPS settings.
4. Under **Actions > Refresh history and publish Pages**, choose **Run workflow** and inspect the summary and deployment.

The workflow runs daily at **06:23 UTC**, with a manual trigger as well. It commits only generated datasets, then explicitly deploys the static site. A bot commit alone does not trigger a branch-based Pages build. Normal pushes to `main` also deploy the site using the existing datasets, without downloading prices again; generated-data-only pushes are excluded.

GitHub schedules can be delayed and can be disabled after 60 days of repository inactivity. Failed or stale assets remain visibly dated; this is daily historical data, not a real-time feed. The workflow is not active until pushed and configured in GitHub.

References: [scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
