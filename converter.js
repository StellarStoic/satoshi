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

    // Slip.js is used for drag-and-drop and swipe-to-remove functionality
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
            if (getCookie("cookieConsent") === "true") {
                saveUserSettings(); // Save settings after removing a currency
            }
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

        // Add vibration feedback on mobile devices when reordering
        if (navigator.vibrate) {
            navigator.vibrate(50); // Vibrate for 50 milliseconds
        }

        if (getCookie("cookieConsent") === "true") {
            saveUserSettings(); // Save settings after reordering
        }
        updateAllCurrencies(); // Recalculate all currencies after reorder
        return false;
    });

    function fetchSupportedCurrencies() {
        fetch('currencies.json')
            .then(response => response.json())
            .then(data => {
                supportedCurrencies = data.currencies; // Store the supported currencies
                populateCurrencyList(supportedCurrencies); // Populate the modal with supported currencies
    
                // Exclude SAT and other BTC-derived units from the list of currencies to fetch from API
                const excludedUnits = ['SAT', 'msat', '𝑓BTC', 'μBTC', 'mBTC', 'cBTC'];
                const currencyCodes = Object.keys(supportedCurrencies).filter(code => !excludedUnits.includes(code));
                
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

                    // Store rates in localStorage with expiry (always store this data)
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
                baseInput.value = MAX_BTC_SUPPLY.toFixed(8);
                highlightInput(container.querySelector('.currency-container:first-child'));
            } else if (baseCurrency === 'SAT' && baseValue > MAX_SAT_SUPPLY) {
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
    
                // Conversion logic for Bitcoin and related units
                const conversions = {
                    'msat': 100000000000, // Millisatoshi
                    'SAT': 100000000, // Satoshi
                    '𝑓BTC': 10000000, // finney
                    'μBTC': 1000000, // bit (Micro-Bitcoin)
                    'mBTC': 1000, // millie (Milli-Bitcoin)
                    'cBTC': 100 // bitcent (Centi-Bitcoin)
                };

                if (baseCurrency === 'BTC') {
                    if (conversions[currencySymbol]) {
                        const convertedValue = baseValue * conversions[currencySymbol];
                        inputField.value = formatCurrency(convertedValue, 0); // No decimals needed for these small units
                    } else if (exchangeRates[currencySymbol]) {
                        const btcToUsdRate = exchangeRates['BTC'];
                        const conversionRate = exchangeRates[currencySymbol] / btcToUsdRate;
                        const newValue = baseValue * conversionRate;
                        inputField.value = formatCurrency(newValue, 2);
                    }
                } else if (conversions[baseCurrency]) {
                    // Conversions from other BTC units to BTC
                    const btcValue = baseValue / conversions[baseCurrency];
    
                    if (currencySymbol === 'BTC') {
                        inputField.value = formatCurrency(btcValue, 8); // Up to 8 decimals for BTC
                    } else if (conversions[currencySymbol]) {
                        const convertedValue = btcValue * conversions[currencySymbol];
                        inputField.value = formatCurrency(convertedValue, 0); // No decimals needed
                    } else if (exchangeRates[currencySymbol]) {
                        const btcToUsdRate = exchangeRates['BTC'];
                        const conversionRate = exchangeRates[currencySymbol] / btcToUsdRate;
                        const newValue = btcValue * conversionRate;
                        inputField.value = formatCurrency(newValue, 4);
                    }
                } else if (currencySymbol === 'BTC') {
                    if (exchangeRates['BTC'] && exchangeRates[baseCurrency]) {
                        const conversionRate = exchangeRates['BTC'] / exchangeRates[baseCurrency];
                        let btcValue = baseValue * conversionRate;
                        if (btcValue > MAX_BTC_SUPPLY) {
                            btcValue = MAX_BTC_SUPPLY;
                            highlightInput(currencyContainer);
                        }
                        inputField.value = formatCurrency(btcValue, 8);
                    }
                } else if (conversions[currencySymbol]) {
                    // Convert fiat to Bitcoin units
                    if (exchangeRates['BTC'] && exchangeRates[baseCurrency]) {
                        const conversionRate = exchangeRates['BTC'] / exchangeRates[baseCurrency];
                        let btcValue = baseValue * conversionRate;
                        if (btcValue > MAX_BTC_SUPPLY) {
                            btcValue = MAX_BTC_SUPPLY;
                            highlightInput(currencyContainer);
                        }
                        const convertedValue = btcValue * conversions[currencySymbol];
                        inputField.value = formatCurrency(convertedValue, 2); // No decimals needed
                    }
                } else if (exchangeRates[baseCurrency] && exchangeRates[currencySymbol]) {
                    const conversionRate = exchangeRates[currencySymbol] / exchangeRates[baseCurrency];
                    const newValue = baseValue * conversionRate;
                    inputField.value = formatCurrency(newValue, 4);
                }
            });
        }, 300); // Adjust the delay as necessary
    }

    function highlightInput(container) {
        const inputField = container.querySelector('.currency-input');
        
        // Add neon glow class
        inputField.classList.add('highlight-red-neon');
    
        // Remove the class after a few seconds to stop the blinking
        setTimeout(() => {
            inputField.classList.remove('highlight-red-neon'); // Stop neon effect
        }, 3000); // Adjust duration as needed (e.g., 3 seconds)
    }

    function formatCurrency(value, decimals) {
        // Format the number to include commas as thousand separators and fixed decimal points
        return Number(value.toFixed(decimals)).toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }


    // function restrictInput(input) {
    //     input.addEventListener('input', function () {
    //         // Allow only numbers, commas, and periods in the input
    //         this.value = this.value.replace(/[^0-9.,]/g, '');
    //         const inputValue = parseFloat(this.value.replace(/,/g, ''));
    
    //         if (!isNaN(inputValue)) {
    //             const currencySymbol = this.closest('.currency-container').querySelector('.currency-symbol').textContent;
    
    //             // Check and cap values based on the currency symbol
    //             if (currencySymbol === 'BTC' && inputValue > MAX_BTC_SUPPLY) {
    //                 this.value = MAX_BTC_SUPPLY.toFixed(8);
    //                 highlightInput(this.closest('.currency-container'));
    //             } else if (currencySymbol === 'SAT' && inputValue > MAX_SAT_SUPPLY) {
    //                 this.value = MAX_SAT_SUPPLY.toFixed(0);
    //                 highlightInput(this.closest('.currency-container'));
    //             } else if (currencySymbol === 'msat' && inputValue > MAX_BTC_SUPPLY * 100000000000) {
    //                 // Max supply for msat (1 BTC = 100,000,000,000 msat)
    //                 this.value = (MAX_BTC_SUPPLY * 100000000000).toFixed(0);
    //                 highlightInput(this.closest('.currency-container'));
    //             } else if (currencySymbol === '𝑓BTC' && inputValue > MAX_BTC_SUPPLY * 10000000) {
    //                 // Max supply for 𝑓BTC (1 BTC = 10,000,000 𝑓BTC)
    //                 this.value = (MAX_BTC_SUPPLY * 10000000).toFixed(0);
    //                 highlightInput(this.closest('.currency-container'));
    //             } else if (currencySymbol === 'μBTC' && inputValue > MAX_BTC_SUPPLY * 1000000) {
    //                 // Max supply for μBTC (1 BTC = 1,000,000 μBTC)
    //                 this.value = (MAX_BTC_SUPPLY * 1000000).toFixed(0);
    //                 highlightInput(this.closest('.currency-container'));
    //             } else if (currencySymbol === 'mBTC' && inputValue > MAX_BTC_SUPPLY * 1000) {
    //                 // Max supply for mBTC (1 BTC = 1,000 mBTC)
    //                 this.value = (MAX_BTC_SUPPLY * 1000).toFixed(0);
    //                 highlightInput(this.closest('.currency-container'));
    //             } else if (currencySymbol === 'cBTC' && inputValue > MAX_BTC_SUPPLY * 100) {
    //                 // Max supply for cBTC (1 BTC = 100 cBTC)
    //                 this.value = (MAX_BTC_SUPPLY * 100).toFixed(0);
    //                 highlightInput(this.closest('.currency-container'));
    //             }
    //         }


    //         // Trigger update on input change
    //         updateAllCurrencies();
    //     });
    
    //     // Prevent entering non-numeric characters except comma and period
    //     input.addEventListener('keypress', function (event) {
    //         if (!/[0-9.,]/.test(event.key) && !event.ctrlKey) {
    //             event.preventDefault();
    //         }
    //     });
    // }



    function restrictInput(input) {
        input.addEventListener('input', function () {
            // Allow only numbers, commas, and periods in the input
            this.value = this.value.replace(/[^0-9.,]/g, '');
            let inputValue = parseFloat(this.value.replace(/,/g, ''));
    
            if (!isNaN(inputValue)) {
                const currencySymbol = this.closest('.currency-container').querySelector('.currency-symbol').textContent;
    
                // Check and cap values based on the currency symbol
                if (currencySymbol === 'BTC') {
                    if (inputValue > MAX_BTC_SUPPLY) {
                        this.value = MAX_BTC_SUPPLY.toFixed(0);
                        highlightInput(this.closest('.currency-container'));
                    } else {
                        // Allow up to 8 decimal places for BTC but do not exceed the supply
                        this.value = formatCurrency(inputValue, 8).replace(/(\.0+|0+)$/, '');
                    }
                } else if (currencySymbol === 'SAT' && inputValue > MAX_SAT_SUPPLY) {
                    this.value = MAX_SAT_SUPPLY.toFixed(0);
                    highlightInput(this.closest('.currency-container'));
                } else if (currencySymbol === 'msat' && inputValue > MAX_BTC_SUPPLY * 100000000000) {
                    // Max supply for msat (1 BTC = 100,000,000,000 msat)
                    this.value = (MAX_BTC_SUPPLY * 100000000000).toFixed(0);
                    highlightInput(this.closest('.currency-container'));
                } else if (currencySymbol === '𝑓BTC' && inputValue > MAX_BTC_SUPPLY * 10000000) {
                    // Max supply for 𝑓BTC (1 BTC = 10,000,000 𝑓BTC)
                    this.value = (MAX_BTC_SUPPLY * 10000000).toFixed(0);
                    highlightInput(this.closest('.currency-container'));
                } else if (currencySymbol === 'μBTC' && inputValue > MAX_BTC_SUPPLY * 1000000) {
                    // Max supply for μBTC (1 BTC = 1,000,000 μBTC)
                    this.value = (MAX_BTC_SUPPLY * 1000000).toFixed(0);
                    highlightInput(this.closest('.currency-container'));
                } else if (currencySymbol === 'mBTC' && inputValue > MAX_BTC_SUPPLY * 1000) {
                    // Max supply for mBTC (1 BTC = 1,000 mBTC)
                    this.value = (MAX_BTC_SUPPLY * 1000).toFixed(0);
                    highlightInput(this.closest('.currency-container'));
                } else if (currencySymbol === 'cBTC' && inputValue > MAX_BTC_SUPPLY * 100) {
                    // Max supply for cBTC (1 BTC = 100 cBTC)
                    this.value = (MAX_BTC_SUPPLY * 100).toFixed(0);
                    highlightInput(this.closest('.currency-container'));
                } else {
                    // For non-BTC currencies, keep the standard format without extra zeros
                    this.value = formatCurrency(inputValue, 8).replace(/(\.0+|0+)$/, '');
                }
            }

            // Trigger update on input change
            updateAllCurrencies();
        });
    
        // Prevent entering non-numeric characters except comma and period
        input.addEventListener('keypress', function (event) {
            if (!/[0-9.,]/.test(event.key) && !event.ctrlKey) {
                event.preventDefault();
            }
        });
    }
    
// commented out due to non-proper font size handling when starting typing in input

//     function adjustFontSize(input) {
//         const maxFontSize = 16;
//         const minFontSize = 10;
//         const step = 0.2;

//         input.style.fontSize = `${maxFontSize}px`;

//     // Check if the input's scrollWidth is greater than its clientWidth
//     // This means that the text is overflowing
//     while (input.scrollWidth > input.clientWidth && parseFloat(input.style.fontSize) > minFontSize) {
//         input.style.fontSize = `${parseFloat(input.style.fontSize) - step}px`;
//     }
    
//     // Ensure the font size does not reduce unnecessarily when input is not full
//     if (input.scrollWidth <= input.clientWidth) {
//         input.style.fontSize = `${maxFontSize}px`; // Reset to maximum font size if there's enough space
//     }
// }

    function initializeInputValidation() {
        const inputs = document.querySelectorAll('.currency-input');
        inputs.forEach(input => restrictInput(input));
    }

function populateCurrencyList(currencies) {
    currencyList.innerHTML = ''; // Clear existing list

    // First, add Bitcoin-derived units manually
    const btcDerivedUnits = {
        'msat': 'Millisatoshi',
        // 'SAT': 'Satoshi', - Should be excluded because BTC and SATs can not be swiped off the screen
        '𝑓BTC': 'finney',
        'μBTC': 'bit (Micro-Bitcoin)',
        'mBTC': 'millie (Milli-Bitcoin)',
        'cBTC': 'bitcent (Centi-Bitcoin)'
    };

    for (const [code, name] of Object.entries(btcDerivedUnits)) {
        const currencyItem = document.createElement('div');
        currencyItem.className = 'currency-item';
        currencyItem.textContent = `${name} (${code})`;
        currencyItem.onclick = function () {
            selectCurrency(code);
        };
        currencyList.appendChild(currencyItem);
    }

    // Then, add the rest of the currencies from the fetched data
    for (const [code, name] of Object.entries(currencies)) {
        // Optional: If you want to skip adding BTC itself, uncomment the next line
        if (code === 'BTC') continue;

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
        if (getCookie("cookieConsent") === "true") {
            saveUserSettings(); // Save user settings after adding a new currency
        }
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



    function getCookie(name) {
        const value = "; " + document.cookie;
        const parts = value.split("; " + name + "=");
        if (parts.length === 2) return parts.pop().split(";").shift();
    }
    
});
