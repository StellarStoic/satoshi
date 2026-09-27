(() => {
  const settingKey = 'satoshiChatEnabled';
  const chatToggle = document.getElementById('syntheticSatoshiEnabled');
  let enabled = true;
  try { enabled = localStorage.getItem(settingKey) !== 'false'; } catch { /* Use the default. */ }
  chatToggle.checked = enabled;
  chatToggle.addEventListener('change', () => {
    try { localStorage.setItem(settingKey, String(chatToggle.checked)); } catch { /* Reload still applies for this view only. */ }
    location.reload();
  });
})();

(() => {
  const analyticsToggle = document.getElementById('analyticsEnabled');
  const sync = () => {
    analyticsToggle.disabled = !window.satoshiAnalytics;
    analyticsToggle.checked = window.satoshiAnalytics?.getConsent() === 'granted';
  };
  sync();
  window.addEventListener('satoshi-analytics-ready', sync);
  window.addEventListener('satoshi-analytics-consent', sync);
  analyticsToggle.addEventListener('change', () => {
    window.satoshiAnalytics?.setConsent(analyticsToggle.checked);
    if (!analyticsToggle.checked) location.reload();
  });
})();
