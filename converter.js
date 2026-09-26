document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('converter');
    const currencyModal = document.getElementById('currencyModal');
    const currencyList = document.getElementById('currencyList');
    const currencySearch = document.getElementById('currencySearch');
    const currencyNoResults = document.getElementById('currencyNoResults');
    const deleteDrop = document.getElementById('currencyDeleteDrop');
    const apiKey = '6d0add5ffd6f427f97a0df5d04816c45';
    let selectedCurrency = null; // To store the selected currency
    let supportedCurrencies = {}; // To store currencies from currencies.json
    let exchangeRates = {}; // To store fetched exchange rates
    let updateTimeout; // For debouncing
    const CACHE_KEY = 'exchangeRatesCache';
    const CACHE_EXPIRY_KEY = 'exchangeRatesCacheExpiry';
    const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const USER_SETTINGS_KEY = 'userCurrencySettings'; // Key to store user settings
    const MAX_BTC_SUPPLY = 21000000; // Maximum supply of BTC
    const MAX_SAT_SUPPLY = MAX_BTC_SUPPLY * 100000000; // Maximum supply of SAT (21 million BTC in Satoshis)
    let settingsLoaded = false;
    let demoScheduled = false;
    let demoTimer;
    let demoObserver;
    let fadeFrame = null;
    let fadeSettleFrame = null;
    let draggedRow = null;
    let dragCanDelete = false;

    // Register these before Slip so editing a value never begins a drag.
    function protectInputFromDrag(event) {
        if (event.target.closest('.currency-input')) event.stopImmediatePropagation();
    }
    container.addEventListener('mousedown', protectInputFromDrag);
    container.addEventListener('touchstart', protectInputFromDrag, {passive: true});

    // A shorter hold keeps touch scrolling available while making a deliberate drag feel responsive.
    const slipInstance = new Slip(container, {reorderDelay: 180, autoScrollSpeed: 8});

    // Mouse users can drag immediately. Touch gets a short decision window for horizontal deletion swipes.
    container.addEventListener('slip:beforewait', function (event) {
        if (matchMedia('(pointer: fine)').matches) event.preventDefault();
    });

    function hideDeleteDrop() {
        deleteDrop.classList.remove('active', 'drop-ready');
        document.body.classList.remove('currency-delete-mode');
        draggedRow = null;
        dragCanDelete = false;
    }

    container.addEventListener('slip:beforereorder', function (event) {
        draggedRow = event.target.closest('.currency-container');
        const symbol = draggedRow?.querySelector('.currency-symbol')?.textContent;
        dragCanDelete = matchMedia('(pointer: fine)').matches && symbol !== 'BTC' && symbol !== 'SAT';
        if (dragCanDelete) {
            deleteDrop.classList.add('active');
            document.body.classList.add('currency-delete-mode');
        }
    });

    window.addEventListener('pointermove', function (event) {
        if (!dragCanDelete) return;
        const bounds = deleteDrop.getBoundingClientRect();
        const overTarget = event.clientX >= bounds.left && event.clientX <= bounds.right
            && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
        deleteDrop.classList.toggle('drop-ready', overTarget);
    }, {passive: true});

    window.addEventListener('pointerup', () => setTimeout(hideDeleteDrop, 0), {passive: true});

    // Prevent swipe gestures on certain conditions
    container.addEventListener('slip:beforeswipe', function (e) {
        const currencySymbolElement = e.target.closest('.currency-container')?.querySelector('.currency-symbol');
        if (!currencySymbolElement) return; // If no currency-symbol found, exit

        const currencySymbol = currencySymbolElement.textContent;
        if (currencySymbol === 'BTC' || currencySymbol === 'SAT') {
            e.preventDefault(); // Prevent swipe for BTC and SAT
        }
    });

    // Handle swipe-to-remove functionality
    container.addEventListener('slip:swipe', function (e) {
        const currencySymbolElement = e.target.closest('.currency-container')?.querySelector('.currency-symbol');
        if (!currencySymbolElement) return; // If no currency-symbol found, exit

        const currencySymbol = currencySymbolElement.textContent;
        if (currencySymbol === 'BTC' || currencySymbol === 'SAT') {
            e.preventDefault();
            return;
        }
        e.target.remove();
        syncCurrencyCheckboxes();
        if (getCookie("cookieConsent") === "true") {
            saveUserSettings(); // Save settings after removing a currency
        }
        updateAllCurrencies(); // Update currencies after removing one
        ensureFirstCurrencyVisible();
    });

    container.addEventListener('slip:reorder', function (e) {
        if (dragCanDelete && draggedRow === e.target && deleteDrop.classList.contains('drop-ready')) {
            e.target.remove();
            hideDeleteDrop();
            syncCurrencyCheckboxes();
            if (getCookie("cookieConsent") === "true") saveUserSettings();
            updateAllCurrencies();
            ensureFirstCurrencyVisible();
            return false;
        }
        e.target.parentNode.insertBefore(e.target, e.detail.insertBefore);
        trackScrollFadeWhileSettling();
        ensureFirstCurrencyVisible();

        // Add vibration feedback on mobile devices when reordering
        if (navigator.vibrate) {
            navigator.vibrate(50); // Vibrate for 50 milliseconds
        }

        if (getCookie("cookieConsent") === "true") {
            saveUserSettings(); // Save settings after reordering
        }
        updateAllCurrencies(); // Recalculate all currencies after reorder
        hideDeleteDrop();
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
            // consol.log('Using cached exchange rates:', exchangeRates);
            loadUserSettings(); // Load user settings after fetching rates
            updateAllCurrencies();
        } else {
            // Fetch new exchange rates from API
            const url = `https://openexchangerates.org/api/latest.json?app_id=${apiKey}&symbols=${currencyCodes.join(',')}`;

            fetch(url)
                .then(response => response.json())
                .then(data => {
                    exchangeRates = data.rates;
                    // consol.log('Fetched new exchange rates:', exchangeRates);
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
        syncCurrencyInputStates();
        scheduleScrollFade();
        if (updateTimeout) clearTimeout(updateTimeout); // Clear any existing timeout to avoid unnecessary updates
    
        // Debounce logic to avoid excessive calculations and updates
        updateTimeout = setTimeout(() => {
            const baseCurrencyContainer = container.querySelector('.currency-container:first-child .currency-symbol');
            const baseCurrency = baseCurrencyContainer ? baseCurrencyContainer.textContent : 'USD'; // Default base currency is USD
            const baseInput = container.querySelector('.currency-container:first-child .currency-input');
            const baseValue = parseFloat(baseInput.value.replace(/,/g, '')); // Parse base currency value as a float
    
            // Exit if the base value is not a valid number
            if (isNaN(baseValue)) return;
    
            // Check for BTC and SAT-specific caps and update the input value if necessary
            if (baseCurrency === 'BTC' && baseValue > MAX_BTC_SUPPLY) {
                baseInput.value = MAX_BTC_SUPPLY.toFixed(8); // Cap the BTC input to the maximum supply of BTC
                highlightInput(container.querySelector('.currency-container:first-child')); // Highlight the input if capped
            } else if (baseCurrency === 'SAT' && baseValue > MAX_SAT_SUPPLY) {
                baseInput.value = MAX_SAT_SUPPLY.toFixed(0); // Cap SAT input if it exceeds maximum SAT supply
                highlightInput(container.querySelector('.currency-container:first-child')); // Highlight the input if capped
            }
    
            // Retrieve latest exchange rates from localStorage
            const cachedRates = JSON.parse(localStorage.getItem('exchangeRatesCache')); 
            if (!cachedRates) return; // Exit if there are no cached exchange rates
    
            // Iterate through all the currency containers and update the values based on the base currency
            document.querySelectorAll('.currency-container').forEach((currencyContainer, index) => {
                const inputField = currencyContainer.querySelector('.currency-input');
                const currencySymbol = currencyContainer.querySelector('.currency-symbol').textContent;
    
                // Make the base currency input editable and skip further processing
                if (index === 0) {
                    fitCurrencyInput(inputField);
                    return;
                }
    
                // Conversion factors for smaller BTC-derived units (e.g., SAT, mBTC)
                const conversions = {
                    'msat': 100000000000, // Millisatoshi
                    'SAT': 100000000, // Satoshi
                    '𝑓BTC': 10000000, // finney
                    'μBTC': 1000000, // bit (Micro-Bitcoin)
                    'mBTC': 1000, // millie (Milli-Bitcoin)
                    'cBTC': 100 // bitcent (Centi-Bitcoin)
                };
    
                // When the base currency is BTC, convert BTC to other currencies
                if (baseCurrency === 'BTC') {
                    if (conversions[currencySymbol]) {
                        // Convert BTC to smaller units like SAT, msat, etc.
                        const convertedValue = baseValue * conversions[currencySymbol];
                        inputField.value = formatCurrency(convertedValue, 0); // No decimals for these units
                    } else if (cachedRates[currencySymbol]) {
                        // Convert BTC to fiat currencies using the exchange rate
                        const btcToUsdRate = cachedRates['BTC'];
                        const conversionRate = cachedRates[currencySymbol] / btcToUsdRate;
                        const newValue = baseValue * conversionRate;
                        inputField.value = formatCurrency(newValue, 2); // Show 2 decimals for fiat currencies
                    }
    
                // When converting other BTC units to BTC (e.g., SAT, μBTC, etc.)
                } else if (conversions[baseCurrency]) {
                    const btcValue = baseValue / conversions[baseCurrency]; // Convert to BTC
    
                    if (currencySymbol === 'BTC') {
                        // Convert small BTC units back to BTC
                        inputField.value = formatCurrency(btcValue, 8); // Display up to 8 decimals for BTC
                    } else if (conversions[currencySymbol]) {
                        // Convert small BTC units to other BTC-derived units
                        const convertedValue = btcValue * conversions[currencySymbol];
                        inputField.value = formatCurrency(convertedValue, 3); // No decimals for these conversions
                    } else if (cachedRates[currencySymbol]) {
                        // Convert small BTC units to fiat currencies
                        const btcToUsdRate = cachedRates['BTC'];
                        const conversionRate = cachedRates[currencySymbol] / btcToUsdRate;
                        const newValue = btcValue * conversionRate;
                        inputField.value = formatCurrency(newValue, 5); // Show up to 4 decimals for fiat currencies
                    }
    
                // When the target currency is BTC and converting from other fiat currencies
                } else if (currencySymbol === 'BTC') {
                    if (cachedRates['BTC'] && cachedRates[baseCurrency]) {
                        const conversionRate = cachedRates['BTC'] / cachedRates[baseCurrency]; // Conversion rate for BTC
                        let btcValue = baseValue * conversionRate;
                        if (btcValue > MAX_BTC_SUPPLY) {
                            btcValue = MAX_BTC_SUPPLY; // Cap BTC supply to the maximum allowed
                            highlightInput(currencyContainer);
                        }
                        inputField.value = formatCurrency(btcValue, 8); // Display up to 8 decimals for BTC
                    }
    
                // Convert fiat currencies to BTC-derived units
                } else if (conversions[currencySymbol]) {
                    if (cachedRates['BTC'] && cachedRates[baseCurrency]) {
                        const conversionRate = cachedRates['BTC'] / cachedRates[baseCurrency]; // Conversion rate to BTC
                        let btcValue = baseValue * conversionRate;
                        if (btcValue > MAX_BTC_SUPPLY) {
                            btcValue = MAX_BTC_SUPPLY; // Cap BTC supply
                            highlightInput(currencyContainer);
                        }
                        const convertedValue = btcValue * conversions[currencySymbol]; // Convert to target unit
                        inputField.value = formatCurrency(convertedValue, 2); // Display up to 2 decimals for units
                    }
    
                // General conversion between two fiat currencies
                } else if (cachedRates[baseCurrency] && cachedRates[currencySymbol]) {
                    const conversionRate = cachedRates[currencySymbol] / cachedRates[baseCurrency];
                    const newValue = baseValue * conversionRate; // Calculate the new value
                    inputField.value = formatCurrency(newValue, 4); // Display up to 4 decimals for fiat conversions
                }
                fitCurrencyInput(inputField);
            });
        }, 300); // Debounce timeout to delay excessive calculations
    }
    
    // function updateAllCurrencies() {
    //     if (updateTimeout) clearTimeout(updateTimeout); // Clear any existing timeout
    
    //     updateTimeout = setTimeout(() => { // Debounce logic to reduce excessive calculations
    //         const baseCurrencyContainer = container.querySelector('.currency-container:first-child .currency-symbol');
    //         const baseCurrency = baseCurrencyContainer ? baseCurrencyContainer.textContent : 'USD';
    //         const baseInput = container.querySelector('.currency-container:first-child .currency-input');
    //         const baseValue = parseFloat(baseInput.value.replace(/,/g, ''));
    
    //         if (isNaN(baseValue)) return; // If base value is not a number, exit
            
    
    //         if (baseCurrency === 'BTC' && baseValue > MAX_BTC_SUPPLY) {
    //             baseInput.value = MAX_BTC_SUPPLY.toFixed(8);
    //             highlightInput(container.querySelector('.currency-container:first-child'));
    //         } else if (baseCurrency === 'SAT' && baseValue > MAX_SAT_SUPPLY) {
    //             baseInput.value = MAX_SAT_SUPPLY.toFixed(0);
    //             highlightInput(container.querySelector('.currency-container:first-child'));
    //         }
    
    //         document.querySelectorAll('.currency-container').forEach((currencyContainer, index) => {
    //             const inputField = currencyContainer.querySelector('.currency-input');
    //             const currencySymbol = currencyContainer.querySelector('.currency-symbol').textContent;
    
    //             if (index === 0) {
    //                 inputField.readOnly = false; // Make the first input editable
    //                 return; // Skip further processing for the base currency
    //             }
    
    //             inputField.readOnly = true; // Make all other inputs read-only
    
    //             // Conversion logic for Bitcoin and related units
    //             const conversions = {
    //                 'msat': 100000000000, // Millisatoshi
    //                 'SAT': 100000000, // Satoshi
    //                 '𝑓BTC': 10000000, // finney
    //                 'μBTC': 1000000, // bit (Micro-Bitcoin)
    //                 'mBTC': 1000, // millie (Milli-Bitcoin)
    //                 'cBTC': 100 // bitcent (Centi-Bitcoin)
    //             };

    //             if (baseCurrency === 'BTC') {
    //                 if (conversions[currencySymbol]) {
    //                     const convertedValue = baseValue * conversions[currencySymbol];
    //                     inputField.value = formatCurrency(convertedValue, 0); // No decimals needed for these small units
    //                 } else if (exchangeRates[currencySymbol]) {
    //                     const btcToUsdRate = exchangeRates['BTC'];
    //                     const conversionRate = exchangeRates[currencySymbol] / btcToUsdRate;
    //                     const newValue = baseValue * conversionRate;
    //                     inputField.value = formatCurrency(newValue, 2);
    //                 }
    //             } else if (conversions[baseCurrency]) {
    //                 // Conversions from other BTC units to BTC
    //                 const btcValue = baseValue / conversions[baseCurrency];
    
    //                 if (currencySymbol === 'BTC') {
    //                     inputField.value = formatCurrency(btcValue, 8); // Up to 8 decimals for BTC
    //                 } else if (conversions[currencySymbol]) {
    //                     const convertedValue = btcValue * conversions[currencySymbol];
    //                     inputField.value = formatCurrency(convertedValue, 0); // No decimals needed
    //                 } else if (exchangeRates[currencySymbol]) {
    //                     const btcToUsdRate = exchangeRates['BTC'];
    //                     const conversionRate = exchangeRates[currencySymbol] / btcToUsdRate;
    //                     const newValue = btcValue * conversionRate;
    //                     inputField.value = formatCurrency(newValue, 4);
    //                 }
    //             } else if (currencySymbol === 'BTC') {
    //                 if (exchangeRates['BTC'] && exchangeRates[baseCurrency]) {
    //                     const conversionRate = exchangeRates['BTC'] / exchangeRates[baseCurrency];
    //                     let btcValue = baseValue * conversionRate;
    //                     if (btcValue > MAX_BTC_SUPPLY) {
    //                         btcValue = MAX_BTC_SUPPLY;
    //                         highlightInput(currencyContainer);
    //                     }
    //                     inputField.value = formatCurrency(btcValue, 8);
    //                 }
    //             } else if (conversions[currencySymbol]) {
    //                 // Convert fiat to Bitcoin units
    //                 if (exchangeRates['BTC'] && exchangeRates[baseCurrency]) {
    //                     const conversionRate = exchangeRates['BTC'] / exchangeRates[baseCurrency];
    //                     let btcValue = baseValue * conversionRate;
    //                     if (btcValue > MAX_BTC_SUPPLY) {
    //                         btcValue = MAX_BTC_SUPPLY;
    //                         highlightInput(currencyContainer);
    //                     }
    //                     const convertedValue = btcValue * conversions[currencySymbol];
    //                     inputField.value = formatCurrency(convertedValue, 2); // No decimals needed
    //                 }
    //             } else if (exchangeRates[baseCurrency] && exchangeRates[currencySymbol]) {
    //                 const conversionRate = exchangeRates[currencySymbol] / exchangeRates[baseCurrency];
    //                 const newValue = baseValue * conversionRate;
    //                 inputField.value = formatCurrency(newValue, 4);
    //             }
    //         });
    //     }, 300); // Adjust the delay as necessary
    // }

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

    function fitCurrencyInput(input) {
        const characterCount = Math.max(Array.from(input.value || '0').length, 1);
        input.style.setProperty('--currency-value-width', `calc(${characterCount}ch + 10px)`);
    }

    function syncCurrencyInputStates() {
        container.querySelectorAll('.currency-input').forEach((input, index) => {
            input.readOnly = index !== 0;
            fitCurrencyInput(input);
        });
    }

    function restrictInput(input) {
        if (input.dataset.validationReady === 'true') return;
        input.dataset.validationReady = 'true';
        input.addEventListener('input', function () {
            // Allow only numbers and periods (dot) in the input
            this.value = this.value.replace(/[^0-9.]/g, '');
    
            // Ensure only one period (dot) is allowed in the input
            if ((this.value.match(/\./g) || []).length > 1) {
                this.value = this.value.substring(0, this.value.length - 1);
            }
    
            // Prevent multiple leading zeros unless followed by a decimal point
            if (this.value.startsWith('0') && this.value.length > 1 && this.value[1] !== '.') {
                // Remove leading zeros unless followed by a decimal
                this.value = this.value.replace(/^0+/, '');
            }
    
            // If the input is empty or a single dot, do nothing and wait for valid input
            if (this.value === '' || this.value === '.') {
                fitCurrencyInput(this);
                updateAllCurrencies();
                return;
            }
    
            let inputValue = parseFloat(this.value); // Parse the input value to a number
    
            // Proceed only if the parsed value is a valid number
            if (!isNaN(inputValue)) {
                const currencySymbol = this.closest('.currency-container').querySelector('.currency-symbol').textContent;
    
                // Check and cap values based on the currency symbol
                if (currencySymbol === 'BTC') {
                    if (inputValue > MAX_BTC_SUPPLY) {
                        this.value = MAX_BTC_SUPPLY.toFixed(8);
                        highlightInput(this.closest('.currency-container'));
                    } else if (this.value.includes('.')) {
                        // Allow up to 8 decimal places for BTC only when the input contains a dot
                        let decimals = this.value.split('.')[1].length;
                        if (decimals > 8) {
                            // Limit the decimals to 8 if user tries to input more
                            this.value = this.value.slice(0, this.value.indexOf('.') + 9);
                        }
                    }
                } else if (currencySymbol === 'SAT') {
                    // Satoshis should not have any decimal places
                    this.value = Math.floor(inputValue).toString();
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
                }

             // // Adjust the font size based on input content width
             // adjustFontSize(this);


                fitCurrencyInput(this);
                // Trigger update on input change for valid numbers
                updateAllCurrencies();
            } else {

             // // Adjust the font size based on input content width
             // adjustFontSize(this);


                fitCurrencyInput(this);
                // If input is invalid (like just a dot or incorrect format), clear the input or handle accordingly
                updateAllCurrencies(); // Ensure currencies are updated if the input is cleared or invalid
            }
        });
    
        // Prevent entering non-numeric characters except for period (dot)
        input.addEventListener('keypress', function (event) {
            if (!/[0-9.]/.test(event.key) && !event.ctrlKey) {
                event.preventDefault();
            }
    
            // Prevent multiple periods (dots) from being entered
            if (event.key === '.' && this.value.includes('.')) {
                event.preventDefault();
            }
        });
    }
    
// commented out due to non-proper font size handling when starting typing in input

// function adjustFontSize(input) {
//     const maxFontSizeEm = 1.3;  // Maximum font size in em
//     const minFontSizeEm = 0.5;  // Minimum font size in em
//     const step = 0.05;  // Step size for smooth adjustment
    

//     // Get the current font size in em units
//     let currentFontSizeEm = parseFloat(window.getComputedStyle(input).fontSize) / parseFloat(getComputedStyle(document.documentElement).fontSize);

//     // Calculate the maximum width the text can occupy without overflowing
//     const inputWidth = input.clientWidth;

//     // Check if the text fits within the input's visible width
//     if (input.scrollWidth <= inputWidth) {
//         // If the text fits and the current font size is less than the maximum, increase the font size
//         if (currentFontSizeEm < maxFontSizeEm) {
//             input.style.fontSize = `${Math.min(maxFontSizeEm, currentFontSizeEm + step)}em`;
//         }
//     } else {
//         // If the text overflows the left edge, reduce the font size
//         if (currentFontSizeEm > minFontSizeEm) {
//             input.style.fontSize = `${Math.max(minFontSizeEm, currentFontSizeEm - step)}em`;
//         }
//     }
// }


function initializeInputValidation() {
    const inputs = document.querySelectorAll('.currency-input');
    inputs.forEach(input => {
        restrictInput(input);
        fitCurrencyInput(input);
    });
}

function populateCurrencyList(currencies) {
    currencyList.innerHTML = ''; // Clear existing list

    function appendCurrency(code, name, isProtected = false) {
        const currencyItem = document.createElement('label');
        currencyItem.className = 'currency-item';
        currencyItem.dataset.code = code;
        currencyItem.dataset.search = `${code} ${name}`.toLocaleLowerCase();
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'currency-checkbox';
        checkbox.disabled = isProtected;
        checkbox.setAttribute('aria-label', `${name} (${code})`);
        const text = document.createElement('span');
        text.textContent = `${name} (${code})`;
        currencyItem.append(checkbox, text);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedCurrency = code;
                addCurrencyContainer();
            } else {
                removeCurrencyContainer(code);
            }
        });
        currencyList.appendChild(currencyItem);
    }

    appendCurrency('BTC', 'Bitcoin', true);
    appendCurrency('SAT', 'Satoshi', true);

    // First, add Bitcoin-derived units manually
    const btcDerivedUnits = {
        'msat': 'Millisatoshi',
        // 'SAT': 'Satoshi', - Should be excluded from the currency list because BTC and SATs can not be swiped off the screen
        '𝑓BTC': 'finney',
        'μBTC': 'bit (Micro-Bitcoin)',
        'mBTC': 'millie (Milli-Bitcoin)',
        'cBTC': 'bitcent (Centi-Bitcoin)'
    };

    for (const [code, name] of Object.entries(btcDerivedUnits)) {
        appendCurrency(code, name);
    }

    // Then, add the rest of the currencies from the fetched data
    for (const [code, name] of Object.entries(currencies)) {
        // Optional: If you want to skip adding BTC itself, uncomment the next line
        if (code === 'BTC' || code === 'SAT') continue;

        appendCurrency(code, name);
    }
    syncCurrencyCheckboxes();
    filterCurrencyList();
}

    function getSelectedCurrencyCodes() {
        return new Set([...container.querySelectorAll('.currency-symbol')].map(symbol => symbol.textContent));
    }

    function syncCurrencyCheckboxes() {
        const selected = getSelectedCurrencyCodes();
        currencyList.querySelectorAll('.currency-item').forEach(item => {
            const checkbox = item.querySelector('.currency-checkbox');
            checkbox.checked = checkbox.disabled || selected.has(item.dataset.code);
        });
    }

    function removeCurrencyContainer(currency) {
        if (currency === 'BTC' || currency === 'SAT') return;
        container.querySelectorAll('.currency-container').forEach(row => {
            if (row.querySelector('.currency-symbol')?.textContent === currency) row.remove();
        });
        syncCurrencyCheckboxes();
        if (getCookie("cookieConsent") === "true") saveUserSettings();
        updateAllCurrencies();
        ensureFirstCurrencyVisible();
    }

    function filterCurrencyList() {
        const query = currencySearch.value.trim().toLocaleLowerCase();
        let visibleCount = 0;
        currencyList.querySelectorAll('.currency-item').forEach(item => {
            const matches = !query || item.dataset.search.includes(query);
            item.hidden = !matches;
            if (matches) visibleCount++;
        });
        currencyNoResults.hidden = visibleCount !== 0;
        currencyList.scrollTop = 0;
    }

    currencySearch.addEventListener('input', filterCurrencyList);
    currencySearch.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeCurrencyModal();
            return;
        }
        if (event.key !== 'Enter') return;
        const query = currencySearch.value.trim().toLocaleLowerCase();
        const visibleItems = [...currencyList.querySelectorAll('.currency-item:not([hidden])')];
        const match = visibleItems.find(item => item.dataset.code.toLocaleLowerCase() === query) || visibleItems[0];
        if (match) {
            event.preventDefault();
            const checkbox = match.querySelector('.currency-checkbox');
            if (!checkbox.checked) {
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change', {bubbles: true}));
            }
            closeCurrencyModal();
        }
    });

    window.openCurrencyModal = function () {
        syncCurrencyCheckboxes();
        currencyModal.style.display = 'block';
        requestAnimationFrame(() => {
            currencySearch.focus();
            currencySearch.select();
        });
    };

    window.closeCurrencyModal = function () {
        currencyModal.style.display = 'none';
        currencySearch.value = '';
        filterCurrencyList();
    };

    window.selectCurrency = function (currency) {
        if (getSelectedCurrencyCodes().has(currency)) {
            closeCurrencyModal();
            return;
        }
        selectedCurrency = currency;  // Store selected currency
        // consol.log(`Selected currency: ${selectedCurrency}`);
        closeCurrencyModal();
        addCurrencyContainer();  // Call to add the container after currency selection
    };

    // Make updateAllCurrencies available globally
    window.updateAllCurrencies = updateAllCurrencies;

    window.addCurrencyContainer = function () {
        if (!selectedCurrency) {
            console.error('No currency selected. Cannot add container.');
            return;
        }
        if (getSelectedCurrencyCodes().has(selectedCurrency)) {
            selectedCurrency = null;
            syncCurrencyCheckboxes();
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
        syncCurrencyCheckboxes();
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
        if (settingsLoaded) return;
        settingsLoaded = true;
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
            ['BTC', 'SAT'].forEach(currency => {
                if (getSelectedCurrencyCodes().has(currency)) return;
                selectedCurrency = currency;
                addCurrencyContainer();
            });
        }
        scheduleReorderDemo();
    }

    function stopReorderDemo() {
        clearTimeout(demoTimer);
        demoObserver?.disconnect();
        demoObserver = null;
        container.classList.remove('converter-demo');
        container.querySelectorAll('.converter-demo-card').forEach(card => {
            card.classList.remove('converter-demo-card');
            card.style.removeProperty('--demo-y');
        });
    }

    function scheduleReorderDemo() {
        if (demoScheduled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        demoScheduled = true;
        const startDemo = () => {
            const cards = [...container.querySelectorAll('.currency-container')];
            if (cards.length < 2) return;
            const first = cards[0];
            const second = cards[Math.min(2, cards.length - 1)];
            const distance = second.offsetTop - first.offsetTop;
            first.style.setProperty('--demo-y', `${distance}px`);
            second.style.setProperty('--demo-y', `${-distance}px`);
            first.classList.add('converter-demo-card');
            second.classList.add('converter-demo-card');
            container.classList.add('converter-demo');
            first.addEventListener('animationend', stopReorderDemo, {once: true});
        };
        const queueDemo = () => { demoTimer = setTimeout(startDemo, 550); };
        const consentModal = document.getElementById('cookieConsentModal');
        if (consentModal?.classList.contains('active')) {
            demoObserver = new MutationObserver(() => {
                if (consentModal.classList.contains('active')) return;
                demoObserver.disconnect();
                demoObserver = null;
                queueDemo();
            });
            demoObserver.observe(consentModal, {attributes: true, attributeFilter: ['class']});
        } else {
            queueDemo();
        }
    }

    container.addEventListener('pointerdown', stopReorderDemo, {capture: true});

    function updateScrollFade() {
        fadeFrame = null;
        const {controlBottom, fadeDistance} = getFadeBoundary();
        container.querySelectorAll('.currency-container').forEach(card => {
            const opacity = Math.max(0, Math.min(1, (card.getBoundingClientRect().top - controlBottom) / fadeDistance));
            card.style.setProperty('--scroll-fade', opacity.toFixed(3));
            card.style.pointerEvents = opacity < .08 ? 'none' : '';
        });
    }

    function getFadeBoundary() {
        const controls = ['#toggle', '#toggle-button', '.add-currency-icon']
            .map(selector => document.querySelector(selector))
            .filter(Boolean);
        const controlBottom = Math.max(...controls.map(control => control.getBoundingClientRect().bottom)) + 4;
        const fadeDistance = 28;
        return {controlBottom, fadeDistance};
    }

    function scheduleScrollFade() {
        if (fadeFrame === null) fadeFrame = requestAnimationFrame(updateScrollFade);
    }

    function trackScrollFadeWhileSettling() {
        cancelAnimationFrame(fadeSettleFrame);
        const startedAt = performance.now();
        const refresh = now => {
            updateScrollFade();
            if (now - startedAt < 280) fadeSettleFrame = requestAnimationFrame(refresh);
        };
        fadeSettleFrame = requestAnimationFrame(refresh);
    }

    function ensureFirstCurrencyVisible() {
        setTimeout(() => {
            const first = container.querySelector('.currency-container');
            if (!first) return;
            const {controlBottom, fadeDistance} = getFadeBoundary();
            const targetTop = controlBottom + fadeDistance + 4;
            const bounds = first.getBoundingClientRect();
            if (bounds.top >= targetTop && bounds.bottom <= innerHeight) return;
            window.scrollBy({
                top: bounds.top - targetTop,
                behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            });
        }, 240);
    }

    window.addEventListener('scroll', scheduleScrollFade, {passive: true});
    window.addEventListener('resize', scheduleScrollFade);

    initializeInputValidation();
    syncCurrencyInputStates();
    loadUserSettings();
    fetchSupportedCurrencies(); // Fetch the supported currencies and exchange rates
    updateScrollFade();



    function getCookie(name) {
        const value = "; " + document.cookie;
        const parts = value.split("; " + name + "=");
        if (parts.length === 2) return parts.pop().split(";").shift();
    }
    
});
