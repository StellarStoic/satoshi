document.addEventListener('DOMContentLoaded', function() {
    let sintraWebSocket = new WebSocket('wss://api.sintra.fi/ws');

    sintraWebSocket.onopen = function() {
        console.log("Connected to Sintra WebSocket");
    };

    sintraWebSocket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.event === "data") {
            const btcPrice = parseFloat(data.data.prices.usd);
            if (!isNaN(btcPrice)) {
                console.log(`Received BTC price from Sintra: ${btcPrice}`);
                const satoshisPerDollar = 1 / (btcPrice / 100000000);
                console.log(`Received satoshis per USD: ${satoshisPerDollar}`);

                let satoshisText = document.getElementById('satoshisValue').textContent;
                let oldSatoshisPerDollar = parseInt(satoshisText, 10);

                if (isNaN(oldSatoshisPerDollar)) {
                    console.error('Old satoshis per dollar value is not a number:', satoshisText);
                    oldSatoshisPerDollar = 1000; // Use `let` for variables that may need to be reassigned
                }

                animateNumberChange('satoshisValue', oldSatoshisPerDollar, Math.round(satoshisPerDollar), 500);
            } else {
                console.error("Invalid BTC price received:", data.data.prices.usd);
            }
        }
    };

    sintraWebSocket.onerror = function(error) {
        console.error("WebSocket Error: ", error);
    };

    sintraWebSocket.onclose = function(event) {
        if (!event.wasClean) {
            console.log("WebSocket Connection Closed Unexpectedly; attempting to reconnect...");
            setTimeout(() => {
                sintraWebSocket = new WebSocket('wss://api.sintra.fi/ws'); // Correct re-initialization inside setTimeout
            }, 5000);
        }
    };

    function animateNumberChange(elementId, start, end, duration) {
        let current = start;
        const range = end - start;
        const increment = end > start ? 1 : -1;
        const stepTime = Math.abs(Math.floor(duration / Math.abs(range)));
        const obj = document.getElementById(elementId);

        if (range === 0) {
            obj.textContent = end; // If no change needed, just set the text
            return;
        }

        const timer = setInterval(() => {
            current += increment;
            obj.textContent = current;
            if (current === end) {
                clearInterval(timer);
            }
        }, stepTime);
    }
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

async function fetchMoscowTime() {
  try {
    const response = await fetch("https://timeapi.io/api/Time/current/zone?timeZone=Europe/Moscow");
    const data = await response.json();

    const timeString = `${data.hour.toString().padStart(2, '0')}:${data.minute.toString().padStart(2, '0')}:${data.seconds.toString().padStart(2, '0')}`;
    document.getElementById("moscow-current-time").textContent = timeString;
  } catch (error) {
    document.getElementById("moscow-current-time").textContent = "Could not load Moscow time.";
  }
}

// Run the function once the page loads
document.addEventListener('DOMContentLoaded', () => {
  fetchMoscowTime();
  setInterval(fetchMoscowTime, 1000); // optional: live clock every second
});

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

