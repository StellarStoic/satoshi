// Function to establish WebSocket connection and listen for fee rate updates
function connectToMempoolAPI() {
    const ws = new WebSocket('wss://mempool.space/api/v1/ws');
    
    ws.onopen = () => {
        console.log('WebSocket connection established');
        // Subscribe to 'stats' and 'blocks' channels to receive mempool statistics and block info
        ws.send(JSON.stringify({
            "action": "init",
            "channels": ["stats", "blocks"]
        }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Log the received data to check its structure
        console.log('Received data:', data);

        // Extract the half-hour fee rate from the 'fees' object
        if (data.fees && data.fees.halfHourFee) {
            const feeRate = data.fees.halfHourFee;
            document.getElementById('fee-rate').textContent = feeRate + ' sat/vB';
        } else {
            console.log('Fee rate data not available in the received payload.');
        }

        // Extract the last block height from the 'blocks' object
        if (data.blocks && data.blocks.length > 0) {
            const lastBlockHeight = data.blocks[7].height;
            document.getElementById('block-height').textContent = '' + lastBlockHeight;
        } else {
            console.log('Block height data not available in the received payload.');
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
        console.log('WebSocket connection closed');
        // Attempt to reconnect after a 15-second delay
        setTimeout(connectToMempoolAPI, 60000);
    };
}

// Call the function to establish connection on page load
connectToMempoolAPI();

// Function to open the fee rate modal
function openFeeRateModal() {
    // Logic to open the modal window displaying more fee rate information
    const mempoolModal = document.getElementById('mempoolTinyDataModal');
    if (mempoolModal) {
        mempoolModal.classList.add('active');
        document.body.classList.add('modal-open');
    } else {
        console.error('Mempool Tiny Data Modal not found!');
    }
}