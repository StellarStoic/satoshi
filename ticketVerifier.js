// Configuration - No hardcoded hash needed anymore!
class TicketVerifier {
    constructor() {
        this.currentBlockHeight = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.fetchCurrentBlockHeight(); // Get current block height on page load
    }

    celebrateWins(results) {
    // Calculate total wins and highest tier
    let totalWins = 0;
    let highestTier = 0;
    
    Object.entries(results).forEach(([tier, matches]) => {
        if (matches.length > 0) {
            totalWins += matches.length;
            // Extract tier number (tier1 -> 1, tier2 -> 2, etc.)
            const tierNum = parseInt(tier.replace('tier', ''));
            if (tierNum > highestTier) {
                highestTier = tierNum;
            }
        }
    });
    
    // Trigger confetti if there are wins
    if (totalWins > 0 && window.lotteryConfetti) {
        // Use highest tier for celebration intensity
        window.lotteryConfetti.triggerWinCelebration(totalWins, highestTier);
    }
}

    setupEventListeners() {
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const uploadBtn = document.querySelector('.upload-btn');
        const closeBtn = document.getElementById('closeResults');

        // Drag and drop events
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        // Close button event
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.closeResults();
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFile(files[0]);
            }
        });

        // File input change event
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFile(e.target.files[0]);
                // Clear the input so the same file can be selected again
                e.target.value = '';
            }
        });

        // Upload button click - ONLY THIS ONE HANDLER NOW
        uploadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Upload button clicked');
            fileInput.click();
        });

        // Drop zone click - only trigger for the drop zone itself
        dropZone.addEventListener('click', (e) => {
            // Only trigger if clicking directly on the drop zone (not on buttons or text inside)
            if (e.target === dropZone) {
                fileInput.click();
            }
        });
    }

    async fetchCurrentBlockHeight() {
        try {
            // Fetch current block height from mempool.space
            const response = await fetch('https://mempool.space/api/blocks/tip/height');
            if (response.ok) {
                this.currentBlockHeight = parseInt(await response.text());
                console.log(`Current block height: ${this.currentBlockHeight}`);
            } else {
                console.warn('Failed to fetch current block height');
            }
        } catch (error) {
            console.warn('Error fetching current block height:', error);
        }
    }

    async getCurrentBlockHeight() {
        // If we don't have current block height yet, fetch it
        if (this.currentBlockHeight === null) {
            await this.fetchCurrentBlockHeight();
        }
        return this.currentBlockHeight;
    }

    handleFile(file) {
        // Check if file is PDF
        if (file.type !== 'application/pdf') {
            alert('Please upload a PDF file only.');
            return;
        }

        console.log('File selected:', file.name);
        this.processPDF(file);
    }

    async processPDF(file) {
        try {
            this.showLoading();
            
            // Read the PDF file
            const arrayBuffer = await file.arrayBuffer();
            
            // Load pdf.js library dynamically
            await this.loadPDFJS();
            
            // Process the PDF
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let pdfText = '';
            
            // Extract text from all pages
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                pdfText += pageText + ' ';
            }
            
            // Extract end block number and lottery numbers, and lightning address
            const endBlockNumber = this.extractEndBlockNumber(pdfText);
            const lotteryNumbers = this.extractLotteryNumbers(pdfText);
            const lightningAddress = this.extractLightningAddress(pdfText);
            
            if (!endBlockNumber) {
                this.showResults(`
                    <div class="no-wins">
                        ❌ Could not find End Block number in the PDF.<br>
                        Please make sure your PDF contains the end block information.<br>
                        <small>Looking for patterns like: "End Block: 921,600" or "Block 1,000,000"</small>
                    </div>
                `);
                return;
            }

            // Check if the end block has been mined yet
            const currentBlockHeight = await this.getCurrentBlockHeight();
            
            if (currentBlockHeight && endBlockNumber > currentBlockHeight) {
                const blocksToGo = endBlockNumber - currentBlockHeight;
                this.showBlockNotMinedWarning(endBlockNumber, currentBlockHeight, blocksToGo, lotteryNumbers);
                return;
            }
            
            // Fetch block hash from API and check results
            await this.fetchAndCheckResults(endBlockNumber, lotteryNumbers, lightningAddress);
            
        } catch (error) {
            console.error('Error processing PDF:', error);
            alert('Error processing PDF file. Please try again.');
            this.hideResults();
        }
    }

    showBlockNotMinedWarning(endBlockNumber, currentBlockHeight, blocksToGo, lotteryNumbers) {
        const warningHTML = `
            <div class="warning-tier">
                <h4>⏳ Block Not Mined Yet</h4>
                <p><strong>The block hash your ticket is for hasn't been mined yet.</strong></p>
                <p>Current block height: <strong>${currentBlockHeight.toLocaleString()}</strong></p>
                <p>Your ticket end block: <strong>${endBlockNumber.toLocaleString()}</strong></p>
                <p>Blocks to go: <strong>${blocksToGo.toLocaleString()}</strong></p>
                <br>
                <p>Please check back after block ${endBlockNumber.toLocaleString()} has been mined to verify your ticket.</p>
                <p>Estimated time: approximately <strong>${Math.round(blocksToGo * 10 / 60)} hours</strong> (assuming 10 minutes per block)</p>
            </div>
        `;
        
        this.showResults(warningHTML);
    }

    async loadPDFJS() {
        if (typeof pdfjsLib === 'undefined') {
            // Load pdf.js from CDN
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
            script.onload = () => {
                // Set worker path
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
            };
            document.head.appendChild(script);
            
            // Wait for script to load
            await new Promise(resolve => script.onload = resolve);
        }
    }

    extractEndBlockNumber(pdfText) {
        // Look for patterns like "End Block: 921,600" or "End Block 921,600" or "Block 1,000,000"
        const patterns = [
            /End Block:\s*([\d,]+)/i,
            /End Block\s*([\d,]+)/i,
            /Block:\s*([\d,]+)/i,
            /Block\s*([\d,]+)/i,
            /ending block:\s*([\d,]+)/i,
            /ending block\s*([\d,]+)/i
        ];
        
        for (const pattern of patterns) {
            const match = pdfText.match(pattern);
            if (match && match[1]) {
                // Remove commas and convert to number
                const cleanNumber = match[1].replace(/,/g, '');
                const blockNumber = parseInt(cleanNumber);
                
                if (!isNaN(blockNumber) && blockNumber > 0) {
                    console.log(`Found end block number: ${match[1]} → ${blockNumber}`);
                    return blockNumber;
                }
            }
        }
        
        // Additional fallback patterns in case the above don't work
        const fallbackPatterns = [
            /block.*?(\d{1,3}(?:,\d{3})*)/i,  // Matches "block" followed by comma-formatted numbers
            /end.*?(\d{1,3}(?:,\d{3})*)/i     // Matches "end" followed by comma-formatted numbers
        ];
        
        for (const pattern of fallbackPatterns) {
            const match = pdfText.match(pattern);
            if (match && match[1]) {
                // Remove commas and convert to number
                const cleanNumber = match[1].replace(/,/g, '');
                const blockNumber = parseInt(cleanNumber);
                
                if (!isNaN(blockNumber) && blockNumber > 0 && blockNumber > 100000) {
                    console.log(`Found end block number (fallback): ${match[1]} → ${blockNumber}`);
                    return blockNumber;
                }
            }
        }
        
        console.log("Could not find end block number in the PDF text");
        console.log("PDF text sample:", pdfText.substring(0, 500)); // Debug: show first 500 chars
        return null;
    }

    extractLotteryNumbers(pdfText) {
        // Look for the pattern "Your Numbers:" followed by numbers and commas
        const pattern = /Your Numbers:\s*([\d\s,]+)/;
        const match = pdfText.match(pattern);
        
        if (match) {
            const numbersText = match[1];
            // Clean up the text and extract individual 8-digit numbers
            const numbers = numbersText.replace(/[\n\s,]/g, '').match(/\d{8}/g);
            return numbers || [];
        } else {
            console.log("Could not find 'Your Numbers:' in the PDF text");
            return [];
        }
    }

    async fetchBlockHash(blockHeight) {
        try {
            this.showLoading(`Fetching block hash for block ${blockHeight.toLocaleString()} from mempool.space...`);
            
            // Use mempool.space API to get block hash
            const response = await fetch(`https://mempool.space/api/block-height/${blockHeight}`);
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            const blockHash = await response.text();
            
            if (!blockHash || blockHash.length === 0) {
                throw new Error('Empty response from API');
            }
            
            console.log(`Fetched block hash for height ${blockHeight}: ${blockHash}`);
            return blockHash;
            
        } catch (error) {
            console.error('Error fetching block hash:', error);
            throw new Error(`Failed to fetch block hash: ${error.message}`);
        }
    }

    extractDigitsFromHash(blockHash) {
        // Extract only digits from a Bitcoin block hash, ignoring letters
        return blockHash.replace(/[^0-9]/g, '');
    }

    checkLotteryTiers(winningDigits, yourNumbers) {
        const results = {
            'tier1': [],  // 8 digits match
            'tier2': [],  // 7 digits match  
            'tier3': [],  // 6 digits match
            'tier4': [],  // 5 digits match
            'tier5': [],  // 4 digits match
            'tier6': []   // 3 digits match
        };
        
        // Make sure we have enough digits to check
        if (winningDigits.length < 8) {
            console.log(`Warning: Only ${winningDigits.length} digits found in hash. Need at least 8 for full check.`);
            return results;
        }
        
        // Get the last 8 digits from the hash (for Tier 1)
        const last8Digits = winningDigits.slice(-8);
        
        console.log(`Winning digits from hash (last 8): ${last8Digits}`);
        console.log(`Total digits in hash: ${winningDigits.length}`);
        console.log(`Total numbers to check: ${yourNumbers.length}`);
        
        // Check each of your numbers against all tiers
        yourNumbers.forEach(number => {
            // Tier 1: Check last 8 digits match exactly
            if (number.length >= 8 && number.slice(-8) === last8Digits) {
                results.tier1.push(number);
            }
            
            // Tier 2: Check last 7 digits match
            if (number.length >= 7 && number.slice(-7) === last8Digits.slice(-7)) {
                results.tier2.push(number);
            }
            
            // Tier 3: Check last 6 digits match  
            if (number.length >= 6 && number.slice(-6) === last8Digits.slice(-6)) {
                results.tier3.push(number);
            }
                
            // Tier 4: Check last 5 digits match
            if (number.length >= 5 && number.slice(-5) === last8Digits.slice(-5)) {
                results.tier4.push(number);
            }
                
            // Tier 5: Check last 4 digits match
            if (number.length >= 4 && number.slice(-4) === last8Digits.slice(-4)) {
                results.tier5.push(number);
            }
                
            // Tier 6: Check last 3 digits match
            if (number.length >= 3 && number.slice(-3) === last8Digits.slice(-3)) {
                results.tier6.push(number);
            }
        });
        
        return results;
    }

    extractLightningAddress(pdfText) {
    // Look for patterns like "Jackpot Payee Address:", "Lightning Address:", etc.
    const patterns = [
        /Jackpot Payee Address:\s*([^\s\n]+@[^\s\n]+)/i,
        /Lightning Address:\s*([^\s\n]+@[^\s\n]+)/i,
        /Payee Address:\s*([^\s\n]+@[^\s\n]+)/i,
        /Prize Address:\s*([^\s\n]+@[^\s\n]+)/i,
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/ // General email pattern as fallback
    ];
    
    for (const pattern of patterns) {
        const match = pdfText.match(pattern);
        if (match && match[1]) {
            console.log(`Found lightning address: ${match[1]}`);
            return match[1];
        }
    }
    
    console.log("Could not find lightning address in the PDF text");
    return null;
    }

    async fetchAndCheckResults(endBlockNumber, lotteryNumbers, lightningAddress) {
        if (!lotteryNumbers || lotteryNumbers.length === 0) {
            this.showResults(`
                <div class="no-wins">
                    ❌ No lottery numbers found in the PDF.<br>
                    Please make sure your PDF contains 'Your Tickets Numbers:' followed by 8-digit numbers
                </div>
            `);
            return;
        }
        
        try {
            // Fetch the block hash from mempool.space API
            const blockHash = await this.fetchBlockHash(endBlockNumber);
            
            // Extract only digits from the Bitcoin block hash
            const winningDigits = this.extractDigitsFromHash(blockHash);
            
            // Check for winning combinations
            const results = this.checkLotteryTiers(winningDigits, lotteryNumbers);

            // Celebrate wins with confetti!
            this.celebrateWins(results);
            
            // Display results
            this.displayResults(results, lotteryNumbers.length, endBlockNumber, blockHash, lightningAddress);
            
        } catch (error) {
            this.showResults(`
                <div class="no-wins">
                    ❌ Error: ${error.message}<br>
                    Please check your internet connection and try again.
                </div>
            `);
        }
    }

displayResults(results, totalNumbers, endBlockNumber, blockHash, lightningAddress) {
    const tierNames = {
        'tier1': 'Tier 1 (8 digits) - 40% of the pool prize',
        'tier2': 'Tier 2 (7 digits) - 25% of the pool prize', 
        'tier3': 'Tier 3 (6 digits) - 15% of the pool prize',
        'tier4': 'Tier 4 (5 digits) - 10% of the pool prize',
        'tier5': 'Tier 5 (4 digits) - 6% of the pool prize',
        'tier6': 'Tier 6 (3 digits) - 4% of the pool prize'
    };
    
    // Extract only the digits from the hash and get last 8
    const digitsOnly = blockHash.replace(/[^0-9]/g, '');
    const last8Digits = digitsOnly.slice(-8);
    
    // Create the highlighted block hash display (keeping all letters)
    const hashDisplay = this.createHighlightedHash(blockHash);
    
    let resultsHTML = `
        <p><strong>End Block Number:</strong> <a href="https://mempool.space/block/${endBlockNumber}" target="_blank" class="block-link">${endBlockNumber.toLocaleString()}</a></p>
        <p><strong>Block Hash:</strong> ${hashDisplay}</p>
        <p><strong>Winning Digits (last 8):</strong> <span class="winning-digits">${last8Digits}</span></p>
        <p><strong>Numbers checked:</strong> ${totalNumbers}</p>
        <hr>
    `;

    // Add lightning address info if found
    if (lightningAddress) {
        resultsHTML += `
            <p><strong>Jackpot Payee Address:</strong> <span class="lightning-address">${lightningAddress}</span></p>
        `;
    }
    
    let anyWins = false;
    let totalWins = 0;
    
    Object.entries(results).forEach(([tier, matches]) => {
        if (matches.length > 0) {
            anyWins = true;
            totalWins += matches.length;
            resultsHTML += `
                <div class="winning-tier">
                    <strong>🎉 ${tierNames[tier]}:</strong><br>
                    ${matches.map(match => `<div class="winning-number">- ${match}</div>`).join('')}
                </div>
            `;
        } else {
            resultsHTML += `
                <div class="losing-tier">
                    <strong>❌ ${tierNames[tier]}:</strong> No matches
                </div>
            `;
        }
    });
    
    if (!anyWins) {
        resultsHTML = `
            <div class="no-wins">
                💔 No winning combinations found in your ${totalNumbers} numbers.
            </div>
        `;
    } else {
        let winMessage = `<strong>🎊 Congratulations!</strong><br>You found ${totalWins} winning number(s)!`;
        
        if (lightningAddress) {
            winMessage += `<br>The prize has been sent to this lightning address: <span class="lightning-address-highlight">${lightningAddress}</span>`;
        } else {
            winMessage += `<br><small>(Note: Could not find jackpot payee address in PDF)</small>`;
        }
        
        resultsHTML += `
            <div class="winning-tier" style="text-align: center; margin-top: 20px;">
                ${winMessage}
            </div>
        `;
    }
    
    this.showResults(resultsHTML);
}   

// Helper method to create highlighted hash display while keeping all characters
createHighlightedHash(fullHash) {
    // Get all digit positions
    const digitPositions = [];
    for (let i = 0; i < fullHash.length; i++) {
        if (fullHash[i].match(/\d/)) {
            digitPositions.push(i);
        }
    }
    
    // We need the last 8 digit positions
    if (digitPositions.length < 8) return fullHash;
    
    const last8Positions = digitPositions.slice(-8);
    
    // Build the result string with highlighted digits
    let result = '';
    let lastPos = 0;
    
    for (let i = 0; i < last8Positions.length; i++) {
        const pos = last8Positions[i];
        
        // Add text before this digit
        result += fullHash.substring(lastPos, pos);
        
        // Add the highlighted digit
        result += `<span class="highlighted-hash-digits">${fullHash[pos]}</span>`;
        
        lastPos = pos + 1;
    }
    
    // Add remaining text after the last highlighted digit
    result += fullHash.substring(lastPos);
    
    return result;
}

    showLoading(message = 'Processing PDF... Please wait.') {
        this.showResults(`<div class="loading">${message}</div>`);
    }

showResults(content) {
    const dropZone = document.getElementById('dropZone');
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsContent = document.getElementById('resultsContent');
    const closeBtn = document.getElementById('closeResults');
    
    // Hide drop zone and show results
    dropZone.classList.add('hidden');
    resultsContent.innerHTML = content;
    resultsContainer.style.display = 'block';
    
    // Add close button event listener
    closeBtn.onclick = () => this.closeResults();
}

    closeResults() {
        const dropZone = document.getElementById('dropZone');
        const resultsContainer = document.getElementById('resultsContainer');
        const fileInput = document.getElementById('fileInput');
        
        // Show drop zone and hide results
        dropZone.classList.remove('hidden');
        resultsContainer.style.display = 'none';
        
        // Clear file input so same file can be selected again
        fileInput.value = '';
        
        // Hide any existing results
        this.hideResults();
    }

    hideResults() {
        const resultsContainer = document.getElementById('resultsContainer');
        resultsContainer.style.display = 'none';
    }
}

// Initialize the ticket verifier when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new TicketVerifier();
});