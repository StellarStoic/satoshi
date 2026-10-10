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
| [Ark Bitcoin Wallet](https://satoshi.si/wallet.html) | An experimental self-custodial Bitcoin wallet using the Ark protocol and Second's Bark Web SDK. Learn with free test sats on Bitcoin Signet, then switch to a separate mainnet wallet for Ark, Lightning, Lightning Address, and on-chain payments. Each network keeps its own password-encrypted local profile and wallet database. |
| [BIP39 word checker](https://satoshi.si/isBip39.html) | Type one word and explore similar words from any of the ten official BIP39 language lists. Validation and suggestions run locally and work offline. |
| [History chart](https://satoshi.si/chart.html) | Explore currencies and other assets priced in sats, with time ranges, linear/logarithmic scales, historical events, snapshots, and CSV/JSON exports. |
| [Moscow Time](https://satoshi.si/MoscowTime.html) | A sats-per-dollar view of Bitcoin's price. |
| [Converter](https://satoshi.si/converter.html) | Bitcoin, satoshi, and fiat conversions. |
| [Bitcoin and Nostr News](https://satoshi.si/news.html) | Bitcoin and Nostr engineering, release, media, research, and community feeds, with locally stored source and keyword filters plus custom RSS and Nostr profiles. |
| [Memed Bitcoin Mood](https://satoshi.si/memedBitcoinMood.html) | Market moods and memes across daily, weekly, monthly, and yearly timeframes, with fallback data providers. |
| [Game39](https://satoshi.si/game39single.html) | BIP39 word games, with a separate [multiplayer mode](https://satoshi.si/game39.html). |
| [GhostQR](https://satoshi.si/ghostQR.html) | An experimental tool for creating printable, layered QR codes. |
| [Entropy Lab](https://satoshi.si/entropy.html) | Compare secure randomness with coin flips, dice, typed patterns and local sensor capture, then visualize deterministic descendants, avalanche behavior and the near-impossible scale of wallet guessing. |
| [21FM](https://satoshi.si/21fm.html) | Diverse browser-generated music: each block hash chooses a style, meter, groove and musical world, then fresh mempool transaction IDs continuously write new phrases and variations inside it. |
| [Pinstr](https://satoshi.si/stickyNotes.html) | Pick one or more touching geohash cells on an OpenFreeMap grid, then style, hashtag, sign and temporarily pin a public Nostr note. Named identities post through a 10-sat weekly or 411-sat yearly subscription (5/205 sats with a satoshi.si NIP-05); a one-note anonymous key pays 69 sats and remains locally available for at most 24 hours to finish publishing. |
| [Steganography Playground](https://satoshi.si/stego.html) | Hide and recover optionally encrypted messages in text or files, lock a text or file secret to a Nostr recipient, inspect Nostr events for concealed content, and combine reversible text transformations locally in the browser. Recipient locks support NIP-07 browser signers, Amber and compatible Android signers through NIP-55, NIP-46 bunker signers, and a discouraged local private-key fallback. Files use local symmetric encryption while NIP-44 protects the small file key, keeping signer requests practical. |
| [Lightning lottery](https://satoshi.si/lottery.html) | An embedded lottery, alongside [statistics](https://satoshi.si/lotteryStats.html), a [ticket verifier](https://satoshi.si/ticketVerifier.html), and [terms](https://satoshi.si/lotteryTOS.html). |
| [Exchange](https://satoshi.si/exchange.html) | A third-party ChangeNOW widget for crypto swaps and fiat purchases, defaulting to XMR/BTC and EUR/BTC. |
| [Nostr identifiers](https://satoshi.si/nip05.html) | Information about NIP-05 identifiers on the satoshi.si domain. |

The shared interface uses a near-black theme with orange accents, gently animated grain, and retro TV navigation effects. Reduced-motion preferences disable the animations. Responsive layouts, menus, and dialogs support smaller screens; the footer places block height on the left and fee rate on the right.

### How 21FM Works

21FM is not a playlist. Engine v5 mixes the complete Bitcoin block hash, engine version and purpose into a deterministic 128-bit music state. It chooses a key, one of ten musical modes, one of 32 groove families, one of five meters, a tempo from 48 to 176 BPM and one of twelve production scenes. It then writes a 16-to-64-bar form with an intro, contrasting sections, breaks, returns and an outro instead of repeating one four-bar score. Styles range from ambient, hip-hop and jazz to blues, acid, house, techno, jungle, funk, dub, samba, reggae and odd-meter experiments. The block height generates a unique reversible BIP39 title but is excluded from the music seed, so height and hash replay produce the same score. Each scene draws role-appropriate voices from 20 sampled instruments and 28 CC0 acoustic drum and percussion samples; electronic styles retain synthesized palettes. Scene-selected effects include feedback or ping-pong delay, phaser, auto-filter or auto-pan, plus a slow stereo texture LFO. Scene selection is independent of listening order. Live mempool transactions appear as bubbles in four-second batches and gently vary phrases and sound. The visualizer adds a small FFT spectrum on capable devices. When a new block is found, the completed block fades fully out, its instruments are released, and the new session fades in. Everything is arranged locally in the browser from public Bitcoin data.

The replay field below the visualizer accepts either a block height or complete hash, then loads the immutable block summary, all transaction IDs and a small transaction-detail sample from mempool.space. Heights resolve to their canonical block hash before playback. The hash chooses the musical world; recorded block weight, transaction count, transaction structures, fees and the complete TXID set reproduce its internal flow. Colored characters around the record show the hash sections that directly choose harmony, groove, ensemble and texture. Replays are cached for the browser session and can be shared with `21fm.html?block=<hash>&engine=v5`. Versioned `v1` and `v4` links keep their legacy four-bar and 32-bit-generator behavior.

V5 greatly reduces generator-state collisions but does not claim that music can never resemble another block. Assuming even state distribution, one million blocks have about a `1.5e-27` chance of any shared 128-bit state; the next block matching one of a million earlier states is about `2.9e-33`. V4 used a 32-bit state, where one million inputs imply about 116 expected colliding pairs. Audible similarity is more common than a state collision because genres deliberately share scales, grooves and instruments, while live mempool timing can make performances from the same written block composition diverge.

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
- **Bark SDK:** the pinned `@secondts/bark` 0.25.0 WebAssembly release powers the experimental browser wallet, using Second's public Ark and Esplora services on Bitcoin Signet or mainnet. Network wallets are isolated in separate IndexedDB databases and password-encrypted profiles. Recovery profiles use PBKDF2-SHA-256 and AES-256-GCM; passwords are never stored. The page does not operate a custodian or wallet backend.
- **nostr-tools:** bundled NIP-19, NIP-44, and NIP-46 support for recipient-locked steganography, with a NIP-55 web handoff for Amber and compatible Android signers. Keys and plaintext are processed in the browser or signer.
- **Tone.js:** the bundled MIT-licensed Web Audio framework used for 21FM scheduling, sampling, synthesis and effects.
- **tonejs-instruments:** the complete MP3 note set for all 20 upstream instruments, used by 21FM under CC BY 3.0. Only the current block's selected instruments are loaded; the original contributors and sample authors are credited in [`audio/lofi/README.md`](audio/lofi/README.md).
- **Versilian Community Sample Library:** 28 CC0 real-world drum and percussion one-shots used by 21FM's organic sessions, documented in [`audio/lofi/real/README.md`](audio/lofi/real/README.md).
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

This project has been described as MIT-licensed; a top-level license file still needs to be added. Bundled dependency notices are in [`vendor/bip39.LICENSE.txt`](vendor/bip39.LICENSE.txt), [`vendor/tone/LICENSE.md`](vendor/tone/LICENSE.md), and [`stego/vendor/nostr-tools.LICENSE`](stego/vendor/nostr-tools.LICENSE). Third-party content and services may have separate terms.
