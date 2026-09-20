# Satoshi.si

[satoshi.si](https://satoshi.si) is a Bitcoin-focused progressive web app: Satoshi's words, whitepaper translations, hands-on learning, market tools, and a few experiments. Built with plain HTML, CSS, and JavaScript, it runs on static hosting without an application server of its own.

## Explore

[Price Scanner](https://satoshi.si/priceScanner.html) overlays BTC or sats values on price tags in a live camera view. On-device OCR keeps frames private, Sintra provides the BTC price, and fresh converter caches or Frankfurter provide currency rates. No photo capture or uploads. Camera controls include switching, torch and zoom where supported. See [scanner notes](docs/price-scanner.md).

[Cost of Living in Bitcoin](https://satoshi.si/living.html) compares reported consumer prices in 2010 with the latest completed year across the 26 current EU countries that were members in 2010. Electricity, petrol and diesel have consistent quantities and complete annual coverage, using Eurostat and European Commission data including taxes. The page shows one item at a time, with photos, EUR/BTC prices, the item's price change, EU-wide buying power lost to inflation and Bitcoin's purchasing-power increase. A simple EUR100 example explains the separate EU inflation benchmark without altering actual item prices. No invented starting amounts or inflation-index substitutes for retail prices. Snapshots refresh through GitHub Actions and work offline. See [maintenance notes](docs/living-costs.md).

| Page | What it offers |
| --- | --- |
| [Words of Satoshi](https://satoshi.si/quotes.html) | Shuffled quotes, click-to-copy, two-minute rotation, and a subtle desktop control for the next quote. |
| [Bitcoin whitepaper](https://satoshi.si/whitepaper.html) | A collection of translations, with contributions welcome to make Bitcoin knowledge accessible in more languages. |
| [BIP39 checker and playground](https://satoshi.si/isBip39.html) | Check English BIP39 words, construct example phrases, explore entropy and checksums, and compare seeds with an optional passphrase. Click technical terms for simple explanations. |
| [History chart](https://satoshi.si/chart.html) | Explore currencies and other assets priced in sats, with time ranges, linear/logarithmic scales, historical events, snapshots, and CSV/JSON exports. |
| [Moscow Time](https://satoshi.si/MoscowTime.html) | A sats-per-dollar view of Bitcoin's price. |
| [Converter](https://satoshi.si/converter.html) | Bitcoin, satoshi, and fiat conversions. |
| [Memed Bitcoin Mood](https://satoshi.si/memedBitcoinMood.html) | Market moods and memes across daily, weekly, monthly, and yearly timeframes, with fallback data providers. |
| [Game39](https://satoshi.si/game39single.html) | BIP39 word games, with a separate [multiplayer mode](https://satoshi.si/game39.html). |
| [GhostQR](https://satoshi.si/ghostQR.html) | An experimental tool for creating printable, layered QR codes. |
| [Lightning lottery](https://satoshi.si/lottery.html) | An embedded lottery, alongside [statistics](https://satoshi.si/lotteryStats.html), a [ticket verifier](https://satoshi.si/ticketVerifier.html), and [terms](https://satoshi.si/lotteryTOS.html). |
| [Exchange](https://satoshi.si/exchangeShitcoins.html) | A third-party ChangeNOW exchange widget. |
| [Nostr identifiers](https://satoshi.si/nip05.html) | Information about NIP-05 identifiers on the satoshi.si domain. |

The shared interface uses a near-black theme with orange accents, gently animated grain, and retro TV navigation effects. Reduced-motion preferences disable the animations. Responsive layouts, menus, and dialogs support smaller screens; the footer places block height on the left and fee rate on the right.

## Install and Use Offline

Open [satoshi.si](https://satoshi.si) in a supported browser and use its install or **Add to Home Screen** option. Installation availability and wording vary by browser. The manifest provides a standalone app window, icons, and theme colors.

The service worker precaches the home shell, an offline fallback, and the BIP39 playground. Visited pages and eligible same-origin static assets are cached with a network-first strategy.

**Offline support is selective, not a promise that every tool works without a connection.**

- The educational BIP39 playground can work offline once its assets have been cached.
- Cached pages remain available, but their live data and external services may not be.
- API responses, JSON datasets, query-string requests, and third-party resources are not cached by the worker. Quotes and historical chart data therefore still require connectivity under the current cache policy.
- External fonts, icons, embeds, and multiplayer services may be unavailable offline.

Updates activate after existing tabs controlled by the old service worker close. See [PWA and theme maintenance](docs/pwa.md) for caching, deployment, and verification details.

## BIP39 Safety and Privacy

**Use example phrases only. Do not enter a real wallet recovery phrase or use this playground to create a wallet.** Predictable examples are deliberately included for learning.

Phrase construction, checksum validation, and seed derivation run locally using a bundled BIP39 library. The playground does not save or transmit the phrase or passphrase, or put them in a URL. The separate single-word checker may query Datamuse for similar words; multiword input is excluded from those requests.

The optional BIP39 passphrase is **not literally a 13th word**: it is separate text, and changing it produces a different seed. The playground produces a 64-byte seed, not wallet addresses or private keys. GhostQR is also experimental and should not be treated as an audited wallet-backup solution.

See [BIP39 implementation notes](docs/bip39-playground.md) for the library, normalization behavior, tests, and references.

## Data Sources and Dependencies

- **Bitcoinity:** the documented source of historical BTC/USD exchange data. The existing pipeline averages available exchange columns.
- **Frankfurter:** historical fiat conversion rates in the data-generation script, plus exchange rates used by the chart.
- **Sintra:** live Bitcoin prices used by price-related tools.
- **mempool.space:** block and fee information.
- **CoinGecko and CoinPaprika:** Bitcoin Mood market data, with Binance as a daily fallback. Some volatility values are estimates rather than measured historical ranges.
- **Open Exchange Rates:** fiat rates used by the converter.
- **Datamuse:** similar-word suggestions for the single-word checker, not word-frequency reporting.
- **Third-party services:** ChangeNOW and the lottery embed power their respective widgets; multiplayer Game39 uses Firebase. Several pages also load libraries, fonts, or icons from external hosts.

The history chart displays BTC per unit. A Yahoo Finance collector now generates sourced stock, futures, index, and ETF datasets, with a daily GitHub Actions workflow ready to enable. Original CSVs remain as a labelled fallback; fiat history is not refreshed by this workflow. See [history sources, methodology, and setup](docs/history-data.md) for the recovered pipeline, adjustment choices, units, failure handling, and deployment steps.

External services can fail, rate-limit requests, or be blocked by browser privacy tools. Static hosting removes the need for our own backend, not these external dependencies. Third-party services have their own terms and privacy policies.

## Run Locally

No site-wide build step is required. Serve this repository's root over HTTP instead of opening HTML with `file://`:

```sh
git clone https://github.com/StellarStoic/satoshi.git
cd satoshi
python3 -m http.server 8080 --bind 127.0.0.1
```

Open **http://127.0.0.1:8080**. A VSCodium static-server extension can serve the same directory instead; Python is only one local preview option, not a production dependency.

Use HTTPS in production or localhost for service-worker development. Root-relative asset paths and the manifest assume hosting at the domain root; subdirectory hosting requires path changes.

## Development

Keep contributions approachable: plain HTML, CSS, and JavaScript, with page-specific styles and shared theme variables in `theme.css`. Navigation effects live in `siteEffects.css` and `siteEffects.js`. The PWA entry points are `site.webmanifest`, `pwa.js`, and `sw.js`.

Run automated checks with Node.js:

```sh
node --test tests/*.test.mjs
```

Tests cover BIP39 behavior, glossary matching, and Bitcoin Mood fallback handling. They do not replace browser checks for layouts, installation, external integrations, or offline behavior.

The BIP39 library bundle is committed, so visitors and normal static previews do not need npm. To rebuild it:

```sh
npm ci --prefix tools/bip39 --ignore-scripts
npm run build --prefix tools/bip39
```

When changing precached assets, increment the cache version in `sw.js`. Check desktop and mobile layouts, keyboard focus, reduced motion, and offline navigation before releasing.

## Planned Work

- Enable and monitor the new Yahoo Finance history workflow in GitHub; extend automated coverage to fiat history.
- Validate legacy history against the newly sourced datasets before retiring it.
- Correct gaps in the legacy FX collector's date stepping and align its input/output paths with the chart.
- Improve offline coverage where appropriate and reduce duplicated navigation and modal markup.

## Contributing and Contact

Quotes, whitepaper translations, educational improvements, accessibility fixes, and bug reports are welcome. Fork the repository and submit a pull request; include sources for new historical data or educational claims, and test the pages you change.

Reach out through [the website](https://satoshi.si) or [Telegram](https://t.me/stellarstoic). The site's support dialog offers Lightning and on-chain contributions.

## License

This project has been described as MIT-licensed; a top-level license file still needs to be added. Bundled BIP39 dependency notices are in [`vendor/bip39.LICENSE.txt`](vendor/bip39.LICENSE.txt). Third-party content and services may have separate terms.
