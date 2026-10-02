# Satoshi.si

[satoshi.si](https://satoshi.si) is a Bitcoin-focused progressive web app: Satoshi's words, whitepaper translations, hands-on learning, market tools, and a few experiments. Built with plain HTML, CSS, and JavaScript, it runs on static hosting without an application server of its own.

## Explore

[Price Scanner](https://satoshi.si/priceScanner.html) overlays BTC or sats values on price tags in a full-screen camera view. A centered targeting frame and self-hosted PaddleOCR models handle varied printed styles and improve handwritten-number recognition entirely on-device. Sintra provides the BTC price, and fresh converter caches or Frankfurter provide currency rates. Optional photo downloads include Bitcoin labels and a satoshi.si logo watermark; images are never uploaded. Currency, display unit and pinch zoom are saved locally. Camera selection automatically prefers the rear camera on phones or the available webcam. See [scanner notes](docs/price-scanner.md).

[Cost of Living in Bitcoin](https://satoshi.si/living.html) compares reported consumer prices in 2010 with the latest completed year across the 26 current EU countries that were members in 2010. Electricity, petrol and diesel have consistent quantities and complete annual coverage, using Eurostat and European Commission data including taxes. The page shows one item at a time, with photos, EUR/BTC prices, the item's price change, EU-wide buying power lost to inflation and Bitcoin's purchasing-power increase. A simple EUR100 example explains the separate EU inflation benchmark without altering actual item prices. No invented starting amounts or inflation-index substitutes for retail prices. Snapshots refresh through GitHub Actions and work offline. See [maintenance notes](docs/living-costs.md).

| Page | What it offers |
| --- | --- |
| [Words of Satoshi](https://satoshi.si/quotes.html) | Shuffled quotes, click-to-copy, two-minute rotation, and a subtle desktop control for the next quote. |
| [Bitcoin whitepaper](https://satoshi.si/whitepaper.html) | A collection of translations, with contributions welcome to make Bitcoin knowledge accessible in more languages. |
| [Self-custody](https://satoshi.si/selfCustody.html) | A newcomer-friendly guide to mobile, desktop and Lightning wallets, signing devices and full nodes, from BlueWallet and Sparrow through SeedSigner, Cupcake, the BitBox02 Bitcoin-only edition and Bitcoin Core. |
| [BIP39 word checker](https://satoshi.si/isBip39.html) | Type one word and explore similar words from any of the ten official BIP39 language lists. Validation and suggestions run locally and work offline. |
| [History chart](https://satoshi.si/chart.html) | Explore currencies and other assets priced in sats, with time ranges, linear/logarithmic scales, historical events, snapshots, and CSV/JSON exports. |
| [Moscow Time](https://satoshi.si/MoscowTime.html) | A sats-per-dollar view of Bitcoin's price. |
| [Converter](https://satoshi.si/converter.html) | Bitcoin, satoshi, and fiat conversions. |
| [Bitcoin and Nostr News](https://satoshi.si/news.html) | Bitcoin and Nostr engineering, release, media, research, and community feeds, with locally stored source and keyword filters plus custom RSS and Nostr profiles. |
| [Memed Bitcoin Mood](https://satoshi.si/memedBitcoinMood.html) | Market moods and memes across daily, weekly, monthly, and yearly timeframes, with fallback data providers. |
| [Game39](https://satoshi.si/game39single.html) | BIP39 word games, with a separate [multiplayer mode](https://satoshi.si/game39.html). |
| [GhostQR](https://satoshi.si/ghostQR.html) | An experimental tool for creating printable, layered QR codes. |
| [Entropy Lab](https://satoshi.si/entropy.html) | Compare secure randomness with coin flips, dice, typed patterns and local sensor capture, then visualize deterministic descendants, avalanche behavior and the near-impossible scale of wallet guessing. |
| [Block Lo-Fi](https://satoshi.si/lofi.html) | Endless browser-generated Lo-Fi music: each block hash creates a musical world, then fresh mempool transaction IDs continuously write new phrases, voicings and instrument changes inside it. |
| [Lightning lottery](https://satoshi.si/lottery.html) | An embedded lottery, alongside [statistics](https://satoshi.si/lotteryStats.html), a [ticket verifier](https://satoshi.si/ticketVerifier.html), and [terms](https://satoshi.si/lotteryTOS.html). |
| [Exchange](https://satoshi.si/exchange.html) | A third-party ChangeNOW widget for crypto swaps and fiat purchases, defaulting to XMR/BTC and EUR/BTC. |
| [Nostr identifiers](https://satoshi.si/nip05.html) | Information about NIP-05 identifiers on the satoshi.si domain. |

The shared interface uses a near-black theme with orange accents, gently animated grain, and retro TV navigation effects. Reduced-motion preferences disable the animations. Responsive layouts, menus, and dialogs support smaller screens; the footer places block height on the left and fee rate on the right.

### How Block Lo-Fi Works

Block Lo-Fi is not a playlist. A Bitcoin block hash acts like a repeatable musical seed: it chooses the key, tempo, groove and one of twelve coherent production scenes. Each scene combines a compatible set of sampled piano, guitar, organ, harmonium, bass, cello, flute, saxophone, harp or mallet sounds with lightweight synthesized pads and drums. Consecutive blocks cannot repeat the same scene. Live transactions from the mempool appear as bubbles in four-second batches and gently influence the rhythm and sound. The visualizer's gravity catches every bubble on its ring. Some transactions fly near the center and make a barely audible whistle; higher-fee transactions arrive more quickly and overshoot slightly farther before curving back into orbit. The block height sits at the visualizer's center, while its complete hash runs clockwise around the outer ring. When a new block is found, the completed block's music fades fully out, its instruments are released, and the new block's session fades in. Everything is arranged locally in the browser from public Bitcoin data.

The replay field below the visualizer loads the immutable block summary, all transaction IDs and a small transaction-detail sample from mempool.space. The hash chooses the musical world; recorded block weight, transaction count, transaction structures, fees and the complete TXID set reproduce its internal flow. Colored characters around the record show the hash sections that directly choose harmony, groove, ensemble and texture. Replays are cached for the browser session and can be shared with `lofi.html?block=<hash>&engine=v2`. Versioned `v1` links retain the earlier hash-only arrangement.

## Install and Use Offline

Open [satoshi.si](https://satoshi.si) in a supported browser and use its install or **Add to Home Screen** option. Installation availability and wording vary by browser. The manifest provides a standalone app window, icons, and theme colors.

The service worker precaches the home shell, an offline fallback, and the BIP39 word checker. Visited pages and eligible same-origin static assets are cached with a network-first strategy.

**Offline support is selective, not a promise that every tool works without a connection.**

- The BIP39 word checker can work offline once its assets have been cached.
- Cached pages remain available, but their live data and external services may not be.
- API responses, JSON datasets, query-string requests, and third-party resources are not cached by the worker. Quotes and historical chart data therefore still require connectivity under the current cache policy.
- External fonts, icons, embeds, and multiplayer services may be unavailable offline.

Updates activate after existing tabs controlled by the old service worker close. See [PWA and theme maintenance](docs/pwa.md) for caching, deployment, and verification details.

## BIP39 Safety and Privacy

The public checker accepts one word and compares it locally with the selected official BIP39 list. It does not send the word to an API. The first four letters are emphasized because those prefixes are unique within each BIP39 wordlist.

The previous phrase, entropy, checksum, and passphrase playground is retained as source in [`archive/bip39-playground`](archive/bip39-playground), but is not published as a second live page. **Never enter a real wallet recovery phrase into an educational tool.**

See [BIP39 implementation notes](docs/bip39-playground.md) for details about the archived playground.

## Data Sources and Dependencies

- **Bitcoinity:** the documented source of historical BTC/USD exchange data. The existing pipeline averages available exchange columns.
- **Frankfurter:** historical fiat conversion rates in the data-generation script, plus exchange rates used by the chart.
- **Sintra:** live Bitcoin prices used by price-related tools.
- **mempool.space:** block and fee information.
- **Tone.js:** the bundled MIT-licensed Web Audio framework used for Block Lo-Fi scheduling, sampling, synthesis and effects.
- **tonejs-instruments:** sparse piano, organ, harmonium, acoustic and nylon guitar, bass, cello, flute, saxophone, harp and xylophone samples used by Block Lo-Fi under CC BY 3.0. Only the active scene's instruments are loaded; the original contributors and sample authors are credited in [`audio/lofi/README.md`](audio/lofi/README.md).
- **Bitcoin and Nostr news:** Bitcoin Optech, Bitcoin Core releases, project blogs, independent publications, Nostr newsletters, community feeds, and Reddit sources. A daily GitHub Action creates the static feed snapshot.
- **CoinGecko and CoinPaprika:** Bitcoin Mood market data, with Binance as a daily fallback. Some volatility values are estimates rather than measured historical ranges.
- **Open Exchange Rates:** fiat rates used by the converter.
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

Tests cover BIP39 behavior, news filtering and feed parsing, scanner recognition, historical data, and Bitcoin Mood fallback handling. They do not replace browser checks for layouts, installation, external integrations, or offline behavior.

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

This project has been described as MIT-licensed; a top-level license file still needs to be added. Bundled dependency notices are in [`vendor/bip39.LICENSE.txt`](vendor/bip39.LICENSE.txt) and [`vendor/tone/LICENSE.md`](vendor/tone/LICENSE.md). Third-party content and services may have separate terms.
