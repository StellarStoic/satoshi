document.addEventListener('DOMContentLoaded', function () {
    // Function to open the QR Code modal
    function openQRCodeModal(event) {
        event.stopPropagation();
        const qrModal = document.getElementById('qrCodeModal');
        if (qrModal) {
            closeAllModals();
            qrModal.classList.add('active');
            document.body.classList.add('modal-open');
        } else {
            console.error('QR Code Modal not found!');
        }
    }

    // Function to close the QR Code modal
    function closeQRCodeModal() {
        const qrModal = document.getElementById('qrCodeModal');
        if (qrModal) {
            qrModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        } else {
            console.error('QR Code Modal not found!');
        }
    }

    // Function to open the Mempool Tiny Data modal
    function openMempoolTinyDataModal(event) {
        event.stopPropagation();
        const mempoolModal = document.getElementById('mempoolTinyDataModal');
        if (mempoolModal) {
            closeAllModals();
            mempoolModal.classList.add('active');
            document.body.classList.add('modal-open');
        } else {
            console.error('Mempool Tiny Data Modal not found!');
        }
    }

    // Function to close the Mempool Tiny Data modal
    function closeMempoolTinyDataModal() {
        const mempoolModal = document.getElementById('mempoolTinyDataModal');
        if (mempoolModal) {
            mempoolModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        } else {
            console.error('Mempool Tiny Data Modal not found!');
        }
    }

    // Function to close all modals
    function closeAllModals() {
        document.querySelectorAll('.description-modal.active').forEach(function (modal) {
            modal.classList.remove('active');
        });
        document.body.classList.remove('modal-open');
    }

    // Attach global functions to the window object
    window.openQRCodeModal = openQRCodeModal;
    window.closeQRCodeModal = closeQRCodeModal;
    window.openMempoolTinyDataModal = openMempoolTinyDataModal;
    window.closeMempoolTinyDataModal = closeMempoolTinyDataModal;

    // Handle clicks outside of modals to close them
    window.addEventListener('click', function (event) {
        const qrModal = document.getElementById('qrCodeModal');
        const mempoolModal = document.getElementById('mempoolTinyDataModal');
        const activeDescriptionModal = document.querySelector('.description-modal.active');

        if (qrModal && qrModal.classList.contains('active') && !qrModal.contains(event.target)) {
            closeQRCodeModal();
        }

        if (mempoolModal && mempoolModal.classList.contains('active') && !mempoolModal.contains(event.target)) {
            closeMempoolTinyDataModal();
        }

        if (activeDescriptionModal && !activeDescriptionModal.contains(event.target) && !event.target.closest('.image-box')) {
            activeDescriptionModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        }
    });

    // Attach click event to lightning icon specifically
    const lightningIcon = document.querySelector('.lni-bolt-alt');
    if (lightningIcon) {
        lightningIcon.addEventListener('click', openQRCodeModal);
    }

    // Attach click event to block height and fee rate spans
    const feeRateSpan = document.getElementById('fee-rate');
    const blockHeightSpan = document.getElementById('block-height');

    if (feeRateSpan) {
        feeRateSpan.addEventListener('click', openMempoolTinyDataModal);
    }

    if (blockHeightSpan) {
        blockHeightSpan.addEventListener('click', openMempoolTinyDataModal);
    }
});
