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

    function prepareCookieNotice() {
        const content = document.querySelector('#cookieConsentModal .modal-content');
        if (!content) return;

        const title = document.createElement('h4');
        title.textContent = 'Privacy settings';
        const summary = document.createElement('p');
        summary.textContent = 'satoshi.si does not track you or sell your data. It only stores optional preferences, such as your selected currency, on this device.';
        const question = document.createElement('p');
        question.className = 'consent-question';
        question.textContent = 'Allow local preferences?';
        const actions = document.createElement('div');
        actions.className = 'consent-button-container';
        const accept = document.createElement('button');
        accept.type = 'button';
        accept.className = 'consent-icon-button green-check';
        accept.title = 'Allow local preferences';
        accept.setAttribute('aria-label', 'Allow local preferences');
        accept.textContent = '\u2714';
        accept.addEventListener('click', acceptCookies);
        const decline = document.createElement('button');
        decline.type = 'button';
        decline.className = 'consent-icon-button red-cross';
        decline.title = 'Continue without saving preferences';
        decline.setAttribute('aria-label', 'Continue without saving preferences');
        decline.textContent = '\u2718';
        decline.addEventListener('click', declineCookies);
        actions.append(accept, decline);
        content.replaceChildren(title, summary, question, actions);
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

    prepareCookieNotice();

    // Check consent on page load
    checkCookieConsent();

    // Attach global functions to the window object if needed
    window.acceptCookies = acceptCookies;
    window.declineCookies = declineCookies;
});
