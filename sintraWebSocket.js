// Function to connect to Sintra WebSocket and handle live BTC price
function connectToSintraAPI() {
    const socket = new WebSocket('wss://api.sintra.fi/ws');

    socket.onopen = function () {
        // consol.log("WebSocket connection to Sintra established.");
    };

    socket.onmessage = function (event) {
        const data = JSON.parse(event.data);
        if (data.event === "data") {
            const btcPrice = data.data.prices.usd; // BTC price in USD
            // consol.log(`Received BTC price from Sintra: ${btcPrice}`);

            // Retrieve cached exchange rates from local storage
            let cachedRates = JSON.parse(localStorage.getItem('exchangeRatesCache'));

            if (cachedRates) {
                cachedRates['BTC'] = 1 / btcPrice; // Update BTC exchange rate (BTC per USD)
                localStorage.setItem('exchangeRatesCache', JSON.stringify(cachedRates));

                // Call updateAllCurrencies to recalculate based on the new BTC price
                updateAllCurrencies();
            }
        }
    };

    socket.onerror = function (error) {
        console.error("WebSocket error with Sintra:", error);
    };

    socket.onclose = function () {
        // consol.log("WebSocket connection to Sintra closed, reconnecting...");
        setTimeout(connectToSintraAPI, 1000); // Reconnect after 1 second
    };
}

connectToSintraAPI();
