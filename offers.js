// Configuration
const CONFIG = {
    // Using CORS proxy to bypass browser restrictions
    HODLHODL_API_BASE: 'https://corsproxy.io/?https://hodlhodl.com/api/v1',
    // Alternative proxies you can try:
    // HODLHODL_API_BASE: 'https://api.allorigins.win/raw?url=https://hodlhodl.com/api/v1',
    // HODLHODL_API_BASE: 'https://cors-anywhere.herokuapp.com/https://hodlhodl.com/api/v1',
    PAYMENT_METHODS_API: 'https://corsproxy.io/?https://hodlhodl.com/api/v1/payment_methods',
    REFERRAL_LINK: 'https://hodlhodl.com/join/L4HT',
    DEFAULT_CURRENCY: 'USD',
    DEFAULT_SIDE: 'sell',
    OFFERS_LIMIT: 100, // Increased to maximum allowed
    MAX_OFFERS: 420 // Total offers we want to load
};

// Helper function to get currency name from code
function getCurrencyName(currencyCode) {
    const currencyNames = {
        'USD': 'US Dollar',
        'EUR': 'Euro',
        'GBP': 'British Pound',
        'CAD': 'Canadian Dollar',
        'JPY': 'Japanese Yen',
        'BRL': 'Brazilian Real',
        'RUB': 'Russian Ruble',
        'THB': 'Thai Baht',
        'AUD': 'Australian Dollar',
        'INR': 'Indian Rupee',
        'ZAR': 'South African Rand',
        'TRY': 'Turkish Lira',
        'MXN': 'Mexican Peso',
        'NGN': 'Nigerian Naira',
        'AED': 'UAE Dirham',
        'COP': 'Colombian Peso',
        'DOP': 'Dominican Peso',
        'KES': 'Kenyan Shilling',
        'PHP': 'Philippine Peso',
        'GEL': 'Georgian Lari',
        'SEK': 'Swedish Krona',
        'ARS': 'Argentine Peso',
        'IDR': 'Indonesian Rupiah',
        'PLN': 'Polish Zloty',
        'UAH': 'Ukrainian Hryvnia',
        'CNY': 'Chinese Yuan',
        'CHF': 'Swiss Franc',
        'MYR': 'Malaysian Ringgit',
        'PEN': 'Peruvian Sol',
        'VND': 'Vietnamese Dong',
        'BDT': 'Bangladeshi Taka',
        'CLP': 'Chilean Peso',
        'CRC': 'Costa Rican Colón',
        'CZK': 'Czech Koruna',
        'DKK': 'Danish Krone',
        'HUF': 'Hungarian Forint',
        'ILS': 'Israeli Shekel',
        'KRW': 'South Korean Won',
        'KWD': 'Kuwaiti Dinar',
        'LKR': 'Sri Lankan Rupee',
        'NZD': 'New Zealand Dollar',
        'PKR': 'Pakistani Rupee',
        'RON': 'Romanian Leu',
        'TWD': 'Taiwan Dollar',
        'SGD': 'Singapore Dollar',
        'ISK': 'Icelandic Króna',
        'HKD': 'Hong Kong Dollar',
        'NOK': 'Norwegian Krone',
        'SAR': 'Saudi Riyal',
        'QAR': 'Qatari Riyal',
        'EGP': 'Egyptian Pound',
        'MAD': 'Moroccan Dirham',
        'XAF': 'Central African CFA Franc',
        'XOF': 'West African CFA Franc',
        'BGN': 'Bulgarian Lev',
        'HRK': 'Croatian Kuna',
        'RSD': 'Serbian Dinar',
        'BHD': 'Bahraini Dinar',
        'OMR': 'Omani Rial',
        'JOD': 'Jordanian Dinar',
        'LBP': 'Lebanese Pound',
        'IRR': 'Iranian Rial',
        'IQD': 'Iraqi Dinar',
        'AFN': 'Afghan Afghani',
        'AMD': 'Armenian Dram',
        'AZN': 'Azerbaijani Manat',
        'BYN': 'Belarusian Ruble',
        'GHS': 'Ghanaian Cedi',
        'ETB': 'Ethiopian Birr',
        'TZS': 'Tanzanian Shilling',
        'UGX': 'Ugandan Shilling',
        'MZN': 'Mozambican Metical',
        'AOA': 'Angolan Kwanza',
        'XPF': 'CFP Franc',
        'FJD': 'Fijian Dollar',
        'PGK': 'Papua New Guinean Kina',
        'WST': 'Samoan Tala',
        'TOP': 'Tongan Paʻanga',
        'VUV': 'Vanuatu Vatu',
        'SBD': 'Solomon Islands Dollar',
        'ZMW': 'Zambian Kwacha',
        'BWP': 'Botswana Pula',
        'NAD': 'Namibian Dollar',
        'LSL': 'Lesotho Loti',
        'SZL': 'Swazi Lilangeni',
        'MUR': 'Mauritian Rupee',
        'SCR': 'Seychellois Rupee',
        'DJF': 'Djiboutian Franc',
        'KMF': 'Comorian Franc',
        'MGA': 'Malagasy Ariary',
        'CDF': 'Congolese Franc',
        'RWF': 'Rwandan Franc',
        'BIF': 'Burundian Franc',
        'GMD': 'Gambian Dalasi',
        'GNF': 'Guinean Franc',
        'SLL': 'Sierra Leonean Leone',
        'LRD': 'Liberian Dollar',
        'GIP': 'Gibraltar Pound',
        'FKP': 'Falkland Islands Pound',
        'SHP': 'Saint Helena Pound',
        'JMD': 'Jamaican Dollar',
        'BBD': 'Barbadian Dollar',
        'BZD': 'Belize Dollar',
        'BMD': 'Bermudian Dollar',
        'KYD': 'Cayman Islands Dollar',
        'TTD': 'Trinidad and Tobago Dollar',
        'XCD': 'East Caribbean Dollar',
        'AWG': 'Aruban Florin',
        'ANG': 'Netherlands Antillean Guilder',
        'UYU': 'Uruguayan Peso',
        'PYG': 'Paraguayan Guaraní',
        'BOB': 'Bolivian Boliviano',
        'GYD': 'Guyanese Dollar',
        'SRD': 'Surinamese Dollar',
        'CUP': 'Cuban Peso',
        'CUC': 'Cuban Convertible Peso',
        'HTG': 'Haitian Gourde',
        'NIO': 'Nicaraguan Córdoba',
        'HNL': 'Honduran Lempira',
        'SVC': 'Salvadoran Colón',
        'GTQ': 'Guatemalan Quetzal',
        'PAB': 'Panamanian Balboa',
        'BSD': 'Bahamian Dollar',
        'BND': 'Brunei Dollar',
        'KHR': 'Cambodian Riel',
        'LAK': 'Laotian Kip',
        'MMK': 'Myanmar Kyat',
        'MNT': 'Mongolian Tögrög',
        'NPR': 'Nepalese Rupee',
        'BTN': 'Bhutanese Ngultrum',
        'MVR': 'Maldivian Rufiyaa',
        'YER': 'Yemeni Rial',
        'SYP': 'Syrian Pound',
        'JEP': 'Jersey Pound',
        'GGP': 'Guernsey Pound',
        'IMP': 'Isle of Man Pound',
        'ALK': 'Albanian Lek',
        'BAM': 'Bosnia-Herzegovina Convertible Mark',
        'MKD': 'Macedonian Denar',
        'MDL': 'Moldovan Leu',
        'ALL': 'Albanian Lek',
        'GIP': 'Gibraltar Pound'
    };
    
    return currencyNames[currencyCode] || currencyCode;
}

// Global variables
let currentBtcPrice = 0;
let allOffers = []; // Store all loaded offers
let currentOffset = 0;
let isLoadingMore = false;
let availablePaymentMethods = new Map(); // Use Map to avoid duplicates by ID
// Global variable to track if we've loaded initial payment methods
let initialPaymentMethodsLoaded = false;


// DOM elements
const elements = {
    offersContainer: document.getElementById('offersContainer'),
    loading: document.getElementById('loading'),
    error: document.getElementById('error'),
    currentPrice: document.getElementById('currentPrice'),
    sideFilter: document.getElementById('sideFilter'),
    currencyFilter: document.getElementById('currencyFilter'),
    countryFilter: document.getElementById('countryFilter'),
    paymentMethodFilter: document.getElementById('paymentMethodFilter'),
    amountFilter: document.getElementById('amountFilter'),
    refreshBtn: document.getElementById('refreshBtn')
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();

    // Add load more button event listener
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => loadOffers(false));
    }
});

// Event listeners
elements.refreshBtn.addEventListener('click', loadOffers);
elements.sideFilter.addEventListener('change', loadOffers);
elements.currencyFilter.addEventListener('change', function() {
    // Update the price display AND reload offers with new currency
    updateCurrentPriceDisplay();
    loadOffers(true); // true = first load (reset offers)
});
elements.countryFilter.addEventListener('change', loadOffers);
elements.paymentMethodFilter.addEventListener('change', loadOffers);
elements.amountFilter.addEventListener('input', function() {
    // Add slight delay to avoid too many API calls while typing
    clearTimeout(window.amountFilterTimeout);
    window.amountFilterTimeout = setTimeout(() => {
        loadOffers(true);
    }, 1500);
});

// initializeApp to load first batch
async function initializeApp() {
    try {
        // Clear payment method dropdown initially
        elements.paymentMethodFilter.innerHTML = '<option value="">All Payment Methods</option>';
        
        // Load currencies and countries first (no auth required)
        await Promise.all([
            loadCurrencies(),
            loadCountries(),
            populatePaymentMethodDropdown() // Load from API now
        ]);
        
        // Try to get current BTC price, but don't fail the whole app if it fails
        try {
            await getCurrentBtcPrice();
        } catch (priceError) {
            console.warn('BTC price fetch failed, but continuing without prices:', priceError.message);
            // Show message to user
            elements.currentPrice.innerHTML = `
                <div style="color: #e74c3c; text-align: center;">
                    ⚠️ Current BTC price unavailable - offers will show without spread calculation
                </div>
            `;
        }
        
        // Then load first batch of offers (which will populate payment methods)
        await loadOffers(true);
        
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to load application. Please refresh the page to try again.');
    }
}

// New function to fetch payment methods from API
async function fetchPaymentMethodsFromAPI() {
    try {
        console.log('🔄 Fetching payment methods from HodlHodl API...');
        
        const proxyUrl = CONFIG.PAYMENT_METHODS_API;
        
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });

        console.log('Payment methods API response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`Payment methods API failed with status ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Payment methods API response:', data);
        
        if (data.status === 'success') {
            return data.payment_methods || [];
        } else {
            throw new Error('Payment methods API returned error status');
        }
        
    } catch (error) {
        console.error('Error fetching payment methods from API:', error);
        return []; // Return empty array if API fails
    }
}

// Updated populatePaymentMethodDropdown to use API data
async function populatePaymentMethodDropdown() {
    const paymentMethodFilter = elements.paymentMethodFilter;
    
    console.log('🔄 Populating payment method dropdown from API...');
    
    // Clear existing options
    paymentMethodFilter.innerHTML = '<option value="">All Payment Methods</option>';
    
    try {
        // Fetch payment methods from API
        const paymentMethods = await fetchPaymentMethodsFromAPI();
        
        if (paymentMethods.length > 0) {
            console.log(`✅ Loaded ${paymentMethods.length} payment methods from API`);
            
            // Sort by type and name
            const sortedMethods = paymentMethods.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type.localeCompare(b.type);
                }
                return a.name.localeCompare(b.name);
            });
            
            // Group by type for better organization
            const methodsByType = {};
            sortedMethods.forEach(method => {
                if (!methodsByType[method.type]) {
                    methodsByType[method.type] = [];
                }
                methodsByType[method.type].push(method);
            });
            
            // Add optgroups for each payment type
            Object.keys(methodsByType).sort().forEach(type => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = `${type} (${methodsByType[type].length})`;
                
                methodsByType[type].forEach(method => {
                    const option = document.createElement('option');
                    option.value = method.id;
                    option.textContent = `${method.name} ${method.global ? '🌍' : `[${method.country_codes?.join(',') || 'Local'}]`}`;
                    option.title = `${method.type} - ${method.name} ${method.global ? '(Global)' : `(Countries: ${method.country_codes?.join(', ') || 'Local'})`}`;
                    optgroup.appendChild(option);
                });
                
                paymentMethodFilter.appendChild(optgroup);
            });
            
            console.log(`✅ Populated dropdown with ${paymentMethods.length} payment methods in ${Object.keys(methodsByType).length} categories`);
            
        } else {
            console.warn('❌ No payment methods loaded from API, falling back to offer extraction');
            // Fallback to our existing extraction method
            populatePaymentMethodDropdownFromOffers();
        }
        
    } catch (error) {
        console.error('Error populating payment method dropdown:', error);
        // Fallback to our existing extraction method
        populatePaymentMethodDropdownFromOffers();
    }
}

// Keep the old function as fallback
function populatePaymentMethodDropdownFromOffers() {
    const paymentMethodFilter = elements.paymentMethodFilter;
    
    if (availablePaymentMethods.size > 0) {
        const sortedMethods = Array.from(availablePaymentMethods.values()).sort((a, b) => 
            a.name.localeCompare(b.name)
        );
        
        sortedMethods.forEach(method => {
            const option = document.createElement('option');
            option.value = method.id;
            option.textContent = `${method.name} - ${method.type}`;
            paymentMethodFilter.appendChild(option);
        });
        
        console.log(`✅ Populated dropdown with ${availablePaymentMethods.size} payment methods from offers`);
    }
}

function extractPaymentMethodsFromOffers(offers) {
    console.log('🔍 === PAYMENT METHOD EXTRACTION START ===');
    console.log(`Processing ${offers.length} offers for payment methods...`);
    
    let sellOffersCount = 0;
    let buyOffersCount = 0;
    let sellMethodsFound = 0;
    let buyMethodsFound = 0;
    let newMethodsCount = 0;
    
    offers.forEach((offer, index) => {
        let paymentMethods = [];
        let source = '';
        
        if (offer.side === 'sell') {
            sellOffersCount++;
            paymentMethods = offer.payment_method_instructions || [];
            source = 'payment_method_instructions';
        } else if (offer.side === 'buy') {
            buyOffersCount++;
            paymentMethods = offer.payment_methods || [];
            source = 'payment_methods';
        }
        
        console.log(`\n📦 Offer ${index + 1}/${offers.length} (${offer.side.toUpperCase()})`);
        console.log(`   Source: ${source}`);
        console.log(`   Methods found: ${paymentMethods.length}`);
        
        if (paymentMethods.length > 0) {
            console.log(`   Method details:`, paymentMethods);
        } else {
            console.log(`   ❌ No payment methods found in this offer`);
        }
        
        if (paymentMethods && Array.isArray(paymentMethods)) {
            paymentMethods.forEach(paymentMethod => {
                let methodId, methodName, methodType;
                
                if (offer.side === 'sell') {
                    methodId = paymentMethod.payment_method_id;
                    methodName = paymentMethod.payment_method_name;
                    methodType = paymentMethod.payment_method_type || 'Unknown';
                    sellMethodsFound++;
                } else if (offer.side === 'buy') {
                    methodId = paymentMethod.id;
                    methodName = paymentMethod.name;
                    methodType = paymentMethod.type || 'Unknown';
                    buyMethodsFound++;
                }
                
                if (methodId && methodName) {
                    if (!availablePaymentMethods.has(methodId)) {
                        availablePaymentMethods.set(methodId, {
                            id: methodId,
                            name: methodName,
                            type: methodType
                        });
                        newMethodsCount++;
                        console.log(`   ✅ NEW: ${methodName} (${methodType}) - ID: ${methodId}`);
                    } else {
                        console.log(`   ⏩ DUPLICATE: ${methodName} - ID: ${methodId}`);
                    }
                } else {
                    console.log(`   ❌ INVALID: Missing ID or Name`, paymentMethod);
                }
            });
        }
    });
    
    console.log('\n📊 === EXTRACTION SUMMARY ===');
    console.log(`Total offers processed: ${offers.length}`);
    console.log(`Sell offers: ${sellOffersCount}`);
    console.log(`Buy offers: ${buyOffersCount}`);
    console.log(`Payment methods from sell offers: ${sellMethodsFound}`);
    console.log(`Payment methods from buy offers: ${buyMethodsFound}`);
    console.log(`New unique methods added: ${newMethodsCount}`);
    console.log(`Total unique payment methods found: ${availablePaymentMethods.size}`);
    console.log('🔍 === PAYMENT METHOD EXTRACTION END ===\n');
    
    // Log all unique payment methods found
    console.log('🎯 UNIQUE PAYMENT METHODS:');
    availablePaymentMethods.forEach((method, id) => {
        console.log(`   ${method.name} - ${method.type} (ID: ${id})`);
    });
    
    // Only populate dropdown on first load OR when we have new methods
    if (!initialPaymentMethodsLoaded || newMethodsCount > 0) {
        populatePaymentMethodDropdown();
        initialPaymentMethodsLoaded = true;
    }
}

// Load currencies from HodlHodl API (no authentication required)
async function loadCurrencies() {
    try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent('https://hodlhodl.com/api/v1/currencies')}`;
        
        console.log('Fetching currencies from:', proxyUrl);
        
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`Currency API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Currencies API Response:', data);
        
        if (data.status === 'success') {
            populateCurrencyDropdown(data.currencies);
        } else {
            throw new Error('Currency API returned error status');
        }
        
    } catch (error) {
        console.error('Error loading currencies:', error);
        throw error; // No fallback, let it fail
    }
}

// Load countries from HodlHodl API (let's try without authentication)
async function loadCountries() {
    try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent('https://hodlhodl.com/api/v1/countries')}`;
        
        console.log('Fetching countries from:', proxyUrl);
        
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });

        console.log('Countries response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`Countries API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Countries API Response:', data);
        
        if (data.status === 'success') {
            populateCountryDropdown(data.countries);
        } else {
            throw new Error('Countries API returned error status');
        }
        
    } catch (error) {
        console.error('Error loading countries:', error);
        throw error; // No fallback, let it fail
    }
}

// Populate currency dropdown with API data
function populateCurrencyDropdown(currencies) {
    const currencyFilter = elements.currencyFilter;
    currencyFilter.innerHTML = '<option value="">All Currencies</option>';
    
    // Filter for fiat currencies only (since we're dealing with BTC/fiat pairs)
    const fiatCurrencies = currencies.filter(currency => currency.type === 'fiat');

    console.log('=== CURRENCIES DEBUG ===');
    console.log('All currencies from API:', currencies);
    console.log('Fiat currencies only:', fiatCurrencies);
    console.log('Currency dropdown options before:', currencyFilter.innerHTML);

    
    fiatCurrencies.forEach(currency => {
        const option = document.createElement('option');
        option.value = currency.code;
        option.textContent = `${currency.code} - ${currency.name}`;
        
        // Set USD as default
        if (currency.code === CONFIG.DEFAULT_CURRENCY) {
            option.selected = true;
        }
        
        currencyFilter.appendChild(option);
    });
    
    console.log('Currency dropdown options after:', currencyFilter.innerHTML);
    console.log(`Loaded ${fiatCurrencies.length} fiat currencies`);
    console.log('=== END CURRENCIES DEBUG ===');
}

// Populate country dropdown with API data
function populateCountryDropdown(countries) {
    const countryFilter = elements.countryFilter;

    console.log('=== COUNTRIES DEBUG ===');
    console.log('Countries from API:', countries);
    console.log('Country dropdown before:', countryFilter.innerHTML);
    
    // Keep only "All Countries" option, add API countries
    if (countries && countries.length > 0) {
        countries.forEach(country => {
            const option = document.createElement('option');
            option.value = country.code;
            option.textContent = `${country.name} (${country.code})`;
            countryFilter.appendChild(option);
        });
        
        console.log('Country dropdown after:', countryFilter.innerHTML);
        console.log(`Loaded ${countries.length} countries`);
    } else {
        console.warn('No countries loaded from API');
    }
    console.log('=== END COUNTRIES DEBUG ===');
}


// Populate payment method dropdown (placeholder for now)
function populatePaymentMethodDropdown() {
    const paymentMethodFilter = elements.paymentMethodFilter;

    console.log('=== PAYMENT METHODS DEBUG ===');
    console.log('Available payment methods:', Array.from(availablePaymentMethods.values()));
    console.log('Payment method dropdown before:', paymentMethodFilter.innerHTML);
    
    // Clear existing options except the first one
    const firstOption = paymentMethodFilter.querySelector('option[value=""]');
    paymentMethodFilter.innerHTML = '';
    if (firstOption) {
        paymentMethodFilter.appendChild(firstOption);
    } else {
        paymentMethodFilter.innerHTML = '<option value="">All Payment Methods</option>';
    }
    
    if (availablePaymentMethods.size > 0) {
        // Convert Map to Array and sort alphabetically by name
        const sortedMethods = Array.from(availablePaymentMethods.values()).sort((a, b) => 
            a.name.localeCompare(b.name)
        );
        
        sortedMethods.forEach(method => {
            const option = document.createElement('option');
            option.value = method.id;
            option.textContent = `${method.name} - ${method.type}`;
            paymentMethodFilter.appendChild(option);
        });
        
        console.log('Payment method dropdown after:', paymentMethodFilter.innerHTML);
        console.log(`Populated dropdown with ${availablePaymentMethods.size} payment methods`);
    } else {
        console.warn('No payment methods available to populate dropdown');
    }
    console.log('=== END PAYMENT METHODS DEBUG ===');
}

// Get current BTC price from a free API
// Get current BTC price from a free API
async function getCurrentBtcPrice() {
    try {
        // Split currencies into multiple requests to avoid rate limits
        const currencyGroups = [
            'usd,eur,gbp,cad,jpy,brl,rub,thb,aud,inr,zar,try,mxn,ngn,aed',
            'cop,dop,kes,php,gel,sek,ars,idr,pln,uah,cny,chf,myr,pen,vnd', 
            'bdt,clp,crc,czk,dkk,huf,ils,krw,kwd,lkr,nzd,pkr,ron,twd,sgd'
        ];
        
        currentBtcPrice = {};
        
        console.log('🔄 Fetching BTC prices from CoinGecko...');
        
        // Fetch groups sequentially with delay and proper error handling
        for (let i = 0; i < currencyGroups.length; i++) {
            try {
                console.log(`📡 Fetching currency group ${i + 1}/${currencyGroups.length}: ${currencyGroups[i]}`);
                
                const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=${currencyGroups[i]}`);
                
                if (!response.ok) {
                    console.warn(`❌ Group ${i + 1} failed: HTTP ${response.status}`);
                    continue; // Skip this group but continue with others
                }
                
                const data = await response.json();
                if (data.bitcoin) {
                    Object.keys(data.bitcoin).forEach(key => {
                        currentBtcPrice[key.toUpperCase()] = data.bitcoin[key];
                    });
                    console.log(`✅ Group ${i + 1} successful: ${Object.keys(data.bitcoin).length} currencies`);
                }
                
                // Add delay between requests (1 second)
                if (i < currencyGroups.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
            } catch (groupError) {
                console.warn(`❌ Group ${i + 1} error:`, groupError.message);
                // Continue with next group even if this one fails
            }
        }
        
        // Check if we got any data at all
        const currenciesLoaded = Object.keys(currentBtcPrice).length;
        console.log(`📊 BTC prices loaded for ${currenciesLoaded} currencies`);
        
        if (currenciesLoaded === 0) {
            throw new Error('No BTC price data could be loaded from any currency group');
        }
        
        updateCurrentPriceDisplay();
        return currentBtcPrice;
        
    } catch (error) {
        console.error('❌ Failed to fetch BTC prices:', error);
        // Don't set fallback prices - just return empty object
        currentBtcPrice = {};
        updateCurrentPriceDisplay();
        throw error; // Re-throw to handle in initializeApp
    }
}

function updateCurrentPriceDisplay() {
    const currency = elements.currencyFilter.value;
    const price = currentBtcPrice[currency];
    const usdPrice = currentBtcPrice['USD'];
    
    if (price) {
        // Show price in selected currency
        elements.currentPrice.innerHTML = `
            Current BTC Price: <span class="price">${formatCurrency(price, currency)}</span>
        `;
    } else if (usdPrice) {
        // Show USD price as fallback with note
        elements.currentPrice.innerHTML = `
            Current BTC Price: <span class="price">${formatCurrency(usdPrice, 'USD')}</span>
            <small style="color: #ffffffff; font-size: 0.8rem; display: block; margin-top: 5px;">
                (Showing USD price - ${currency} rate not available)
            </small>
        `;
    } else {
        // No price data at all
        elements.currentPrice.innerHTML = `
            Current BTC Price: <span class="price">Price data unavailable</span>
        `;
    }
}

// Load offers from HodlHodl API with CORS proxy and with pagination
async function loadOffers(isFirstLoad = false) {
    if (isFirstLoad) {
        showLoading();
        hideError();
        allOffers = [];
        currentOffset = 0;
        availablePaymentMethods.clear(); // Reset payment methods on first load
    } else {
        isLoadingMore = true;
        document.getElementById('loadMoreBtn').textContent = 'Loading...';
        document.getElementById('loadMoreBtn').disabled = true;
    }

    try {
        const side = elements.sideFilter.value;
        const currency = elements.currencyFilter.value;
        const country = elements.countryFilter.value;
        const paymentMethod = elements.paymentMethodFilter.value;
        const amount = elements.amountFilter.value;
        
        // Update price display with current currency selection
        updateCurrentPriceDisplay();

        // Build API URL with filters
        let apiUrl = `https://hodlhodl.com/api/v1/offers?filters[asset_code]=BTC&filters[side]=${side}&pagination[limit]=${CONFIG.OFFERS_LIMIT}&pagination[offset]=${currentOffset}`;
        
        // Add currency filter if selected
        if (currency) {
            apiUrl += `&filters[currency_code]=${currency}`;
        }
        
        // Add country filter if selected
        if (country) {
            // When specific country is selected, show offers ONLY from that country
            apiUrl += `&filters[country]=${encodeURIComponent(country)}`;
            // REMOVED: &filters[include_global]=true
        } else {
            // When no country selected, show all countries including global
            apiUrl += '&filters[include_global]=true';
        }
        
        // Add payment method filter if selected
        if (paymentMethod) {
            apiUrl += `&filters[payment_method_id]=${paymentMethod}`;
        }

        // ADD AMOUNT FILTER IF ENTERED
        if (amount && !isNaN(amount) && parseFloat(amount) > 0) {
            apiUrl += `&filters[amount]=${encodeURIComponent(amount)}`;
        }
        
        // Use CORS proxy
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`;

        console.log('Fetching offers from:', proxyUrl);
        
        const response = await fetch(proxyUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });

        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Offers API Response:', data);
        
        if (data.status === 'success') {
            allOffers = allOffers.concat(data.offers);
            currentOffset += data.offers.length;

            console.log(`Loaded ${data.offers.length} new offers, total: ${allOffers.length}`);
            
            // Extract payment methods from ALL accumulated offers, not just the new ones
            extractPaymentMethodsFromOffers(allOffers);
            
            // Only populate dropdown on first load or when we have new payment methods
            if (isFirstLoad || data.offers.length > 0) {
                populatePaymentMethodDropdown();
            }
            
            displayOffers(allOffers, side, currency);
            toggleLoadMoreButton(data.offers.length);
            
        } else {
            throw new Error('API returned error status');
        }
        
    } catch (error) {
        console.error('Error loading offers:', error);
        if (isFirstLoad) {
            showError('Failed to load offers. Please try again. Error: ' + error.message);
        }
    } finally {
        if (isFirstLoad) {
            hideLoading();
        } else {
            isLoadingMore = false;
            document.getElementById('loadMoreBtn').textContent = 'Load More Offers';
            document.getElementById('loadMoreBtn').disabled = false;
        }
    }
}

// Toggle load more button visibility
function toggleLoadMoreButton(newOffersCount) {
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    
    if (newOffersCount < CONFIG.OFFERS_LIMIT || allOffers.length >= CONFIG.MAX_OFFERS) {
        // No more offers to load or reached our maximum
        loadMoreBtn.style.display = 'none';
    } else {
        // More offers available
        loadMoreBtn.style.display = 'block';
    }
}


// Display offers in the UI
function displayOffers(offers, side, currency) {
    const country = elements.countryFilter.value;
    
    // Filter out non-searchable offers and calculate spread percentage
    const offersWithSpread = offers
        .filter(offer => offer.searchable === true)
        .map(offer => {
            const offerPrice = parseFloat(offer.price);
            const offerCurrency = offer.currency_code;
            
            // Get market price for THIS offer's currency from CoinGecko
            const marketPrice = currentBtcPrice[offerCurrency];
            
            let spreadPercentage = 0;
            let hasMarketPrice = false;
            let spreadMessage = '';
            
            if (marketPrice && marketPrice > 0) {
                // We have the correct currency's market price - calculate spread
                spreadPercentage = ((offerPrice - marketPrice) / marketPrice) * 100;
                hasMarketPrice = true;
                console.log(`💰 Spread for ${offerCurrency}: Offer ${offerPrice} vs Market ${marketPrice} = ${spreadPercentage.toFixed(2)}%`);
            } else {
                // No market price available for this currency
                spreadMessage = `No rates for ${offerCurrency}`;
                console.warn(`❌ No market price available for ${offerCurrency}`);
            }
            
            return {
                ...offer,
                spreadPercentage,
                offerPrice,
                hasMarketPrice,
                spreadMessage, // Store the message when no rates available
                displayCurrency: offerCurrency
            };
        });

    // Show appropriate message based on country selection
    if (offersWithSpread.length === 0) {
        let message = '';
        
        if (country && country !== '') {
            // Specific country selected but no offers found
            const countryName = elements.countryFilter.options[elements.countryFilter.selectedIndex].text;
            message = `
                <div class="no-offers">
                    <h3>No offers found for ${countryName}</h3>
                    <p>There are currently no active offers from ${countryName}.</p>
                    <div class="suggestion">
                        <p>💡 <strong>Try this:</strong></p>
                        <ul>
                            <li>Select "All Countries" to see global offers</li>
                            <li>Try a different currency</li>
                            <li>Check different payment methods</li>
                            <li>Or try the opposite trade type (${side === 'sell' ? 'Buy' : 'Sell'} instead)</li>
                        </ul>
                    </div>
                    <button onclick="selectAllCountries()" class="suggestion-btn">
                        Select All Countries
                    </button>
                </div>
            `;
        } else {
            // No country selected but no offers found
            message = `
                <div class="no-offers">
                    <h3>No offers found</h3>
                    <p>No active offers match your current filters.</p>
                    <div class="suggestion">
                        <p>💡 <strong>Suggestions:</strong></p>
                        <ul>
                            <li>Try a different currency</li>
                            <li>Check different payment methods</li>
                            <li>Try the opposite trade type</li>
                            <li>Or select a specific country</li>
                        </ul>
                    </div>
                </div>
            `;
        }
        
        elements.offersContainer.innerHTML = message;
        return;
    }

    // Separate offers: experienced traders vs new traders (0 trades)
    const experiencedTraders = offersWithSpread.filter(offer => offer.trader.trades_count > 0);
    const newTraders = offersWithSpread.filter(offer => !offer.trader.trades_count || offer.trader.trades_count === 0);

    // Sort both groups by price
    experiencedTraders.sort((a, b) => {
        if (side === 'sell') return a.offerPrice - b.offerPrice;
        else return b.offerPrice - a.offerPrice;
    });
    
    newTraders.sort((a, b) => {
        if (side === 'sell') return a.offerPrice - b.offerPrice;
        else return b.offerPrice - a.offerPrice;
    });

    const usdPrice = currentBtcPrice['USD'];
    const amount = elements.amountFilter.value;

    // Generate HTML for both sections
    let offersHTML = `
        <div class="offer-count">
            Showing <span style="color:rgb(242, 169, 0); font-size:1.4em";>${offersWithSpread.length}</span> ${side === 'sell' ? 'Sell' : 'Buy'} offers 
            ${country && country !== '' ? `from ${elements.countryFilter.options[elements.countryFilter.selectedIndex].text}` : 'from all countries'}
            ${currency && currency !== '' ? `using ${currency} (${getCurrencyName(currency)})` : ''}
            ${amount && !isNaN(amount) && parseFloat(amount) > 0 ? `for <span style="color: #27ae60; font-size: 1.2em;">${formatCurrency(amount, currency)}</span>` : ''}
            ${usdPrice ? `(Reference in USD: ${formatCurrency(usdPrice, 'USD')})` : ''}
        </div>
    `;

    // Experienced traders section
    if (experiencedTraders.length > 0) {
        offersHTML += experiencedTraders.map(offer => createOfferCard(offer, side)).join('');
    }

    // New traders section with separator
    if (newTraders.length > 0) {
        offersHTML += `
            <div class="new-traders-section">
                <div class="new-traders-header">
                    <hr>
                    <div class="new-traders-label">&#8650; Offers from new traders with 0 trades so far &#8650;</div>
                </div>
                ${newTraders.map(offer => createOfferCard(offer, side)).join('')}
            </div>
        `;
    }
    
    elements.offersContainer.innerHTML = offersHTML;
    
    // Add click event listeners
    document.querySelectorAll('.offer-card').forEach((card, index) => {
        const allOffers = [...experiencedTraders, ...newTraders];
        card.addEventListener('click', () => {
            const offer = allOffers[index];
            openHodlHodlOffer(offer.id);
        });
    });
}

// Helper function to select "All Countries"
function selectAllCountries() {
    elements.countryFilter.value = '';
    loadOffers(true);
}

// Add this CSS for the load more button
const loadMoreStyles = document.createElement('style');
loadMoreStyles.textContent = `
    .load-more-btn {
        display: block;
        margin: 20px auto;
        padding: 12px 30px;
        background: #667eea;
        color: white;
        border: none;
        border-radius: 5px;
        font-size: 1rem;
        cursor: pointer;
        transition: background-color 0.3s ease;
    }
    
    .load-more-btn:hover:not(:disabled) {
        background: #ccc;
    }
    
    .load-more-btn:disabled {
        background: #957979ff;
        cursor: not-allowed;
    }
    
    .offer-count {
        text-align: center;
        padding: 10px;
        border-radius: 5px;
        margin-bottom: 15px;
        font-weight: 600;
        color: #ffffffff;
    }
`;
document.head.appendChild(loadMoreStyles);

// Create HTML for a single offer card
// Updated createOfferCard function with payment method bubbles
function createOfferCard(offer, side) {
    const spreadPercentage = offer.spreadPercentage || 0;
    const isPositiveSpread = spreadPercentage > 0;
    const traderStatusClass = getTraderStatusClass(offer.trader.online_status);

    // Get status title/tooltip text to show status on hover
    const statusTitle = getTraderStatusTitle(offer.trader.online_status);
    
    // Use the offer's actual currency, not the filter currency
    const displayCurrency = offer.displayCurrency || offer.currency_code;
    
    // Get payment methods for this offer based on side
    const paymentMethods = side === 'sell' ? 
        offer.payment_method_instructions : 
        offer.payment_methods;
    
    const paymentMethodBubbles = createPaymentMethodBubbles(paymentMethods, side);
    
    // Determine spread display and CSS class
    let spreadDisplay, spreadClass;
    if (offer.hasMarketPrice) {
        // We have market price - show actual spread
        spreadDisplay = `${isPositiveSpread ? '+' : ''}${spreadPercentage.toFixed(2)}%`;
        spreadClass = isPositiveSpread ? 'spread-positive' : 'spread-negative';
    } else {
        // No market price available - show message
        spreadDisplay = offer.spreadMessage || 'No rates';
        spreadClass = 'spread-na';
    }
    
    return `
        <div class="offer-card" data-offer-id="${offer.id}">
            <div class="offer-header">
                <div class="offer-side side-${side}">${side === 'sell' ? 'Seller' : 'Buyer'}</div>
                <div class="offer-price">${formatCurrency(offer.price, displayCurrency)}</div>
                <div class="offer-spread ${spreadClass}" title="Spread vs market price. Rates are rough estimates. Please visit the offer page to get exact details.">
                    ${spreadDisplay}
                </div>
            </div>
            
            <div class="offer-details">
                <div class="detail-item">
                    <span class="detail-label">Currency</span>
                    <span class="detail-value">${displayCurrency}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Min Amount</span>
                    <span class="detail-value">${formatCurrency(offer.min_amount, displayCurrency)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Max Amount</span>
                    <span class="detail-value">${formatCurrency(offer.max_amount, displayCurrency)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Trader Trades</span>
                    <span class="detail-value">${offer.trader.trades_count || 0}</span>
                </div>
            </div>
            
            ${paymentMethodBubbles ? `
            <div class="payment-methods">
                <span class="payment-methods-label">Payment Methods:</span>
                <div class="payment-method-bubbles">
                    ${paymentMethodBubbles}
                </div>
            </div>
            ` : ''}
            
            <div class="offer-trader">
                <div class="trader-info">
                    <div class="trader-status ${traderStatusClass}" title="${statusTitle}"></div>
                    <span class="trader-name">${offer.trader.login}</span>
                    <span class="trader-country">${offer.trader.country}</span>
                    ${offer.trader.rating ? `<span class="trader-rating" title="How is the rating for each user calculated?
The rating for each user is calculated as an arithmetic average of all ratings given to that user by other traders.">★ ${offer.trader.rating}</span>` : ''}
                    <span class="trader-trades">${offer.trader.trades_count || 0} trades</span>
                </div>
                <div class="offer-action">
                    View Offer
                </div>
            </div>
        </div>
    `;
}

// Helper function to get trader status title/tooltip
function getTraderStatusTitle(onlineStatus) {
    switch (onlineStatus) {
        case 'online':
            return 'Trader is currently online and active';
        case 'recently_online':
            return 'Trader was recently online (within the last few hours)';
        case 'offline':
            return 'Trader is currently offline';
        default:
            return 'Trader status unknown';
    }
}

// Helper function to get trader status CSS class (keep your existing function)
function getTraderStatusClass(onlineStatus) {
    switch (onlineStatus) {
        case 'online':
            return 'status-online';
        case 'recently_online':
            return 'status-recently';
        default:
            return 'status-offline';
    }
}

// Create payment method bubbles HTML
function createPaymentMethodBubbles(paymentMethods, offerSide) {
    if (!paymentMethods || paymentMethods.length === 0) {
        return '';
    }
    
    // Limit to first 5 payment methods to avoid clutter
    const displayMethods = paymentMethods.slice(0, 50);
    
    return displayMethods.map(method => {
        // Handle different structures for sell vs buy offers
        let methodName, methodType;
        
        if (offerSide === 'sell') {
            // SELL offers structure
            methodName = method.payment_method_name;
            methodType = method.payment_method_type || 'Payment';
        } else {
            // BUY offers structure
            methodName = method.name;
            methodType = method.type || 'Payment';
        }
        
        return `
            <span class="payment-method-bubble" title="${methodName} - ${methodType}">
                ${methodName}
            </span>
        `;
    }).join('');
}

// Helper function to get trader status CSS class
function getTraderStatusClass(onlineStatus) {
    switch (onlineStatus) {
        case 'online':
            return 'status-online';
        case 'recently_online':
            return 'status-recently';
        default:
            return 'status-offline';
    }
}

// Format currency display
function formatCurrency(amount, currency) {
    const number = parseFloat(amount);
    
    if (isNaN(number)) {
        return 'N/A';
    }
    
    // Format based on currency - handle all currencies from your list
    try {
        const formatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        
        return formatter.format(number);
    } catch (error) {
        // Fallback for unsupported currencies
        return `${number.toLocaleString()} ${currency}`;
    }
}

// Modal and localStorage functions with 24-hour expiration
function shouldShowModal() {
    const modalData = localStorage.getItem('hodlhodlModalData');
    
    if (!modalData) {
        return true; // No data found, show modal
    }
    
    try {
        const data = JSON.parse(modalData);
        const now = Date.now();
        
        // Check if 24 hours have passed since last interaction
        if (now - data.timestamp > 24 * 60 * 60 * 1000) {
            localStorage.removeItem('hodlhodlModalData'); // Clear expired data
            return true; // 24 hours passed, show modal again
        }
        
        return data.action !== 'visited'; // Only show if they haven't visited
    } catch (error) {
        console.error('Error parsing modal data:', error);
        return true; // Show modal if there's an error
    }
}

function setModalVisited() {
    const modalData = {
        action: 'visited',
        timestamp: Date.now()
    };
    localStorage.setItem('hodlhodlModalData', JSON.stringify(modalData));
}

function setModalDeclined() {
    const modalData = {
        action: 'declined', 
        timestamp: Date.now()
    };
    localStorage.setItem('hodlhodlModalData', JSON.stringify(modalData));
}

function showSignupModal() {
    const modal = document.getElementById('signupModal');
    if (modal) {
        modal.style.display = 'block';
        
        // Add event listeners for modal buttons
        document.getElementById('visitHodlHodlBtn').addEventListener('click', function() {
            setModalVisited(); // Set to visited with timestamp
            window.open(CONFIG.REFERRAL_LINK, '_blank');
            modal.style.display = 'none';
        });
        
        document.getElementById('skipBtn').addEventListener('click', function() {
            setModalDeclined(); // Set to declined with timestamp
            modal.style.display = 'none';
        });
        
        // Close modal when clicking X - treat as decline
        modal.querySelector('.close-modal').addEventListener('click', function() {
            setModalDeclined(); // Set to declined with timestamp
            modal.style.display = 'none';
        });
        
        // Close modal when clicking outside - treat as decline
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                setModalDeclined(); // Set to declined with timestamp
                modal.style.display = 'none';
            }
        });
        // Prevent event listeners from being added multiple times
        modal.dataset.listenersAdded = 'true';
    }
}

// Updated openHodlHodlOffer function
function openHodlHodlOffer(offerId) {
    if (offerId.startsWith('sample')) {
        alert('This is sample data. In production, this would open the actual HodlHodl offer.');
        return;
    }
    
    // Check if we should show the modal (considers 24-hour expiration)
    if (shouldShowModal()) {
        showSignupModal();
    } else {
        // User has visited HodlHodl within 24h, open offer directly
        const offerUrl = `https://hodlhodl.com/offers/${offerId}`;
        window.open(offerUrl, '_blank');
    }
}

// UI helper functions
function showLoading() {
    elements.loading.style.display = 'block';
    elements.offersContainer.style.display = 'none';
}

function hideLoading() {
    elements.loading.style.display = 'none';
    elements.offersContainer.style.display = 'block';
}

function showError(message) {
    elements.error.textContent = message;
    elements.error.style.display = 'block';
    elements.offersContainer.style.display = 'none';
}

function hideError() {
    elements.error.style.display = 'none';
}

// Add CSS for sample data warning
const additionalStyles = document.createElement('style');
additionalStyles.textContent = `
    .no-offers {
        text-align: center;
        padding: 40px;
        background: white;
        border-radius: 10px;
        color: #636e72;
        font-size: 1.1rem;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    
    .sample-warning {
        margin-bottom: 20px;
    }
`;
document.head.appendChild(additionalStyles);

// Auto-refresh every 2 minutes
setInterval(() => {
    loadOffers();
}, 330000);

// Add keyboard shortcut for refresh (Ctrl/Cmd + R)
document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault();
        loadOffers();
    }
});