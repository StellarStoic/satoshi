export const PAGE_HELP = Object.freeze({
    '/': {
        title: 'About Satoshi.si',
        description: 'Satoshi.si is a collection of practical Bitcoin tools, learning experiences, games, market data, news, and creative experiments.'
    },
    '/index.html': {
        title: 'About Satoshi.si',
        description: 'Satoshi.si is a collection of practical Bitcoin tools, learning experiences, games, market data, news, and creative experiments.'
    },
    '/chart.html': {
        title: 'About the history chart',
        description: 'Compare the historical price of currencies, stocks, commodities, and indexes with their value measured in Bitcoin.'
    },
    '/converter.html': {
        title: 'About the converter',
        description: 'Convert Bitcoin, sats, currencies, and other assets together. Drag a currency to the first position to make it the amount that drives every conversion below it.'
    },
    '/entropy.html': {
        title: 'About the entropy lab',
        description: 'Explore how unpredictable input becomes wallet entropy, why strong randomness matters, and why guessing a properly generated Bitcoin wallet is effectively impossible.'
    },
    '/living.html': {
        title: 'About cost of living',
        description: 'Compare selected European living costs over time in fiat and Bitcoin, with inflation included for context.'
    },
    '/lotteryTOS.html': {
        title: 'About these terms',
        description: 'These terms explain how the Lucky Sats Lottery works, what participants agree to, and the limits of the service.'
    },
    '/luckysats.html': {
        title: 'About Lucky Sats',
        description: 'Lucky Sats embeds the lottery experience so you can participate and review its information without leaving Satoshi.si.'
    },
    '/news.html': {
        title: 'About Bitcoin and Nostr News',
        description: 'Browse Bitcoin and Nostr stories gathered from selected public feeds. Search the stream, filter sources and keywords, or add your own RSS and Nostr sources locally.'
    },
    '/nip05.html': {
        title: 'About NIP-05',
        description: 'Learn about readable Nostr identifiers and the available satoshi.si NIP-05 names that can point to your Nostr public key.'
    },
    '/offers.html': {
        title: 'About the P2P order book',
        description: 'Compare public peer-to-peer Bitcoin buy and sell offers from several markets in one place, then continue on the original platform.'
    },
    '/priceScanner.html': {
        title: 'About the price scanner',
        description: 'Point your camera at a printed or handwritten price. On-device recognition finds the amount and overlays its current Bitcoin or sat value without uploading the camera image.'
    },
    '/quotes.html': {
        title: 'About Words of Satoshi',
        description: 'Read a rotating selection of Satoshi Nakamoto quotations. Select a quote to copy it, or use refresh to reveal another.'
    },
    '/selfCustody.html': {
        title: 'About self-custody',
        description: 'Learn what Bitcoin self-custody really means and compare wallet, signing-device, backup, and node options for taking control of your keys.'
    },
    '/settings.html': {
        title: 'About settings',
        description: 'Manage preferences stored in this browser, including optional site features. These choices stay on your device unless a feature clearly says otherwise.'
    },
    '/ticketVerifier.html': {
        title: 'About ticket verification',
        description: 'Verify a Lucky Sats Lottery ticket and independently check whether its numbers and result match the published draw.'
    },
    '/whitepaper.html': {
        title: 'About the Bitcoin whitepaper',
        description: 'Read the original Bitcoin whitepaper or open an available translation to understand the peer-to-peer electronic cash system described by Satoshi Nakamoto.'
    }
});

const EXISTING_TRIGGER_SELECTOR = [
    '.info-modal-trigger',
    '.lofi-help-trigger',
    '#helpIcon',
    '#mood-info-modal-btn'
].join(',');

function normalisePath(pathname) {
    if (!pathname || pathname === '/') return '/';
    const cleanPath = pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '');
    const filename = cleanPath.slice(cleanPath.lastIndexOf('/'));
    return filename.endsWith('.html') ? filename : cleanPath;
}

export function helpForPath(pathname) {
    return PAGE_HELP[normalisePath(pathname)] || null;
}

function iconMarkup() {
    return '<i class="lni lni-question-mark-circle" aria-hidden="true"></i>';
}

function hasNearbyTopRightControl() {
    return Boolean(document.querySelector('.wordlist-settings-trigger'));
}

const TOP_RIGHT_COMPANIONS = Object.freeze({
    '/quotes.html': {selector: '#next-quote'},
    '/converter.html': {selector: '.add-currency-icon', reparent: true},
    '/news.html': {selector: '#openNewsSettings'},
    '/priceScanner.html': {selector: '.scanner-top-controls', wide: true},
    '/wallet.html': {selector: '#openWalletSettings'}
});

function alignTopRightControls(trigger) {
    const config = TOP_RIGHT_COMPANIONS[normalisePath(location.pathname)];
    if (!config) return;
    const companion = document.querySelector(config.selector);
    if (!companion) return;
    companion.classList.add('site-help-companion');
    if (config.reparent) document.documentElement.append(companion);
    trigger.classList.add(config.wide ? 'site-help-trigger--wide-offset' : 'site-help-trigger--offset');
}

function styleExistingTrigger(trigger) {
    trigger.classList.add('site-help-trigger');
    if (hasNearbyTopRightControl()) trigger.classList.add('site-help-trigger--offset');
    alignTopRightControls(trigger);
    trigger.innerHTML = iconMarkup();
    trigger.setAttribute('aria-haspopup', 'dialog');

    if (!trigger.getAttribute('aria-label')) trigger.setAttribute('aria-label', 'About this page');
    if (!trigger.getAttribute('title')) trigger.setAttribute('title', trigger.getAttribute('aria-label'));

    if (trigger.tagName !== 'BUTTON') {
        trigger.setAttribute('role', 'button');
        trigger.setAttribute('tabindex', '0');
        trigger.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            trigger.click();
        });
    }
    if (trigger.parentElement !== document.documentElement) document.documentElement.append(trigger);
}

function createHelpDialog(help) {
    const dialog = document.createElement('dialog');
    dialog.id = 'siteHelpDialog';
    dialog.className = 'site-help-dialog';
    dialog.setAttribute('aria-labelledby', 'siteHelpTitle');

    const content = document.createElement('div');
    content.className = 'site-help-dialog__content';

    const title = document.createElement('h2');
    title.id = 'siteHelpTitle';
    title.textContent = help.title;

    const description = document.createElement('p');
    description.textContent = help.description;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'site-help-dialog__close';
    close.setAttribute('aria-label', 'Close');
    close.title = 'Close';
    close.textContent = '\u00d7';
    close.addEventListener('click', () => dialog.close());

    content.append(close, title, description);
    dialog.append(content);
    dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
    });
    document.body.append(dialog);
    return dialog;
}

function createHelpTrigger(dialog, help) {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = 'siteHelpTrigger';
    trigger.className = 'site-help-trigger';
    trigger.setAttribute('aria-label', help.title);
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', dialog.id);
    trigger.title = help.title;
    trigger.innerHTML = iconMarkup();
    trigger.addEventListener('click', () => dialog.showModal());
    alignTopRightControls(trigger);
    document.documentElement.append(trigger);
}

export function initialiseSiteHelp() {
    const existing = document.querySelector(EXISTING_TRIGGER_SELECTOR);
    if (existing) {
        styleExistingTrigger(existing);
        return;
    }

    if (document.getElementById('siteHelpTrigger')) return;
    const help = helpForPath(location.pathname);
    if (!help) return;
    const dialog = createHelpDialog(help);
    createHelpTrigger(dialog, help);
}

if (typeof document !== 'undefined') initialiseSiteHelp();
