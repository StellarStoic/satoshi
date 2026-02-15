// Contact Modal Functions
function openContactModal() {
    document.getElementById('contactModal').style.display = 'block';
}

// Function to close modal
function closeContactModal() {
    const modal = document.getElementById('contactModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Copy Signal number to clipboard
function copySignalNumber() {
    const signalNumber = document.getElementById('signalNumber').textContent;
    
    navigator.clipboard.writeText(signalNumber).then(() => {
        // Show a temporary success message
        const signalElement = document.querySelector('.contact-option:nth-child(2) .contact-info h3');
        const originalText = signalElement.textContent;
        signalElement.textContent = '✓ Copied!';
        signalElement.style.color = '#e3a600';
        
        setTimeout(() => {
            signalElement.textContent = originalText;
            signalElement.style.color = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
        alert('Failed to copy number. Please copy manually: ' + signalNumber);
    });
}

// Close modal when clicking outside
window.addEventListener('click', function(event) {
    const modal = document.getElementById('contactModal');
    // If the user clicks the background (the modal wrapper) and NOT the content box
    if (event.target === modal) {
        closeContactModal();
    }
});