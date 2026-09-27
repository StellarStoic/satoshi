const MEASUREMENT_ID = 'G-E8H7JMT2R7';
const CONSENT_KEY = 'satoshiAnalyticsConsent';
let loaded = false;

function readConsent() {
  try { return localStorage.getItem(CONSENT_KEY); } catch { return null; }
}

function writeConsent(value) {
  try { localStorage.setItem(CONSENT_KEY, value); } catch { /* Keep the choice for this page only. */ }
}

function loadAnalytics() {
  if (loaded || readConsent() !== 'granted') return;
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, {allow_google_signals: false, allow_ad_personalization_signals: false});
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.append(script);
}

function removeNotice() {
  document.querySelector('.satoshi-analytics-consent')?.remove();
  document.body.classList.remove('analytics-consent-open');
}

function setConsent(granted) {
  const value = granted ? 'granted' : 'denied';
  writeConsent(value);
  removeNotice();
  if (granted) loadAnalytics();
  else if (loaded && window.gtag) window.gtag('consent', 'update', {analytics_storage: 'denied'});
  window.dispatchEvent(new CustomEvent('satoshi-analytics-consent', {detail: {value}}));
}

function makeButton(label, className, granted) {
  const result = document.createElement('button');
  result.type = 'button';
  result.className = className;
  result.textContent = label;
  result.addEventListener('click', () => setConsent(granted));
  return result;
}

function showNotice() {
  if (readConsent() || document.querySelector('.satoshi-analytics-consent')) return;
  const overlay = document.createElement('section');
  overlay.className = 'satoshi-analytics-consent';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'analyticsConsentTitle');
  const content = document.createElement('div');
  content.className = 'satoshi-analytics-consent-content';
  const title = document.createElement('h2');
  title.id = 'analyticsConsentTitle';
  title.textContent = 'Website statistics';
  const text = document.createElement('p');
  text.textContent = 'Allow Google Analytics to measure site usage? Your local settings work either way, and satoshi.si does not use analytics for advertising.';
  const actions = document.createElement('div');
  actions.append(makeButton('Decline', 'analytics-decline', false), makeButton('Allow', 'analytics-allow', true));
  content.append(title, text, actions);
  overlay.append(content);
  document.body.append(overlay);
  document.body.classList.add('analytics-consent-open');
  requestAnimationFrame(() => content.querySelector('.analytics-allow')?.focus());
}

window.satoshiAnalytics = {measurementId: MEASUREMENT_ID, getConsent: readConsent, setConsent};
window.acceptCookies = () => setConsent(true);
window.declineCookies = () => setConsent(false);
window.dispatchEvent(new CustomEvent('satoshi-analytics-ready'));
document.getElementById('cookieConsentModal')?.remove();

if (readConsent() === 'granted') loadAnalytics();
else if (!readConsent()) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showNotice, {once: true});
  else showNotice();
}
