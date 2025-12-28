
// global variable to track current mood
let currentMood = '';

// ============================================================
// MOOD SYSTEM - Only 5 mutually exclusive states
// ============================================================
const MOOD_CATEGORIES = {
    
    // MOONING 🚀
    // Represents: Parabolic price surge, extreme bullish momentum
    // Conditions: Price increase >5% (daily), >10% (weekly), >20% (monthly), >50% (yearly)
    //             High volatility expected, but the sheer magnitude of gains dominates
    //             This is the "rocket ship" scenario - euphoria, FOMO, face-melting green candles
    // Meme suggestions: Rocket ships launching, "to the moon" animations, astronauts, 
    //                   Lamborghinis, excited Pepe, number-go-up technology, 
    //                   parabolic charts, "bull market is back" energy
    'MOONING': {
        emoji: '🚀',
        memes: [
            './img/bitcoinMoodMemes/MOONING_001.gif',
            './img/bitcoinMoodMemes/MOONING_002.gif',
            './img/bitcoinMoodMemes/MOONING_003.gif',
            './img/bitcoinMoodMemes/MOONING_004.gif',
            './img/bitcoinMoodMemes/MOONING_005.gif',
        ]
    },
    
    // BULLISH 📈
    // Represents: Healthy upward trend, confident organic growth
    // Conditions: Price increase between +1% and the mooning threshold
    //             Low volatility (<8% daily, <15% weekly) - smooth sailing
    //             Grinding higher without drama, accumulation phase
    // Meme suggestions: "Stonks" guy with confidence, steady uptrend charts,
    //                   smart money accumulation, "just stacking sats",
    //                   slow and steady wins, "this is fine" dog but happy,
    //                   calm investor drinking coffee while portfolio rises
    'BULLISH': {
        emoji: '📈',
        memes: [
            './img/bitcoinMoodMemes/BULLISH_001.gif',
            './img/bitcoinMoodMemes/BULLISH_002.gif',
            './img/bitcoinMoodMemes/BULLISH_003.gif',
            './img/bitcoinMoodMemes/BULLISH_004.gif',
            './img/bitcoinMoodMemes/BULLISH_005.gif',
            './img/bitcoinMoodMemes/BULLISH_006.gif',
            './img/bitcoinMoodMemes/BULLISH_007.gif',
            './img/bitcoinMoodMemes/BULLISH_008.gif',
            './img/bitcoinMoodMemes/BULLISH_009.gif',
            './img/bitcoinMoodMemes/BULLISH_010.gif',
            './img/bitcoinMoodMemes/BULLISH_011.webp',
        ]
    },
    
    // NEUTRAL 🥱
    // Represents: Sideways market, low volatility, boredom
    // Conditions: Price change between -1% and +1%
    //             Low volatility (<8% daily, <15% weekly)
    //             No clear direction, patient waiting game
    // Meme suggestions: Crabs walking sideways (crab market), sleeping investors,
    //                   waiting room, "boring" labels, flatline EKG,
    //                   "nothing is happening" energy, patience memes,
    //                   "wake me up when something happens"
    'NEUTRAL': {
        emoji: '🥱',
        memes: [
            './img/bitcoinMoodMemes/NEUTRAL_001.gif',
            './img/bitcoinMoodMemes/NEUTRAL_002.gif',
            './img/bitcoinMoodMemes/NEUTRAL_003.gif',
            './img/bitcoinMoodMemes/NEUTRAL_004.gif',
            './img/bitcoinMoodMemes/NEUTRAL_005.gif',
            './img/bitcoinMoodMemes/NEUTRAL_006.gif',
            './img/bitcoinMoodMemes/NEUTRAL_007.gif',
        ]
    },
    
    // CHOPPY 🔃
    // Represents: Sideways market with high volatility, indecision, whipsaw
    // Conditions: Price change between -1% and +1%
    //             High volatility (>=8% daily, >=15% weekly)
    //             Big moves that cancel out, fakeouts, bull/bear traps
    // Meme suggestions: Rollercoaster going sideways, waves crashing,
    //                   confusion, "chop" (karate hands), whipsaw machine,
    //                   traders getting rekt, "which way do I go?",
    //                   Bitcoin bouncing between support/resistance,
    //                   liquidations on both sides
    'CHOPPY': {
        emoji: '🔃',
        memes: [
            './img/bitcoinMoodMemes/CHOPPY_001.gif',
            './img/bitcoinMoodMemes/CHOPPY_002.gif',
            './img/bitcoinMoodMemes/CHOPPY_003.gif',
            './img/bitcoinMoodMemes/CHOPPY_004.gif',
            './img/bitcoinMoodMemes/CHOPPY_005.gif',
        ]
    },
    
    // BEARISH 📉
    // Represents: Downtrend, price dropping, fear and uncertainty
    // Conditions: Price decrease < -1% (any significant drop)
    //             VOLATILITY DOESN'T MATTER - if it's dropping, it's bearish
    //             Can be panic crash or steady bleed
    // Meme suggestions: Red candles everywhere, "buy the dip" (but scared),
    //                   fire parachute, "this is fine" dog surrounded by fire,
    //                   liquidations, dumping, bear market vibes,
    //                   "I should have sold", regret, panic selling,
    //                   "are we going to zero?"
    'BEARISH': {
        emoji: '📉',
        memes: [
            './img/bitcoinMoodMemes/BEARISH_001.gif',
            './img/bitcoinMoodMemes/BEARISH_002.gif',
            './img/bitcoinMoodMemes/BEARISH_003.gif',
            './img/bitcoinMoodMemes/BEARISH_004.gif',
            './img/bitcoinMoodMemes/BEARISH_005.gif',
            './img/bitcoinMoodMemes/BEARISH_006.gif',
            './img/bitcoinMoodMemes/BEARISH_007.gif',
        ]
    }
};

// ============================================================
// BITCOIN CELEBRATION CALENDAR - Add new dates here!
// Format: 'MM-DD': { name: 'Celebration Name', memes: [...], frequency: 0.5 }
// frequency = 0.5 means 50% chance to show a celebration meme
// ============================================================
const SPECIAL_DATES = {
    '01-03': { // January 3 - Genesis Block
        name: '🎂 Happy Bitcoin Birthday!',
        memes: [
            './img/bitcoinMoodMemes/HAPPYBIRTHDAYBITCON.jpg',
        ],
        frequency: 0.6 // 50% chance to show birthday meme
    },
    '10-31': { // October 31 - Whitepaper Day
        name: '📄 Happy Bitcoin Whitepaper Day!',
        memes: [
            './img/bitcoinMoodMemes/HAPPYBITCOINWHITEPAPERDAY.jpg',
        ],
        frequency: 0.6 // Higher chance for this important day
    },
    '05-22': { // May 22 - Bitcoin Pizza Day
        name: '🍕 Happy Bitcoin Pizza Day!',
        memes: [
            './img/bitcoinMoodMemes/BITCOINPIZZADAY_001',
            './img/bitcoinMoodMemes/BITCOINPIZZADAY_002',
            './img/bitcoinMoodMemes/BITCOINPIZZADAY_003',
            './img/bitcoinMoodMemes/BITCOINPIZZADAY_004',
        ],
        frequency: 0.6 // Very high chance - this is THE meme day
    },
    // '11-09': { // any date - test
    //     name: '🍕 Test!',
    //     memes: [
    //         './img/bitcoinMoodMemes/NEUTRAL_006.gif',
    //     ],
    //     frequency: 0.7 // Very high chance - this is THE meme day
    // },
    // Note: Halving is DYNAMIC and handled separately
};

// ============================================================
// DYNAMIC HALVING DATE FROM MEMPOOL API
// ============================================================

// Halving celebration definition (checked dynamically against API date)
const HALVING_CELEBRATION = {
    name: '🪓 Bitcoin Halving Day!',
    memes: [
        './img/bitcoinMoodMemes/HALVINGISNEAR_001.gif',
    ],
    frequency: 0.5
};
let nextHalvingDate = null; // Will be populated from API

// ============================================================
// ATH STATE MANAGEMENT
// ============================================================
let athState = {
    historicalATH: 0,
    sessionATH: 0,
    initialized: false
};

// Update ATH from ANY successful API
function updateATHFromPrice(currentPrice, source) {
    console.log(`🎯 Checking ATH from ${source}: $${currentPrice.toLocaleString()}`);
    
    if (!currentPrice || currentPrice <= 0) return;
    
    // Don't celebrate if ATH never loaded properly
    if (!athState.initialized) {
        console.log('⚠️ ATH not initialized, skipping celebration');
        athState.sessionATH = Math.max(athState.sessionATH, currentPrice);
        return;
    }
    
    // Only celebrate genuine new ATHs
    if (currentPrice > athState.historicalATH) {
        console.log(`🎉 REAL NEW ATH DETECTED: $${currentPrice.toLocaleString()}!`);
        athState.historicalATH = currentPrice;
        celebrateATH();
    }
}

async function initializeATH() {
    await fetchHistoricalATH();
    setInterval(() => fetchHistoricalATH(), 5 * 60 * 1000);
}

async function fetchHistoricalATH() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin?market_data=true');
        const data = await response.json();
        const newATH = data.market_data?.ath?.usd;
        
        if (newATH && newATH > 0) {
            athState.historicalATH = newATH;
            athState.initialized = true; // Mark as successfully loaded
            console.log(`✅ ATH initialized: $${newATH.toLocaleString()}`);
        }
    } catch (error) {
        console.warn('❌ ATH fetch failed - disabling ATH checks:', error.message);
        athState.initialized = false; // Ensure false if fetch fails
    }
}


// CHECK ATH STATUS - Returns string for display
function checkATHStatus(currentPrice, timeframe) {
    if (timeframe !== 'daily' || !athState.initialized) return '';
    
    const distance = ((currentPrice - athState.historicalATH) / athState.historicalATH) * 100;
    
    if (currentPrice > athState.historicalATH) {
        return '🏆 NEW ATH!';
    }
    
    if (distance >= -5) {
        return `📊 ${Math.abs(distance).toFixed(1)}% from ATH`;
    }
    
    return '';
}

// ============================================================
// CORE MOOD DETERMINATION - Hierarchical logic
// ============================================================
function calculateMood(priceChangePercent, volatilityPercent, timeframe) {
    const change = parseFloat(priceChangePercent);
    const vol = parseFloat(volatilityPercent);
    const thresholds = getThresholds(timeframe);
    
    // Priority 1: Extreme bull (mooning)
    if (change > thresholds.mooning) {
        return 'MOONING';
    }
    
    // Priority 2: Strong bull (moderate gains)
    if (change > 1) { // +1% to mooning threshold
        // Even bullish trends can be volatile
        if (vol >= thresholds.highVolatility) {
            return 'CHOPPY'; // Bullish but wild
        }
        return 'BULLISH'; // Healthy uptrend
    }
    
    // Priority 3: Bearish (dropping)
    if (change < -1) {
        return 'BEARISH';
    }
    
    // Priority 4: Neutral range (-1% to +1%)
    if (vol >= thresholds.highVolatility) {
        return 'CHOPPY'; // Sideways volatility
    }
    return 'NEUTRAL'; // Boring sideways
}

// THRESHOLDS
function getThresholds(timeframe) {
    const base = {
        daily:      { mooning: 5,  highVolatility: 8 },
        weekly:     { mooning: 10, highVolatility: 15 },
        monthly:    { mooning: 20, highVolatility: 25 },
        yearly:     { mooning: 50, highVolatility: 80 }
    };
    return base[timeframe] || base.daily;
}


// ============================================================
// MEME & DISPLAY FUNCTIONS
// ============================================================

// Get today's celebration (static or dynamic)
function getTodaysCelebration() {
    const today = new Date();
    const monthDay = String(today.getUTCMonth() + 1).padStart(2, '0') + '-' + String(today.getUTCDate()).padStart(2, '0');
    
    if (SPECIAL_DATES[monthDay]) return SPECIAL_DATES[monthDay];
    if (isHalvingDay()) return HALVING_CELEBRATION;
    return null;
}

// Check if today is halving day
function isHalvingDay() {
    if (!nextHalvingDate) return false;
    const today = new Date();
    return today.getUTCMonth() === nextHalvingDate.getUTCMonth() && today.getUTCDate() === nextHalvingDate.getUTCDate();
}

// Fetch next halving date from Mempool.space
async function fetchHalvingDate() {
    try {
        const response = await fetch('https://mempool.space/api/blocks/tip/height');
        if (!response.ok) throw new Error('Failed to fetch block height');
        
        const currentHeight = await response.json();
        const HALVING_INTERVAL = 210000;
        const nextHalvingHeight = Math.ceil(currentHeight / HALVING_INTERVAL) * HALVING_INTERVAL;
        const blocksUntilHalving = nextHalvingHeight - currentHeight;
        
        // Estimate: 10 minutes per block
        const secondsUntilHalving = blocksUntilHalving * 600;
        nextHalvingDate = new Date(Date.now() + secondsUntilHalving * 1000);
        
        console.log(`✅ Next halving: ${nextHalvingDate.toDateString()}`);
    } catch (error) {
        console.warn('❌ Halving fetch failed (graceful):', error.message);
        nextHalvingDate = null; // Graceful degradation
    }
}

// Global variable to track current timeframe
let currentTimeframe = 'daily'; // Default

// Function to update active button
function updateActiveButton(selectedTimeframe) {
    // Remove 'active' class from all buttons
    document.querySelectorAll('.controls button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Add 'active' class to selected button
    const buttons = document.querySelectorAll('.controls button');
    const index = ['daily', 'weekly', 'monthly', 'yearly'].indexOf(selectedTimeframe);
    if (index !== -1) {
        buttons[index].classList.add('active');
    }
}

// DISPLAY & MODAL
function displayMood(currentPrice, priceChange, volatility, mood, timeframe, source) {
    
    // Update modal title with timeframe
    document.getElementById('modal-timeframe-title').textContent = 
        `${getTimeframeDisplayName(timeframe)} Mood`;

    // Update MOOD (exists in HTML)
    const moodData = MOOD_CATEGORIES[mood];
    document.getElementById('mood-text').textContent = `${moodData.emoji} ${mood}`;
    document.getElementById('mood-text').setAttribute('data-mood', mood);
    
    // Update MEME (exists in HTML)
    const memeImage = document.getElementById('meme-image');
    memeImage.setAttribute('data-mood', mood);
    memeImage.src = getRandomMeme(mood, false);
    memeImage.alt = `${mood} meme`;
    // memeImage.onclick = nextMeme; // click handler
    memeImage.style.cursor = 'pointer';
    
    // Update CELEBRATION (exists in HTML)
    const celebration = getTodaysCelebration();
    const celebrationText = celebration ? celebration.name : '';
    document.getElementById('celebration-text').textContent = celebrationText;
    document.getElementById('celebration-text').classList.toggle('hidden', !celebration);
    
    // MODAL elements (these exist in the modal HTML)
    document.getElementById('modal-current-price').textContent = 
        currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('modal-price-change').textContent = `${priceChange.toFixed(2)}%`;
    document.getElementById('modal-price-change').style.color = priceChange >= 0 ? '#00aa00' : '#ff4444';
    document.getElementById('modal-volatility').textContent = `${volatility.toFixed(2)}%`;
    document.getElementById('modal-timeframe-text').textContent = 
        { daily: 'Today', weekly: 'This Week', monthly: 'This Month', yearly: 'This Year' }[timeframe] || timeframe;
    document.getElementById('modal-source-text').textContent = `via ${source}`;
    document.getElementById('modal-celebration-text').textContent = celebrationText;
    document.getElementById('modal-celebration-text').classList.toggle('hidden', !celebration);
    
    // ATH celebration
    const athStatus = checkATHStatus(currentPrice, timeframe);
    if (athStatus.includes('NEW ATH')) {
        celebrateATH();
    }
    
    // Show display
    hideLoading();
    showMoodDisplay();
}

// ============================================================
// API CONFIGURATION & TIMEOUT PROTECTION
// ============================================================
const API_TIMEOUT = 5000; // 5 seconds max per API
const FALLBACK_APIS = [
    { name: 'CoinGecko', func: fetchCoinGeckoData, priority: 1 },
    { name: 'Binance', func: fetchBinanceData, priority: 2 },
    { name: 'CoinStats', func: fetchCoinStatsData, priority: 3 },
    { name: 'CoinPaprika', func: fetchCoinPaprikaData, priority: 4 }
];

// Helper: Fetch with timeout
async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);
    
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);
        return response;
    } catch (error) {
        clearTimeout(timeout);
        throw error;
    }
}

// ============================================================
// API 1: COINGECKO (PRIMARY)
// ============================================================
async function fetchCoinGeckoData(timeframe) {
    console.log(`🔄 Trying CoinGecko...`);
    try {
        let url, priceChange, volatility, currentPrice;
        
        if (timeframe === 'daily') {
            // ✅ URL IS VALID - editor grey is just visual wrapping
            url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_high=true&include_24hr_low=true&include_last_updated_at=true';
            
            const response = await fetchWithTimeout(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            const bitcoin = data.bitcoin;
            
            currentPrice = bitcoin.usd;
            priceChange = bitcoin.usd_24h_change;
            volatility = bitcoin.usd_24h_high && bitcoin.usd_24h_low ? 
                ((bitcoin.usd_24h_high - bitcoin.usd_24h_low) / bitcoin.usd_24h_low) * 100 : 
                Math.abs(priceChange) * 1.5;
                
        } else {
            // Longer timeframes
            const daysMap = { weekly: 7, monthly: 30, yearly: 365 };
            url = `https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${daysMap[timeframe]}&interval=daily`;
            
            const response = await fetchWithTimeout(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            const prices = data.prices.map(p => p[1]);
            
            currentPrice = prices[prices.length - 1];
            priceChange = ((currentPrice - prices[0]) / prices[0]) * 100;
            volatility = ((Math.max(...prices) - Math.min(...prices)) / Math.min(...prices)) * 100;
        }
        
        console.log(`✅ CoinGecko success: $${currentPrice.toLocaleString()}`);
        return { currentPrice, priceChange, volatility, source: 'CoinGecko' };
        
    } catch (error) {
        console.warn(`❌ CoinGecko failed: ${error.message}`);
        throw error; // Let fetchMood handle fallback
    }
}

// ============================================================
// API 2: BINANCE (FALLBACK 1) - VERY RELIABLE
// ============================================================
async function fetchBinanceData(timeframe) {
    console.log(`🔄 Trying Binance...`);
    try {
        // Get current price
        const priceResp = await fetchWithTimeout('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        if (!priceResp.ok) throw new Error(`HTTP ${priceResp.status}`);
        
        const priceData = await priceResp.json();
        currentPrice = parseFloat(priceData.price);
        
        // Get 24h stats
        const statsResp = await fetchWithTimeout('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
        if (!statsResp.ok) throw new Error(`HTTP ${statsResp.status}`);
        
        const statsData = await statsResp.json();
        
        let priceChange, volatility;
        if (timeframe === 'daily') {
            priceChange = parseFloat(statsData.priceChangePercent);
            volatility = ((parseFloat(statsData.highPrice) - parseFloat(statsData.lowPrice)) / parseFloat(statsData.lowPrice)) * 100;
        } else {
            // Approximate for longer timeframes
            priceChange = parseFloat(statsData.priceChangePercent);
            volatility = Math.abs(priceChange) * 1.2;
        }
        
        console.log(`✅ Binance success: $${currentPrice.toLocaleString()}`);
        return { currentPrice, priceChange, volatility, source: 'Binance' };
        
    } catch (error) {
        console.warn(`❌ Binance failed: ${error.message}`);
        throw error;
    }
}

// ============================================================
// API 3: COINSTATS (FALLBACK 2)
// ============================================================
async function fetchCoinStatsData(timeframe) {
    console.log(`🔄 Trying CoinStats...`);
    try {
        const response = await fetchWithTimeout('https://api.coinstats.app/public/v1/coins/bitcoin?currency=USD');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const coin = data.coin;
        
        const currentPrice = coin.price;
        const changeMap = {
            daily: coin.priceChange1d,
            weekly: coin.priceChange1w,
            monthly: coin.priceChange1m,
            yearly: coin.priceChange1y
        };
        
        const priceChange = changeMap[timeframe] || coin.priceChange1d;
        const volatility = Math.abs(priceChange) * 1.5; // Estimate
        
        console.log(`✅ CoinStats success: $${currentPrice.toLocaleString()}`);
        return { currentPrice, priceChange, volatility, source: 'CoinStats' };
        
    } catch (error) {
        console.warn(`❌ CoinStats failed: ${error.message}`);
        throw error;
    }
}

// ============================================================
// API 4: COINPAPRIKA (FALLBACK 3)
// ============================================================
async function fetchCoinPaprikaData(timeframe) {
    console.log(`🔄 Trying CoinPaprika...`);
    try {
        const response = await fetchWithTimeout('https://api.coinpaprika.com/v1/tickers/btc-bitcoin');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        const quotes = data.quotes.USD;
        
        const currentPrice = quotes.price;
        const changeMap = {
            daily: quotes.percent_change_24h,
            weekly: quotes.percent_change_7d,
            monthly: quotes.percent_change_30d,
            yearly: quotes.percent_change_1y
        };
        
        const priceChange = changeMap[timeframe] || quotes.percent_change_24h;
        const volatility = Math.abs(priceChange) * 1.3; // Estimate
        
        console.log(`✅ CoinPaprika success: $${currentPrice.toLocaleString()}`);
        return { currentPrice, priceChange, volatility, source: 'CoinPaprika' };
        
    } catch (error) {
        console.warn(`❌ CoinPaprika failed: ${error.message}`);
        throw error;
    }
}

// ============================================================
// MAIN FETCH FUNCTION WITH SEQUENTIAL FALLBACK
// ============================================================
async function fetchMood(timeframe) {
    currentTimeframe = timeframe; // Store current timeframe
    updateActiveButton(timeframe); // Update button glow

    // Clear meme tracker when switching timeframes
    Object.keys(lastMemeDisplayed).forEach(key => {
        lastMemeDisplayed[key] = null;
    });

    showLoading();
    hideError();
    hideMoodDisplay();
    
    const apis = [
        { func: fetchCoinGeckoData, name: 'CoinGecko' },
        { func: fetchBinanceData, name: 'Binance' },
        { func: fetchCoinStatsData, name: 'CoinStats' },
        { func: fetchCoinPaprikaData, name: 'CoinPaprika' }
    ];
    
    for (const api of apis) {
        try {
            console.log(`\n🎯 Attempting ${api.name}...`);
            const result = await api.func(timeframe);
            
            // CRITICAL: Update ATH state from this successful API call
            updateATHFromPrice(result.currentPrice, api.name);
            
            const mood = calculateMood(result.priceChange, result.volatility, timeframe);
            displayMood(result.currentPrice, result.priceChange, result.volatility, mood, timeframe, result.source);
            return; // Success - exit
            
        } catch (error) {
            console.warn(`⏭️ ${api.name} failed: ${error.message}`);
        }
    }
    
    showError('All Bitcoin APIs failed. Please try again later.');
}

// ============================================================
// VISUAL CONFIRMATION: Test URLs in browser console
// ============================================================
console.log('✅ API URLs are valid. To test manually, paste this in browser console:');
console.log(`
// Test CoinGecko URL (should return JSON):
fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true')
.then(r => r.json())
.then(d => console.log('✅ CoinGecko works:', d.bitcoin.usd.toLocaleString()));
`);


// ============================================================
// MODAL CONTROLS FOR PRICE INFO
// ============================================================

function openPriceModal() {
    const modal = document.getElementById('priceInfoModal');
    modal.classList.add('show');
    modal.style.display = 'block';
}

function closePriceModal() {
    const modal = document.getElementById('priceInfoModal');
    modal.classList.remove('show');
    modal.style.display = 'none';
}


// ESC key to close modal
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closePriceModal();
    }
});


// ============================================================
// HELPER FUNCTIONS
// ============================================================

const MAX_RETRIES = 3;
const GUARANTEED_FALLBACK = './img/bitcoinMoodMemes/TITCOIN.gif';
// Track last displayed meme per mood to prevent repeats
const lastMemeDisplayed = {};

function getRandomMeme(moodKey, isErrorRetry) {
    // Handle missing second parameter (for older JS engines)
    if (isErrorRetry === undefined) {
        isErrorRetry = false;
    }
    
    const celebration = getTodaysCelebration();
    let memes;

    if (celebration && Math.random() < celebration.frequency) {
        memes = celebration.memes;
    } else {
        const mood = MOOD_CATEGORIES[moodKey];
        memes = mood?.memes || MOOD_CATEGORIES.NEUTRAL.memes;
    }

    if (memes.length <= 1) {
        return memes[0];
    }

    let selectedMeme;
    let attempts = 0;
    const maxAttempts = 10;

    do {
        selectedMeme = memes[Math.floor(Math.random() * memes.length)];
        attempts++;
    } while (
        !isErrorRetry && 
        lastMemeDisplayed[moodKey] === selectedMeme && 
        attempts < maxAttempts
    );

    // Only update history on user clicks (not error retries)
    if (!isErrorRetry) {
        lastMemeDisplayed[moodKey] = selectedMeme;
    }

    return selectedMeme;
}

function setupImageErrorHandling() {
    const memeImage = document.getElementById('meme-image');
    let retryCount = 0;
    
    memeImage.onerror = function() {
        retryCount++;
        const mood = this.getAttribute('data-mood') || 'NEUTRAL';
        console.warn(`[Retry ${retryCount}] Failed: ${this.src}`);
        
        if (retryCount >= MAX_RETRIES) {
            console.error('❌ Max retries, using guaranteed fallback');
            this.src = GUARANTEED_FALLBACK;
            return;
        }
        
        // PASS TRUE to skip history update
        this.src = getRandomMeme(mood, true);
    };
    
    memeImage.onload = function() {
        retryCount = 0;
        this.classList.remove('loading');
    };
}

// ATH celebration effects
function celebrateATH() {
    // Add celebratory styles
    document.body.style.animation = 'pulse 0.5s 3';
    
    // Create confetti effect
    createConfetti();
    
    // Play sound if you add one
    // playCelebrationSound();
    
    // Show ATH notification
    showATHNotification();
}

function createConfetti() {
    // Simple confetti effect
    const confettiCount = 50;
    for (let i = 0; i < confettiCount; i++) {
        setTimeout(() => {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.background = ['#f7931a', '#ffd700', '#ffffff', '#4caf50'][Math.floor(Math.random() * 4)];
            confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
            document.body.appendChild(confetti);
            
            // Remove confetti after animation
            setTimeout(() => confetti.remove(), 5000);
        }, i * 100);
    }
}

function showATHNotification() {
    const notification = document.createElement('div');
    notification.className = 'ath-notification';
    notification.innerHTML = `
        <div class="ath-popup">
            <h2>🎉 NEW ALL-TIME HIGH! 🎉</h2>
            <p>Bitcoin has reached a new historical peak!</p>
            <button onclick="this.parentElement.parentElement.remove()">OK</button>
        </div>
    `;
    document.body.appendChild(notification);
}


function getTimeframeDisplayName(timeframe) {
    const names = {
        'daily': 'Daily',
        'weekly': 'Weekly',
        'monthly': 'Monthly',
        'yearly': 'Yearly'
    };
    return names[timeframe] || timeframe;
}


// nextMeme to use data attribute
function nextMeme() {
    const moodElement = document.getElementById('mood-text');
    const currentMood = moodElement.getAttribute('data-mood');
    const memeImage = document.getElementById('meme-image');
    const newMemePath = getRandomMeme(currentMood, false);
    memeImage.src = newMemePath;
    console.log('🎲 Next meme:', newMemePath);
}

// UI helper functions
function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('loading').textContent = 'Loading Bitcoin data...';
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function showMoodDisplay() {
    document.getElementById('mood-display').classList.remove('hidden');
}

function hideMoodDisplay() {
    document.getElementById('mood-display').classList.add('hidden');
}

function showError(message = 'Failed to fetch Bitcoin data. Please try again.') {
    const errorElement = document.getElementById('error');
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
    hideLoading();
}

function hideError() {
    document.getElementById('error').classList.add('hidden');
}

// INITIALIZATION
document.addEventListener('DOMContentLoaded', function() {
    setupImageErrorHandling();
    
    // Modal click handlers (only attach once)
    if (!document.getElementById('priceInfoModal').hasAttribute('data-handler-attached')) {
        document.getElementById('priceInfoModal').addEventListener('click', function(e) {
            if (e.target === this) closePriceModal();
        });
        document.getElementById('priceInfoModal').setAttribute('data-handler-attached', 'true');
    }

    // ESC key handler (only attach once)
    if (!document.body.hasAttribute('data-esc-handler-attached')) {
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closePriceModal();
        });
        document.body.setAttribute('data-esc-handler-attached', 'true');
    }

    // Info button (only attach once)
    const infoBtn = document.getElementById('mood-info-modal-btn');
    if (!infoBtn.hasAttribute('data-click-attached')) {
        infoBtn.addEventListener('click', openPriceModal);
        infoBtn.setAttribute('data-click-attached', 'true');
    }

        // Remove existing handler before adding new one (prevents duplicates)
        const memeImage = document.getElementById('meme-image');
        memeImage.removeEventListener('click', nextMeme);
        memeImage.addEventListener('click', nextMeme);
        memeImage.style.cursor = 'pointer';
        memeImage.title = 'Click for next meme';

    // Set daily button as active by default
    updateActiveButton('daily');
    
    // Start data loading
    fetchHistoricalATH().then(() => {
        return fetchHalvingDate();
    }).then(() => {
        fetchMood('daily');
    });
});