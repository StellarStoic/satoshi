// Function to establish WebSocket connection and listen for fee rate updates
function connectToMempoolAPI() {
    const ws = new WebSocket('wss://mempool.space/api/v1/ws');

    ws.onopen = () => {
        // consol.log('WebSocket connection established');
        ws.send(JSON.stringify({ "action": "init", "channels": ["stats", "blocks"] }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        // consol.log('Received data:', data);

        // Check if the received message contains block or fee data, ignore others
        if (data.blocks || data.fees) {
            window.latestMempoolData = data; // Store relevant data globally
            updateFooterDisplay(data);
        } else {
            // consol.log('Unnecessary data received, ignoring.');
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        // consol.log('WebSocket connection closed');
        setTimeout(connectToMempoolAPI, 1000);
    };

    // Store the WebSocket instance globally for further reference
    window.currentWebSocket = ws;
}

// Call the function to establish connection on page load
connectToMempoolAPI();

// Global variables to track current state
let currentBlockIndex = 7; // Start with the latest block
let dataType = ''; // To track whether we clicked 'fee rate' or 'block height'

// Function to update footer display
function updateFooterDisplay(data) {
    if (data.blocks && data.blocks.length > 0) {
        const lastBlockHeight = data.blocks[data.blocks.length - 1].height; // Use the last block in the array
        document.getElementById('block-height').textContent = '' + lastBlockHeight;
    } else {
        // consol.log('Block height data not available in the received payload.');
    }

    if (data.fees && data.fees.halfHourFee) {
        const feeRate = data.fees.halfHourFee;
        document.getElementById('fee-rate').textContent = feeRate + ' sat/vB';
    } else {
        // consol.log('Fee rate data not available in the received payload.');
    }
}

// Function to open the Mempool Data Modal with dynamic content
function openMempoolDataModal(type, event) {
    event.stopPropagation();
    const mempoolModal = document.getElementById('mempoolTinyDataModal');

    if (mempoolModal) {
        closeAllModals();
        dataType = type;
        clearModalContent();

        if (dataType === 'block') {
            updateBlockHeightModalData(currentBlockIndex);
        } else if (dataType === 'fee') {
            updateFeeRateModalData();
        }

        mempoolModal.classList.add('active');
        document.body.classList.add('modal-open');
    } else {
        console.error('Mempool Tiny Data Modal not found!');
    }
}

// Function to ensure WebSocket is ready and data is available before updating modal
function validateWebSocketAndData(callback) {
    if (window.currentWebSocket.readyState !== WebSocket.OPEN) {
        // consol.log('WebSocket is not open. Reconnecting...');
        connectToMempoolAPI(); // Reconnect if not open
        return;
    }

    if (!window.latestMempoolData || (!window.latestMempoolData.blocks && !window.latestMempoolData.fees)) {
        // consol.log('Data is not available yet. Please wait...');
        return;
    }

    callback();
}

// Function to clear modal content before loading new data
function clearModalContent() {
    const elementsToClear = [
        'modal-title', 'avg-fee-rate', 'fee-range', 'total-fees-btc',
        'total-fees-sats', 'tx-count', 'time-passed', 'mined-by', 'half-hour-fee',
        'economy-fee', 'fastest-fee', 'half-hour-fee', 'hour-fee', 'minimum-fee'
    ];
    elementsToClear.forEach(className => {
        const element = document.querySelector(`#mempoolTinyDataModal .${className}`);
        if (element) element.textContent = '';
    });
}

// Function to update the modal content based on the block index
function updateBlockHeightModalData(blockIndex) {
    const data = window.latestMempoolData;

    if (!data || !data.blocks || data.blocks.length <= blockIndex) {
        // consol.log('No data available for the specified block index.');
        return;
    }

    const blockData = data.blocks[blockIndex];

    if (!blockData || !blockData.extras) {
        // consol.log('Block data or extras not available.');
        return;
    }

    // Populate modal content for block data
    document.querySelector('#mempoolTinyDataModal .modal-title').textContent = `${blockData.height}`;
    document.querySelector('#mempoolTinyDataModal .avg-fee-rate').textContent = `Avg Fee: ~ ${blockData.extras.avgFeeRate} sat/vB`;
    document.querySelector('#mempoolTinyDataModal .fee-range').textContent = `Fee Range: ${Math.round(blockData.extras.feeRange[0])} - ${Math.round(blockData.extras.feeRange[6])} sat/vB`;
    document.querySelector('#mempoolTinyDataModal .total-fees-btc').textContent = `Total Fees: ${(blockData.extras.totalFees / 1e8).toFixed(3)} BTC`;
    document.querySelector('#mempoolTinyDataModal .total-fees-sats').textContent = `Total Fees (Sats): ${blockData.extras.totalFees} sats`;
    document.querySelector('#mempoolTinyDataModal .tx-count').textContent = `Transaction Count: ${blockData.tx_count.toLocaleString()}`;
    
    // Calculate time passed since block was mined
    const timePassed = Math.round((Date.now() / 1000 - blockData.timestamp) / 60);
    document.querySelector('#mempoolTinyDataModal .time-passed').textContent = `Time Passed: ${timePassed} minutes ago`;

    document.querySelector('#mempoolTinyDataModal .mined-by').textContent = `Mined by: ${blockData.extras.pool.name}`;

    // Show elements specific to block data
    toggleModalSections('block');
}

// Function to update the modal content for fee rate
function updateFeeRateModalData() {
    const data = window.latestMempoolData;

    if (!data || !data.fees) {
        // consol.log('Fee rate data not available.');
        return;
    }

    const { fastestFee, halfHourFee, hourFee, economyFee, minimumFee } = data.fees;
    
    // Populate modal content for fee data
    document.querySelector('#mempoolTinyDataModal .modal-title').textContent = `Fee Rates`;
    document.querySelector('#mempoolTinyDataModal .half-hour-fee').textContent = `Half-Hour Fee: ${halfHourFee} sat/vB`;
    document.querySelector('#mempoolTinyDataModal .economy-fee').textContent = `Economy Fee: ${economyFee} sat/vB`;
    document.querySelector('#mempoolTinyDataModal .fastest-fee').textContent = `Fastest Fee: ${fastestFee} sat/vB`;
    document.querySelector('#mempoolTinyDataModal .hour-fee').textContent = `Hour Fee: ${hourFee} sat/vB`;
    document.querySelector('#mempoolTinyDataModal .minimum-fee').textContent = `Minimum Fee: ${minimumFee} sat/vB`;

    // Show elements specific to fee data
    toggleModalSections('fee');
}

// Function to toggle modal sections visibility and manage arrow display
function toggleModalSections(type) {
    const showBlockData = type === 'block';
    
    // Toggle block data visibility
    document.querySelectorAll('#mempoolTinyDataModal .block-data').forEach(el => el.style.display = showBlockData ? 'block' : 'none');
    
    // Toggle fee data visibility
    document.querySelectorAll('#mempoolTinyDataModal .fee-data').forEach(el => el.style.display = showBlockData ? 'none' : 'block');
    
    // Show or hide arrows based on the type (blocks vs fee)
    const leftArrow = document.querySelector('#mempoolTinyDataModal .left-arrow');
    const rightArrow = document.querySelector('#mempoolTinyDataModal .right-arrow');

    if (showBlockData) {
        // Set arrow visibility for block data
        leftArrow.style.visibility = currentBlockIndex > 0 ? 'visible' : 'hidden';
        rightArrow.style.visibility = currentBlockIndex < (window.latestMempoolData.blocks.length - 1) ? 'visible' : 'hidden';
        leftArrow.style.color = currentBlockIndex > 0 ? 'white' : 'rgba(128, 128, 128, 0.)'; // Adjust arrow color based on current block index
        rightArrow.style.color = currentBlockIndex < (window.latestMempoolData.blocks.length - 1) ? 'white' : 'rgba(128, 128, 128, 0.2)';
    } else {
        // Completely hide arrows for fee data
        leftArrow.style.visibility = 'hidden';
        rightArrow.style.visibility = 'hidden';
    }
}


// Event listener for left arrow click to navigate blocks
document.querySelector('#mempoolTinyDataModal .left-arrow').addEventListener('click', function () {
    if (dataType === 'block' && currentBlockIndex > 0) {
        currentBlockIndex--;
        updateBlockHeightModalData(currentBlockIndex);
    }
});

// Event listener for right arrow click to navigate blocks
document.querySelector('#mempoolTinyDataModal .right-arrow').addEventListener('click', function () {
    if (dataType === 'block' && currentBlockIndex < (window.latestMempoolData.blocks.length - 1)) {
        currentBlockIndex++;
        updateBlockHeightModalData(currentBlockIndex);
    }
});

// Attach event listeners for footer elements
document.getElementById('block-height').addEventListener('click', function (event) {
    validateWebSocketAndData(() => openMempoolDataModal('block', event));
});

document.getElementById('fee-rate').addEventListener('click', function (event) {
    validateWebSocketAndData(() => openMempoolDataModal('fee', event));
});

function closeAllModals() {
    document.querySelectorAll('.description-modal.active').forEach(function (modal) {
        modal.classList.remove('active');
    });
    document.body.classList.remove('modal-open');
}
