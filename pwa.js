if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(error => {
            console.warn('Offline support could not be registered:', error);
        });
    });
}

const SATOSHI_CHAT_SETTING = 'satoshiChatEnabled';

const menuList = document.querySelector('#menu > ul');
if (menuList && !menuList.querySelector('a[href="/settings.html"], a[href="settings.html"]')) {
    const settingsItem = document.createElement('li');
    const settingsLink = document.createElement('a');
    settingsLink.href = '/settings.html';
    settingsLink.textContent = 'Settings';
    settingsItem.append(settingsLink);
    menuList.append(settingsItem);
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
