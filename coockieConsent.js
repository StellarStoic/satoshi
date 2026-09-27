// Compatibility for legacy inline buttons. The global consent UI and GA4
// loading are managed by analytics.mjs; functional preferences stay local.
window.acceptCookies = () => window.satoshiAnalytics?.setConsent(true);
window.declineCookies = () => window.satoshiAnalytics?.setConsent(false);
