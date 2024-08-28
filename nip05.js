// Function to show the description as a modal
function showDescriptionModal(descriptionElement) {
    // Create the overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay active';
    document.body.appendChild(modalOverlay);

    // Create the description modal
    const modal = document.createElement('div');
    modal.className = 'description-modal active';

    // Add content to the modal
    modal.innerHTML = `
        <button class="close-icon" onclick="closeDescriptionModal()">X</button>
        ${descriptionElement.innerHTML}
    `;
    document.body.appendChild(modal);

    // Add class to blur background
    document.body.classList.add('modal-active');

    // Event listener to close modal on outside click
    modalOverlay.addEventListener('click', closeDescriptionModal);
}

// Function to close the description modal
function closeDescriptionModal() {
    const modal = document.querySelector('.description-modal');
    const modalOverlay = document.querySelector('.modal-overlay');

    if (modal) modal.remove();
    if (modalOverlay) modalOverlay.remove();

    document.body.classList.remove('modal-active');
}

// Event listener for image clicks
document.querySelectorAll('.image-box').forEach((box) => {
    box.addEventListener('click', function () {
        const descriptionElement = this.nextElementSibling;
        showDescriptionModal(descriptionElement);
    });
});