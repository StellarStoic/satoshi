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
