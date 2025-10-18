// Configuration
const DATA_FOLDER = './historical_data/';
const EVENTS_FILE = './historical_data/bitcoinHistoricalEvents.json';

// Chart variables
let chart = null;
let currentData = null;
let historicalEventsFiltered = [];
let historicalEvents = [];
let isAutoLoading = false;
let loadTimeout = null;
let currentScaleType = 'log'; // Default to logarithmic
let satoshiQuotes = [];

// Event category colors
const eventCategoryColors = {
    'Technology': '#007bff',    // Blue
    'Market': '#ff6b35',        // Orange
    'Adoption': '#28a745',      // Green
    'Regulation': '#dc3545',    // Red
    'Security': '#6f42c1',      // Purple
    'Halving': '#ffffff'        // White
};

// Initialize when page loads
document.addEventListener('DOMContentLoaded', async function() {
    initializeChart();
    loadHistoricalEvents();
    await loadSatoshiQuotes();
    loadInitialData();
    setupAutoLoad();
    loadChartData(); // Auto-load on page load
    await fetchEUCBRates(); // Fetch EUCB rates first
    setInterval(fetchEUCBRates, 60 * 60 * 1000); 
    initializeSintraFeed(); // Then start Sintra WebSocket - start only after we have eucbRates
    hideZoomResetButton();   // Ensure zoom button starts hidden
});

function setupAutoLoad() {
    // Add event listeners for auto-load
    document.getElementById('currencySelect').addEventListener('change', debounceLoad);
    document.getElementById('eventFilter').addEventListener('change', debounceLoad);
    document.getElementById('timeRange').addEventListener('change', debounceLoad);
    // Scale changes don't reload data, just update the chart display
    document.getElementById('scaleType').addEventListener('change', function() {
        toggleScaleType();
    });
}

function debounceLoad() {
    // Clear existing timeout
    if (loadTimeout) {
        clearTimeout(loadTimeout);
    }
    
    // Set new timeout (300ms delay)
    loadTimeout = setTimeout(() => {
        loadChartData();
    }, 300);
}

function getCategoryIcon(category) {
    const icons = {
        'Technology': '⚙️',
        'Market': '📈',
        'Adoption': '🌍',
        'Regulation': '⚖️',
        'Security': '🔒',
        'Halving': '½'
    };
    return icons[category] || '⚡';
}


function initializeChart() {
    const ctx = document.getElementById('priceChart').getContext('2d');
    
    // Debug: Check if zoom plugin is available
    console.log('Chart.js Zoom Plugin:', typeof Chart.Zoom);

    // Store hover state
    let hoveredEvent = null;
    let hoveredPixelX = 0;
    let hoveredPixelY = 0;

    // 🎯 Store original range for zoom detection
    let originalXRange = null;

    // Register plugin for event markers
    const eventMarkerPlugin = {
        id: 'eventMarkers',
        afterDraw: (chart) => {
            if (!historicalEventsFiltered.length) return;
            
            const ctx = chart.ctx;
            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y;
            
            historicalEventsFiltered.forEach(event => {
                const eventDate = new Date(event.date);
                const pixelX = xAxis.getPixelForValue(eventDate);
                
                if (pixelX >= xAxis.left && pixelX <= xAxis.right) {

                    // 🎨 Get color based on event category
                    const eventColor = eventCategoryColors[event.category] || '#eee'; // Default white
                    // Draw vertical line
                    ctx.save();
                    ctx.strokeStyle = eventColor;
                    ctx.setLineDash([5, 3]);
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(pixelX, yAxis.top);
                    ctx.lineTo(pixelX, yAxis.bottom);
                    ctx.stroke();
                    ctx.restore();
                    
                    // Draw label with category-specific color
                    ctx.save();
                    ctx.fillStyle = eventColor;
                    ctx.fillRect(pixelX - 25, yAxis.top, 50, 20);
                    ctx.fillStyle = event.category === 'Halving' ? '#000000' : '#ffffff'; // Black text for white background
                    ctx.font = 'bold 10px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    // Use category icon or abbreviation
                    const categoryIcon = getCategoryIcon(event.category);
                    ctx.fillText(categoryIcon, pixelX, yAxis.top + 10);
                    ctx.restore();

                    // Store event position for hover detection
                    event.pixelX = pixelX;
                    event.labelTop = yAxis.top;

                    // 🆕 DEBUG: Log what we're storing
                    console.log('📍 Storing coordinates for event:', {
                        id: event.id,
                        title: event.title, 
                        pixelX: pixelX,
                        labelTop: yAxis.top,
                        hasId: !!event.id
                    });
                }
            });

            // 🆕 DEBUG: Check what events are available for clicking
            console.log('📋 Events in historicalEventsFiltered:', historicalEventsFiltered.map(e => ({
                id: e.id,
                title: e.title,
                hasPixelX: !!e.pixelX,
                hasLabelTop: !!e.labelTop
            })));

            // 🎯 Draw hover tooltip if an event is hovered
            if (hoveredEvent) {
                drawEventTooltip(chart, hoveredEvent, hoveredPixelX, hoveredPixelY);
            }
        }
    };
    
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Satoshi per 1 Unit',
                data: [],
                borderColor: '#f2a900',
                backgroundColor: 'rgba(242, 169, 0, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.1,
                pointRadius: 0,
                pointHoverRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
                // 🎯 MOVE ZOOM EVENT LISTENERS HERE (not inside plugins)
                onZoom: function(context) {
                    console.log('🎯 onZoom event fired!', context);
                    checkZoomState();
                },
                onPan: function(context) {
                    console.log('🎯 onPan event fired!', context);
                    checkZoomState();
            },
            // Event hover detection
            onHover: (event, elements) => {
                const canvas = event.native.target;
                const rect = canvas.getBoundingClientRect();
                const x = event.native.clientX - rect.left;
                const y = event.native.clientY - rect.top;
                
                // Check if hovering over an event marker
                const hovered = historicalEventsFiltered.find(ev => {
                    if (!ev.pixelX || !ev.labelTop) return false;
                    
                    // Check if mouse is over the event label (top area)
                    const isOverLabel = 
                        x >= ev.pixelX - 25 && 
                        x <= ev.pixelX + 25 && 
                        y >= ev.labelTop && 
                        y <= ev.labelTop + 20;
                    
                    return isOverLabel;
                });
                
                if (hovered) {
                    hoveredEvent = hovered;
                    hoveredPixelX = x;
                    hoveredPixelY = y;
                    canvas.style.cursor = 'pointer';
                    chart.update(); // Redraw to show tooltip
                } else {
                    if (hoveredEvent) {
                        hoveredEvent = null;
                        chart.update(); // Redraw to remove tooltip
                    }
                    canvas.style.cursor = 'default';
                }
            },
            // Event click handler
            onClick: (event, elements) => {
                const canvas = event.native.target;
                const rect = canvas.getBoundingClientRect();
                const x = event.native.clientX - rect.left;
                const y = event.native.clientY - rect.top;
                
                console.log('🎯 Chart clicked at:', { x, y });

                // Check if clicking on an event marker
                    const clicked = historicalEventsFiltered.find(ev => {
                        if (!ev.pixelX || !ev.labelTop) {
                            console.log('❌ Event missing pixel coordinates:', ev.id);
                            return false;
                        }
                    
                    const isOverLabel = 
                        x >= ev.pixelX - 25 && 
                        x <= ev.pixelX + 25 && 
                        y >= ev.labelTop && 
                        y <= ev.labelTop + 20;

                    console.log(`🔍 Checking event ${ev.id}:`, { 
                        eventX: ev.pixelX, 
                        eventY: ev.labelTop,
                        clickX: x, 
                        clickY: y,
                        isOverLabel 
                    });
                    return isOverLabel;
                });
                
                if (clicked) {
                    console.log('✅ Clicked on event marker:', clicked.id, clicked.title);
                    showEventDetails(clicked.id);
                } else {
                    console.log('❌ No event marker clicked');
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        // 🆕 Dynamic unit based on zoom level
                        unit: function(context) {
                            if (!chart) return 'year';
                            
                            const xScale = chart.scales.x;
                            if (!xScale) return 'year';
                            
                            const range = xScale.max - xScale.min;
                            const oneDay = 24 * 60 * 60 * 1000;
                            
                            // Determine unit based on visible time range
                            if (range <= oneDay * 7) { // 1 week or less
                                return 'day';
                            } else if (range <= oneDay * 30) { // 1 month or less
                                return 'week';
                            } else if (range <= oneDay * 90) { // 3 months or less
                                return 'month';
                            } else if (range <= oneDay * 365) { // 1 year or less
                                return 'quarter';
                            } else {
                                return 'year';
                            }
                        },
                        // 🆕 Dynamic display formats
                        displayFormats: {
                            millisecond: 'HH:mm:ss',
                            second: 'HH:mm:ss',
                            minute: 'HH:mm',
                            hour: 'HH:mm',
                            day: 'MMM dd',
                            week: 'MMM dd',
                            month: 'MMM yyyy',
                            quarter: 'QQQ yyyy',
                            year: 'yyyy'
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#888',
                        maxTicksLimit: 12, // 🆕 Increased for better detail when zoomed
                        // 🆕 Auto-rotation for better readability
                        autoSkip: true,
                        maxRotation: 45,
                        minRotation: 0
                    }
                },
                y: {
                    type: 'logarithmic',
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#888',
                        callback: function(value) {
                            if (value >= 1000000) {
                                return (value / 1000000).toFixed(1) + 'M sats';
                            } else if (value >= 1000) {
                                return (value / 1000).toFixed(1) + 'K sats';
                            }
                            return value.toLocaleString() + ' sats';
                        }
                    }
                }
            },
            plugins: {
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        modifierKey: 'shift',
                    },
                    zoom: {
                        wheel: {
                            enabled: true,
                            speed: 0.1, // Smaller = slower zoom
                        },
                        pinch: {
                            enabled: true
                        },
                        drag: {
                            enabled: false // Disable drag-to-zoom (use wheel/pinch only)
                        },
                        mode: 'x', // Zoom only on x-axis (time)
                    },
                limits: {
                    x: { 
                        min: 'original', 
                        max: 'original',
                        minRange: 1000 * 60 * 60 * 24 * 30 // Minimum 30 days zoom
                    }
                }
                },
                legend: {
                    labels: {
                        color: '#f0f0f0',
                        font: {
                            size: 14
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.9)',
                    titleColor: '#f2a900',
                    bodyColor: '#f0f0f0',
                    borderColor: '#333',
                    borderWidth: 1,
                    callbacks: {
                        title: function(context) {
                            return new Date(context[0].parsed.x).toLocaleDateString();
                        },
                        label: function(context) {
                            const value = context.parsed.y;
                            const btcPrice = (100000000 / value).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            });
                            return [
                                `Sats per unit: ${Math.round(value).toLocaleString()}`,
                                `BTC price: ${btcPrice} ${getSelectedCurrency()}`
                            ];
                        }
                    }
                }
            }
        },
        plugins: [eventMarkerPlugin]
    });
        // 🎯 Store original range after chart is created
    setTimeout(() => {
        if (chart && chart.scales.x) {
            originalXRange = chart.scales.x.max - chart.scales.x.min;
            console.log('Original X range stored:', originalXRange);
        }
    }, 1000);
}

// 🎯 SIMPLE POLLING SOLUTION - Add this after chart creation
function startZoomPolling() {
    let lastRange = null;
    
    setInterval(() => {
        if (!chart || !chart.scales.x || originalXRange === null) return;
        
        const currentRange = chart.scales.x.max - chart.scales.x.min;
        
        // Only check if range changed
        if (lastRange !== currentRange) {
            lastRange = currentRange;
            
            const isZoomed = currentRange < (originalXRange * 0.95);
            console.log('🔍 Zoom polling:', { currentRange, originalXRange, isZoomed });
            
            if (isZoomed) {
                showZoomResetButton();
            } else {
                hideZoomResetButton();
            }
        }
    }, 300); // Check every 300ms
}

// Start polling after chart is ready
setTimeout(() => {
    startZoomPolling();
    console.log('✅ Zoom polling started');
}, 2000);

function resetZoom() {
    if (chart) {
        chart.resetZoom();
        hideZoomResetButton(); // Hide button after reset
        showNotification('Zoom reset to full view');
    }
}

function checkZoomState() {
    if (!chart) {
        console.log('❌ checkZoomState: No chart instance');
        return;
    }
    
    if (!chart.scales.x) {
        console.log('❌ checkZoomState: No x scale available');
        return;
    }
    
    const currentRange = chart.scales.x.max - chart.scales.x.min;
    console.log('📊 Zoom check:', { 
        currentRange, 
        originalXRange,
        min: chart.scales.x.min,
        max: chart.scales.x.max
    });
    
    const isZoomed = originalXRange && currentRange < (originalXRange * 0.95);
    
    console.log('🔍 Is zoomed?', isZoomed);
    
    if (isZoomed) {
        console.log('🔼 Showing zoom reset button');
        showZoomResetButton();
    } else {
        console.log('🔽 Hiding zoom reset button');
        hideZoomResetButton();
    }
}

function showZoomResetButton() {
    const zoomBtn = document.getElementById('zoomResetBtn');
    console.log('🎯 Attempting to show button:', zoomBtn);
    if (zoomBtn) {
        zoomBtn.classList.add('show');
        console.log('✅ Button show class added');
    } else {
        console.log('❌ Zoom button element not found!');
    }
}

function hideZoomResetButton() {
    const zoomBtn = document.getElementById('zoomResetBtn');
    if (zoomBtn) {
        zoomBtn.classList.remove('show');
        console.log('✅ Button hide class removed');
    }
}

// when hovering over events
function drawEventTooltip(chart, event, mouseX, mouseY) {
    const ctx = chart.ctx;
    const xAxis = chart.scales.x;
    const yAxis = chart.scales.y;
    
    // Tooltip dimensions
    const tooltipWidth = 250;
    const tooltipHeight = 120;
    const padding = 10;
    const offset = 15; // Distance from mouse cursor
    
    // Position tooltip next to mouse
    let tooltipX = mouseX + offset;
    let tooltipY = mouseY - tooltipHeight / 2;
    
    // Keep tooltip within chart bounds
    if (tooltipX + tooltipWidth > xAxis.right) {
        tooltipX = mouseX - tooltipWidth - offset; // Show on left side if no space on right
    }
    if (tooltipY < chart.chartArea.top) {
        tooltipY = chart.chartArea.top; // Don't go above chart
    }
    if (tooltipY + tooltipHeight > chart.chartArea.bottom) {
        tooltipY = chart.chartArea.bottom - tooltipHeight; // Don't go below chart
    }
    if (tooltipX < xAxis.left) {
        tooltipX = xAxis.left; // Don't go left of chart
    }
    
    // Draw tooltip background
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.strokeStyle = eventCategoryColors[event.category] || '#ff4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 8);
    ctx.fill();
    ctx.stroke();
    
    // Draw tooltip content
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // Event title (truncate if too long)
    const title = event.title.length > 40 ? event.title.substring(0, 40) + '...' : event.title;
    ctx.fillText(title, tooltipX + padding, tooltipY + padding);
    
    // Event date
    ctx.font = '11px Arial';
    ctx.fillStyle = '#cccccc';
    ctx.fillText(new Date(event.date).toLocaleDateString(), tooltipX + padding, tooltipY + padding + 20);
    
    // Event category with color
    ctx.fillStyle = eventCategoryColors[event.category] || '#ff4444';
    ctx.fillText(event.category, tooltipX + padding, tooltipY + padding + 40);
    
    // Event description (truncate)
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px Arial';
    const description = event.shortDescription.length > 80 ? 
        event.shortDescription.substring(0, 80) + '...' : event.shortDescription;
    
    // Wrap description text
    const lines = wrapText(ctx, description, tooltipX + padding, tooltipY + padding + 60, tooltipWidth - padding * 2, 12);
    lines.forEach((line, index) => {
        ctx.fillText(line, tooltipX + padding, tooltipY + padding + 60 + (index * 12));
    });
    
    ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];
    
    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + ' ' + word).width;
        if (width < maxWidth) {
            currentLine += ' ' + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

function toggleScaleType() {
    const scaleType = getSelectedScaleType();
    
    if (scaleType === currentScaleType) return;
    
    currentScaleType = scaleType;
    updateChartScale();
}

function updateChartScale() {
    if (!chart) return;
    
    const yAxis = chart.options.scales.y;
    const currency = getSelectedCurrency();
    
    if (currentScaleType === 'log') {
        yAxis.type = 'logarithmic';
        yAxis.ticks.callback = function(value) {
            if (value >= 1000000) {
                return (value / 1000000).toFixed(1) + 'M sats';
            } else if (value >= 1000) {
                return (value / 1000).toFixed(1) + 'K sats';
            }
            return value.toLocaleString() + ' sats';
        };
    } else {
        yAxis.type = 'linear';
        yAxis.ticks.callback = function(value) {
            if (value >= 1000000) {
                return (value / 1000000).toFixed(1) + 'M sats';
            } else if (value >= 1000) {
                return (value / 1000).toFixed(0) + 'K sats';
            }
            return value.toLocaleString() + ' sats';
        };
    }

    // 🆕 Update chart title to reflect current scale
    if (chart.data.datasets[0]) {
        chart.data.datasets[0].label = `Satoshis per 1 ${currency} over time - ${currentScaleType === 'log' ? 'logarithmic' : 'linear'} scale`;
    }
    
    chart.update();
    
    // Show scale change notification
    showNotification(`Switched to ${currentScaleType === 'log' ? 'logarithmic' : 'linear'} scale`);
}

// function updateScaleInfo() {
//     const scaleSelect = document.getElementById('scaleType');
//     const scaleInfo = document.getElementById('scaleInfo');
    
//     if (!scaleInfo) {
//         // Create scale info element if it doesn't exist
//         const info = document.createElement('div');
//         info.id = 'scaleInfo';
//         info.className = `scale-info ${currentScaleType}`;
//         info.innerHTML = currentScaleType === 'log' 
//             ? '📈 Showing percentage changes' 
//             : '📊 Showing absolute changes';
        
//         // Insert after the scale select
//         scaleSelect.parentNode.appendChild(info);
//     } else {
//         scaleInfo.className = `scale-info ${currentScaleType}`;
//         scaleInfo.innerHTML = currentScaleType === 'log' 
//             ? '📈 Showing percentage changes' 
//             : '📊 Showing absolute changes';
//     }
// }

function getSelectedScaleType() {
    return document.getElementById('scaleType').value;
}

async function loadChartData() {
    const currency = getSelectedCurrency();
    const timeRange = getSelectedTimeRange();
    
    try {
        showAutoLoading(true);
        const data = await loadCSVData(currency);
        if (!data || data.length === 0) {
            throw new Error('No data found for ' + currency);
        }
        
        // 🚨 Process data WITHOUT custom start date (always full CSV range)
        currentData = processData(data, currency, timeRange);
        
        updateChart(currentData, currency);
        updateSatsDisplay(currentData[currentData.length - 1].sats, currency);
        
    } catch (error) {
        console.error('Error loading chart data:', error);
        showError('Failed to load data: ' + error.message);
    } finally {
        showAutoLoading(false);
    }
}

function showAutoLoading(show) {
    const loadingElement = document.getElementById('loading');
    const chartWrapper = document.querySelector('.chart-wrapper');
    
    if (show) {
        isAutoLoading = true;
        if (loadingElement) {
            loadingElement.style.display = 'flex';
            loadingElement.innerHTML = '<i class="lni lni-spinner-solid spinning"></i> Loading...';
        }
    } else {
        isAutoLoading = false;
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }
    }
}

// Snapshot function
function takeSnapshot() {
    if (!chart) {
        showError('No chart data available to snapshot');
        return;
    }
    
    try {
        // Get the chart canvas
        const canvas = document.getElementById('priceChart');
        
        // Create a new canvas for the snapshot
        const snapshotCanvas = document.createElement('canvas');
        const ctx = snapshotCanvas.getContext('2d');
        
        // Set snapshot dimensions
        snapshotCanvas.width = canvas.width;
        snapshotCanvas.height = canvas.height;
        
        // Draw the chart onto the snapshot canvas
        ctx.drawImage(canvas, 0, 0);
        
        // Add satoshi.si emblem
        addEmblemToSnapshot(ctx, snapshotCanvas.width, snapshotCanvas.height);
        
        // Add current date and parameters
        addInfoToSnapshot(ctx, snapshotCanvas.width, snapshotCanvas.height);
        
        // Convert to image and download
        const image = snapshotCanvas.toDataURL('image/png');
        downloadImage(image, generateSnapshotFilename());
        
        // Visual feedback
        showSnapshotFeedback();
        
    } catch (error) {
        console.error('Error taking snapshot:', error);
        showError('Failed to take snapshot: ' + error.message);
    }
}

function addEmblemToSnapshot(ctx, width, height) {
    // Add satoshi.si text in top right
    ctx.save();
    ctx.fillStyle = 'rgba(242, 169, 0, 0.8)';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('satoshi.si', width - 15, 25);
    ctx.restore();
}

function addInfoToSnapshot(ctx, width, height) {
    const currency = getSelectedCurrency();
    const timeRange = getSelectedTimeRange();
    const scaleType = getSelectedScaleType();
    const currentSats = currentData ? Math.round(currentData[currentData.length - 1].sats).toLocaleString() : 'N/A';
    
    ctx.save();
    // ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    // ctx.font = '12px Arial';
    // ctx.textAlign = 'left';
    
    // // Add info at top right
    // const infoLines = [
    //     `Currency: ${currency}`,
    //     `Time Range: ${timeRange}`,
    //     `Scale: ${scaleType === 'log' ? 'Logarithmic' : 'Linear'}`,
    //     `Current: 1 ${currency} = ${currentSats} sats`,
    //     `Generated: ${new Date().toLocaleDateString()}`
    // ];
    
    // infoLines.forEach((line, index) => {
    //     ctx.fillText(line, 15, height - 50 + (index * 15));
    // });
    
    ctx.restore();
}

function generateSnapshotFilename() {
    const currency = getSelectedCurrency();
    const timeRange = getSelectedTimeRange();
    const date = new Date().toISOString().split('T')[0];
    
    return `bitcoin-chart-${currency}-${timeRange}-${date}.png`;
}

function downloadImage(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function showSnapshotFeedback() {
    const button = document.querySelector('.snapshot-btn');
    const originalHtml = button.innerHTML;
    
    // Visual feedback
    button.innerHTML = '<i class="lni lni-checkmark-circle"></i> Snapshot Saved!';
    button.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
    
    // Show notification
    showNotification('Snapshot saved successfully!');
    
    // Revert after 2 seconds
    setTimeout(() => {
        button.innerHTML = originalHtml;
        button.style.background = 'linear-gradient(135deg, #ff6b6b, #ee5a52)';
    }, 2000);
}

function showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 10000;
        font-family: Arial, sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        document.body.removeChild(notification);
    }, 3000);
}

function getEarliestEventDate() {
    if (!historicalEvents.length) return null;
    
    // Sort events by date and get the earliest one
    const sortedEvents = [...historicalEvents].sort((a, b) => new Date(a.date) - new Date(b.date));
    return new Date(sortedEvents[0].date);
}

async function loadSatoshiQuotes() {
    try {
        const response = await fetch('quotes.json');
        if (response.ok) {
            satoshiQuotes = await response.json();
            console.log(`Loaded ${satoshiQuotes.length} Satoshi quotes`);
        }
    } catch (error) {
        console.error('Error loading Satoshi quotes:', error);
    }
}

function onEventFilterChange() {
    const filter = document.getElementById('eventFilter').value;
    const eventsSection = document.querySelector('.events-section');
    
    if (filter === 'hide') {
        // Hide events section title but keep the container visible for quotes
        eventsSection.style.display = 'block';
        // Change the title to "Satoshi Wisdom"
        const title = eventsSection.querySelector('h3');
        if (title) title.textContent = 'Satoshi Wisdom';
        showRandomQuote();
        
        // 🚨 IMPORTANT: Clear events for chart markers
        historicalEventsFiltered = [];
        
        // 🚨 Reset chart to full CSV range AND reset zoom
        if (chart) {
            chart.options.scales.x.min = undefined;
            chart.options.scales.x.max = undefined; // 🆕 Reset max too
            chart.resetZoom(); // 🆕 CRITICAL: Reset zoom state
        }
        
    } else {
        // Show events section with original title
        eventsSection.style.display = 'block';
        const title = eventsSection.querySelector('h3');
        if (title) title.textContent = 'Bitcoin Historical Events';
        
        let filteredEvents;
        if (filter === 'all') {
            // 🆕 Copy all events with spread operator
            filteredEvents = historicalEvents.map(event => ({ ...event }));
        } else {
            // 🆕 Copy filtered events with spread operator
            filteredEvents = historicalEvents
                .filter(ev => ev.category.toLowerCase() === filter.toLowerCase())
                .map(event => ({ ...event }));
        }
        
        // Update timeline with filtered events
        displayEventsTimeline(filteredEvents);
        
        // 🚨 IMPORTANT: Update events for chart markers
        historicalEventsFiltered = filteredEvents;
        
        // 🚨 Adjust chart scale to start from first event AND reset zoom
        if (chart && historicalEvents.length > 0) {
            const earliestEventDate = getEarliestEventDate();
            chart.options.scales.x.min = earliestEventDate;
            chart.options.scales.x.max = undefined; // 🆕 Ensure max is not restricted
            chart.resetZoom(); // 🆕 CRITICAL: Reset zoom state
            hideZoomResetButton(); // 🎯 Hide reset button
        }
    }
        // 🎯 Update original range after filter change
    setTimeout(() => {
        if (chart && chart.scales.x) {
            originalXRange = chart.scales.x.max - chart.scales.x.min;
        }
    }, 100);

    // 🆕 Force chart redraw to ensure all changes apply
    if (chart) {
        chart.update('none'); // Update without animation for immediate effect
    }
}

function showRandomQuote() {
    const timeline = document.getElementById('eventsTimeline');
    if (!timeline || satoshiQuotes.length === 0) return;
    
    // Get random quote
    const randomQuote = satoshiQuotes[Math.floor(Math.random() * satoshiQuotes.length)];
    
    timeline.innerHTML = `
        <div class="satoshi-quote">
            <div class="quote-text">"${randomQuote.text}"</div>
            <div class="quote-source">- Satoshi Nakamoto </div>
            <div class="quote-context">
                ${randomQuote.date} • ${randomQuote.medium}
                ${randomQuote.category ? ` • ${randomQuote.category}` : ''}
            </div>
        </div>
    `;
    
    // 🚨 Clear events for chart markers when showing quotes
    historicalEventsFiltered = [];
    
    // Redraw chart to remove markers
    if (chart) chart.update();
}

async function loadHistoricalEvents() {
    try {
        const response = await fetch(EVENTS_FILE);
        if (response.ok) {
            historicalEvents = await response.json();
            
            // Apply current filter when first loading
            const currentFilter = document.getElementById('eventFilter').value;
            onEventFilterChange(); // This will filter and display
            
            console.log(`Loaded ${historicalEvents.length} historical events`);
        }
    } catch (error) {
        console.error('Error loading historical events:', error);
    }
}

function displayEventsTimeline(eventsToShow = historicalEvents) {
    const timeline = document.getElementById('eventsTimeline');
    const eventsSection = document.querySelector('.events-section');
    if (!timeline) return;
    
    // If we're in "hide" mode, show quotes instead
    const currentFilter = document.getElementById('eventFilter').value;
    if (currentFilter === 'hide') {
        showRandomQuote();
        return;
    }
    
    // Show events section with proper title
    eventsSection.style.display = 'block';
    const title = eventsSection.querySelector('h3');
    if (title) title.textContent = 'Bitcoin Historical Events';
    
    // Use the filtered events passed as parameter
    const sortedEvents = eventsToShow.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Show message if no events in this category
    if (sortedEvents.length === 0) {
        timeline.innerHTML = '<div class="no-events">No events found in this category</div>';
        // 🚨 Clear chart markers when no events
        historicalEventsFiltered = [];
        if (chart) chart.update();
        return;
    }
    
    timeline.innerHTML = sortedEvents.map(event => {
        const eventColor = eventCategoryColors[event.category] || '#eee';
        return `
            <div class="event-card" onclick="showEventDetails('${event.id}')" style="border-left: 4px solid ${eventColor}">
                <div class="event-category" style="color: ${eventColor}">${event.category}</div>
                <div class="event-title">${event.title}</div>
                <div class="event-date">${new Date(event.date).toLocaleDateString()}</div>
                <div class="event-description">${event.shortDescription}</div>
            </div>
        `;
    }).join('');
    
    // 🚨 Store filtered events for chart markers
    historicalEventsFiltered = eventsToShow;
    
    // Redraw chart to update markers
    if (chart) chart.update();
}

function drawFilteredEvents(category) {
    let filteredEvents;
    
    if (category === 'hide') {
        filteredEvents = [];
    } else if (category === 'all') {
        // 🆕 Use spread operator to copy all properties including id
        filteredEvents = historicalEvents.map(event => ({ ...event }));
    } else {
        // 🆕 Use spread operator to copy filtered events
        filteredEvents = historicalEvents
            .filter(ev => ev.category.toLowerCase() === category.toLowerCase())
            .map(event => ({ ...event }));
    }
    
    // 🆕 Clear previous coordinates
    filteredEvents.forEach(event => {
        delete event.pixelX;
        delete event.labelTop;
    });
    
    historicalEventsFiltered = filteredEvents;
    
    console.log('🔄 After filtering, events are:', historicalEventsFiltered.map(e => e.id));
    
    // Update the timeline display
    displayEventsTimeline(historicalEventsFiltered);
    
    // Redraw chart to update event markers
    if (chart) chart.update();
}

function showEventDetails(eventId) {
    console.log('Showing event details for:', eventId);
    
    // Debug: Check what events we have
    console.log('All historical events:', historicalEvents);
    console.log('Filtered events:', historicalEventsFiltered);

    const event = historicalEvents.find(e => e.id === eventId);
    console.log('Found event:', event);
    
    if (!event) {
        console.error('❌ Event not found with id:', eventId);
        console.log('Available event IDs:', historicalEvents.map(e => e.id));
        return;
    }
    
    // Debug: Check which elements exist
    const modal = document.getElementById('eventModal');
    const title = document.getElementById('eventTitle');
    const date = document.getElementById('eventDate');
    const description = document.getElementById('eventDescription');
    const longDescription = document.getElementById('eventLongDescription');
    const link = document.getElementById('eventLink');
    
    console.log('Modal elements:', { modal, title, date, description, longDescription, link });
    
    if (!modal) {
        console.error('❌ Modal element not found');
        return;
    }
    if (!title) {
        console.error('Event title element not found');
        return;
    }
    if (!date) {
        console.error('Event date element not found');
        return;
    }
    
    // Set content with null checks
    title.textContent = event.title;
    date.textContent = new Date(event.date).toLocaleDateString();
    
    if (description) {
        description.textContent = event.shortDescription;
    }
    
    if (longDescription) {
        longDescription.innerHTML = event.longDescription || event.shortDescription;
    }
    
    if (link) {
        if (event.externalLink) {
            link.href = event.externalLink;
            link.style.display = 'inline-block';
        } else {
            link.style.display = 'none';
        }
    }
    
    modal.style.display = 'block';
    console.log('✅ Modal should be visible now for event:', event.title);
}

function closeEventModal() {
    document.getElementById('eventModal').style.display = 'none';
}

// showLoading function to handle auto-loading state
function showLoading(show) {
    const button = document.querySelector('.snapshot-btn');
    
    if (button) {
        button.disabled = show;
        if (show) {
            button.innerHTML = '<i class="lni lni-spinner-solid spinning"></i> Loading...';
        } else {
            button.innerHTML = '<i class="lni lni-camera"></i> Take Snapshot';
        }
    }
}

async function loadInitialData() {
    await loadChartData();
}


async function loadCSVData(currency) {
    // Adjust this path based on your actual folder structure
    const filename = `satoshi_hist_data_${currency}.csv`;
    const fullPath = `${DATA_FOLDER}${filename}`;
    
    console.log(`Loading file: ${fullPath}`);  // Debug log
    
    const response = await fetch(fullPath);
    
    if (!response.ok) {
        throw new Error(`Failed to load data file: ${fullPath} (Status: ${response.status})`);
    }
    
    const csvText = await response.text();
    return new Promise((resolve, reject) => {
        Papa.parse(csvText, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: function(results) {
                console.log(`Loaded ${results.data.length} rows from ${filename}`);
                resolve(results.data);
            },
            error: function(error) {
                reject(error);
            }
        });
    });
}

function processData(csvData, currency, timeRange) {
    const now = new Date();
    let cutoffDate;
    
    switch (timeRange) {
        case '6months': cutoffDate = new Date(now.setMonth(now.getMonth() - 6)); break;
        case '1year':   cutoffDate = new Date(now.setFullYear(now.getFullYear() - 1)); break;
        case '2years':  cutoffDate = new Date(now.setFullYear(now.getFullYear() - 2)); break;
        case '5years':  cutoffDate = new Date(now.setFullYear(now.getFullYear() - 5)); break;
        default:        cutoffDate = new Date(0); // All time
    }
    
    return csvData
        .map(row => {
            const timestamp = new Date(row.Time).getTime();
            if (timestamp < cutoffDate.getTime()) return null;
            
            // Calculate average of numeric columns
            const prices = [];
            Object.keys(row).forEach(key => {
                if (key !== 'Time' && row[key] && !isNaN(row[key])) {
                    prices.push(row[key]);
                }
            });
            const price = prices.length > 0 ? prices.reduce((a, b) => a + b) / prices.length : null;
            if (!price || isNaN(price)) return null;
            
            return {
                timestamp: timestamp,
                date: new Date(timestamp),
                price: price,
                sats: 100000000 / price,
                currency: currency,
                exchanges: Object.keys(row).filter(k => k !== 'Time' && row[k])
            };
        })
        .filter(item => item !== null)
        .sort((a, b) => a.timestamp - b.timestamp);
}



function updateChart(data, currency) {
    const chartData = data.map(item => ({
        x: item.date,
        y: item.sats
    }));

    chart.data.datasets[0].data = chartData;
    chart.data.datasets[0].label = `Satoshis per 1 ${currency} over time - ${currentScaleType === 'log' ? 'logarithmic' : 'linear'} scale`;

    // 🚨 Set x-axis min based on event filter
    const eventFilter = document.getElementById('eventFilter').value;
    if (eventFilter !== 'hide' && historicalEvents.length > 0) {
        // Use earliest event date as x-axis start
        const earliestEventDate = getEarliestEventDate();
        chart.options.scales.x.min = earliestEventDate;
        console.log(`📅 Chart x-axis starts from: ${earliestEventDate.toLocaleDateString()}`);
    } else {
        // Use default x-axis (full CSV range)
        chart.options.scales.x.min = undefined;
    }

    updateChartScale();
    chart.update();

    updateDataInfo(data, currency);
    updateChartLegend(data);

    // Update events based on current filter
    const category = document.getElementById('eventFilter')?.value || 'all';
    drawFilteredEvents(category);
}

function updateDataInfo(data, currency) {
    const infoElement = document.getElementById('dataInfo');
    if (!infoElement) return;
    
    const firstDate = data[0].date.toLocaleDateString();
    const lastDate = data[data.length - 1].date.toLocaleDateString();
    const dataPoints = data.length;
    const exchanges = new Set();
    data.forEach(item => item.exchanges.forEach(ex => exchanges.add(ex)));
    const scaleType = getSelectedScaleType();
    
    const eventFilter = document.getElementById('eventFilter').value;
    const mode = eventFilter === 'hide' ? 'CSV start' : 'Event start';
    
    infoElement.innerHTML = 
        `Data from ${firstDate} to ${lastDate} • ${dataPoints} data points • ${exchanges.size} exchanges • ${currency} • ${scaleType} scale • ${mode}`;
}

// 🔸 Update the legend below the chart
function updateChartLegend(latest) {
    const legend = document.getElementById('chartLegend');
    if (!legend || !latest) return;

    const btcPrice = latest.btcPrice
        ? latest.btcPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : (100000000 / latest.sats).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    legend.innerHTML = `
        <div class="legend-item">
            <div class="legend-color" style="background:#f2a900;"></div>
            <span>1 ${latest.currency} = ${Math.round(latest.sats).toLocaleString()} sats</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background:#ff4444;"></div>
            <span>1 BTC = ${btcPrice} ${latest.currency}</span>
        </div>
    `;
}

// 🔸 Update the current ticker‑style sats display above/beside the chart
function updateSatsDisplay(currency, satsPerFiat, btcFiatPrice) {
    const displayElement = document.getElementById('currentSats');
    if (!displayElement) return;

    const btcPrice = btcFiatPrice
        ? btcFiatPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : (100000000 / satsPerFiat).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    displayElement.innerHTML =
        `1 ${currency} = ${Math.round(satsPerFiat).toLocaleString()} sats (${btcPrice} ${currency}/BTC)`;
}

// function showLoading(show) {
//     const button = document.querySelector('button');
//     const loadingElement = document.getElementById('loading');
    
//     if (button) {
//         button.disabled = show;
//         button.innerHTML = show ? 
//             '<i class="lni lni-spinner-solid spinning"></i> Loading...' : 
//                         '<i class="lni lni-camera"></i> <span class="button-text">Take Snapshot</span>';
//     }
    
//     if (loadingElement) {
//         loadingElement.style.display = show ? 'flex' : 'none';
//     }
// }

function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 5000);
    }
}

function getSelectedCurrency() {
    return document.getElementById('currencySelect').value;
}

function getSelectedTimeRange() {
    return document.getElementById('timeRange').value;
}

function exportData() {
    if (!currentData || currentData.length === 0) {
        alert('No data to export');
        return;
    }
    
    const csv = convertToCSV(currentData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // 🆕 Get first and last dates for better filename
    const firstDate = currentData[0].date;
    const lastDate = currentData[currentData.length - 1].date;
    
    const firstDateFormatted = firstDate.toISOString().split('T')[0];
    const lastDateFormatted = lastDate.toISOString().split('T')[0];
    
    const currency = getSelectedCurrency();
    const timeRange = getSelectedTimeRange();
    
    if (firstDateFormatted === lastDateFormatted) {
        // Single date
        a.download = `bitcoin-sats-${currency}-${timeRange}-${lastDateFormatted}.csv`;
    } else {
        // Date range
        a.download = `bitcoin-sats-${currency}-${timeRange}-${firstDateFormatted}-to-${lastDateFormatted}.csv`;
    }
    
    a.click();
    window.URL.revokeObjectURL(url);
    
    console.log(`📤 Exported data from ${firstDateFormatted} to ${lastDateFormatted}`);
}

// 🆕 Export Modal Functions
function showExportModal() {
    if (!currentData || currentData.length === 0) {
        alert('No data to export');
        return;
    }
    
    const modal = document.getElementById('exportModal');
    if (modal) {
        // Calculate approximate file sizes
        const csvSize = new Blob([convertToCSV(currentData)]).size;
        const jsonSize = new Blob([convertToJSON(currentData)]).size;
        
        // Update button texts with file sizes
        const csvBtn = modal.querySelector('.export-option-btn:nth-child(1)');
        const jsonBtn = modal.querySelector('.export-option-btn:nth-child(2)');
        
        if (csvBtn) {
            csvBtn.querySelector('small').textContent = 
                `Spreadsheet compatible • ${formatFileSize(csvSize)}`;
        }
        if (jsonBtn) {
            jsonBtn.querySelector('small').textContent = 
                `For developers & APIs • ${formatFileSize(jsonSize)}`;
        }
        
        modal.style.display = 'block';
    }
}

// 🆕 Helper function to format file sizes
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function closeExportModal() {
    const modal = document.getElementById('exportModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 🆕 Main export function that handles both formats
function exportDataAs(format) {
    if (!currentData || currentData.length === 0) {
        alert('No data to export');
        return;
    }
    
    closeExportModal(); // Close the modal
    
    const lastDate = currentData[currentData.length - 1].date;
    const lastDateFormatted = lastDate.toISOString().split('T')[0];
    const currency = getSelectedCurrency();
    
    let blob, filename, mimeType;
    
    if (format === 'csv') {
        const csv = convertToCSV(currentData);
        blob = new Blob([csv], { type: 'text/csv' });
        filename = `bitcoin-sats-${currency}-upto-${lastDateFormatted}.csv`;
        mimeType = 'text/csv';
    } else if (format === 'json') {
        const json = convertToJSON(currentData);
        blob = new Blob([json], { type: 'application/json' });
        filename = `bitcoin-sats-${currency}-upto-${lastDateFormatted}.json`;
        mimeType = 'application/json';
    } else {
        console.error('Unknown export format:', format);
        return;
    }
    
    // Download the file
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
    
    // Show success notification
    showNotification(`Exported as ${format.toUpperCase()} format`);
    
    console.log(`📤 Exported ${currentData.length} records as ${format}`);
}

// 🆕 JSON Conversion Function
function convertToJSON(data) {
    if (!data || data.length === 0) return '[]';
    
    const exportData = {
        metadata: {
            currency: getSelectedCurrency(),
            timeRange: getSelectedTimeRange(),
            scale: getSelectedScaleType(),
            exportDate: new Date().toISOString(),
            totalRecords: data.length,
            dateRange: {
                start: data[0].date.toISOString(),
                end: data[data.length - 1].date.toISOString()
            }
        },
        data: data.map(item => ({
            timestamp: item.timestamp,
            date: item.date.toISOString(),
            btcPrice: item.price,
            satsPerUnit: Math.round(item.sats),
            currency: item.currency,
            exchanges: item.exchanges
        }))
    };
    
    return JSON.stringify(exportData, null, 2); // Pretty print with 2-space indentation
}

// 🆕 Update your existing CSV function for consistency
function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = ['Time', 'BTC_Price', 'Sats_Per_Unit', 'Currency'];
    
    const rows = data.map(item => [
        item.date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC'),
        item.price.toFixed(8),
        Math.round(item.sats),
        item.currency
    ]);
    
    return [headers, ...rows].map(row => row.join(',')).join('\n');
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('eventModal');
    if (event.target === modal) {
        closeEventModal();
    }
}


let eucbRates = {}; // cache for live conversion rates

// Fetch currency rates from ECB via Frankfurter API (base USD)
async function fetchEUCBRates() {
    try {
        console.log("🔄 Fetching ECB rates (base USD)…");
        const res = await fetch('https://api.frankfurter.app/latest?from=USD');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        // Frankfurter returns: { amount:1, base:"USD", rates:{EUR:0.93,JPY:160.2,...} }
        if (data && data.rates) {
            eucbRates = data.rates;
            console.log("✅ Frankfurt ECB rates loaded:", eucbRates);
        } else {
            console.warn("⚠️ Invalid Frankfurt response:", data);
        }
    } catch (err) {
        console.error("❌ Failed to fetch Frankfurt rates:", err);
    }
}

// Get conversion rate from live EUCB (Frankfurt) data
function getConversionRate(currency) {
    if (!eucbRates || Object.keys(eucbRates).length === 0) {
        console.warn("⚠️ ECB rates not available – defaulting to USD");
        return 1;
    }
    return eucbRates[currency] || 1;
}

function initializeSintraFeed() {
    let sintraWebSocket = new WebSocket('wss://api.sintra.fi/ws');

    sintraWebSocket.onopen = function() {
        console.log("✅ Connected to Sintra WebSocket");
    };

    sintraWebSocket.onmessage = function(event) {
        const message = JSON.parse(event.data);
        if (message.event !== "data" || !message.data?.prices) return;

        if (!eucbRates || Object.keys(eucbRates).length === 0) {
            console.warn("⚠️ ECB rates not ready – defaulting to USD values");
        }

        const prices = message.data.prices;
        const currencySelect = document.getElementById('currencySelect');
        const selectedCurrency = currencySelect ? currencySelect.value : 'USD';

        // Supported currencies fetched directly from Sintra
        const sintraSupported = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

        let btcFiatPrice;

        if (sintraSupported.includes(selectedCurrency)) {
            // Directly use the Sintra price
            btcFiatPrice = parseFloat(prices[selectedCurrency.toLowerCase()]);
            if (isNaN(btcFiatPrice)) {
                console.warn(`No valid Sintra price for ${selectedCurrency}`);
                return;
            }
        } else {
            // Not supported directly, use BTC/USD and EUCB conversion
            const btcUsdPrice = parseFloat(prices.usd);
            const conversionRate = getConversionRate(selectedCurrency);
            btcFiatPrice = btcUsdPrice * conversionRate;

            // Debug logging — remove later
            console.log(`BTC/USD: ${btcUsdPrice}, rate USD→${selectedCurrency}: ${conversionRate}, BTC/${selectedCurrency}: ${btcFiatPrice}`);
        }

        // Now compute sats per 1 fiat
        if (!btcFiatPrice || btcFiatPrice <= 0) return;
        const satsPerFiat = 100000000 / btcFiatPrice;

        // Update legend and sats display
        updateSatsDisplay(selectedCurrency, satsPerFiat, btcFiatPrice);
        updateChartLegend({ currency: selectedCurrency, sats: satsPerFiat, btcPrice: btcFiatPrice });
    };

    sintraWebSocket.onerror = function(error) {
        console.error("WebSocket error:", error);
    };

    sintraWebSocket.onclose = function(event) {
        if (!event.wasClean) {
            console.warn("Sintra connection lost. Reconnecting...");
            setTimeout(initializeSintraFeed, 5000);
        }
    };
}