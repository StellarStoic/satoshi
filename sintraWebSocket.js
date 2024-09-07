let sintraWebSocket = null; // Declare WebSocket globally
let isManuallyClosed = false; // Flag to control automatic reconnect
let btcAgeInterval = null; // Variable to store the interval ID

// Function to start Sintra WebSocket connection
function startSintraWebSocket() {
    if (sintraWebSocket) {
        sintraWebSocket.close(); // Close existing connection before starting a new one
    }

    sintraWebSocket = new WebSocket('wss://api.sintra.fi/ws');
    isManuallyClosed = false; // Reset manual close flag when starting WebSocket

    sintraWebSocket.onopen = function () {
        // consol.log("WebSocket connection to Sintra established.");
    };

    sintraWebSocket.onmessage = function (event) {
        const data = JSON.parse(event.data);
        if (data.event === "data") {
            const btcPrice = data.data.prices.usd; // BTC price in USD
            // consol.log(`Received BTC price from Sintra: ${btcPrice}`);

            // Retrieve cached exchange rates from local storage
            let cachedRates = JSON.parse(localStorage.getItem('exchangeRatesCache'));

            if (cachedRates) {
                cachedRates['BTC'] = 1 / btcPrice; // Update BTC exchange rate (BTC per USD)
                localStorage.setItem('exchangeRatesCache', JSON.stringify(cachedRates));
                
                // Store the current time when BTC price is cached
                const cacheTimestamp = Date.now();
                localStorage.setItem('btcCacheTimestamp', cacheTimestamp); // Store cache timestamp

                // Call updateAllCurrencies to recalculate based on the new BTC price
                if (typeof updateAllCurrencies === 'function') {
                    updateAllCurrencies();
                }
            }
        }
    };

    sintraWebSocket.onerror = function (error) {
        console.error("WebSocket error with Sintra:", error);
    };

    sintraWebSocket.onclose = function () {
        // consol.log("WebSocket connection to Sintra closed.");
        if (!isManuallyClosed) {
            setTimeout(startSintraWebSocket, 1000); // Reconnect after 1 second only if not manually closed
        }
    };
}

// Function to stop Sintra WebSocket connection
function stopSintraWebSocket() {
    if (sintraWebSocket) {
        isManuallyClosed = true; // Set flag to prevent automatic reconnect
        sintraWebSocket.close();
        sintraWebSocket = null; // Reset WebSocket reference
        // consol.log("WebSocket connection to Sintra stopped.");
    }
}

// Function to calculate and format the age of the cached BTC price
function getCachedBtcAge() {
    const cachedTimestamp = localStorage.getItem('btcCacheTimestamp'); // Retrieve timestamp
    if (cachedTimestamp) {
        const now = Date.now();
        const ageMs = now - cachedTimestamp; // Time difference in milliseconds
        const ageMinutes = Math.floor(ageMs / (1000 * 60)); // Convert milliseconds to minutes

        if (ageMinutes < 60) {
            return `${ageMinutes}m`; // Show in minutes if less than an hour
        } else {
            const ageHours = Math.floor(ageMinutes / 60); // Convert minutes to hours
            return `${ageHours}h`; // Show in hours if more than 60 minutes
        }
    }
    return null;
}

// Function to start the interval to update BTC age every minute
function startBtcAgeUpdater() {
    // Clear any existing interval before starting a new one
    if (btcAgeInterval) {
        clearInterval(btcAgeInterval);
    }

    // Function to update BTC price age
    function updateBtcAge() {
        const stopText = document.getElementById('stop-text');
        const btcAge = getCachedBtcAge();
        
        // Update the stop-text with the new BTC price age
        stopText.textContent = btcAge !== null ? `BTC Price from ${btcAge} ago` : "BTC Price (cache unavailable)";
    }

    // Call the function immediately to set the initial text
    updateBtcAge();

    // Start the interval to update the text every minute (60000ms)
    btcAgeInterval = setInterval(updateBtcAge, 60000);
}


// Function to handle toggle between live and cached BTC prices
function handleBtcToggle() {
    const toggleButton = document.getElementById('toggle-button');
    const btcPriceStatus = document.getElementById('active-text');
    const stopText = document.getElementById('stop-text');

    toggleButton.addEventListener('click', function () {
        if (!toggleButton.classList.contains('moveup')) {
            // Switch to "Live BTC Price"
            toggleButton.classList.remove('movedown');
            toggleButton.classList.add('moveup');
            stopText.classList.remove('active');
            btcPriceStatus.classList.add('active');
            startSintraWebSocket(); // Start WebSocket for live price

            // Stop updating BTC age since we're using live price
            clearInterval(btcAgeInterval);
        } else {
            // Switch to "BTC Price from Cache"
            toggleButton.classList.remove('moveup');
            toggleButton.classList.add('movedown');
            stopSintraWebSocket(); // Stop WebSocket for live price

            const btcAge = getCachedBtcAge();
            stopText.classList.add('active');
            btcPriceStatus.classList.remove('active');

            // Start updating BTC age every minute
            startBtcAgeUpdater();
        }
    });
}

// Initialize the WebSocket and toggle state
document.addEventListener('DOMContentLoaded', function () {
    handleBtcToggle();

    const cachedRates = JSON.parse(localStorage.getItem('exchangeRatesCache'));
    const toggleButton = document.getElementById('toggle-button');
    const btcPriceStatus = document.getElementById('active-text');
    const stopText = document.getElementById('stop-text');

    if (cachedRates && cachedRates['BTC']) {
        const btcAge = getCachedBtcAge();
        if (btcAge !== null) {
            stopText.textContent = `BTC Price from ${btcAge} ago`;
        } else {
            stopText.textContent = "BTC Price (cache unavailable)";
        }
        toggleButton.classList.add('movedown');
        startBtcAgeUpdater(); // Start updating BTC age if in cached mode
    } else {
        btcPriceStatus.textContent = "Live BTC Price";
        toggleButton.classList.add('moveup');
        startSintraWebSocket();
    }
});
