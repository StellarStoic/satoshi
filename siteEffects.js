(() => {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const storageKey = 'satoshi-soft-fade-entry-v1';
    const retiredStorageKey = 'satoshi-channel-entry';
    let overlay;
    let navigating = false;
    let cleanupTimer;
    let activationFrame;
    let paintFrame;

    function cancelPendingWork() {
        clearTimeout(cleanupTimer);
        cancelAnimationFrame(activationFrame);
        cancelAnimationFrame(paintFrame);
    }

    function clearEffect() {
        cancelPendingWork();
        overlay?.remove();
        overlay = null;
    }

    function activateFade() {
        activationFrame = requestAnimationFrame(() => {
            paintFrame = requestAnimationFrame(() => overlay?.classList.add('is-active'));
        });
    }

    function showFade(kind) {
        cancelPendingWork();
        if (!overlay?.classList.contains('site-page-fade')) {
            overlay?.remove();
            overlay = document.createElement('div');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.append(overlay);
        }
        // Reuse the same compositor surface when a visitor continues navigating.
        // Internal transitions never create any of the old TV/static child layers.
        overlay.className = `site-page-fade site-page-fade--${kind}`;
        activateFade();
    }

    function showPowerOff() {
        clearEffect();
        overlay = document.createElement('div');
        overlay.className = 'site-power-off';
        overlay.setAttribute('aria-hidden', 'true');
        for (const name of ['top', 'bottom', 'line']) {
            const part = document.createElement('div');
            part.className = `site-power-off__${name}`;
            overlay.append(part);
        }
        document.body.append(overlay);
    }

    function consumeEntry() {
        try {
            const pending = JSON.parse(sessionStorage.getItem(storageKey));
            sessionStorage.removeItem(storageKey);
            sessionStorage.removeItem(retiredStorageKey);
            return pending && pending.url === location.href && Date.now() - pending.time < 15000;
        } catch {
            return false;
        }
    }

    if (consumeEntry() && !reducedMotion.matches) {
        showFade('enter');
        // The almost-transparent surface remains reusable for the next navigation.
    }

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
        if (internal) {
            showFade('leave');
            try {
                sessionStorage.setItem(storageKey, JSON.stringify({url: url.href, time: Date.now()}));
            } catch {
                // Navigation still works when browser storage is unavailable.
            }
        } else {
            showPowerOff();
        }
        setTimeout(() => {
            location.assign(url.href);
            cleanupTimer = setTimeout(() => {
                clearEffect();
                navigating = false;
            }, 1500);
        }, internal ? 570 : 380);
    });
})();
