document.addEventListener('DOMContentLoaded', function () {
    // Function to open the QR Code modal
    function openQRCodeModal(event) {
        event.stopPropagation(); // Prevent the click event from bubbling up
        console.log('Attempting to open QR Code modal'); // Debugging log
        const qrModal = document.getElementById('qrCodeModal');
        if (qrModal) {
            console.log('QR Code modal found, opening...'); // Debugging log
            closeAllModals(); // Ensure all modals are closed before opening
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

    // Function to close all modals
    function closeAllModals() {
        console.log('Closing all modals'); // Debugging log
        document.querySelectorAll('.description-modal.active').forEach(function (modal) {
            modal.classList.remove('active');
        });
        document.body.classList.remove('modal-open');
    }



    // Attach global functions to the window object
    window.openQRCodeModal = openQRCodeModal;
    window.closeQRCodeModal = closeQRCodeModal;

    // Handle clicks outside of modals to close them
    window.addEventListener('click', function (event) {
        console.log('Window click detected:', event.target); // Debugging log
        const qrModal = document.getElementById('qrCodeModal');
        const activeDescriptionModal = document.querySelector('.description-modal.active');

        if (qrModal && qrModal.classList.contains('active') && !qrModal.contains(event.target)) {
            console.log('Click outside QR Code modal, closing...'); // Debugging log
            closeQRCodeModal();
        }

        if (activeDescriptionModal && !activeDescriptionModal.contains(event.target) && !event.target.closest('.image-box')) {
            console.log('Click outside description modal, closing...'); // Debugging log
            activeDescriptionModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        }
    });

    // Attach click event to lightning icon specifically
    const lightningIcon = document.querySelector('.lni-bolt-alt');
    if (lightningIcon) {
        console.log('Lightning icon found, adding click event'); // Debugging log
        lightningIcon.addEventListener('click', openQRCodeModal);
    }
});
