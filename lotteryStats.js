let currentRoundNumber = 0;
let minRoundNumber = 0;
let maxRoundNumber = 0;

async function fetchAndDisplayStats() {
    try {
        const response = await fetch('https://lottery-api.satoshi.si/api/stats');
        const statsData = await response.json();

        // Example: Update elements in your HTML. You'll need to add these IDs to your lotteryStats.html.
        document.getElementById('total-rounds').textContent = statsData.total_rounds;
        document.getElementById('latest-round').textContent = statsData.latest_round;
        document.getElementById('total-payout').textContent = statsData.total_payout_sats.toLocaleString() + ' 丰';
        document.getElementById('avg-payout').textContent = statsData.average_payout_per_round.toFixed(2) + ' 丰';
        document.getElementById('last-updated').textContent = new Date(statsData.last_updated).toLocaleString();

        // Set round range
        currentRoundNumber = statsData.latest_round;
        minRoundNumber = statsData.oldest_round;
        maxRoundNumber = statsData.latest_round;

    } catch (error) {
        console.error('Error fetching stats:', error);
        // Display an error message to the user on the page
    }
}

async function fetchAndDisplayLatestRound(roundNumber) {
    try {
        const response = await fetch('https://lottery-api.satoshi.si/api/latest');
        const roundData = await response.json();

        // Use the new function to display the round
        fetchAndDisplayRound(roundData.round_number);

        // Update round overview
        document.getElementById('current-round-number').textContent = roundData.round_number;

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
    
    console.log('Current round:', roundNumber);
    console.log('Min round:', minRoundNumber);
    console.log('Max round:', maxRoundNumber);
    console.log('Should disable next?', roundNumber >= maxRoundNumber);
    
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
    fetchAndDisplayStats();
    fetchAndDisplayLatestRound();
    setupRoundNavigation();

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