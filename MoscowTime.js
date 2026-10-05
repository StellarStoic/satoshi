document.addEventListener('DOMContentLoaded', async function() {
    const {
        SINTRA_CURRENCIES,
        normaliseSintraPrices,
        parseFrankfurterRates,
        moscowTimeValue,
    } = await import('./MoscowTimeModel.mjs');
    const currencyKey = 'moscowTimeCurrency';
    const valueElement = document.getElementById('satoshisValue');
    const currencySelect = document.getElementById('moscowCurrency');
    const settingsDialog = document.getElementById('moscowSettings');
    const currencyNames = {};
    let sintraPrices = {};
    let fxRates = {USD: 1};
    let displayedValue = null;
    let fxReady = false;
    let animationFrame;
    let reconnectTimer;
    let reconnectDelay = 1000;
    let selectedCurrency = 'USD';

    try {
        const stored = localStorage.getItem(currencyKey);
        if (/^[A-Z]{3}$/.test(stored || '')) selectedCurrency = stored;
    } catch { /* Use USD when browser storage is unavailable. */ }

    function animateNumber(end) {
        cancelAnimationFrame(animationFrame);
        const start = Number.isFinite(displayedValue) ? displayedValue : end;
        const started = performance.now();
        const duration = 420;
        const draw = now => {
            const progress = Math.min(1, (now - started) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (end - start) * eased);
            valueElement.textContent = current.toLocaleString();
            if (progress < 1) animationFrame = requestAnimationFrame(draw);
            else displayedValue = end;
        };
        animationFrame = requestAnimationFrame(draw);
    }

    function render() {
        const result = moscowTimeValue(selectedCurrency, sintraPrices, fxRates);
        if (!result) {
            valueElement.textContent = 'Syncing';
            return;
        }
        animateNumber(result.sats);
    }

    function addCurrencyOptions() {
        const current = selectedCurrency;
        const nativeGroup = document.createElement('optgroup');
        nativeGroup.label = 'Provided by Sintra';
        for (const code of SINTRA_CURRENCIES) nativeGroup.append(new Option(`${code} · ${currencyNames[code] || code}`, code));

        const convertedGroup = document.createElement('optgroup');
        convertedGroup.label = 'Sintra + Frankfurter';
        Object.keys(fxRates)
            .filter(code => !SINTRA_CURRENCIES.includes(code))
            .sort((a, b) => (currencyNames[a] || a).localeCompare(currencyNames[b] || b))
            .forEach(code => convertedGroup.append(new Option(`${code} · ${currencyNames[code] || code}`, code)));

        currencySelect.replaceChildren(nativeGroup);
        if (convertedGroup.children.length) currencySelect.append(convertedGroup);
        if ([...currencySelect.options].some(option => option.value === current)) currencySelect.value = current;
        else if (fxReady) {
            selectedCurrency = 'USD';
            currencySelect.value = 'USD';
            try { localStorage.setItem(currencyKey, selectedCurrency); } catch { /* Keep it for this session. */ }
        }
    }

    async function loadCurrencyNames() {
        try {
            const response = await fetch('currencies.json');
            if (!response.ok) return;
            Object.assign(currencyNames, (await response.json()).currencies || {});
            addCurrencyOptions();
        } catch { /* Currency codes remain usable without display names. */ }
    }

    function readCachedFx() {
        try {
            const cached = JSON.parse(localStorage.getItem('priceScannerFxCache'));
            if (cached?.expiresAt > Date.now() && cached?.rates?.USD === 1) {
                fxRates = cached.rates;
                fxReady = true;
            }
        } catch { /* Fetch a fresh set below. */ }
    }

    async function refreshFx() {
        try {
            const response = await fetch('https://api.frankfurter.dev/v2/rates?base=USD', {cache: 'no-store'});
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const rates = parseFrankfurterRates(await response.json());
            if (Object.keys(rates).length < 2) throw new Error('No reference rates returned');
            fxRates = rates;
            fxReady = true;
            try {
                localStorage.setItem('priceScannerFxCache', JSON.stringify({
                    rates,
                    expiresAt: Date.now() + 86_400_000,
                    source: 'Frankfurter',
                }));
            } catch { /* Rates still work for this session. */ }
            addCurrencyOptions();
            render();
        } catch (error) {
            console.warn('Moscow Time currency rates could not refresh:', error);
        }
    }

    function acceptSintraPrices(prices) {
        sintraPrices = {...sintraPrices, ...normaliseSintraPrices(prices)};
        render();
    }

    async function refreshSintra() {
        try {
            const response = await fetch('https://api.sintra.fi/v1/prices', {cache: 'no-store'});
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            acceptSintraPrices(await response.json());
        } catch (error) {
            console.warn('Moscow Time prices could not refresh:', error);
        }
    }

    function connectSintra() {
        clearTimeout(reconnectTimer);
        const socket = new WebSocket('wss://api.sintra.fi/ws');
        socket.onmessage = event => {
            try {
                const message = JSON.parse(event.data);
                if (message.event === 'data') {
                    reconnectDelay = 1000;
                    acceptSintraPrices(message.data?.prices || {});
                }
            } catch { /* Ignore malformed updates and wait for the next one. */ }
        };
        socket.onerror = () => socket.close();
        socket.onclose = () => {
            reconnectTimer = setTimeout(connectSintra, reconnectDelay);
            reconnectDelay = Math.min(30_000, reconnectDelay * 2);
        };
    }

    currencySelect.addEventListener('change', () => {
        selectedCurrency = currencySelect.value;
        displayedValue = null;
        try { localStorage.setItem(currencyKey, selectedCurrency); } catch { /* Keep it for this session. */ }
        render();
    });
    document.getElementById('openMoscowSettings')?.addEventListener('click', () => settingsDialog.showModal());
    settingsDialog.addEventListener('click', event => {
        if (event.target === settingsDialog) settingsDialog.close();
    });

    readCachedFx();
    addCurrencyOptions();
    render();
    loadCurrencyNames();
    refreshFx();
    refreshSintra();
    connectSintra();
});




// Handle opening the Moscow Time modal
function openMoscowTimeModal(event) {
    event.stopPropagation();  // Stop the click from propagating to more general handlers
    const moscowModal = document.getElementById('moscowTimeModal');
    if (moscowModal) {
        closeAllModals();  // Close all other modals
        moscowModal.classList.add('active');
        document.body.classList.add('modal-open');
    } else {
        console.error('Moscow Time Modal not found!');
    }
}

// Function to close the Moscow Time modal
function closeMoscowTimeModal() {
    const moscowModal = document.getElementById('moscowTimeModal');
    if (moscowModal) {
        moscowModal.classList.remove('active');
        document.body.classList.remove('modal-open');
    } else {
        console.error('Moscow Time Modal not found!');
    }
}

// element to trigger opening the Moscow Time modal
const moscowTrigger = document.querySelector('.info-modal-trigger');
if (moscowTrigger) {
    moscowTrigger.addEventListener('click', openMoscowTimeModal);
}

document.querySelector('#moscowTimeModal .close').addEventListener('click', function() {
    closeMoscowTimeModal();
});

document.querySelector('.info-modal-trigger').addEventListener('click', function() {
    showModal('moscowTimeModal'); // Pass the ID of the modal if needed
});
