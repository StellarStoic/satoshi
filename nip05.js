document.addEventListener('DOMContentLoaded', function () {
    // Function to toggle image description modal
    function toggleDescription(element) {
        console.log('toggleDescription called with:', element); // Debugging log
        if (element.classList.contains('active')) {
            console.log('Closing description modal');
            element.classList.remove('active');
            document.body.classList.remove('modal-open');
        } else {
            console.log('Opening description modal');
            closeAllModals();
            element.classList.add('active');
            document.body.classList.add('modal-open');
        }
    }

    // Make toggleDescription function available globally
    window.toggleDescription = toggleDescription;

    // Attach click event to all image-box elements to toggle description modal
    document.querySelectorAll('.image-box').forEach((box) => {
        box.addEventListener('click', function () {
            console.log('Image box clicked:', box); // Debugging log
            const descriptionElement = this.nextElementSibling;
            toggleDescription(descriptionElement);
        });
    });

    // Function to open the QR Code modal
    function openQRCodeModal(event) {
        console.log('Attempting to open QR Code modal'); // Debugging log
        event.stopPropagation(); // Prevent click from bubbling up
        closeAllModals(); // Ensure all other modals are closed before opening the QR code modal
        const qrModal = document.getElementById('qrCodeModal');
        if (qrModal) {
            console.log('QR Code modal found, opening...'); // Debugging log
            qrModal.classList.add('active');
            document.body.classList.add('modal-open');
        } else {
            console.error('QR Code Modal not found!');
        }
    }

    // Function to close the QR Code modal
    function closeQRCodeModal() {
        console.log('Closing QR Code modal'); // Debugging log
        const qrModal = document.getElementById('qrCodeModal');
        if (qrModal) {
            qrModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        } else {
            console.error('QR Code Modal not found!');
        }
    }

    // Make QR code modal functions available globally
    window.openQRCodeModal = openQRCodeModal;
    window.closeQRCodeModal = closeQRCodeModal;

    // Function to close all open modals
    function closeAllModals() {
        console.log('Closing all modals'); // Debugging log
        document.querySelectorAll('.description-modal.active').forEach(function (modal) {
            modal.classList.remove('active');
        });
        document.body.classList.remove('modal-open');
    }

    // Function to handle clicks outside of modals to close them
    window.addEventListener('click', function (event) {
        const qrModal = document.getElementById('qrCodeModal');
        const activeModal = document.querySelector('.description-modal.active');

        console.log('Window click detected:', event.target); // Debugging log

        if (qrModal && qrModal.classList.contains('active') && !event.target.closest('.modal-content')) {
            console.log('Click outside QR Code modal, closing...'); // Debugging log
            closeQRCodeModal();
        }

        if (activeModal && !activeModal.contains(event.target) && !event.target.closest('.image-box')) {
            console.log('Click outside description modal, closing...'); // Debugging log
            activeModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        }
    });

    // Ensure that clicking on the lightning icon opens the QR code modal
    const lightningIcon = document.querySelector('.lni-bolt-2');
    if (lightningIcon) {
        console.log('Lightning icon found, adding click event'); // Debugging log
        lightningIcon.addEventListener('click', openQRCodeModal);
    } else {
        console.error('Lightning icon not found!');
    }
});
