const SATOSHI_THEME_SETTING = 'satoshiSiteTheme';
const SATOSHI_THEMES = Object.freeze(['legacy', 'coffee', 'forest', 'ocean', 'space', 'electric', 'ice']);

function normaliseSatoshiTheme(theme) {
    return SATOSHI_THEMES.includes(theme) ? theme : 'legacy';
}

function applySatoshiTheme(theme, persist = false) {
    const selectedTheme = normaliseSatoshiTheme(theme);
    document.documentElement.dataset.theme = selectedTheme;
    if (persist) {
        try { localStorage.setItem(SATOSHI_THEME_SETTING, selectedTheme); } catch { /* Keep this session's theme. */ }
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
        'content',
        selectedTheme === 'ice' ? '#f4f8fb' : getComputedStyle(document.documentElement).getPropertyValue('--page-bg').trim() || '#101112'
    );
    window.dispatchEvent(new CustomEvent('satoshi-theme-change', {detail: {theme: selectedTheme}}));
    return selectedTheme;
}

let initialSatoshiTheme = 'legacy';
try { initialSatoshiTheme = localStorage.getItem(SATOSHI_THEME_SETTING) || 'legacy'; } catch { /* Use Legacy. */ }
applySatoshiTheme(initialSatoshiTheme);
window.satoshiTheme = Object.freeze({
    themes: SATOSHI_THEMES,
    get: () => normaliseSatoshiTheme(document.documentElement.dataset.theme),
    set: theme => applySatoshiTheme(theme, true),
});
window.addEventListener('storage', event => {
    if (event.key === SATOSHI_THEME_SETTING) applySatoshiTheme(event.newValue || 'legacy');
});

if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(error => {
            console.warn('Offline support could not be registered:', error);
        });
    });
}

const SATOSHI_CHAT_SETTING = 'satoshiChatEnabled';
const SENSITIVE_WALLET_PAGE = location.pathname === '/wallet.html';
const RUNNING_AS_APP = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
let deferredInstallPrompt = null;
let appInstalled = RUNNING_AS_APP;

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    window.dispatchEvent(new CustomEvent('satoshi-pwa-install-state'));
});

if (!SENSITIVE_WALLET_PAGE && !document.querySelector('link[href="/analytics.css"]')) {
    const analyticsStyles = document.createElement('link');
    analyticsStyles.rel = 'stylesheet';
    analyticsStyles.href = '/analytics.css';
    document.head.append(analyticsStyles);
}
if (!SENSITIVE_WALLET_PAGE) {
    import('/analytics.mjs').catch(error => console.warn('Analytics consent could not be loaded:', error));
}
import('/seo.mjs').catch(error => console.warn('SEO metadata could not be loaded:', error));

if (!document.querySelector('link[href*="lineicons.com"]')) {
    const lineIconStyles = document.createElement('link');
    lineIconStyles.rel = 'stylesheet';
    lineIconStyles.href = 'https://cdn.lineicons.com/5.0/lineicons.css';
    document.head.append(lineIconStyles);
}
if (!document.querySelector('link[href="/siteHelp.css"]')) {
    const helpStyles = document.createElement('link');
    helpStyles.rel = 'stylesheet';
    helpStyles.href = '/siteHelp.css';
    document.head.append(helpStyles);
}
import('/siteHelp.mjs').catch(error => console.warn('Page help could not be loaded:', error));

const menuList = document.querySelector('#menu > ul');
const menu = document.getElementById('menu');
const menuToggle = document.getElementById('toggle');
const MENU_ITEMS = [
    {label: 'Home', href: '/index.html'},
    {label: 'Wallet ₿', href: '/wallet.html'},
    {label: 'Knowledge', children: [
        {label: 'Bitcoin whitepaper', href: '/whitepaper.html'},
        {label: 'Self-custody', href: '/selfCustody.html'},
        {label: 'Words of Satoshi', href: '/quotes.html'},
        {label: 'Is BIP39 word?', href: '/isBip39.html'},
    ]},
    {label: 'Lottery', children: [
        {label: 'Play', href: '/lottery.html'},
        {label: 'Play on Telegram', href: 'https://t.me/bitcoinlightninglotterybot', external: true},
        {label: 'Follow Nostr bot', href: 'https://nosta.me/npub10tteryu88lw060vnljwr0m8du3l533dg33wh8sq57rw40u69u43szykhqv', external: true},
        {label: 'Results & Stats', href: '/lotteryStats.html'},
        {label: 'Ticket Verifier', href: '/ticketVerifier.html'},
        {label: 'Lottery Terms of service', href: '/lotteryTOS.html'},
    ]},
    {label: 'Price Related', children: [
        {label: 'Converter', href: '/converter.html'},
        {label: 'Moscow time', href: '/MoscowTime.html'},
        {label: 'Memed Bitcoin Mood', href: '/memedBitcoinMood.html'},
        {label: 'History chart', href: '/chart.html'},
        {label: 'Price Scanner', href: '/priceScanner.html'},
    ]},
    {label: 'Exchange', children: [
        {label: 'Exchange', href: '/exchange.html'},
        {label: 'P2P Bitcoin Offers', href: '/offers.html'},
    ]},
    {label: 'Nostr', children: [
        {label: 'NIP-05', href: '/nip05.html'},
        {label: 'NIP-05 name store', href: '/nip05store.html'},
        {label: 'Sticky notes', href: '/stickyNotes.html'},
    ]},
    {label: 'Games', children: [
        {label: 'Game39 Multi Player', href: '/game39.html'},
        {label: 'Game39 Single Player', href: '/game39single.html'},
    ]},
    {label: 'Tools', children: [
        {label: 'Bitcoin & Ark TX cost', href: '/bitcoinTxCost.html'},
        {label: 'Entropy Lab', href: '/entropy.html'},
        {label: '21FM', href: '/21fm.html'},
        {label: 'Steganography & Ciphers', href: '/stego.html'},
        {label: 'GhostQR', href: '/ghostQR.html'},
    ]},
    {label: 'News', href: '/news.html'},
    {label: 'Settings', href: '/settings.html'},
];

function showInstallHelp() {
    let dialog = document.getElementById('pwaInstallDialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'pwaInstallDialog';
        dialog.className = 'pwa-install-dialog';
        const content = document.createElement('div');
        content.className = 'pwa-install-content';
        const title = document.createElement('h2');
        title.textContent = 'Install Satoshi.si';
        const message = document.createElement('p');
        message.className = 'pwa-install-message';
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'pwa-install-close';
        close.setAttribute('aria-label', 'Close');
        close.innerHTML = '<i class="lni lni-xmark" aria-hidden="true"></i>';
        close.addEventListener('click', () => dialog.close());
        content.append(close, title, message);
        dialog.appendChild(content);
        dialog.addEventListener('click', event => {
            if (event.target === dialog) dialog.close();
        });
        document.body.appendChild(dialog);
    }

    const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    dialog.querySelector('.pwa-install-message').textContent = isiOS
        ? 'In Safari, tap Share, then Add to Home Screen.'
        : 'Open the browser menu and choose Install app or Add to Home screen.';
    dialog.showModal();
}

async function installPwa() {
    if (!deferredInstallPrompt) {
        showInstallHelp();
        return;
    }
    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    try {
        await prompt.prompt();
        await prompt.userChoice.catch(() => null);
    } catch {
        showInstallHelp();
    }
}

window.satoshiPwa = Object.freeze({
    install: installPwa,
    get installed() { return appInstalled; },
});

function createMenuLink(item) {
    const link = document.createElement('a');
    link.href = item.href;
    link.textContent = item.label;
    if (item.external) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
    }
    return link;
}

if (menuList) {
    menu?.setAttribute('role', 'navigation');
    menu?.setAttribute('aria-label', 'Main navigation');
    menuToggle?.setAttribute('aria-label', 'Navigation');
    menuList.replaceChildren(...MENU_ITEMS.map(item => {
        const listItem = document.createElement('li');
        if (!item.children) {
            listItem.append(createMenuLink(item));
            return listItem;
        }
        listItem.className = 'has-submenu';
        const trigger = createMenuLink({label: item.label, href: '#'});
        trigger.setAttribute('aria-haspopup', 'true');
        const submenu = document.createElement('ul');
        submenu.className = 'submenu';
        submenu.append(...item.children.map(child => {
            const childItem = document.createElement('li');
            childItem.append(createMenuLink(child));
            return childItem;
        }));
        listItem.append(trigger, submenu);
        return listItem;
    }));
}

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    appInstalled = true;
    window.dispatchEvent(new CustomEvent('satoshi-pwa-install-state'));
});

if (document.querySelector('.footer')) {
    import('/siteFooter.mjs').catch(error => console.warn('Live footer data could not be loaded:', error));
}

let chatEnabled = true;
try { chatEnabled = localStorage.getItem(SATOSHI_CHAT_SETTING) !== 'false'; } catch { /* Use the default. */ }
const animatedHome = ['/', '/index.html'].includes(location.pathname);
if (chatEnabled && !animatedHome && !SENSITIVE_WALLET_PAGE) {
    if (!document.querySelector('link[href="/satoshiChat.css"]')) {
        const chatStyles = document.createElement('link');
        chatStyles.rel = 'stylesheet';
        chatStyles.href = '/satoshiChat.css';
        document.head.append(chatStyles);
    }
    import('/satoshiChat.mjs').catch(error => {
        console.warn('Synthetic Satoshi chat could not be loaded:', error);
    });
}
