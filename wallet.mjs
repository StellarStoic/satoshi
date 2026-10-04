import init, {
  OnchainWallet,
  Wallet,
  generateMnemonic,
  validateArkAddress,
  validateMnemonic,
} from './vendor/bark/bark_ffi_wasm.js';
import {
  balanceTotal,
  classifyPaymentDestination,
  formatSats,
  notificationMovement,
  normalizeMnemonic,
  parseBolt11AmountSats,
  receivedMovementAmount,
} from './walletModel.mjs';
import {englishWordlist} from './vendor/bip39.mjs';
import {
  LEGACY_WALLET_PROFILE_KEY,
  decryptWalletSecret,
  encryptWalletSecret,
  readAutoLockMinutes,
  validateWalletPassword,
  walletProfileKey,
} from './walletSecurity.mjs';

const NETWORKS = Object.freeze({
  signet: Object.freeze({
    id: 'signet', sdkName: 'Signet', label: 'Bitcoin Signet', shortLabel: 'Signet',
    serverAddress: 'https://ark.signet.2nd.dev', esploraAddress: 'https://esplora.signet.2nd.dev',
  }),
  mainnet: Object.freeze({
    id: 'mainnet', sdkName: 'Bitcoin', label: 'Bitcoin mainnet', shortLabel: 'Mainnet',
    serverAddress: 'https://ark.second.tech', esploraAddress: 'https://mempool.second.tech/api',
  }),
});
const SELECTED_NETWORK_KEY = 'satoshiBarkSelectedNetwork';
const WASM_URL = '/vendor/bark/bark_ffi_wasm_bg.wasm';
const TERMS_KEY = 'satoshiBarkMainnetTermsV1';
const TERMS_VERSION = 1;
const WORD_SET = new Set(englishWordlist);

const elements = Object.fromEntries([
  'walletNotice', 'secureContextError', 'walletOnboarding', 'walletDashboard', 'termsState', 'termsStatus',
  'createWallet', 'showRestore', 'restoreForm', 'restoreWordCount', 'restoreWordsGrid', 'cancelRestore', 'openBarkInfo',
  'unlockForm', 'unlockPassword', 'recoverInstead', 'newWalletActions',
  'openTermsInline', 'barkHelpDialog', 'backupDialog', 'backupForm', 'cancelBackup', 'mnemonicWords',
  'backupCheck', 'backupWordsStep', 'backupVerifyStep', 'startBackupVerification', 'spendableBalance', 'btcBalance', 'walletFingerprint', 'lastSync', 'syncWallet',
  'lockWallet', 'receiveView', 'sendView', 'activityView', 'arkReceivePanel', 'lightningReceivePanel', 'newArkAddress',
  'invoiceAmount', 'invoiceDescription', 'sendForm',
  'sendDestination', 'sendAmount', 'destinationHint', 'walletHistory', 'confirmPaymentDialog',
  'paymentSummary', 'confirmPayment',
  'arkRoundInterval', 'arkVtxoLifetime', 'arkExitDelay',
  'walletTermsAgreement', 'acceptWalletTerms', 'termsAccepted', 'termsAgreementLabel',
  'passwordDialog', 'passwordForm', 'passwordTitle', 'newWalletPassword', 'confirmWalletPassword', 'cancelPasswordSetup',
  'receivePaymentDialog', 'receivePaymentTitle', 'receivePaymentMethod', 'receivePaymentQr',
  'receivePaymentDetails', 'receivePaymentValue', 'copyReceivePayment',
  'walletErrorDialog', 'walletErrorMessage', 'closeWalletError', 'retryWalletConnection',
  'openNetworkDialog', 'currentNetworkLabel', 'networkWarning', 'signetFaucet',
  'networkDialog', 'networkForm', 'closeNetworkDialog', 'signetProfileStatus', 'mainnetProfileStatus',
  'arkNetworkName', 'arkServerName', 'confirmPaymentTitle', 'walletLiveChannel', 'walletLiveStatus',
  'enableWalletNotifications', 'walletPaymentToast', 'walletPaymentToastTitle', 'walletPaymentToastBody',
  'notificationConsentDialog', 'notificationConsentForm', 'notificationConsentCheck', 'confirmNotificationConsent',
  'cancelNotificationConsent', 'cancelNotificationConsentFooter',
].map(id => [id, document.getElementById(id)]));

let sdkPromise;
let wallet;
let onchain;
let pendingMnemonic = '';
let pendingPayment;
let currentArkAddress = '';
let currentInvoice = '';
let operationRunning = false;
let pendingPasswordMnemonic = '';
let errorTimer;
let inactivityTimer;
let acceptedTerms;
let activeNetwork = NETWORKS.signet;
let pendingPasswordNetwork = '';
let notificationHolder;
let notificationGeneration = 0;
let notificationRestartTimer;
let notificationRefreshTimer;
let paymentToastTimer;
let pushServiceAvailable = false;
const seenIncomingMovements = new Set();
const PUSH_API = 'https://mcp.satoshi.si/wallet-notifications/v1';
const PUSH_STATE_PREFIX = 'satoshiBarkPushV1:';

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

function pushStateKey(networkId = activeNetwork.id) {
  return `${PUSH_STATE_PREFIX}${networkId}`;
}

function readPushState(networkId = activeNetwork.id) {
  const state = readJson(pushStateKey(networkId));
  return state?.id && state?.secret && Number(state?.expiresAt) > Date.now() / 1000 ? state : null;
}

function writePushState(state, networkId = activeNetwork.id) {
  try {
    if (state) localStorage.setItem(pushStateKey(networkId), JSON.stringify(state));
    else localStorage.removeItem(pushStateKey(networkId));
  } catch { /* Background alerts remain best-effort if storage is unavailable. */ }
}

function readTerms() {
  const record = readJson(TERMS_KEY);
  return record?.version === TERMS_VERSION && typeof record.acceptedAt === 'string' ? record : null;
}

function storedNetworkId() {
  try {
    const value = localStorage.getItem(SELECTED_NETWORK_KEY);
    return NETWORKS[value] ? value : '';
  } catch {
    return '';
  }
}

function readWalletProfile(networkId = activeNetwork.id) {
  const profile = readJson(walletProfileKey(networkId));
  if (profile || networkId !== 'mainnet') return profile;
  return readJson(LEGACY_WALLET_PROFILE_KEY);
}

function showTimedError(message) {
  clearTimeout(errorTimer);
  elements.walletErrorMessage.textContent = message;
  elements.retryWalletConnection.hidden = !message.includes('chain-data service');
  const bar = elements.walletErrorDialog.querySelector('.error-timeout');
  bar.classList.remove('running');
  void bar.offsetWidth;
  bar.classList.add('running');
  showDialog(elements.walletErrorDialog);
  errorTimer = setTimeout(() => closeDialog(elements.walletErrorDialog), 6500);
}

function setNotice(message, tone = 'neutral') {
  elements.walletNotice.textContent = message;
  elements.walletNotice.dataset.tone = tone;
  if (tone === 'error') showTimedError(message);
}

function errorMessage(error, fallback = 'The wallet operation failed.') {
  const message = error instanceof Error ? error.message : String(error || fallback);
  const clean = message.replace(/\s+/g, ' ').trim();
  if (/failed to fetch|error sending request|failed to create chain source/i.test(clean)) {
    const host = new URL(activeNetwork.esploraAddress).host;
    return `Could not reach the ${activeNetwork.shortLabel} chain-data service (${host}). Check the connection and allow this domain in browser shields, privacy extensions, VPN, or DNS filtering, then try again.`;
  }
  return clean || fallback;
}

function setOperationState(running, message) {
  operationRunning = running;
  document.querySelectorAll('.wallet-primary, .wallet-secondary, .wallet-danger, .wallet-actions button')
    .forEach(button => {
      button.disabled = running || ((button === elements.createWallet || button === elements.showRestore) && !acceptedTerms);
    });
  if (message) setNotice(message);
}

async function ensureSdk() {
  if (!window.isSecureContext || !globalThis.crypto?.subtle || !globalThis.indexedDB) {
    throw new Error('Bark requires HTTPS or localhost with WebAssembly, Web Crypto, and IndexedDB enabled.');
  }
  if (!sdkPromise) sdkPromise = init({module_or_path: WASM_URL});
  await sdkPromise;
}

async function checkChainSource(network) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const endpoint = `${network.esploraAddress.replace(/\/$/, '')}/blocks/tip/height`;
  try {
    const response = await fetch(endpoint, {cache: 'no-store', credentials: 'omit', mode: 'cors', signal: controller.signal});
    if (!response.ok || !/^\d+$/.test((await response.text()).trim())) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`Could not reach the ${network.shortLabel} chain-data service (${new URL(network.esploraAddress).host}). Check the connection and allow this domain in browser shields, privacy extensions, VPN, or DNS filtering, then try again.`, {cause: error});
  } finally {
    clearTimeout(timeout);
  }
}

function networkConfig(network = activeNetwork) {
  return Object.freeze({serverAddress: network.serverAddress, esploraAddress: network.esploraAddress, userAgent: 'satoshi-si/1.0.0'});
}

async function walletDatabaseNames(mnemonic, network = activeNetwork) {
  const digestContext = network.id === 'mainnet' ? `satoshi.si-bark:${mnemonic}` : `satoshi.si-bark:${network.id}:${mnemonic}`;
  const bytes = new TextEncoder().encode(digestContext);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const id = Array.from(digest.slice(0, 10), byte => byte.toString(16).padStart(2, '0')).join('');
  if (network.id === 'mainnet') return {ark: `satoshi-bark-${id}`, chain: `satoshi-bark-chain-${id}`};
  return {ark: `satoshi-bark-${network.id}-${id}`, chain: `satoshi-bark-chain-${network.id}-${id}`};
}

function showDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function updateNetworkProfileStatuses() {
  [['signet', elements.signetProfileStatus], ['mainnet', elements.mainnetProfileStatus]].forEach(([networkId, output]) => {
    const saved = Boolean(readWalletProfile(networkId));
    output.textContent = saved ? 'Encrypted wallet saved in this browser' : 'No wallet saved';
    output.classList.toggle('has-wallet', saved);
  });
}

function applyNetworkUi() {
  document.body.dataset.walletNetwork = activeNetwork.id;
  elements.currentNetworkLabel.textContent = activeNetwork.label;
  elements.signetFaucet.hidden = activeNetwork.id !== 'signet';
  elements.arkNetworkName.textContent = activeNetwork.label;
  elements.arkServerName.textContent = new URL(activeNetwork.serverAddress).host;
  elements.confirmPaymentTitle.textContent = activeNetwork.id === 'mainnet' ? 'Confirm real bitcoin payment' : 'Confirm Signet test payment';
  elements.networkWarning.innerHTML = activeNetwork.id === 'mainnet'
    ? '<i data-lucide="triangle-alert"></i><strong>This uses real bitcoin.</strong> Begin with an amount you can afford to lose.'
    : '<i data-lucide="badge-check"></i><strong>Signet coins have no monetary value.</strong> Learn and experiment risk free.';
  elements.sendDestination.placeholder = activeNetwork.id === 'mainnet'
    ? 'Ark address, lnbc invoice, name@domain, or bc1 address'
    : 'Ark address, lntb invoice, name@domain, or tb1 address';
  elements.arkRoundInterval.textContent = 'Available after wallet opens';
  elements.arkVtxoLifetime.textContent = 'Available after wallet opens';
  elements.arkExitDelay.textContent = 'Available after wallet opens';
  updateNetworkProfileStatuses();
  globalThis.lucide?.createIcons?.();
}

function openNetworkSelection() {
  updateNetworkProfileStatuses();
  const input = elements.networkForm.querySelector(`input[value="${activeNetwork.id}"]`);
  if (input) input.checked = true;
  elements.closeNetworkDialog.hidden = !storedNetworkId();
  showDialog(elements.networkDialog);
}

async function showNetworkEntryNotice() {
  if (readWalletProfile()) {
    setNotice(`${activeNetwork.shortLabel} wallet found. Enter its password to unlock it.`, 'success');
  } else if (await hasLegacyWalletData()) {
    setNotice(`Existing ${activeNetwork.shortLabel} wallet data found. Restore it once with the recovery words to add secure password unlock.`, 'success');
  } else {
    setNotice(`Create or restore a separate ${activeNetwork.shortLabel} wallet.`);
  }
}

async function selectNetwork(networkId) {
  const selected = NETWORKS[networkId];
  if (!selected || operationRunning) return;
  if (wallet && selected.id === activeNetwork.id) {
    try { localStorage.setItem(SELECTED_NETWORK_KEY, selected.id); } catch { /* Keep the selection for this page. */ }
    closeDialog(elements.networkDialog);
    return;
  }
  if (wallet) await disposeWallet({announce: false, message: ''});
  activeNetwork = selected;
  try { localStorage.setItem(SELECTED_NETWORK_KEY, selected.id); } catch { /* Keep the selection for this page. */ }
  elements.restoreForm.hidden = true;
  clearRestoreInputs();
  elements.spendableBalance.textContent = '0 sats';
  elements.btcBalance.textContent = '0 BTC';
  elements.walletFingerprint.textContent = 'Wallet ----';
  elements.lastSync.textContent = 'Not synchronized';
  renderHistory([]);
  applyNetworkUi();
  updateEntryState();
  closeDialog(elements.networkDialog);
  await showNetworkEntryNotice();
}

function updateEntryState() {
  acceptedTerms = readTerms();
  const profile = readWalletProfile();
  const canStart = Boolean(acceptedTerms) && window.isSecureContext;
  elements.createWallet.disabled = !canStart;
  elements.showRestore.disabled = !canStart;
  elements.termsStatus.textContent = acceptedTerms
    ? `Terms agreed ${new Date(acceptedTerms.acceptedAt).toLocaleString()}.`
    : 'Terms must be accepted before continuing.';
  elements.termsState.classList.toggle('accepted', Boolean(acceptedTerms));
  elements.unlockForm.hidden = !profile || !canStart;
  elements.newWalletActions.hidden = Boolean(profile);
  if (acceptedTerms) {
    elements.termsAccepted.hidden = false;
    elements.termsAccepted.textContent = `You agreed to these terms on ${new Date(acceptedTerms.acceptedAt).toLocaleString()}.`;
    elements.walletTermsAgreement.checked = true;
    elements.walletTermsAgreement.disabled = true;
    elements.termsAgreementLabel.querySelector('span').textContent = `Agreed on ${new Date(acceptedTerms.acceptedAt).toLocaleString()}`;
    elements.acceptWalletTerms.hidden = true;
  } else {
    elements.walletTermsAgreement.checked = false;
    elements.walletTermsAgreement.disabled = false;
    elements.termsAgreementLabel.querySelector('span').textContent = 'I have read and agree to these terms.';
    elements.acceptWalletTerms.hidden = false;
  }
}

async function hasLegacyWalletData() {
  if (readWalletProfile() || typeof indexedDB.databases !== 'function') return false;
  try {
    const databases = await indexedDB.databases();
    if (activeNetwork.id === 'signet') return databases.some(database => database.name?.startsWith('satoshi-bark-signet-') || database.name?.startsWith('satoshi-bark-chain-signet-'));
    return databases.some(database => /^satoshi-bark-(?:chain-)?[a-f0-9]{20}$/.test(database.name || ''));
  } catch {
    return false;
  }
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  if (!wallet) return;
  let minutes = 5;
  try { minutes = readAutoLockMinutes(); } catch { /* Keep secure default. */ }
  if (minutes > 0) inactivityTimer = setTimeout(() => disposeWallet({message: `Wallet locked after ${minutes} minutes of inactivity.`}), minutes * 60_000);
}

['pointerdown', 'keydown', 'touchstart'].forEach(type => document.addEventListener(type, resetInactivityTimer, {passive: true}));

function normalizeWord(value) {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function attachWordAssistant(input) {
  const dropdown = document.createElement('div');
  dropdown.className = 'word-suggestions';
  dropdown.hidden = true;
  input.parentElement.append(dropdown);

  const update = () => {
    const value = normalizeWord(input.value);
    if (input.value !== value) input.value = value;
    input.classList.remove('word-valid', 'word-possible', 'word-invalid');
    input.removeAttribute('aria-invalid');
    dropdown.replaceChildren();
    if (!value) {
      dropdown.hidden = true;
      return;
    }
    const matches = englishWordlist.filter(word => word.startsWith(value));
    if (!matches.length) {
      input.classList.add('word-invalid');
      input.setAttribute('aria-invalid', 'true');
      const empty = document.createElement('span');
      empty.textContent = 'No BIP39 word matches';
      dropdown.append(empty);
      dropdown.hidden = false;
      return;
    }
    input.classList.add(WORD_SET.has(value) ? 'word-valid' : 'word-possible');
    matches.slice(0, 6).forEach(word => {
      const option = document.createElement('button');
      option.type = 'button';
      option.textContent = word;
      option.addEventListener('pointerdown', event => {
        event.preventDefault();
        input.value = word;
        dropdown.hidden = true;
        update();
        input.focus();
      });
      dropdown.append(option);
    });
    dropdown.hidden = false;
  };
  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  input.addEventListener('blur', () => setTimeout(() => { dropdown.hidden = true; }, 120));
  input.addEventListener('keydown', event => {
    const options = [...dropdown.querySelectorAll('button')];
    if (event.key === 'Escape') dropdown.hidden = true;
    if (event.key === 'Enter' && options.length && !WORD_SET.has(input.value)) {
      event.preventDefault();
      input.value = options[0].textContent;
      update();
      dropdown.hidden = true;
    }
  });
}

function createWordInput(position) {
  const label = document.createElement('label');
  const prompt = document.createElement('span');
  prompt.textContent = String(position);
  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.autocapitalize = 'none';
  input.spellcheck = false;
  input.required = true;
  input.setAttribute('aria-label', `Recovery word ${position}`);
  label.append(prompt, input);
  attachWordAssistant(input);
  return label;
}

function renderRestoreInputs(count = Number(elements.restoreWordCount.value)) {
  elements.restoreWordsGrid.replaceChildren(...Array.from({length: count}, (_, index) => createWordInput(index + 1)));
}

function restoreMnemonicValue() {
  return normalizeMnemonic([...elements.restoreWordsGrid.querySelectorAll('input')].map(input => input.value).join(' '));
}

function clearRestoreInputs() {
  elements.restoreWordsGrid.querySelectorAll('input').forEach(input => { input.value = ''; input.className = ''; });
}

function showPasswordSetup(mnemonic) {
  pendingPasswordMnemonic = mnemonic;
  pendingPasswordNetwork = activeNetwork.id;
  elements.passwordTitle.textContent = `Create a ${activeNetwork.shortLabel} wallet password`;
  pendingMnemonic = '';
  elements.newWalletPassword.value = '';
  elements.confirmWalletPassword.value = '';
  showDialog(elements.passwordDialog);
  elements.newWalletPassword.focus();
}

function showReceivePayment({title, method, value, details}) {
  elements.receivePaymentTitle.textContent = title;
  elements.receivePaymentMethod.textContent = method;
  elements.receivePaymentValue.textContent = value;
  elements.receivePaymentDetails.replaceChildren();
  Object.entries(details).forEach(([label, detail]) => {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = detail;
    elements.receivePaymentDetails.append(dt, dd);
  });
  renderQr(elements.receivePaymentQr, method === 'Lightning invoice' ? value.toUpperCase() : value);
  showDialog(elements.receivePaymentDialog);
}

function renderQr(container, value) {
  container.replaceChildren();
  if (!value || typeof globalThis.qrcode !== 'function') return;
  const qr = globalThis.qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  container.innerHTML = qr.createSvgTag({cellSize: 6, margin: 2});
}

async function copyText(value, label) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    setNotice(`${label} copied.`, 'success');
  } catch {
    const field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    document.execCommand('copy');
    field.remove();
    setNotice(`${label} copied.`, 'success');
  }
}

function renderHistory(movements) {
  elements.walletHistory.replaceChildren();
  if (!Array.isArray(movements) || !movements.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No wallet activity yet.';
    elements.walletHistory.append(empty);
    return;
  }

  movements.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5).forEach(movement => {
    const item = document.createElement('article');
    item.className = 'history-item';
    const title = document.createElement('strong');
    title.textContent = movement.subsystemName || movement.subsystemKind || 'Bark movement';
    const amountValue = Number(movement.effectiveBalanceSats || movement.intendedBalanceSats || 0);
    const amount = document.createElement('strong');
    amount.className = amountValue > 0 ? 'positive' : amountValue < 0 ? 'negative' : '';
    amount.textContent = `${amountValue > 0 ? '+' : ''}${formatSats(amountValue)}`;
    const status = document.createElement('span');
    status.textContent = movement.status || 'Recorded';
    const time = document.createElement('time');
    const date = new Date(movement.completedAt || movement.updatedAt || movement.createdAt);
    time.dateTime = Number.isNaN(date.valueOf()) ? '' : date.toISOString();
    time.textContent = Number.isNaN(date.valueOf()) ? '' : date.toLocaleString();
    item.append(title, amount, status, time);
    elements.walletHistory.append(item);
  });
}

function incomingMovementKey(movement) {
  return `${activeNetwork.id}:${movement.id ?? movement.createdAt ?? movement.paymentHash ?? JSON.stringify(movement)}`;
}

function rememberExistingIncoming(movements) {
  if (!Array.isArray(movements)) return;
  movements.forEach(movement => {
    if (receivedMovementAmount(movement)) seenIncomingMovements.add(incomingMovementKey(movement));
  });
}

function movementMethod(movement) {
  const source = `${movement.subsystemName || ''} ${movement.subsystemKind || ''}`.toLowerCase();
  if (source.includes('lightning')) return 'Lightning';
  if (source.includes('board') || source.includes('onchain')) return 'On-chain';
  return 'Ark';
}

function showPaymentToast(movement, amount) {
  clearTimeout(paymentToastTimer);
  elements.walletPaymentToastTitle.textContent = `${formatSats(amount)} received`;
  elements.walletPaymentToastBody.textContent = `${movementMethod(movement)} on ${activeNetwork.label}`;
  elements.walletPaymentToast.hidden = false;
  elements.walletPaymentToast.classList.remove('show');
  void elements.walletPaymentToast.offsetWidth;
  elements.walletPaymentToast.classList.add('show');
  paymentToastTimer = setTimeout(() => {
    elements.walletPaymentToast.classList.remove('show');
    elements.walletPaymentToast.hidden = true;
  }, 8000);
}

async function showSystemPaymentNotification(movement, amount) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(`${formatSats(amount)} received`, {
      body: `${movementMethod(movement)} payment on ${activeNetwork.label}`,
      icon: '/android-chrome-192x192.png',
      badge: '/favicon-32x32.png',
      tag: `bark-${incomingMovementKey(movement)}`,
      data: {url: '/wallet.html'},
    });
  } catch { /* The in-page alert remains available if system alerts fail. */ }
}

function updateNotificationPermissionUi() {
  const supported = 'Notification' in window && 'serviceWorker' in navigator;
  const active = Boolean(readPushState());
  elements.enableWalletNotifications.hidden = !supported || (!pushServiceAvailable && !active);
  elements.enableWalletNotifications.dataset.active = String(active);
  elements.enableWalletNotifications.querySelector('span').textContent = active ? 'Background alerts on' : 'Background alerts';
  if (!supported) elements.enableWalletNotifications.title = 'System notifications are unavailable in this browser.';
}

async function probePushService() {
  try {
    const response = await fetch(`${PUSH_API}/config`, {cache: 'no-store', credentials: 'omit'});
    const config = response.ok ? await response.json() : null;
    pushServiceAvailable = Boolean(config?.vapidPublicKey);
  } catch {
    pushServiceAvailable = false;
  }
  updateNotificationPermissionUi();
}

function vapidKeyBytes(value) {
  const padded = `${value}${'='.repeat((4 - value.length % 4) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

async function enableBackgroundNotifications({quiet = false} = {}) {
  if (!wallet) throw new Error('Unlock the wallet before enabling background alerts.');
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !window.isSecureContext) {
    throw new Error('Background notifications are unavailable in this browser.');
  }
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const configResponse = await fetch(`${PUSH_API}/config`, {cache: 'no-store', credentials: 'omit'});
  if (!configResponse.ok) throw new Error('The background notification service is unavailable.');
  const config = await configResponse.json();
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKeyBytes(config.vapidPublicKey),
    });
  }

  const authorizationSeconds = Math.min(86400, Number(config.authorizationSeconds) || 86400);
  const response = await fetch(`${PUSH_API}/subscriptions`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({
      network: activeNetwork.id,
      serverAddress: activeNetwork.serverAddress,
      mailboxIdentifier: wallet.mailboxIdentifier(),
      authorization: wallet.mailboxAuthorization(authorizationSeconds),
      subscription: subscription.toJSON(),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not register background notifications.');
  writePushState({id: result.id, secret: result.secret, expiresAt: result.expiresAt});
  updateNotificationPermissionUi();
  if (!quiet) setNotice('Background payment alerts are active for 24 hours.', 'success');
}

async function disableBackgroundNotifications() {
  const state = readPushState();
  if (state) {
    await fetch(`${PUSH_API}/subscriptions/${state.id}`, {
      method: 'DELETE', mode: 'cors', credentials: 'omit', headers: {authorization: `Bearer ${state.secret}`},
    }).catch(() => {});
  }
  writePushState(null);
  updateNotificationPermissionUi();
  setNotice('Background alerts are off. The previous mailbox permission will expire on its own.', 'success');
}

async function renewBackgroundNotifications() {
  const state = readPushState();
  if (!state || state.expiresAt - Date.now() / 1000 > 6 * 60 * 60) return;
  try { await enableBackgroundNotifications({quiet: true}); } catch { /* Foreground alerts still work. */ }
}

function scheduleNotificationRefresh() {
  clearTimeout(notificationRefreshTimer);
  notificationRefreshTimer = setTimeout(async () => {
    if (!wallet) return;
    if (operationRunning) {
      scheduleNotificationRefresh();
      return;
    }
    await refreshWallet({announce: false});
  }, 350);
}

function handleWalletNotification(notification) {
  if (String(notification?.type || '').toLowerCase() === 'channellagging') {
    elements.walletLiveStatus.textContent = 'Catching up with the wallet stream...';
    elements.walletLiveChannel.dataset.state = 'reconnecting';
    scheduleNotificationRefresh();
    return;
  }
  const movement = notificationMovement(notification);
  if (!movement) return;
  const amount = receivedMovementAmount(movement);
  const key = incomingMovementKey(movement);
  if (amount && !seenIncomingMovements.has(key)) {
    seenIncomingMovements.add(key);
    showPaymentToast(movement, amount);
    void showSystemPaymentNotification(movement, amount);
  }
  elements.walletLiveStatus.textContent = 'Listening for incoming payments';
  elements.walletLiveChannel.dataset.state = 'live';
  scheduleNotificationRefresh();
}

function stopWalletNotifications() {
  clearTimeout(notificationRestartTimer);
  clearTimeout(notificationRefreshTimer);
  notificationGeneration += 1;
  const holder = notificationHolder;
  notificationHolder = undefined;
  try { holder?.cancelNextNotificationWait(); } catch { /* No pending wait. */ }
  if (elements.walletLiveStatus) elements.walletLiveStatus.textContent = 'Alerts pause while the wallet is locked';
  if (elements.walletLiveChannel) elements.walletLiveChannel.dataset.state = 'paused';
}

function startWalletNotifications() {
  if (!wallet || notificationHolder) return;
  const generation = ++notificationGeneration;
  let holder;
  try {
    holder = wallet.notifications();
    notificationHolder = holder;
    elements.walletLiveStatus.textContent = 'Listening for incoming payments';
    elements.walletLiveChannel.dataset.state = 'live';
  } catch {
    elements.walletLiveStatus.textContent = 'Live alerts unavailable';
    elements.walletLiveChannel.dataset.state = 'paused';
    return;
  }

  void (async () => {
    let reconnect = false;
    try {
      while (wallet && generation === notificationGeneration) {
        const notification = await holder.nextNotification();
        if (!notification || generation !== notificationGeneration) break;
        handleWalletNotification(notification);
      }
    } catch {
      reconnect = Boolean(wallet && generation === notificationGeneration);
      if (reconnect) {
        elements.walletLiveStatus.textContent = 'Reconnecting live alerts...';
        elements.walletLiveChannel.dataset.state = 'reconnecting';
      }
    } finally {
      if (notificationHolder === holder) notificationHolder = undefined;
      try { holder.free(); } catch { /* Already released. */ }
      if (reconnect) notificationRestartTimer = setTimeout(startWalletNotifications, 3000);
    }
  })();
}

function renderRecoveryStatus() {
  const recovery = wallet.recoveryStatus();
  if (recovery.type === 'failed') {
    setNotice(`Recovery scan failed and funds may be missing: ${recovery.message}`, 'error');
  } else if (recovery.type === 'completed' && !recovery.report.isComplete) {
    setNotice('Recovery was incomplete. Some wallet funds may be missing from this view.', 'error');
  }
}

function formatBlocksAsTime(blocks) {
  const value = Number(blocks);
  if (!Number.isFinite(value) || value <= 0) return 'Not reported';
  const days = value / 144;
  const duration = days >= 2 ? `${days.toFixed(days >= 10 ? 0 : 1)} days` : `${Math.round(value * 10 / 60)} hours`;
  return `${value.toLocaleString()} blocks (about ${duration})`;
}

async function renderArkServerInfo() {
  try {
    const info = await wallet.arkInfo();
    if (!info) return;
    const roundSeconds = Number(info.roundIntervalSecs);
    elements.arkRoundInterval.textContent = Number.isFinite(roundSeconds) && roundSeconds > 0
      ? `${roundSeconds.toLocaleString()} seconds`
      : 'Not reported';
    elements.arkVtxoLifetime.textContent = formatBlocksAsTime(info.vtxoLifetime || info.vtxoExpiryDelta);
    elements.arkExitDelay.textContent = formatBlocksAsTime(info.vtxoExitDelta);
  } catch {
    elements.arkRoundInterval.textContent = 'Could not read server policy';
    elements.arkVtxoLifetime.textContent = 'Could not read server policy';
    elements.arkExitDelay.textContent = 'Could not read server policy';
  }
}

async function refreshWallet({announce = true, seedIncoming = false} = {}) {
  if (!wallet || operationRunning) return;
  setOperationState(true, 'Synchronizing Bark wallet...');
  try {
    await wallet.sync();
    const [balance, history] = await Promise.all([wallet.balance(), wallet.history()]);
    const spendable = Number(balance.spendableSats) || 0;
    const total = balanceTotal(balance);
    elements.spendableBalance.textContent = formatSats(spendable);
    elements.btcBalance.textContent = `${(spendable / 100_000_000).toFixed(8)} BTC`;
    elements.lastSync.textContent = `Synced ${new Date().toLocaleTimeString()}`;
    renderHistory(history);
    if (seedIncoming) rememberExistingIncoming(history);
    if (announce) {
      const pending = total - spendable;
      setNotice(pending > 0 ? `${formatSats(pending)} is pending. ${formatSats(spendable)} is spendable.` : 'Wallet synchronized.', 'success');
    }
    renderRecoveryStatus();
  } catch (error) {
    setNotice(`Sync failed: ${errorMessage(error)}`, 'error');
  } finally {
    setOperationState(false);
  }
}

async function disposeWallet({announce = true, message = `${activeNetwork.shortLabel} wallet locked. Enter its password to reopen it.`} = {}) {
  clearTimeout(inactivityTimer);
  stopWalletNotifications();
  const oldWallet = wallet;
  const oldOnchain = onchain;
  wallet = undefined;
  onchain = undefined;
  try { await oldWallet?.stopDaemonWait(); } catch { /* The handle is being released below. */ }
  try { oldWallet?.free(); } catch { /* Already released. */ }
  try { oldOnchain?.free(); } catch { /* Already released. */ }
  pendingMnemonic = '';
  pendingPayment = undefined;
  currentArkAddress = '';
  currentInvoice = '';
  clearRestoreInputs();
  elements.sendDestination.value = '';
  elements.sendAmount.value = '';
  elements.receivePaymentQr.replaceChildren();
  elements.walletDashboard.hidden = true;
  elements.walletOnboarding.hidden = false;
  updateEntryState();
  if (announce || message) setNotice(message, 'success');
}

async function openWalletWithMnemonic(mnemonic, {passwordToSave = ''} = {}) {
  const openingNetwork = activeNetwork;
  const config = networkConfig(openingNetwork);
  setOperationState(true, `Opening the ${openingNetwork.shortLabel} wallet and scanning for recoverable funds...`);
  let localOnchain;
  let localWallet;
  try {
    await ensureSdk();
    const normalized = normalizeMnemonic(mnemonic);
    if (!validateMnemonic(normalized)) throw new Error('The recovery phrase is not a valid BIP39 mnemonic.');
    if (passwordToSave) {
      const profile = await encryptWalletSecret(normalized, passwordToSave, {network: openingNetwork.id});
      localStorage.setItem(walletProfileKey(openingNetwork.id), JSON.stringify(profile));
      updateNetworkProfileStatuses();
    }
    await checkChainSource(openingNetwork);
    const names = await walletDatabaseNames(normalized, openingNetwork);
    localOnchain = await OnchainWallet.default({network: openingNetwork.sdkName, mnemonic: normalized, config, dbName: names.chain});
    localWallet = await Wallet.openWithOnchain(openingNetwork.sdkName, normalized, config, localOnchain, {
      runDaemon: true,
      indexedDbName: names.ark,
      createIfNotExists: true,
      createWithoutServer: false,
      skipRecovery: false,
    });
    wallet = localWallet;
    onchain = localOnchain;
    pendingMnemonic = '';
    pendingPasswordMnemonic = '';
    pendingPasswordNetwork = '';
    clearRestoreInputs();
    elements.walletFingerprint.textContent = `Wallet ${wallet.fingerprint()}`;
    elements.walletOnboarding.hidden = true;
    elements.walletDashboard.hidden = false;
    updateNetworkProfileStatuses();
    resetInactivityTimer();
    renderRecoveryStatus();
    await renderArkServerInfo();
  } catch (error) {
    try { localWallet?.free(); } catch { /* Ignore teardown errors. */ }
    try { localOnchain?.free(); } catch { /* Ignore teardown errors. */ }
    wallet = undefined;
    onchain = undefined;
    pendingMnemonic = '';
    pendingPasswordMnemonic = '';
    pendingPasswordNetwork = '';
    updateEntryState();
    setNotice(`Wallet could not open: ${errorMessage(error)}`, 'error');
    return;
  } finally {
    setOperationState(false);
  }
  await refreshWallet({announce: true, seedIncoming: true});
  startWalletNotifications();
  void renewBackgroundNotifications();
}

function renderMnemonicWords(mnemonic) {
  const words = mnemonic.split(' ');
  elements.mnemonicWords.replaceChildren(...words.map((word, index) => {
    const item = document.createElement('li');
    const position = document.createElement('span');
    position.className = 'mnemonic-position';
    position.textContent = String(index + 1);
    const value = document.createElement('strong');
    value.textContent = word;
    item.append(position, value);
    return item;
  }));
}

function shuffledWordPositions(length) {
  const positions = Array.from({length}, (_, index) => index);
  for (let index = positions.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const swapIndex = random[0] % (index + 1);
    [positions[index], positions[swapIndex]] = [positions[swapIndex], positions[index]];
  }
  if (positions.length > 1 && positions.every((position, index) => position === index)) {
    [positions[0], positions[1]] = [positions[1], positions[0]];
  }
  return positions;
}

function createBackupChallenge(mnemonic) {
  const words = mnemonic.split(' ');
  elements.backupDialog.querySelector('header span').textContent = 'One-time backup';
  elements.backupDialog.querySelector('header h2').textContent = 'Write down these recovery words';
  renderMnemonicWords(mnemonic);
  elements.backupWordsStep.hidden = false;
  elements.backupVerifyStep.hidden = true;
  elements.backupCheck.replaceChildren(...shuffledWordPositions(words.length).map(index => {
    const label = document.createElement('label');
    const prompt = document.createElement('span');
    prompt.textContent = `Word ${index + 1}`;
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.autocapitalize = 'none';
    input.spellcheck = false;
    input.required = true;
    input.dataset.wordIndex = String(index);
    input.setAttribute('aria-label', `Recovery word ${index + 1}`);
    label.append(prompt, input);
    attachWordAssistant(input);
    return label;
  }));
}

function destinationTypeLabel(type) {
  return ({ark: 'Ark payment', 'lightning-invoice': 'Lightning invoice', 'lightning-address': 'Lightning Address', 'on-chain': 'Bitcoin on-chain payment'})[type] || 'Unknown destination';
}

function updateDestinationHint() {
  const destination = elements.sendDestination.value.trim().replace(/^lightning:/i, '');
  let type = null;
  try { type = classifyPaymentDestination(destination, validateArkAddress); } catch { /* Partial Ark address. */ }
  const invoiceAmount = type === 'lightning-invoice' ? parseBolt11AmountSats(destination) : null;
  if (!destination) {
    elements.destinationHint.textContent = 'Destination type will appear here.';
    elements.sendAmount.disabled = false;
  } else if (!type) {
    elements.destinationHint.textContent = 'This destination is not recognized yet.';
    elements.sendAmount.disabled = false;
  } else if (invoiceAmount) {
    elements.destinationHint.textContent = `${destinationTypeLabel(type)} with ${formatSats(invoiceAmount, {fractional: true})} encoded.`;
    elements.sendAmount.value = Number.isInteger(invoiceAmount) ? String(invoiceAmount) : '';
    elements.sendAmount.disabled = true;
  } else {
    elements.destinationHint.textContent = destinationTypeLabel(type);
    elements.sendAmount.disabled = false;
  }
}

function renderPaymentSummary(payment) {
  const list = document.createElement('dl');
  list.className = 'payment-summary-list';
  [['Method', destinationTypeLabel(payment.type)], ['Amount', formatSats(payment.amount, {fractional: true})], ['Estimated fee', formatSats(payment.fee)], ['Destination', payment.destination]]
    .forEach(([term, value]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term;
      dd.textContent = value;
      list.append(dt, dd);
    });
  const warning = document.createElement('p');
  warning.textContent = 'Bitcoin payments cannot be reversed. Check the destination and amount before sending.';
  elements.paymentSummary.replaceChildren(list, warning);
}

async function estimatePayment(destination, type, amount) {
  if (type === 'ark') return wallet.estimateArkoorPaymentFee(amount);
  if (type === 'lightning-invoice' || type === 'lightning-address') return wallet.estimateLightningSendFee(Math.ceil(amount));
  return wallet.estimateSendOnchainFee(destination, amount);
}

async function executePayment(payment) {
  if (payment.type === 'ark') return wallet.sendArkoorPayment(payment.destination, payment.amount);
  if (payment.type === 'lightning-invoice') {
    const args = {invoice: payment.destination, wait: true};
    if (!parseBolt11AmountSats(payment.destination)) args.amountSats = payment.amount;
    return wallet.payLightningInvoice(args);
  }
  if (payment.type === 'lightning-address') {
    return wallet.payLightningAddress({lightningAddress: payment.destination, amountSats: payment.amount, wait: true});
  }
  return wallet.sendOnchain(payment.destination, payment.amount);
}

elements.openBarkInfo.addEventListener('click', () => showDialog(elements.barkHelpDialog));
elements.openTermsInline.addEventListener('click', () => showDialog(elements.barkHelpDialog));
elements.openNetworkDialog.addEventListener('click', openNetworkSelection);
elements.closeNetworkDialog.addEventListener('click', () => closeDialog(elements.networkDialog));
elements.networkDialog.addEventListener('cancel', event => {
  if (!storedNetworkId()) event.preventDefault();
});
elements.networkForm.addEventListener('submit', async event => {
  event.preventDefault();
  await selectNetwork(new FormData(elements.networkForm).get('walletNetwork'));
});
document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
document.querySelectorAll('[data-cancel-payment]').forEach(button => button.addEventListener('click', () => {
  pendingPayment = undefined;
  closeDialog(elements.confirmPaymentDialog);
}));

document.querySelectorAll('.bark-dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  if (dialog === elements.passwordDialog) return;
  if (dialog === elements.networkDialog && !storedNetworkId()) return;
  if (dialog === elements.backupDialog) {
    resetBackupFlow();
    setNotice('Wallet creation canceled. No recovery phrase was saved.');
  }
  dialog.close();
}));

elements.walletTermsAgreement.addEventListener('change', () => {
  elements.acceptWalletTerms.disabled = !elements.walletTermsAgreement.checked;
});

elements.acceptWalletTerms.addEventListener('click', () => {
  if (!elements.walletTermsAgreement.checked) return;
  const record = {version: TERMS_VERSION, acceptedAt: new Date().toISOString()};
  try {
    localStorage.setItem(TERMS_KEY, JSON.stringify(record));
    updateEntryState();
    closeDialog(elements.barkHelpDialog);
    setNotice('Terms accepted. You can now create or restore a wallet.', 'success');
    if (!storedNetworkId()) openNetworkSelection();
  } catch {
    setNotice('Terms agreement could not be saved in this browser.', 'error');
  }
});

elements.showRestore.addEventListener('click', () => {
  elements.restoreForm.hidden = false;
  elements.restoreWordsGrid.querySelector('input')?.focus();
});

elements.cancelRestore.addEventListener('click', () => {
  clearRestoreInputs();
  elements.restoreForm.hidden = true;
  updateEntryState();
});

elements.recoverInstead.addEventListener('click', () => {
  elements.unlockForm.hidden = true;
  elements.newWalletActions.hidden = false;
  elements.restoreForm.hidden = false;
  elements.restoreWordsGrid.querySelector('input')?.focus();
});

elements.restoreWordCount.addEventListener('change', () => renderRestoreInputs());

elements.createWallet.addEventListener('click', async () => {
  try {
    setOperationState(true, `Creating a new ${activeNetwork.shortLabel} recovery phrase locally...`);
    await ensureSdk();
    pendingMnemonic = generateMnemonic();
    createBackupChallenge(pendingMnemonic);
    showDialog(elements.backupDialog);
    setNotice('Write down and verify the recovery words before the wallet opens.');
  } catch (error) {
    pendingMnemonic = '';
    setNotice(`Wallet creation failed: ${errorMessage(error)}`, 'error');
  } finally {
    setOperationState(false);
  }
});

function resetBackupFlow() {
  pendingMnemonic = '';
  elements.mnemonicWords.replaceChildren();
  elements.backupCheck.replaceChildren();
  elements.backupWordsStep.hidden = false;
  elements.backupVerifyStep.hidden = true;
  elements.backupDialog.querySelector('header span').textContent = 'One-time backup';
  elements.backupDialog.querySelector('header h2').textContent = 'Write down these recovery words';
}

elements.cancelBackup.addEventListener('click', () => {
  resetBackupFlow();
  closeDialog(elements.backupDialog);
  setNotice('Wallet creation canceled. No recovery phrase was saved.');
});

elements.backupDialog.addEventListener('cancel', event => {
  event.preventDefault();
  resetBackupFlow();
  closeDialog(elements.backupDialog);
  setNotice('Wallet creation canceled. No recovery phrase was saved.');
});

elements.startBackupVerification.addEventListener('click', () => {
  if (!pendingMnemonic) return;
  elements.mnemonicWords.replaceChildren();
  elements.backupWordsStep.hidden = true;
  elements.backupVerifyStep.hidden = false;
  elements.backupDialog.querySelector('header span').textContent = 'Backup check';
  elements.backupDialog.querySelector('header h2').textContent = 'Verify every recovery word';
  elements.backupCheck.querySelector('input')?.focus();
});

elements.backupForm.addEventListener('submit', event => {
  event.preventDefault();
  if (!pendingMnemonic) return;
  const words = pendingMnemonic.split(' ');
  const inputs = Array.from(elements.backupCheck.querySelectorAll('input'));
  const mismatch = inputs.find(input => normalizeMnemonic(input.value) !== words[Number(input.dataset.wordIndex)]);
  if (mismatch) {
    setNotice(`Word ${Number(mismatch.dataset.wordIndex) + 1} does not match your new wallet. Check the numbered paper backup.`, 'error');
    mismatch.focus();
    return;
  }
  const mnemonic = pendingMnemonic;
  closeDialog(elements.backupDialog);
  elements.mnemonicWords.replaceChildren();
  elements.backupCheck.replaceChildren();
  elements.backupDialog.querySelector('header span').textContent = 'One-time backup';
  elements.backupDialog.querySelector('header h2').textContent = 'Write down these recovery words';
  showPasswordSetup(mnemonic);
});

elements.restoreForm.addEventListener('submit', async event => {
  event.preventDefault();
  const mnemonic = restoreMnemonicValue();
  await ensureSdk();
  if (!validateMnemonic(mnemonic)) {
    setNotice('These words do not form a valid BIP39 recovery phrase. Check every word and its position.', 'error');
    return;
  }
  showPasswordSetup(mnemonic);
});

elements.passwordForm.addEventListener('submit', async event => {
  event.preventDefault();
  const password = elements.newWalletPassword.value;
  const problem = validateWalletPassword(password);
  if (problem) return setNotice(problem, 'error');
  if (password !== elements.confirmWalletPassword.value) return setNotice('The two wallet passwords do not match.', 'error');
  if (pendingPasswordNetwork !== activeNetwork.id) return setNotice('The selected network changed. Start wallet setup again.', 'error');
  const mnemonic = pendingPasswordMnemonic;
  closeDialog(elements.passwordDialog);
  elements.newWalletPassword.value = '';
  elements.confirmWalletPassword.value = '';
  await openWalletWithMnemonic(mnemonic, {passwordToSave: password});
});

elements.cancelPasswordSetup.addEventListener('click', () => {
  pendingPasswordMnemonic = '';
  pendingPasswordNetwork = '';
  elements.newWalletPassword.value = '';
  elements.confirmWalletPassword.value = '';
  closeDialog(elements.passwordDialog);
  setNotice('Password setup canceled. No unlock profile was saved.');
});

elements.passwordDialog.addEventListener('cancel', event => {
  event.preventDefault();
  elements.cancelPasswordSetup.click();
});

elements.unlockForm.addEventListener('submit', async event => {
  event.preventDefault();
  const profile = readWalletProfile();
  if (!profile) return updateEntryState();
  setOperationState(true, 'Decrypting your local wallet profile...');
  try {
    const mnemonic = await decryptWalletSecret(profile, elements.unlockPassword.value, {network: activeNetwork.id});
    elements.unlockPassword.value = '';
    await openWalletWithMnemonic(mnemonic);
  } catch (error) {
    elements.unlockPassword.value = '';
    setNotice(`Wallet could not unlock: ${errorMessage(error)}`, 'error');
  } finally {
    setOperationState(false);
  }
});

document.querySelectorAll('[data-wallet-view]').forEach(button => button.addEventListener('click', () => {
  const view = button.dataset.walletView;
  elements.receiveView.hidden = view !== 'receive';
  elements.sendView.hidden = view !== 'send';
  elements.activityView.hidden = view !== 'activity';
  document.querySelectorAll('[data-wallet-view]').forEach(candidate => candidate.classList.toggle('active', candidate === button));
}));

document.querySelectorAll('[data-receive-mode]').forEach(button => button.addEventListener('click', () => {
  const mode = button.dataset.receiveMode;
  elements.arkReceivePanel.hidden = mode !== 'ark';
  elements.lightningReceivePanel.hidden = mode !== 'lightning';
  document.querySelectorAll('[data-receive-mode]').forEach(candidate => {
    const selected = candidate === button;
    candidate.classList.toggle('active', selected);
    candidate.setAttribute('aria-selected', String(selected));
  });
}));

elements.newArkAddress.addEventListener('click', async () => {
  if (!wallet || operationRunning) return;
  setOperationState(true, 'Generating a fresh Ark receive address...');
  try {
    currentArkAddress = await wallet.newAddress();
    showReceivePayment({
      title: 'Ark receive address',
      method: 'Ark payment',
      value: currentArkAddress,
      details: {Network: activeNetwork.label, Amount: 'Any amount'},
    });
    setNotice('Fresh Ark address ready.', 'success');
  } catch (error) {
    setNotice(`Could not generate an Ark address: ${errorMessage(error)}`, 'error');
  } finally {
    setOperationState(false);
  }
});

elements.copyReceivePayment.addEventListener('click', () => copyText(elements.receivePaymentValue.textContent, 'Payment request'));

elements.lightningReceivePanel.addEventListener('submit', async event => {
  event.preventDefault();
  if (!wallet || operationRunning) return;
  const amount = Number(elements.invoiceAmount.value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    setNotice('Enter a whole-satoshi invoice amount.', 'error');
    return;
  }
  setOperationState(true, 'Requesting a Lightning invoice from the Ark server...');
  try {
    const [invoice, estimate] = await Promise.all([
      wallet.bolt11Invoice({amountSats: amount, description: elements.invoiceDescription.value.trim() || undefined}),
      wallet.estimateLightningReceiveFee(amount),
    ]);
    currentInvoice = invoice.invoice;
    showReceivePayment({
      title: 'Lightning invoice',
      method: 'Lightning invoice',
      value: currentInvoice,
      details: {Amount: formatSats(amount), 'Estimated fee': formatSats(estimate.feeSats), Status: 'Keep this wallet open until it settles'},
    });
    setNotice('Lightning invoice ready. Keep this wallet open until it settles.', 'success');
  } catch (error) {
    setNotice(`Could not create a Lightning invoice: ${errorMessage(error)}`, 'error');
  } finally {
    setOperationState(false);
  }
});

elements.sendDestination.addEventListener('input', updateDestinationHint);

elements.sendForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!wallet || operationRunning) return;
  const destination = elements.sendDestination.value.trim().replace(/^lightning:/i, '');
  let type;
  try { type = classifyPaymentDestination(destination, validateArkAddress); } catch { type = null; }
  const encodedAmount = type === 'lightning-invoice' ? parseBolt11AmountSats(destination) : null;
  const amount = encodedAmount || Number(elements.sendAmount.value);
  if (!type) {
    setNotice(`Enter a valid ${activeNetwork.shortLabel} Ark address, Lightning invoice, Lightning Address, or Bitcoin address.`, 'error');
    return;
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    setNotice('The payment amount must be a positive whole number of satoshis.', 'error');
    return;
  }
  setOperationState(true, 'Checking the destination and estimating the fee...');
  try {
    await wallet.sync();
    if (type === 'ark' && !(await wallet.validateArkoorAddress(destination))) {
      throw new Error('This Ark address is not compatible with the connected Ark server.');
    }
    const [estimate, balance] = await Promise.all([estimatePayment(destination, type, amount), wallet.balance()]);
    const fee = Number(estimate.feeSats) || 0;
    if ((Number(balance.spendableSats) || 0) < amount + fee) throw new Error('The spendable balance is lower than the amount plus estimated fee.');
    pendingPayment = {destination, type, amount, fee};
    renderPaymentSummary(pendingPayment);
    showDialog(elements.confirmPaymentDialog);
    setNotice('Review the irreversible payment before confirming.');
  } catch (error) {
    setNotice(`Payment review failed: ${errorMessage(error)}`, 'error');
  } finally {
    setOperationState(false);
  }
});

elements.confirmPayment.addEventListener('click', async () => {
  if (!wallet || !pendingPayment || operationRunning) return;
  const payment = pendingPayment;
  pendingPayment = undefined;
  closeDialog(elements.confirmPaymentDialog);
  setOperationState(true, activeNetwork.id === 'mainnet' ? 'Sending real bitcoin...' : 'Sending Signet test bitcoin...');
  try {
    const result = await executePayment(payment);
    elements.sendForm.reset();
    updateDestinationHint();
    const txid = typeof result === 'string' ? ` Transaction: ${result}` : '';
    setNotice(`Payment submitted.${txid}`, 'success');
  } catch (error) {
    setNotice(`Payment failed: ${errorMessage(error)}`, 'error');
  } finally {
    setOperationState(false);
  }
  await refreshWallet({announce: false});
});

elements.syncWallet.addEventListener('click', () => refreshWallet({announce: true}));
elements.lockWallet.addEventListener('click', () => disposeWallet());
elements.enableWalletNotifications.addEventListener('click', async () => {
  if (readPushState()) {
    await disableBackgroundNotifications();
    return;
  }
  if (!wallet) {
    setNotice('Unlock the wallet before enabling background alerts.');
    return;
  }
  elements.notificationConsentCheck.checked = false;
  elements.confirmNotificationConsent.disabled = true;
  showDialog(elements.notificationConsentDialog);
});
elements.notificationConsentCheck.addEventListener('change', () => {
  elements.confirmNotificationConsent.disabled = !elements.notificationConsentCheck.checked;
});
elements.cancelNotificationConsent.addEventListener('click', () => closeDialog(elements.notificationConsentDialog));
elements.cancelNotificationConsentFooter.addEventListener('click', () => closeDialog(elements.notificationConsentDialog));
elements.notificationConsentForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!elements.notificationConsentCheck.checked) return;
  elements.confirmNotificationConsent.disabled = true;
  elements.confirmNotificationConsent.textContent = 'Enabling...';
  try {
    await enableBackgroundNotifications();
    closeDialog(elements.notificationConsentDialog);
  } catch (error) {
    setNotice(errorMessage(error, 'Could not enable background alerts.'), 'error');
  } finally {
    elements.confirmNotificationConsent.textContent = 'Enable alerts';
    elements.confirmNotificationConsent.disabled = !elements.notificationConsentCheck.checked;
  }
});
elements.closeWalletError.addEventListener('click', () => {
  clearTimeout(errorTimer);
  closeDialog(elements.walletErrorDialog);
});
elements.retryWalletConnection.addEventListener('click', async () => {
  clearTimeout(errorTimer);
  elements.retryWalletConnection.disabled = true;
  elements.retryWalletConnection.textContent = 'Checking...';
  try {
    await checkChainSource(activeNetwork);
    closeDialog(elements.walletErrorDialog);
    updateEntryState();
    setNotice(`${activeNetwork.shortLabel} chain-data connection restored. Unlock the wallet to continue.`, 'success');
    if (!elements.unlockForm.hidden) elements.unlockPassword.focus();
    else {
      elements.restoreForm.hidden = false;
      elements.restoreWordsGrid.querySelector('input')?.focus();
    }
  } catch (error) {
    setNotice(errorMessage(error), 'error');
  } finally {
    elements.retryWalletConnection.disabled = false;
    elements.retryWalletConnection.textContent = 'Try again';
  }
});

window.addEventListener('pagehide', () => {
  stopWalletNotifications();
  try { wallet?.stopDaemon(); } catch { /* Page is unloading. */ }
  try { wallet?.free(); } catch { /* Page is unloading. */ }
  try { onchain?.free(); } catch { /* Page is unloading. */ }
  wallet = undefined;
  onchain = undefined;
  pendingMnemonic = '';
});

const supported = window.isSecureContext && Boolean(globalThis.crypto?.subtle) && Boolean(globalThis.indexedDB);
elements.secureContextError.hidden = supported;
if (!supported) setNotice('Wallet engine unavailable in this browser context.', 'error');

const requestedNetworkId = new URLSearchParams(location.search).get('network');
const initialNetworkId = NETWORKS[requestedNetworkId] ? requestedNetworkId : storedNetworkId();
activeNetwork = NETWORKS[initialNetworkId] || NETWORKS.signet;
renderRestoreInputs();
applyNetworkUi();
updateEntryState();
updateNotificationPermissionUi();
void probePushService();
if (!acceptedTerms) showDialog(elements.barkHelpDialog);
else if (!initialNetworkId) openNetworkSelection();
else await showNetworkEntryNotice();

window.addEventListener('load', () => globalThis.lucide?.createIcons?.());
