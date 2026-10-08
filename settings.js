(() => {
  const select = document.getElementById('siteTheme');
  const key = 'satoshiSiteTheme';
  const validThemes = ['legacy', 'coffee', 'forest', 'ocean', 'space', 'electric', 'ice'];

  function currentTheme() {
    if (window.satoshiTheme) return window.satoshiTheme.get();
    try {
      const stored = localStorage.getItem(key);
      return validThemes.includes(stored) ? stored : 'legacy';
    } catch {
      return 'legacy';
    }
  }

  function sync() {
    select.value = currentTheme();
  }

  select.addEventListener('change', () => {
    if (window.satoshiTheme) {
      window.satoshiTheme.set(select.value);
      return;
    }
    document.documentElement.dataset.theme = select.value;
    try { localStorage.setItem(key, select.value); } catch { /* Keep this session's theme. */ }
  });
  document.addEventListener('DOMContentLoaded', sync, {once: true});
  window.addEventListener('satoshi-theme-change', sync);
})();

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
  const metadataUrl = '/__satoshi_pwa_metadata__';
  const numericVersion = name => Number.parseInt(name.slice(cachePrefix.length), 10);
  let installed = null;

  function relativeTime(isoDate) {
    const elapsed = Date.now() - Date.parse(isoDate);
    if (!Number.isFinite(elapsed) || elapsed < 0) return '';
    const units = [
      ['day', 86400000],
      ['hour', 3600000],
      ['minute', 60000],
    ];
    const [unit, duration] = units.find(([, milliseconds]) => elapsed >= milliseconds) || ['second', 1000];
    const amount = Math.max(1, Math.floor(elapsed / duration));
    return `${amount} ${unit}${amount === 1 ? '' : 's'} ago`;
  }

  function renderInstalledVersion() {
    if (!installed) return;
    const age = relativeTime(installed.updatedAt);
    output.textContent = `v${installed.version}${age ? ` · updated ${age}` : ''}`;
  }

  // When the metadata entry is missing — an install that could not cache every file, or a
  // cache the worker is still filling — the version's own entries still carry the server's
  // Date header, and the oldest of those is when this version arrived. Without this the
  // panel silently dropped the age and showed a bare "v204".
  async function oldestCachedDate(cache) {
    let oldest = Infinity;
    const requests = await cache.keys().catch(() => []);
    for (const request of requests) {
      const response = await cache.match(request).catch(() => null);
      const stamp = Date.parse((response && response.headers.get('date')) || '');
      if (Number.isFinite(stamp) && stamp < oldest) oldest = stamp;
    }
    return Number.isFinite(oldest) ? new Date(oldest).toISOString() : '';
  }

  async function showInstalledVersion() {
    try {
      const versions = (await caches.keys())
        .filter(name => name.startsWith(cachePrefix))
        .map(numericVersion)
        .filter(Number.isFinite)
        .sort((a, b) => b - a);
      if (!versions.length) {
        installed = null;
        output.textContent = 'not installed';
        return;
      }
      const version = versions[0];
      const cache = await caches.open(`${cachePrefix}${version}`);
      const metadata = await cache.match(metadataUrl);
      const details = metadata ? await metadata.json().catch(() => ({})) : {};
      // A value that is present but unparsable is no better than a missing one, so each
      // candidate is checked for a real moment before it is trusted.
      const usable = value => (Number.isFinite(Date.parse(String(value || ''))) ? String(value) : '');
      const updatedAt = usable(details.updatedAt)
        || usable(metadata && metadata.headers.get('date'))
        || await oldestCachedDate(cache);
      installed = {version, updatedAt: updatedAt || ''};
      renderInstalledVersion();
    } catch {
      output.textContent = 'not available';
    }
  }

  showInstalledVersion();
  setInterval(renderInstalledVersion, 60000);
  navigator.serviceWorker?.addEventListener('controllerchange', showInstalledVersion);
  // A backgrounded app has its timers throttled, so returning to it re-reads rather than
  // trusting an interval that may not have run.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') showInstalledVersion();
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

(() => {
  const button = document.getElementById('installSatoshiApp');
  const sync = () => {
    const installed = window.satoshiPwa?.installed === true;
    button.disabled = installed;
    button.textContent = installed ? 'Installed' : 'Install';
  };
  button.addEventListener('click', () => window.satoshiPwa?.install());
  document.addEventListener('DOMContentLoaded', sync, {once: true});
  window.addEventListener('satoshi-pwa-install-state', sync);
})();
