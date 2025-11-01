// Handle opening the Lottery Explainer modal
function openLotteryExplainerModal(event) {
    event.stopPropagation();  // Stop the click from propagating to more general handlers
    const lotteryModal = document.getElementById('lotteryExplainerModal');
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
    const lotteryModal = document.getElementById('lotteryExplainerModal');
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

// Add event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Element to trigger opening the Lottery Explainer modal
    const lotteryTrigger = document.getElementById('lotteryInfoTrigger');
    if (lotteryTrigger) {
        lotteryTrigger.addEventListener('click', openLotteryExplainerModal);
        lotteryTrigger.addEventListener('touchstart', openLotteryExplainerModal); // For touch devices
    }
    
    // Close modal when clicking the X button
    const closeButton = document.querySelector('#lotteryExplainerModal .close');
    if (closeButton) {
        closeButton.addEventListener('click', closeLotteryExplainerModal);
    }
    
    // Close modal when clicking outside the modal content
    const lotteryModal = document.getElementById('lotteryExplainerModal');
    const modalContent = document.querySelector('#lotteryExplainerModal .modal-content');
    
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