let currentRoundNumber = 0;
let minRoundNumber = 0;
let maxRoundNumber = 0;

// List of blockchain API providers with their endpoints
const BLOCKCHAIN_PROVIDERS = [
    {
        name: 'mempool.space',
        url: 'https://mempool.space/api/blocks/tip/height',
        timeout: 5000
    },
        {
        name: 'mempool.emzy.de',
        url: 'https://mempool.emzy.de/api/blocks/tip/height',
        timeout: 5000
    },
    {
        name: 'blockchain.info',
        url: 'https://blockchain.info/q/getblockcount',
        timeout: 5000
    },
    {
        name: 'blockstream.info',
        url: 'https://blockstream.info/api/blocks/tip/height',
        timeout: 5000
    }
];

// Function to fetch block height with multiple fallbacks
async function getCurrentBlockHeight() {
    const errors = [];
    
    // Try each provider in order
    for (const provider of BLOCKCHAIN_PROVIDERS) {
        try {
            console.log(`Trying ${provider.name}...`);
            const blockHeight = await fetchWithTimeout(provider);
            
            if (blockHeight !== null && blockHeight !== undefined) {
                console.log(`Success from ${provider.name}: Block ${blockHeight}`);
                // Return both the block height and the provider name
                return {
                    height: blockHeight,
                    provider: provider.name
                };
            }
        } catch (error) {
            console.warn(`Failed to fetch from ${provider.name}:`, error.message);
            errors.push(`${provider.name}: ${error.message}`);
        }
    }
    
    // If all providers fail
    console.error('All blockchain providers failed:', errors);
    return null;
}

// Helper function with timeout
async function fetchWithTimeout(provider) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), provider.timeout);
    
    try {
        const response = await fetch(provider.url, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        // Use custom parser if provided, otherwise default JSON parsing
        if (provider.parser) {
            return await provider.parser(response);
        } else {
            const text = await response.text();
            // Try to parse as JSON first, then as plain text
            try {
                return JSON.parse(text);
            } catch {
                // If not JSON, try to parse as plain number
                const parsed = parseInt(text.trim(), 10);
                if (!isNaN(parsed)) {
                    return parsed;
                }
                throw new Error('Invalid response format');
            }
        }
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// Function to calculate time until next draw
function calculateTimeToDraw(currentBlockHeight) {
    // Lottery draws happen every 100 blocks
    const blocksUntilNextDraw = 100 - (currentBlockHeight % 100);
    const minutesUntilDraw = blocksUntilNextDraw * 10; // 10 minutes per block
    const hours = Math.floor(minutesUntilDraw / 60);
    const minutes = minutesUntilDraw % 60;
    
    return {
        blocksUntilNextDraw,
        hours,
        minutes,
        totalMinutes: minutesUntilDraw
    };
}

// Function to update progress bar
function updateProgressBar(currentBlockHeight) {
    const progressBar = document.getElementById('block-progress-bar');
    if (!progressBar) return;
    
    // Clear existing blocks
    progressBar.innerHTML = '';
    
    const currentBlockInCycle = currentBlockHeight % 100 || 100;
    
    // Calculate the next block to be mined (first unmined block)
    const nextBlockToMine = (currentBlockInCycle === 100) ? 1 : currentBlockInCycle + 1;
    
    // Create 100 block segments
    for (let i = 1; i <= 100; i++) {
        const blockSegment = document.createElement('div');
        blockSegment.className = 'block-segment';
        
        // Determine block status
        if (i <= 96) {
            blockSegment.classList.add('open');
        } else if (i <= 99) {
            blockSegment.classList.add('closed');
        } else {
            blockSegment.classList.add('draw');
        }
        
        // Add washed-off effect for blocks that haven't been mined yet
        if (i > currentBlockInCycle) {
            blockSegment.classList.add('unmined');
        }
        
        // Highlight the NEXT block to be mined (not the current/last mined block)
        if (i === nextBlockToMine) {
            blockSegment.style.boxShadow = '0 0 0 2px white';
            blockSegment.style.zIndex = '1';
            blockSegment.classList.add('current-pulse');
            // Also add unmined class if it's an unmined block
            if (i > currentBlockInCycle) {
                blockSegment.classList.add('unmined');
            }
        }
        
        progressBar.appendChild(blockSegment);
    }
}

// Function to update time display
function updateTimeDisplay(timeData) {
    const timeElement = document.getElementById('time-to-draw');
    if (!timeElement) return;
    
    if (timeData.blocksUntilNextDraw === 0) {
        timeElement.textContent = 'Drawing now!';
        timeElement.style.color = '#f2a900'; // Gold color
    } else {
        let timeText = '';
        if (timeData.hours > 0) {
            timeText += `${timeData.hours}h `;
        }
        timeText += `${timeData.minutes}m`;
        timeElement.textContent = timeText;
        timeElement.style.color = '#f2a900'; // Gold color
    }
}

// Main function to update draw countdown
async function updateDrawCountdown() {
    const result = await getCurrentBlockHeight();
    
    if (result && result.height) {
        const currentBlockHeight = result.height;
        const providerName = result.provider;
        
        const timeData = calculateTimeToDraw(currentBlockHeight);
        
        // Update progress bar
        updateProgressBar(currentBlockHeight);
        
        // Update time display in stat card
        updateTimeDisplay(timeData);
        
        // Update the blocks-left counter in progress bar title
        const blocksLeftElement = document.getElementById('blocks-left');
        if (blocksLeftElement) {
            blocksLeftElement.textContent = timeData.blocksUntilNextDraw;
        }
        
        // UPDATE PROVIDER STATUS
        const providerElement = document.getElementById('current-provider');
        if (providerElement) {
            providerElement.textContent = providerName;
        }
        
    } else {
        // Handle case when all providers fail
        console.error('Unable to fetch block height from any provider');
        
        // Show error in UI
        const timeElement = document.getElementById('time-to-draw');
        if (timeElement) {
            timeElement.textContent = 'API Error';
            timeElement.style.color = 'red';
        }
        
        const blocksLeftElement = document.getElementById('blocks-left');
        if (blocksLeftElement) {
            blocksLeftElement.textContent = 'Error';
        }
        
        // Update provider status to show error
        const providerElement = document.getElementById('current-provider');
        if (providerElement) {
            providerElement.textContent = 'All APIs failed';
            providerElement.style.color = 'red';
        }
    }
}

// Function to start periodic updates
function startCountdownUpdates() {
    // Update immediately
    updateDrawCountdown();
    
    // Update every 60 seconds (60000 milliseconds)
    setInterval(updateDrawCountdown, 60000);
}

async function fetchAndDisplayStats() {
    try {
        const response = await fetch('https://lottery-api.satoshi.si/api/stats');
        const statsData = await response.json();

        // Check if we have the new scraped overview stats
        if (statsData.total_rounds && statsData.total_bets && statsData.total_winners) {
            // New format: scraped overview stats
            document.getElementById('total-rounds').textContent = statsData.total_rounds;
            document.getElementById('current-round').textContent = statsData.current_round;
            document.getElementById('total-payout').textContent = statsData.total_paid_sats.toLocaleString() + ' 丰';
            
            // ADD THESE MISSING UPDATES:
            document.getElementById('total-bets').textContent = statsData.total_bets;
            document.getElementById('total-winners').textContent = statsData.total_winners;
            document.getElementById('current-jackpot').textContent = statsData.current_prize_pool + ' 丰';
            
            // Use the new average payout field for last 21 rounds
            if (statsData.average_payout_last_21_rounds) {
                document.getElementById('avg-payout').textContent = statsData.average_payout_last_21_rounds.toFixed(2) + ' 丰';
            } else {
                document.getElementById('avg-payout').textContent = 'N/A';
            }
            
            // Set round range - use last 15 rounds for navigation
            currentRoundNumber = statsData.current_round;
            minRoundNumber = statsData.current_round - 14; // Assuming last 15 rounds
            maxRoundNumber = statsData.current_round;
            
        } else if (statsData.total_rounds_shown) {
            // Old format: calculated stats from last 15 rounds
            document.getElementById('total-rounds').textContent = statsData.total_rounds_shown;
            document.getElementById('current-round').textContent = statsData.latest_round;
            document.getElementById('total-payout').textContent = statsData.total_payout_sats.toLocaleString() + ' 丰';
            document.getElementById('avg-payout').textContent = statsData.average_payout_per_round.toFixed(2) + ' 丰';
            
            // Set round range
            currentRoundNumber = statsData.latest_round;
            minRoundNumber = statsData.oldest_round_shown;
            maxRoundNumber = statsData.latest_round;
        }

        document.getElementById('last-updated').textContent = new Date(statsData.last_updated).toLocaleString();

    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}

async function fetchAndDisplayLatestRound() {
    try {
        const response = await fetch('https://lottery-api.satoshi.si/api/latest');
        const roundData = await response.json();

        console.log('API Response:', roundData); // Debug log

                // Check if we got valid data
        if (!roundData) {
            console.error('No data received from /api/latest');
            return;
        }
        
        // Check if we got an array (15 rounds) or a single object
        if (Array.isArray(roundData) && roundData.length > 0) {
            // We got an array of rounds - display the first (latest) one
            const latestRound = roundData[0];
            fetchAndDisplayRound(latestRound.round_number);
            document.getElementById('current-round-number').textContent = latestRound.round_number;
            
            // Update round range based on the array
            minRoundNumber = roundData[roundData.length - 1].round_number; // Oldest in the array
            maxRoundNumber = roundData[0].round_number; // Latest in the array
            currentRoundNumber = latestRound.round_number;
            
        } else if (roundData.round_number) {
            // We got a single round object (old format)
            fetchAndDisplayRound(roundData.round_number);
            document.getElementById('current-round-number').textContent = roundData.round_number;
            currentRoundNumber = roundData.round_number;
        } else {
            // Fallback: If we get unexpected data, try to fetch round 1
            console.warn('Unexpected data format from /api/latest, attempting to fetch round 1');
            fetchAndDisplayRound(1);
        }

        // // Use the new function to display the round
        // fetchAndDisplayRound(roundData.round_number);

        // // Update round overview
        // document.getElementById('current-round-number').textContent = roundData.round_number;

        // Extract block number from "Block 926800" format
        const blockNumber = roundData.block.replace('Block ', '');
        document.getElementById('block-number').textContent = blockNumber;
        
        // Display block hash with winning numbers highlighted
        displayBlockHash(roundData.hash, roundData.draw_number);

        document.getElementById('draw-number').textContent = roundData.draw_number;
        // Replace "sats" with "丰" in prize pool
        document.getElementById('prize-pool').textContent = 
            roundData.prize_pool.replace('sats', '丰');
        // Replace "sats" with "丰" in total payout
        document.getElementById('total-payout-latest').textContent = 
            roundData.total_payout.replace('sats', '丰');

        document.getElementById('last-updated').textContent = new Date(roundData.scraped_at).toLocaleString();
        
        // Update navigation arrows
        updateNavigationArrows(roundNumber);

        // Populate winners table
        const winnersTableBody = document.getElementById('winners-table-body');
        winnersTableBody.innerHTML = ''; // Clear existing rows
        roundData.winners.forEach(winner => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${winner.tier}</td>
                <td>${winner.address}</td>
                <td>${winner.amount.replace('sats', '丰')}</td>
                <td>${winner.winning_digits}</td>
            `;
            winnersTableBody.appendChild(row);
        });

    } catch (error) {
        console.error('Error fetching latest round:', error);
    }
}

function displayBlockHash(hash, drawNumber) {
    const blockHashElement = document.getElementById('block-hash');
    
    if (!hash || !drawNumber) {
        blockHashElement.textContent = 'N/A';
        return;
    }
    
    const mempoolLink = `https://mempool.space/block/${hash}`;
    const hashString = hash.toString();
    
    // Find the last 8 numeric digits in the hash
    let numericDigits = [];
    let positions = [];
    
    // Scan from the end to find numeric digits
    for (let i = hashString.length - 1; i >= 0; i--) {
        if (hashString[i] >= '0' && hashString[i] <= '9') {
            numericDigits.unshift(hashString[i]); // Add to beginning to maintain order
            positions.unshift(i); // Store position
            if (numericDigits.length === 8) {
                break;
            }
        }
    }
    
    // If we found 8 numeric digits
    if (numericDigits.length === 8) {
        let resultHTML = '';
        let lastIndex = 0;
        
        // Build the highlighted HTML
        for (let i = 0; i < positions.length; i++) {
            const pos = positions[i];
            
            // Add text before this position
            resultHTML += hashString.substring(lastIndex, pos);
            
            // Start highlighting for this numeric digit
            resultHTML += '<span class="winning-numbers">' + hashString[pos] + '</span>';
            
            // Update last index
            lastIndex = pos + 1;
        }
        
        // Add any remaining text after the last highlighted digit
        resultHTML += hashString.substring(lastIndex);
        
        blockHashElement.innerHTML = `
            <a href="${mempoolLink}" target="_blank" class="block-hash-link">
                ${resultHTML}
            </a>
        `;
    } else {
        // If not enough numeric digits found, show without highlighting
        blockHashElement.innerHTML = `
            <a href="${mempoolLink}" target="_blank" class="block-hash-link">
                ${hashString}
            </a>
        `;
    }
}

async function fetchAndDisplayRound(roundNumber) {
    try {
        const response = await fetch(`https://lottery-api.satoshi.si/api/round/${roundNumber}`);
        const roundData = await response.json();

        // Update round overview
        document.getElementById('current-round-number').textContent = roundData.round_number;

        // Extract block number from "Block 926800" format
        const blockNumber = roundData.block.replace('Block ', '');
        document.getElementById('block-number').textContent = blockNumber;
        
        // Display block hash with winning numbers highlighted
        displayBlockHash(roundData.hash, roundData.draw_number);

        document.getElementById('draw-number').textContent = roundData.draw_number;
        document.getElementById('prize-pool').textContent = roundData.prize_pool.replace('sats', '丰');
        document.getElementById('total-payout-latest').textContent = roundData.total_payout.replace('sats', '丰');
        
        document.getElementById('last-updated').textContent = new Date(roundData.scraped_at).toLocaleString();

        // Update navigation arrows
        updateNavigationArrows(roundNumber);
        
        // Populate winners table
        const winnersTableBody = document.getElementById('winners-table-body');
        winnersTableBody.innerHTML = '';
        roundData.winners.forEach(winner => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${winner.tier}</td>
                <td>${winner.address}</td>
                <td>${winner.amount.replace('sats', '丰')}</td>
                <td>${winner.winning_digits}</td>
            `;
            winnersTableBody.appendChild(row);
        });

    } catch (error) {
        console.error(`Error fetching round ${roundNumber}:`, error);
    }
}

// Function to update navigation arrow states
function updateNavigationArrows(roundNumber) {
    const prevArrow = document.getElementById('prev-round');
    const nextArrow = document.getElementById('next-round');
    
    // console.log('Current round:', roundNumber);
    // console.log('Min round:', minRoundNumber);
    // console.log('Max round:', maxRoundNumber);
    // console.log('Should disable next?', roundNumber >= maxRoundNumber);
    
    // Update current round
    currentRoundNumber = roundNumber;
    
    // Enable/disable arrows based on round bounds
    if (prevArrow) {
        prevArrow.classList.toggle('disabled', roundNumber <= minRoundNumber);
    }
    if (nextArrow) {
        nextArrow.classList.toggle('disabled', roundNumber >= maxRoundNumber);
    }
}

// Navigation event handlers
function setupRoundNavigation() {
    const prevArrow = document.getElementById('prev-round');
    const nextArrow = document.getElementById('next-round');
    
    if (prevArrow) {
        prevArrow.addEventListener('click', () => {
            if (currentRoundNumber > minRoundNumber) {
                fetchAndDisplayRound(currentRoundNumber - 1);
            }
        });
    }
    
    if (nextArrow) {
        nextArrow.addEventListener('click', () => {
            if (currentRoundNumber < maxRoundNumber) {
                fetchAndDisplayRound(currentRoundNumber + 1);
            }
        });
    }
}

// Handle opening the Lottery Explainer modal
function openLotteryExplainerModal(event) {
    event.stopPropagation();  // Stop the click from propagating to more general handlers
    const lotteryModal = document.getElementById('lotteryStatsExplainerModal');
    if (lotteryModal) {
        closeAllModals();  // Close all other modals if this function exists
        lotteryModal.classList.add('active');
        document.body.classList.add('modal-open');
    } else {
        console.error('Lottery Explainer Modal not found!');
    }
}

// Function to close the Lottery Explainer modal
function closeLotteryExplainerModal() {
    const lotteryModal = document.getElementById('lotteryStatsExplainerModal');
    if (lotteryModal) {
        lotteryModal.classList.remove('active');
        document.body.classList.remove('modal-open');
    } else {
        console.error('Lottery Explainer Modal not found!');
    }
}

// Function to close all modals (if you have multiple modals)
function closeAllModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.style.display = 'none';
    });
    document.body.classList.remove('modal-open');
}

// Add at the beginning of your fetch functions
function showLoading() {
    document.querySelectorAll('.stat-value, .meta-value').forEach(el => {
        el.classList.add('loading');
        el.textContent = '';
    });
}

// Add event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {

    // New: Fetch and display API data
    showLoading();
    // First fetch stats, then fetch and display the latest round
    fetchAndDisplayStats().then(() => {
        fetchAndDisplayLatestRound();
    });
    setupRoundNavigation();

    startCountdownUpdates();

    // Element to trigger opening the Lottery Explainer modal
    const lotteryTrigger = document.getElementById('lotteryInfoTrigger');
    if (lotteryTrigger) {
        lotteryTrigger.addEventListener('click', openLotteryExplainerModal);
        lotteryTrigger.addEventListener('touchstart', openLotteryExplainerModal); // For touch devices
    }
    
    // Close modal when clicking the X button
    const closeButton = document.querySelector('#lotteryStatsExplainerModal .close');
    if (closeButton) {
        closeButton.addEventListener('click', closeLotteryExplainerModal);
    }
    
    // Close modal when clicking outside the modal content
    const lotteryModal = document.getElementById('lotteryStatsExplainerModal');
    const modalContent = document.querySelector('#lotteryStatsExplainerModal .modal-content');
    
    if (lotteryModal && lotteryModal.classList.contains('active') && 
        modalContent && !modalContent.contains(event.target) &&
        event.target.id !== 'lotteryInfoTrigger') {
        closeLotteryExplainerModal();
    }

    
    // Close modal with Escape key
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeLotteryExplainerModal();
        }
    });
});