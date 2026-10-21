const SITE = 'https://satoshi.si';
const IMAGE = `${SITE}/android-chrome-512x512.png`;
const SITE_NAME = 'Satoshi.si';
const pages = {
  '/': ['Satoshi.si | Bitcoin Tools, Education and News', 'Explore practical Bitcoin tools, wallet education, BIP39 resources, price conversion, historical charts, Nostr services and Bitcoin news.'],
  '/index.html': ['Satoshi.si | Bitcoin Tools, Education and News', 'Explore practical Bitcoin tools, wallet education, BIP39 resources, price conversion, historical charts, Nostr services and Bitcoin news.'],
  '/opreturn.html': ['OP_RETURN write: put a message on Bitcoin | Satoshi.si', 'Write a short public message into an OP_RETURN output. After confirmation, its transaction becomes part of Bitcoin history.'],
  '/opreturnBoard.html': ['OP_RETURN read: messages written into Bitcoin | Satoshi.si', 'A filtered stream of readable OP_RETURN messages found on the Bitcoin blockchain, newest first.'],
  '/whitepaper.html': ['Bitcoin Whitepaper Translations | Satoshi.si', 'Read the original Bitcoin whitepaper and browse translations of Satoshi Nakamoto\'s peer-to-peer electronic cash proposal.'],
  '/selfCustody.html': ['Bitcoin Wallets and Self-Custody Guide | Satoshi.si', 'Compare Bitcoin wallets, signing devices and nodes while learning how self-custody protects your keys and bitcoin.'],
  '/wallet.html': ['Ark Bitcoin Wallet | Satoshi.si', 'An experimental self-custodial Bitcoin wallet using the Ark Layer 2 protocol, built with Second\'s Bark Web SDK for Signet and mainnet.'],
  '/bitcoinTxCost.html': ['Bitcoin and Ark Transaction Cost | Satoshi.si', 'Estimate transaction costs between Ark, Lightning, Legacy, nested SegWit, native SegWit, and Taproot using current fees and Second\'s pricing.'],
  '/quotes.html': ['Satoshi Nakamoto Quotes | Satoshi.si', 'Read and copy quotations from Bitcoin creator Satoshi Nakamoto, with a new quote shown every two minutes.'],
  '/isBip39.html': ['BIP39 Word Checker and Similar Words | Satoshi.si', 'Check words or wordlist positions across official BIP39 languages and explore visually and phonetically similar recovery words.'],
  '/converter.html': ['Bitcoin, Satoshi and Currency Converter | Satoshi.si', 'Convert Bitcoin, satoshis and fiat currencies in a draggable multi-currency converter using current exchange rates.'],
  '/MoscowTime.html': ['Moscow Time: Satoshis per Currency | Satoshi.si', 'See how many satoshis one unit of your selected currency buys, commonly known among Bitcoiners as Moscow Time.'],
  '/chart.html': ['Bitcoin Purchasing Power History Chart | Satoshi.si', 'Compare currencies, commodities, stocks and indexes in Bitcoin over time with interactive ranges, zooming and downloadable data.'],
  '/priceScanner.html': ['Live Bitcoin Price Tag Scanner | Satoshi.si', 'Scan printed or handwritten prices on-device and overlay their live Bitcoin or satoshi value without uploading camera images.'],
  '/memedBitcoinMood.html': ['Bitcoin Market Mood in Memes | Satoshi.si', 'Turn Bitcoin market movement across daily, weekly, monthly and yearly periods into a simple meme-based mood.'],
  '/news.html': ['Bitcoin and Nostr News | Satoshi.si', 'Bitcoin and Nostr news, engineering updates, podcasts, Reddit discussions, and community feeds.'],
  '/game39.html': ['Multiplayer BIP39 Word Game | Satoshi.si', 'Play a multiplayer word game built around the official BIP39 vocabulary used by Bitcoin wallet recovery phrases.'],
  '/game39single.html': ['Single-Player BIP39 Word Game | Satoshi.si', 'Practice recognizing official BIP39 recovery words in a focused single-player Bitcoin word game.'],
  '/ghostQR.html': ['GhostQR Layered QR Code Maker | Satoshi.si', 'Create experimental layered QR codes that split visual information into printable transparent fragments.'],
  '/entropy.html': ['Information about Entropy | Satoshi.si', 'Learn Bitcoin wallet entropy through secure randomness, coin flips, dice, typed patterns, images, movement, sound, and interactive visualizations.'],
  '/21fm.html': ['21FM | Bitcoin Block Music Generator | Satoshi.si', 'Listen to 21FM: diverse generative music shaped by live Bitcoin blocks, fees, transactions, and mempool activity.'],
  '/stego.html': ['Steganography and Cipher Tools | Satoshi.si', 'Hide and recover encrypted messages in text or files, inspect Nostr events for concealed content, and explore reversible text ciphers entirely in your browser.'],
  '/nip05.html': ['NIP-05 Nostr Identifier | Satoshi.si', 'Learn how NIP-05 gives a Nostr public key a human-readable identifier and explore names available on the satoshi.si domain.'],
  '/nip05store.html': ['NIP-05 Name Store | Satoshi.si', 'Claim a NIP-05 name like yourname@satoshi.si. Pay in sats over Lightning, on-chain or Ark, and use the same key to publish to the satoshi.si nostr relay.'],
  '/nostrKeys.html': ['Nostr Keys: Convert, Generate and Mine | Satoshi.si', 'Convert, generate and mine Nostr npub and nsec keys locally in your browser, with a downloadable offline HTML copy and configurable CPU mining.'],
  '/stickyNotes.html': ['Pinstr: Geohash Nostr Boards | Satoshi.si', 'Pinstr lets you sign and pin temporary Nostr notes to public geohash boards.'],
  '/about.html': ['About Pinstr: geohash boards and short-lived notes', 'Pinstr is a cork board for short-lived public digital notes. Each board is a geohash, from a country-sized cell to a doorway. Notes expire, boards nest, and no account is needed.'],
  '/lottery.html': ['Bitcoin Lightning Lottery | Satoshi.si', 'Play a Bitcoin Lightning lottery with results derived transparently from Bitcoin block hashes.'],
  '/lotteryStats.html': ['Bitcoin Lottery Results and Statistics | Satoshi.si', 'Review Bitcoin Lightning lottery results, recent draws, prize pools and supporting statistics.'],
  '/ticketVerifier.html': ['Bitcoin Lottery Ticket Verifier | Satoshi.si', 'Verify a Bitcoin Lightning lottery ticket against the published draw and Bitcoin block-derived winning number.'],
  '/lotteryTOS.html': ['Bitcoin Lottery Terms of Service | Satoshi.si', 'Read the terms, risks, eligibility requirements and affiliate disclosures for the Bitcoin Lightning lottery.'],
  '/exchange.html': ['Buy Bitcoin or Exchange Monero | Satoshi.si', 'Buy Bitcoin with supported fiat currencies or exchange Monero and other digital assets for Bitcoin through the ChangeNOW widget.'],
  '/offers.html': ['Bitcoin P2P Order Book | Satoshi.si', 'Compare public Bitcoin P2P buy and sell offers from Hodl Hodl, Peach, RoboSats, Mostro, LNP2PBot, and Bisq.'],
  '/living.html': ['EU Cost of Living in Bitcoin | Satoshi.si', 'Compare selected European living costs in euros and Bitcoin using annual prices and EU inflation context.'],
};

const applications = new Map([
  ['/wallet.html', 'FinanceApplication'],
  ['/bitcoinTxCost.html', 'FinanceApplication'],
  ['/converter.html', 'FinanceApplication'],
  ['/MoscowTime.html', 'FinanceApplication'],
  ['/chart.html', 'FinanceApplication'],
  ['/priceScanner.html', 'UtilitiesApplication'],
  ['/memedBitcoinMood.html', 'EntertainmentApplication'],
  ['/game39.html', 'GameApplication'],
  ['/game39single.html', 'GameApplication'],
  ['/ghostQR.html', 'UtilitiesApplication'],
  ['/entropy.html', 'EducationalApplication'],
  ['/21fm.html', 'MultimediaApplication'],
  ['/stego.html', 'SecurityApplication'],
  ['/nostrKeys.html', 'SecurityApplication'],
  ['/stickyNotes.html', 'SocialNetworkingApplication'],
  ['/lottery.html', 'GameApplication'],
  ['/lotteryStats.html', 'ReferenceApplication'],
  ['/ticketVerifier.html', 'UtilitiesApplication'],
  ['/exchange.html', 'FinanceApplication'],
  ['/offers.html', 'FinanceApplication'],
  ['/living.html', 'FinanceApplication'],
]);

const entry = pages[location.pathname];
if (entry) {
  const [title, description] = entry;
  const canonicalPath = location.pathname === '/index.html' ? '/' : location.pathname;
  const canonical = `${SITE}${canonicalPath}`;
  document.title = title;

  function meta(selector, attributes) {
    let node = document.head.querySelector(selector);
    if (!node) {
      node = document.createElement(attributes.property ? 'meta' : attributes.rel ? 'link' : 'meta');
      document.head.append(node);
    }
    Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value));
  }

  meta('meta[name="description"]', {name: 'description', content: description});
  meta('link[rel="canonical"]', {rel: 'canonical', href: canonical});
  meta('meta[property="og:type"]', {property: 'og:type', content: 'website'});
  meta('meta[property="og:site_name"]', {property: 'og:site_name', content: SITE_NAME});
  meta('meta[property="og:locale"]', {property: 'og:locale', content: 'en_US'});
  meta('meta[property="og:title"]', {property: 'og:title', content: title});
  meta('meta[property="og:description"]', {property: 'og:description', content: description});
  meta('meta[property="og:url"]', {property: 'og:url', content: canonical});
  meta('meta[property="og:image"]', {property: 'og:image', content: IMAGE});
  meta('meta[property="og:image:width"]', {property: 'og:image:width', content: '512'});
  meta('meta[property="og:image:height"]', {property: 'og:image:height', content: '512'});
  meta('meta[property="og:image:alt"]', {property: 'og:image:alt', content: 'Satoshi.si'});
  meta('meta[name="twitter:card"]', {name: 'twitter:card', content: 'summary'});
  meta('meta[name="twitter:title"]', {name: 'twitter:title', content: title});
  meta('meta[name="twitter:description"]', {name: 'twitter:description', content: description});
  meta('meta[name="twitter:image"]', {name: 'twitter:image', content: IMAGE});
  meta('meta[name="twitter:image:alt"]', {name: 'twitter:image:alt', content: 'Satoshi.si'});

  const structured = document.createElement('script');
  structured.type = 'application/ld+json';
  structured.dataset.satoshiSeo = 'true';
  const pageSchema = {
    '@context': 'https://schema.org',
    '@type': canonicalPath === '/' ? 'WebSite' : 'WebPage',
    name: title,
    description,
    url: canonical,
    inLanguage: 'en',
    isPartOf: canonicalPath === '/' ? undefined : {'@type': 'WebSite', name: SITE_NAME, url: SITE},
  };
  if (canonicalPath === '/') {
    pageSchema.alternateName = 'Satoshi';
  } else if (applications.has(canonicalPath)) {
    pageSchema.mainEntity = {
      '@type': 'WebApplication',
      name: title.replace(/ \| Satoshi\.si$/, ''),
      url: canonical,
      applicationCategory: applications.get(canonicalPath),
      operatingSystem: 'Any',
      browserRequirements: 'Requires a modern web browser',
      offers: {'@type': 'Offer', price: '0', priceCurrency: 'USD'},
    };
  }
  structured.textContent = JSON.stringify(pageSchema);
  document.head.append(structured);
}
