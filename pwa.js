if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(error => {
            console.warn('Offline support could not be registered:', error);
        });
    });
}

const SATOSHI_CHAT_SETTING = 'satoshiChatEnabled';

if (!document.querySelector('link[href="/analytics.css"]')) {
    const analyticsStyles = document.createElement('link');
    analyticsStyles.rel = 'stylesheet';
    analyticsStyles.href = '/analytics.css';
    document.head.append(analyticsStyles);
}
import('/analytics.mjs').catch(error => console.warn('Analytics consent could not be loaded:', error));
import('/seo.mjs').catch(error => console.warn('SEO metadata could not be loaded:', error));

const menuList = document.querySelector('#menu > ul');
const MENU_ITEMS = [
    {label: 'Home', href: '/index.html'},
    {label: 'Knowledge', children: [
        {label: 'Bitcoin whitepaper', href: '/whitepaper.html'},
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
    {label: 'Nostr', children: [{label: 'NIP-05', href: '/nip05.html'}]},
    {label: 'Games', children: [
        {label: 'Game39 Multi Player', href: '/game39.html'},
        {label: 'Game39 Single Player', href: '/game39single.html'},
    ]},
    {label: 'Tools', children: [{label: 'GhostQR', href: '/ghostQR.html'}]},
    {label: 'News', href: '/news.html'},
    {label: 'Settings', href: '/settings.html'},
];

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

let chatEnabled = true;
try { chatEnabled = localStorage.getItem(SATOSHI_CHAT_SETTING) !== 'false'; } catch { /* Use the default. */ }
const animatedHome = ['/', '/index.html'].includes(location.pathname);
if (chatEnabled && !animatedHome) {
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
