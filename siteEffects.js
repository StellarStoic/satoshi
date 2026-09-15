(() => {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const storageKey = 'satoshi-channel-entry';
    let overlay;
    let navigating = false;
    let cleanupTimer;

    function clearEffect() {
        clearTimeout(cleanupTimer);
        overlay?.remove();
        overlay = null;
    }

    function showEffect(kind) {
        clearEffect();
        overlay = document.createElement('div');
        overlay.className = `site-tv-transition site-tv-${kind}`;
        overlay.setAttribute('aria-hidden', 'true');
        for (const name of ['static', 'roll', 'top', 'bottom', 'line']) {
            const part = document.createElement('div');
            part.className = `site-tv-${name}`;
            overlay.append(part);
        }
        document.body.append(overlay);
    }

    function consumeEntry() {
        try {
            const pending = JSON.parse(sessionStorage.getItem(storageKey));
            sessionStorage.removeItem(storageKey);
            return pending && pending.url === location.href && Date.now() - pending.time < 15000;
        } catch {
            return false;
        }
    }

    if (consumeEntry() && !reducedMotion.matches) {
        showEffect('enter');
        cleanupTimer = setTimeout(clearEffect, 220);
    }

    // A restored history entry must never retain the departing screen's overlay.
    addEventListener('pageshow', event => {
        if (event.persisted) clearEffect();
        navigating = false;
    });
    reducedMotion.addEventListener('change', () => {
        if (reducedMotion.matches) clearEffect();
    });

    document.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest('a[href]');
        if (!link || link.hasAttribute('download')) return;
        const target = link.getAttribute('target') || document.querySelector('base[target]')?.getAttribute('target') || '_self';
        if (target.toLowerCase() !== '_self') return;
        const url = new URL(link.href, location.href);
        if (!['http:', 'https:'].includes(url.protocol)) return;
        if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search) return;
        if (reducedMotion.matches) return;
        event.preventDefault();
        if (navigating) return;
        navigating = true;
        const internal = url.origin === location.origin || ['satoshi.si', 'www.satoshi.si'].includes(url.hostname);
        showEffect(internal ? 'leave' : 'off');
        if (internal) {
            try {
                sessionStorage.setItem(storageKey, JSON.stringify({ url: url.href, time: Date.now() }));
            } catch {
                // Navigation still works when browser storage is unavailable.
            }
        }
        setTimeout(() => {
            location.assign(url.href);
            cleanupTimer = setTimeout(() => {
                clearEffect();
                navigating = false;
            }, 1500);
        }, internal ? 240 : 380);
    });
})();
