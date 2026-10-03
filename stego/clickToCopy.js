// clickToCopy is for the about modal and the qr codes

document.addEventListener("DOMContentLoaded", () => {
    // console.log("DOM fully loaded. Searching for QR codes...");

    function attachQRListeners() {
        const qrCodes = document.querySelectorAll(".qr-code");
        // console.log("Found QR codes:", qrCodes.length);

        if (qrCodes.length === 0) {
            // console.warn("No QR codes found! Make sure they exist in the DOM.");
            return;
        }

        qrCodes.forEach(img => {
            img.addEventListener("click", copyQRCodeTitle);
            // console.log("Event listener added to:", img.id);
        });
    }

    attachQRListeners(); // Run the function on page load

    // If the modal opens dynamically, re-check for QR codes when the modal is opened
    document.getElementById("infoModal").addEventListener("click", attachQRListeners);
});

// Function to copy the title attribute of an image to the clipboard
function copyQRCodeTitle(event) {
    // console.log("QR code clicked!"); // Log when the QR code is clicked

    const qrTitle = event.target.title; // Get the title attribute from clicked image
    // console.log("QR Code Title:", qrTitle); // Log the title value

    if (!qrTitle) {
        console.warn("No title attribute found on the clicked image.");
        return;
    }

    navigator.clipboard.writeText(qrTitle)
        .then(() => {
            // console.log("Copied to clipboard:", qrTitle); // Log success

            // Show a small feedback message
            const feedback = document.createElement("div");
            feedback.textContent = "Copied to clipboard!";
            feedback.style.position = "fixed";
            feedback.style.top = "50%";
            feedback.style.left = "50%";
            feedback.style.transform = "translate(-50%, -50%)";
            feedback.style.background = "rgba(0, 0, 0, 0.75)";
            feedback.style.color = "#fff";
            feedback.style.padding = "10px";
            feedback.style.borderRadius = "5px";
            feedback.style.zIndex = "9999";
            document.body.appendChild(feedback);

            // Remove the feedback message after 2 seconds
            setTimeout(() => {
                // console.log("Feedback message removed.");
                document.body.removeChild(feedback);
            }, 2000);
        })
        .catch(err => {
            console.error("Failed to copy:", err); // Log if clipboard write fails
        });
}


// nostr ID copy 
// nostr ID copy (using same feedback as QR codes)
document.getElementById("infoModal").addEventListener("click", function (event) {
    // Check if the clicked element has the "copy-nostr-id" class
    if (event.target.classList.contains("copy-nostr-id")) {
        const textToCopy = event.target.textContent.trim();
        navigator.clipboard.writeText(textToCopy)
            .then(() => {
                // Create a floating feedback message, same as for QR codes
                const feedback = document.createElement("div");
                feedback.textContent = "Copied to clipboard!";
                feedback.style.position = "fixed";
                feedback.style.top = "50%";
                feedback.style.left = "50%";
                feedback.style.transform = "translate(-50%, -50%)";
                feedback.style.background = "rgba(0, 0, 0, 0.75)";
                feedback.style.color = "#fff";
                feedback.style.padding = "10px";
                feedback.style.borderRadius = "5px";
                feedback.style.zIndex = "9999";
                document.body.appendChild(feedback);
                
                // Remove the feedback after 2 seconds
                setTimeout(() => {
                    document.body.removeChild(feedback);
                }, 2000);
            })
            .catch(err => {
                console.error("Failed to copy text: ", err);
            });
    }
});

