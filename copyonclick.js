document.addEventListener('DOMContentLoaded', function () {
    // Existing code for quotes
    const quotes = document.getElementById("quotes");
    const copyNotification = document.querySelector(".copy-notification");

    if (quotes) {
        quotes.addEventListener("click", function () {
            const quote = quotes.innerText;

            navigator.clipboard.writeText(quote).then(() => {
                copyNotification.style.display = "block";

                setTimeout(() => {
                    copyNotification.style.display = "none";
                }, 3500);
            });
        });
    }

    // Function to copy content to clipboard and show a stylish notification
    function copyToClipboard(content, message) {
        navigator.clipboard.writeText(content).then(() => {
            const copyNotification = document.querySelector('.copy-notification');
            if (copyNotification) {
                copyNotification.textContent = message;
                copyNotification.style.display = "block";
                setTimeout(() => {
                    copyNotification.style.display = "none";
                }, 3500);
            }
        }).catch(err => console.error('Failed to copy text: ', err));
    }

    // Attach click events to QR codes and their descriptions
    document.querySelectorAll('.qr-code, .qr-code-text').forEach(element => {
        element.addEventListener('click', function() {
            const addressToCopy = this.title || this.innerText;
            const message = this.id.includes('lightning') ? "Bitcoin lightning address copied to clipboard!" : "OnChain bitcoin address copied to clipboard!";
            copyToClipboard(addressToCopy, message);
        });
    });
});
