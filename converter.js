document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('converter');
    const currencyModal = document.getElementById('currencyModal');
    const currencyList = document.getElementById('currencyList');
    const apiKey = '6d0add5ffd6f427f97a0df5d04816c45';
    let selectedCurrency = null; // To store the selected currency
    let supportedCurrencies = {}; // To store currencies from currencies.json
    let exchangeRates = {}; // To store fetched exchange rates
    let updateTimeout; // For debouncing
    const CACHE_KEY = 'exchangeRatesCache';
    const CACHE_EXPIRY_KEY = 'exchangeRatesCacheExpiry';
    const CACHE_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
    const USER_SETTINGS_KEY = 'userCurrencySettings'; // Key to store user settings
    const MAX_BTC_SUPPLY = 21000000; // Maximum supply of BTC
    const MAX_SAT_SUPPLY = MAX_BTC_SUPPLY * 100000000; // Maximum supply of SAT (21 million BTC in Satoshis)

    // Initialize Slip.js for drag-and-drop and swipe-to-remove functionality
    const slipInstance = new Slip(container);

    // Prevent drag start when clicking on an input field
    container.addEventListener('mousedown', function (e) {
        if (e.target.tagName.toLowerCase() === 'input') {
            e.stopPropagation(); // Prevent drag when input is clicked
        }
    });

    container.addEventListener('touchstart', function (e) {
        if (e.target.tagName.toLowerCase() === 'input') {
            e.stopPropagation(); // Prevent drag when input is touched
        }
    });

    // Prevent swipe gestures on certain conditions
    container.addEventListener('slip:beforeswipe', function (e) {
        const currencySymbolElement = e.target.querySelector('.currency-symbol');
        if (!currencySymbolElement) return; // If no currency-symbol found, exit

        const currencySymbol = currencySymbolElement.textContent;
        if (currencySymbol === 'BTC' || currencySymbol === 'SAT') {
            e.preventDefault(); // Prevent swipe for BTC and SAT
        }
    });

    // Handle swipe-to-remove functionality
    container.addEventListener('slip:swipe', function (e) {
        const currencySymbolElement = e.target.querySelector('.currency-symbol');
        if (!currencySymbolElement) return; // If no currency-symbol found, exit

        const currencySymbol = currencySymbolElement.textContent;
        if (currencySymbol !== 'BTC' && currencySymbol !== 'SAT') {
            e.target.parentNode.removeChild(e.target); // Remove the swiped container
            saveUserSettings(); // Save settings after removing a currency
            updateAllCurrencies(); // Update currencies after removing one
        }
    });

    // Prevent reordering of BTC and SAT
    container.addEventListener('slip:beforereorder', function (e) {
        const currencySymbolElement = e.target.querySelector('.currency-symbol');
        if (!currencySymbolElement) return; // If no currency-symbol found, exit

        const currencySymbol = currencySymbolElement.textContent;
        if (currencySymbol === 'BTC' || currencySymbol === 'SAT') {
            e.preventDefault(); // Prevent reordering for BTC and SAT
        }
    });

    container.addEventListener('slip:reorder', function (e) {
        e.target.parentNode.insertBefore(e.target, e.detail.insertBefore);
        saveUserSettings(); // Save settings after reordering
        updateAllCurrencies(); // Recalculate all currencies after reorder
        return false;
    });

    function fetchSupportedCurrencies() {
        fetch('currencies.json')
            .then(response => response.json())
            .then(data => {
                supportedCurrencies = data.currencies; // Store the supported currencies
                populateCurrencyList(supportedCurrencies); // Populate the modal with supported currencies

                // Exclude "SAT" from the list of currencies to fetch from API
                const currencyCodes = Object.keys(supportedCurrencies).filter(code => code !== 'SAT');
                fetchExchangeRates(currencyCodes); // Fetch rates for these currencies
            })
            .catch(error => console.error('Error fetching supported currencies:', error));
    }

    function fetchExchangeRates(currencyCodes = ['USD']) {
        // Check if exchange rates are stored in localStorage and not expired
        const cachedRates = localStorage.getItem(CACHE_KEY);
        const cachedExpiry = localStorage.getItem(CACHE_EXPIRY_KEY);
        const now = new Date().getTime();

        if (cachedRates && cachedExpiry && now < cachedExpiry) {
            // Use cached rates if not expired
            exchangeRates = JSON.parse(cachedRates);
            console.log('Using cached exchange rates:', exchangeRates);
            loadUserSettings(); // Load user settings after fetching rates
            updateAllCurrencies();
        } else {
            // Fetch new exchange rates from API
            const url = `https://openexchangerates.org/api/latest.json?app_id=${apiKey}&symbols=${currencyCodes.join(',')}`;

            fetch(url)
                .then(response => response.json())
                .then(data => {
                    exchangeRates = data.rates;
                    console.log('Fetched new exchange rates:', exchangeRates);
                    loadUserSettings(); // Load user settings after fetching rates
                    updateAllCurrencies();

                    // Store rates in localStorage with expiry
                    localStorage.setItem(CACHE_KEY, JSON.stringify(exchangeRates));
                    localStorage.setItem(CACHE_EXPIRY_KEY, (now + CACHE_DURATION_MS).toString());
                })
                .catch(error => console.error('Error fetching exchange rates:', error));
        }
    }

    function updateAllCurrencies() {
        if (updateTimeout) clearTimeout(updateTimeout); // Clear any existing timeout

        updateTimeout = setTimeout(() => { // Debounce logic to reduce excessive calculations
            const baseCurrencyContainer = container.querySelector('.currency-container:first-child .currency-symbol');
            const baseCurrency = baseCurrencyContainer ? baseCurrencyContainer.textContent : 'USD';
            const baseInput = container.querySelector('.currency-container:first-child .currency-input');
            const baseValue = parseFloat(baseInput.value.replace(/,/g, ''));

            if (isNaN(baseValue)) return; // If base value is not a number, exit

            if (baseCurrency === 'BTC' && baseValue > MAX_BTC_SUPPLY) {
                // Cap BTC at maximum supply and highlight
                baseInput.value = MAX_BTC_SUPPLY.toFixed(8);
                highlightInput(container.querySelector('.currency-container:first-child'));
            } else if (baseCurrency === 'SAT' && baseValue > MAX_SAT_SUPPLY) {
                // Cap SAT at maximum supply in Satoshis and highlight
                baseInput.value = MAX_SAT_SUPPLY.toFixed(0);
                highlightInput(container.querySelector('.currency-container:first-child'));
            }

            document.querySelectorAll('.currency-container').forEach((currencyContainer, index) => {
                const inputField = currencyContainer.querySelector('.currency-input');
                const currencySymbol = currencyContainer.querySelector('.currency-symbol').textContent;

                if (index === 0) {
                    inputField.readOnly = false; // Make the first input editable
                    return; // Skip further processing for the base currency
                }

                inputField.readOnly = true; // Make all other inputs read-only

                if (baseCurrency === 'BTC') {
                    if (currencySymbol === 'SAT') {
                        // Convert BTC to SAT
                        const satoshiValue = baseValue * 100000000;
                        inputField.value = formatCurrency(satoshiValue, 0); // No decimals needed for SAT
                    } else if (exchangeRates[currencySymbol]) {
                        // Convert BTC to other currencies
                        const btcToUsdRate = exchangeRates['BTC'];
                        const conversionRate = exchangeRates[currencySymbol] / btcToUsdRate;
                        const newValue = baseValue * conversionRate;
                        inputField.value = formatCurrency(newValue, 2);
                    }
                } else if (baseCurrency === 'SAT') {
                    if (currencySymbol === 'BTC') {
                        // Convert SAT to BTC
                        let btcValue = baseValue / 100000000;
                        if (btcValue > MAX_BTC_SUPPLY) {
                            btcValue = MAX_BTC_SUPPLY;
                            highlightInput(currencyContainer); // Highlight input if exceeded
                        }
                        inputField.value = formatCurrency(btcValue, 8); // Up to 8 decimals for BTC
                    } else if (exchangeRates[currencySymbol]) {
                        // Convert SAT to other currencies via BTC
                        const btcValue = baseValue / 100000000;
                        const btcToUsdRate = exchangeRates['BTC'];
                        const conversionRate = exchangeRates[currencySymbol] / btcToUsdRate;
                        const newValue = btcValue * conversionRate;
                        inputField.value = formatCurrency(newValue, 2);
                    }
                } else if (currencySymbol === 'BTC') {
                    // Convert fiat to BTC
                    if (exchangeRates['BTC'] && exchangeRates[baseCurrency]) {
                        const conversionRate = exchangeRates['BTC'] / exchangeRates[baseCurrency];
                        let btcValue = baseValue * conversionRate;
                        if (btcValue > MAX_BTC_SUPPLY) {
                            btcValue = MAX_BTC_SUPPLY;
                            highlightInput(currencyContainer); // Highlight input if exceeded
                        }
                        inputField.value = formatCurrency(btcValue, 8); // Up to 8 decimals for BTC
                    }
                } else if (currencySymbol === 'SAT') {
                    // Convert fiat to SAT via BTC
                    if (exchangeRates['BTC'] && exchangeRates[baseCurrency]) {
                        const conversionRate = exchangeRates['BTC'] / exchangeRates[baseCurrency];
                        let btcValue = baseValue * conversionRate;
                        if (btcValue > MAX_BTC_SUPPLY) {
                            btcValue = MAX_BTC_SUPPLY;
                            highlightInput(currencyContainer); // Highlight input if exceeded
                        }
                        const satoshiValue = btcValue * 100000000;
                        inputField.value = formatCurrency(satoshiValue, 0); // No decimals needed for SAT
                    }
                } else if (exchangeRates[baseCurrency] && exchangeRates[currencySymbol]) {
                    // Convert between two fiat currencies
                    const conversionRate = exchangeRates[currencySymbol] / exchangeRates[baseCurrency];
                    const newValue = baseValue * conversionRate;
                    inputField.value = formatCurrency(newValue, 2); // Format with commas and decimals
                }
            });
        }, 300); // Adjust the delay as necessary
    }

    function highlightInput(container) {
        const inputField = container.querySelector('.currency-input');
        inputField.classList.add('highlight-red');
        setTimeout(() => {
            inputField.classList.remove('highlight-red'); // Reset background color after 1 second
        }, 1000);
    }

    function formatCurrency(value, decimals) {
        // Format the number to include commas as thousand separators and fixed decimal points
        return Number(value.toFixed(decimals)).toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    function restrictInput(input) {
        input.addEventListener('input', function () {
            this.value = this.value.replace(/[^0-9.,]/g, '');
            const inputValue = parseFloat(this.value.replace(/,/g, ''));

            if (!isNaN(inputValue) && (this.closest('.currency-container').querySelector('.currency-symbol').textContent === 'BTC' || this.closest('.currency-container').querySelector('.currency-symbol').textContent === 'SAT')) {
                if (this.closest('.currency-container').querySelector('.currency-symbol').textContent === 'BTC' && inputValue > MAX_BTC_SUPPLY) {
                    this.value = MAX_BTC_SUPPLY.toFixed(8);
                    highlightInput(this.closest('.currency-container'));
                } else if (this.closest('.currency-container').querySelector('.currency-symbol').textContent === 'SAT' && inputValue > MAX_SAT_SUPPLY) {
                    this.value = MAX_SAT_SUPPLY.toFixed(0);
                    highlightInput(this.closest('.currency-container'));
                }
            }

            adjustFontSize(this);
            updateAllCurrencies(); // Trigger update on input change
        });

        input.addEventListener('keypress', function (event) {
            if (!/[0-9.,]/.test(event.key) && !event.ctrlKey) {
                event.preventDefault();
            }
        });
    }

    function adjustFontSize(input) {
        const maxFontSize = 16;
        const minFontSize = 10;
        const step = 0.2;

        input.style.fontSize = `${maxFontSize}px`;

        while (input.scrollWidth > input.clientWidth && parseFloat(input.style.fontSize) > minFontSize) {
            input.style.fontSize = `${parseFloat(input.style.fontSize) - step}px`;
        }
    }

    function initializeInputValidation() {
        const inputs = document.querySelectorAll('.currency-input');
        inputs.forEach(input => restrictInput(input));
    }

    function populateCurrencyList(currencies) {
        currencyList.innerHTML = ''; // Clear existing list
        for (const [code, name] of Object.entries(currencies)) {
            const currencyItem = document.createElement('div');
            currencyItem.className = 'currency-item';
            currencyItem.textContent = `${name} (${code})`;
            currencyItem.onclick = function () {
                selectCurrency(code);
            };
            currencyList.appendChild(currencyItem);
        }
    }

    window.openCurrencyModal = function () {
        currencyModal.style.display = 'block';
    };

    window.closeCurrencyModal = function () {
        currencyModal.style.display = 'none';
    };

    window.selectCurrency = function (currency) {
        selectedCurrency = currency;  // Store selected currency
        console.log(`Selected currency: ${selectedCurrency}`);
        closeCurrencyModal();
        addCurrencyContainer();  // Call to add the container after currency selection
    };

    window.addCurrencyContainer = function () {
        if (!selectedCurrency) {
            console.error('No currency selected. Cannot add container.');
            return;
        }
        const newContainer = document.createElement('div');
        newContainer.className = 'currency-container';
        newContainer.innerHTML = `
            <span class="currency-symbol">${selectedCurrency}</span>
            <input type="text" class="currency-input" value="0" />
        `;
        container.appendChild(newContainer);
        initializeInputValidation(); // Reinitialize input validation
        saveUserSettings(); // Save user settings after adding a new currency
        selectedCurrency = null;  // Reset after use
        updateAllCurrencies(); // Update all currencies after adding a new one
    };

    function saveUserSettings() {
        const userSettings = [];
        document.querySelectorAll('.currency-container').forEach(container => {
            const currencySymbol = container.querySelector('.currency-symbol').textContent;
            userSettings.push(currencySymbol);
        });
        localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(userSettings));
    }

    function loadUserSettings() {
        const savedSettings = localStorage.getItem(USER_SETTINGS_KEY);
        if (savedSettings) {
            const currencies = JSON.parse(savedSettings);

            // Clear existing containers except for the base one
            const baseContainer = container.querySelector('.currency-container:first-child');
            container.innerHTML = ''; // Clear all containers
            container.appendChild(baseContainer); // Re-append the base container

            currencies.forEach((currency, index) => {
                if (index === 0) {
                    baseContainer.querySelector('.currency-symbol').textContent = currency;
                } else {
                    selectedCurrency = currency;
                    addCurrencyContainer();
                }
            });
        }
    }

    initializeInputValidation();
    fetchSupportedCurrencies(); // Fetch the supported currencies and exchange rates
});
