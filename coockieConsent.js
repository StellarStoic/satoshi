document.addEventListener('DOMContentLoaded', function () {
    // Function to set a cookie with a specified path
    function setCookie(name, value, days) {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        const expires = "expires=" + date.toUTCString();
        document.cookie = name + "=" + value + ";" + expires + ";path=/";  // Set path to root
    }

    // Function to get a cookie by name
    function getCookie(name) {
        const value = "; " + document.cookie;
        const parts = value.split("; " + name + "=");
        if (parts.length === 2) return parts.pop().split(";").shift();
    }

    // Function to delete a cookie by name
    function deleteCookie(name) {
        document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";  // Set path to root
    }

    // Function to check for cookie consent
    function checkCookieConsent() {
        const consent = getCookie("cookieConsent");
        const sessionDecline = sessionStorage.getItem("cookieConsentDeclined");

        if (!consent && !sessionDecline) {
            // Show the cookie consent modal if consent is not found and not declined in the current session
            openCookieConsentModal();
        }
    }

    // Function to show the cookie consent modal
    function openCookieConsentModal() {
        const cookieModal = document.getElementById('cookieConsentModal');
        if (cookieModal) {
            cookieModal.classList.add('active');
            document.body.classList.add('modal-open');
        }
    }

    // Function to accept cookies and close the modal
    function acceptCookies() {
        setCookie("cookieConsent", "true", 365); // Store consent for 1 year
        const cookieModal = document.getElementById('cookieConsentModal');
        if (cookieModal) {
            cookieModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        }
    }

    // Function to decline cookies, delete all cookies and close the modal
    function declineCookies() {
        // Mark that the user declined cookies for this session
        sessionStorage.setItem("cookieConsentDeclined", "true");

        // List of cookies to delete
        const cookiesToDelete = ['userCurrencySettings', 'cookieConsent'];

        // Delete each cookie
        cookiesToDelete.forEach(cookieName => {
            deleteCookie(cookieName);
        });

        // Clear localStorage as well
        localStorage.clear();

        const cookieModal = document.getElementById('cookieConsentModal');
        if (cookieModal) {
            cookieModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        }
    }

    // Check consent on page load
    checkCookieConsent();

    // Attach global functions to the window object if needed
    window.acceptCookies = acceptCookies;
    window.declineCookies = declineCookies;
});
