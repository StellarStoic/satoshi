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
  const timeout = document.getElementById('walletAutoLockMinutes');
  const key = 'satoshiBarkAutoLockMinutes';
  let value = '5';
  try { value = localStorage.getItem(key) || value; } catch { /* Use secure default. */ }
  if (![...timeout.options].some(option => option.value === value)) value = '5';
  timeout.value = value;
  timeout.addEventListener('change', () => {
    try { localStorage.setItem(key, timeout.value); } catch { /* Applies after storage is available. */ }
  });
})();

(() => {
  const output = document.getElementById('pwaVersion');
  const cachePrefix = 'satoshi-static-v';
  const numericVersion = name => Number.parseInt(name.slice(cachePrefix.length), 10);

  async function showInstalledVersion() {
    try {
      const versions = (await caches.keys())
        .filter(name => name.startsWith(cachePrefix))
        .map(numericVersion)
        .filter(Number.isFinite)
        .sort((a, b) => b - a);
      output.textContent = versions.length ? `v${versions[0]}` : 'not installed';
    } catch {
      output.textContent = 'not available';
    }
  }

  showInstalledVersion();
  navigator.serviceWorker?.addEventListener('controllerchange', showInstalledVersion);
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
