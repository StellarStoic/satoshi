const SITE = 'https://satoshi.si';
const IMAGE = `${SITE}/android-chrome-512x512.png`;
const pages = {
  '/': ['Satoshi.si | Bitcoin Tools, Education and News', 'Explore practical Bitcoin tools, BIP39 education, price conversion, historical charts, Satoshi quotes, Nostr resources and current Bitcoin news.'],
  '/index.html': ['Satoshi.si | Bitcoin Tools, Education and News', 'Explore practical Bitcoin tools, BIP39 education, price conversion, historical charts, Satoshi quotes, Nostr resources and current Bitcoin news.'],
  '/whitepaper.html': ['Bitcoin Whitepaper Translations | Satoshi.si', 'Read the original Bitcoin whitepaper and explore translations that make Satoshi Nakamoto’s peer-to-peer electronic cash proposal accessible worldwide.'],
  '/selfCustody.html': ['Bitcoin Wallets, Self-Custody, Signing Devices and Nodes | Satoshi.si', 'Compare trusted Bitcoin wallets for iOS, Android and desktop, then learn about offline signing devices, multisig, Lightning wallets and running your own node.'],
  '/quotes.html': ['Satoshi Nakamoto Quotes | Satoshi.si', 'Discover carefully presented quotes from Satoshi Nakamoto, with quick copying and a new quotation every two minutes.'],
  '/isBip39.html': ['BIP39 Word Checker and Similar Words | Satoshi.si', 'Check whether a word belongs to an official BIP39 wordlist, find its position and explore visually and phonetically similar recovery words.'],
  '/converter.html': ['Bitcoin, Satoshi and Currency Converter | Satoshi.si', 'Convert Bitcoin, satoshis and fiat currencies in a draggable multi-currency converter using current exchange rates.'],
  '/MoscowTime.html': ['Moscow Time: Satoshis per Dollar | Satoshi.si', 'See the current number of satoshis per US dollar, commonly known by Bitcoiners as Moscow Time.'],
  '/chart.html': ['Bitcoin Purchasing Power History Chart | Satoshi.si', 'Compare currencies, commodities, stocks and indexes in Bitcoin over time with interactive ranges, zooming and downloadable data.'],
  '/priceScanner.html': ['Live Bitcoin Price Tag Scanner | Satoshi.si', 'Scan printed or handwritten prices on-device and overlay their live Bitcoin or satoshi value without uploading camera images.'],
  '/memedBitcoinMood.html': ['Bitcoin Market Mood in Memes | Satoshi.si', 'Turn Bitcoin market movement across daily, weekly, monthly and yearly periods into a simple meme-based mood.'],
  '/news.html': ['Bitcoin and Nostr News | Satoshi.si', 'Follow Bitcoin and Nostr engineering, research, market and community feeds with local source controls, keyword filters, RSS and Nostr profiles.'],
  '/game39.html': ['Multiplayer BIP39 Word Game | Satoshi.si', 'Play a multiplayer word game built around the official BIP39 vocabulary used by Bitcoin wallet recovery phrases.'],
  '/game39single.html': ['Single-Player BIP39 Word Game | Satoshi.si', 'Practice and recognize official BIP39 words in a focused single-player Bitcoin word game.'],
  '/ghostQR.html': ['GhostQR Layered QR Code Maker | Satoshi.si', 'Create experimental printable layered QR codes for splitting and reconstructing visual information.'],
  '/nip05.html': ['NIP-05 Nostr Identifier | Satoshi.si', 'Learn about NIP-05 human-readable Nostr identifiers and identifiers available on the satoshi.si domain.'],
  '/lottery.html': ['Bitcoin Lightning Lottery | Satoshi.si', 'Play a Bitcoin Lightning lottery with transparent results, ticket verification and supporting statistics.'],
  '/lotteryStats.html': ['Bitcoin Lottery Results and Statistics | Satoshi.si', 'Review published Bitcoin Lightning lottery results, recent draws and supporting statistics.'],
  '/ticketVerifier.html': ['Bitcoin Lottery Ticket Verifier | Satoshi.si', 'Verify a Bitcoin Lightning lottery ticket against published draw information.'],
  '/lotteryTOS.html': ['Bitcoin Lottery Terms of Service | Satoshi.si', 'Read the terms, risks, eligibility requirements and affiliate disclosures for the Bitcoin Lightning lottery.'],
  '/exchange.html': ['Buy Bitcoin with EUR or Exchange Monero | Satoshi.si', 'Use a third-party ChangeNOW widget to buy Bitcoin with fiat or exchange Monero and other supported digital assets for Bitcoin.'],
  '/offers.html': ['P2P Bitcoin Offers | Satoshi.si', 'Browse tools and information related to finding and comparing peer-to-peer Bitcoin offers.'],
  '/living.html': ['EU Cost of Living in Bitcoin | Satoshi.si', 'Compare selected European living costs in 2010 and recent years using euros, annual Bitcoin prices and EU inflation context.'],
};

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
  meta('meta[property="og:site_name"]', {property: 'og:site_name', content: 'Satoshi.si'});
  meta('meta[property="og:title"]', {property: 'og:title', content: title});
  meta('meta[property="og:description"]', {property: 'og:description', content: description});
  meta('meta[property="og:url"]', {property: 'og:url', content: canonical});
  meta('meta[property="og:image"]', {property: 'og:image', content: IMAGE});
  meta('meta[name="twitter:card"]', {name: 'twitter:card', content: 'summary'});
  meta('meta[name="twitter:title"]', {name: 'twitter:title', content: title});
  meta('meta[name="twitter:description"]', {name: 'twitter:description', content: description});

  const structured = document.createElement('script');
  structured.type = 'application/ld+json';
  structured.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': canonicalPath === '/' ? 'WebSite' : 'WebPage',
    name: title,
    description,
    url: canonical,
    isPartOf: canonicalPath === '/' ? undefined : {'@type': 'WebSite', name: 'Satoshi.si', url: SITE},
  });
  document.head.append(structured);
}
