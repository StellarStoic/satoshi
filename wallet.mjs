import init, {
  OnchainWallet,
  Wallet,
  extractTxFromPsbt,
  generateMnemonic,
  validateArkAddress,
  validateMnemonic,
} from './vendor/bark/bark_ffi_wasm.js';
import {
  balanceTotal,
  bitcoinAddressMatchesNetwork,
  classifyPaymentDestination,
  describeBackgroundNotificationError,
  formatErrorReport,
  formatSats,
  notificationMovement,
  notificationLifetimeLabel,
  notificationRenewalDue,
  normalizeMnemonic,
  parseBolt11AmountSats,
  recommendedOnchainFeeRate,
  requiredSatsForEstimate,
  receivedMovementAmount,
  selectAuthorizationSeconds,
  spentVtxoIdsFromError,
} from './walletModel.mjs';
import {englishWordlist} from './vendor/bip39.mjs';
import {
  AUTO_LOCK_KEY,
  LEGACY_WALLET_PROFILE_KEY,
  PRIVACY_MODE_KEY,
  decryptWalletSecret,
  encryptWalletSecret,
  readAutoLockMinutes,
  readPrivacyMode,
  readRefreshThresholdBlocks,
  refreshThresholdKey,
  validateWalletPassword,
  walletDatabaseBelongsToNetwork,
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
  'walletFeeSlow', 'walletFeeRegular', 'walletFeeFast', 'walletArkFeePolicy', 'walletArkFeeQuote', 'walletFeesUpdated',
  'lockWallet', 'receiveView', 'sendView', 'activityView', 'activityDialog', 'openWalletActivity', 'arkReceivePanel', 'lightningReceivePanel', 'newArkAddress',
  'openWalletSettings', 'onchainBalance', 'onchainPending', 'moveView', 'onchainReceivePanel', 'newOnchainAddress',
  'invoiceAmount', 'invoiceDescription', 'sendForm', 'onchainSendForm', 'onchainSendDestination', 'onchainSendAmount',
  'onchainFeeRate', 'onchainFeeHint', 'useSuggestedOnchainFee', 'arkSendMaxOption', 'arkSendMax',
  'boardForm', 'boardAmount', 'offboardForm', 'offboardAmount', 'offboardAll',
  'sendDestination', 'sendAmount', 'destinationHint', 'walletHistory', 'confirmPaymentDialog',
  'onchainHistory', 'walletSettingsDialog', 'walletSettingActions', 'openMoveBalances', 'walletAutoLockSetting', 'walletRefreshThreshold', 'walletPrivacyMode', 'openRevealSeed', 'revealSeedDialog',
  'walletDangerZone', 'openDeleteWallet', 'deleteWalletDialog', 'deleteWalletStep', 'deleteWalletTitle',
  'deleteWalletPrompt', 'cancelDeleteWallet', 'confirmDeleteWallet',
  'openEmergencyExit', 'emergencyExitDialog', 'emergencyExitStatus', 'emergencyExitFees',
  'emergencyExitAgreement', 'emergencyExitAgreementLabel', 'closeEmergencyExit', 'cancelEmergencyExit',
  'progressEmergencyExit', 'claimEmergencyExit', 'confirmEmergencyExit',
  'revealSeedForm', 'revealSeedPassword', 'revealedMnemonicWords', 'cancelRevealSeed', 'closeRevealedSeed', 'confirmRevealSeed',
  'paymentSummary', 'confirmPayment',
  'paymentResultDialog', 'paymentResultTitle', 'paymentResultDetails', 'copyPaymentResult', 'openPaymentResultExplorer',
  'arkRoundInterval', 'arkVtxoLifetime', 'arkExitDelay',
  'walletTermsAgreement', 'acceptWalletTerms', 'termsAccepted', 'termsAgreementLabel',
  'passwordDialog', 'passwordForm', 'passwordTitle', 'newWalletPassword', 'confirmWalletPassword', 'cancelPasswordSetup',
  'receivePaymentDialog', 'receivePaymentTitle', 'receivePaymentMethod', 'receivePaymentQr',
  'receivePaymentDetails', 'receivePaymentValue', 'copyReceivePayment',
  'walletErrorDialog', 'walletErrorMessage', 'closeWalletError', 'retryWalletConnection',
  'walletErrorDetailWrapper', 'walletErrorDetail', 'copyWalletError', 'walletErrorCopyState',
  'openNetworkDialog', 'currentNetworkLabel', 'networkWarning', 'signetFaucet',
  'networkDialog', 'networkForm', 'closeNetworkDialog', 'signetProfileStatus', 'mainnetProfileStatus',
  'arkNetworkName', 'arkServerName', 'confirmPaymentTitle', 'walletLiveChannel', 'walletLiveStatus',
  'enableWalletNotifications', 'paymentAlertDialog', 'paymentAlertTitle', 'paymentAlertBody', 'paymentAlertMeta',
  'paymentAlertExpiry', 'closePaymentAlert', 'dismissPaymentAlert',
  'notificationConsentDialog', 'notificationConsentForm', 'notificationConsentCheck', 'confirmNotificationConsent',
  'cancelNotificationConsent', 'cancelNotificationConsentFooter',
  'nextRoundCountdown', 'qrScannerDialog', 'qrScannerVideo', 'qrScannerStatus', 'closeQrScanner',
].map(id => [id, document.getElementById(id)]));

let sdkPromise;
let wallet;
let onchain;
let pendingMnemonic = '';
let pendingPayment;
let currentArkAddress = '';
let currentInvoice = '';
let currentArkInfo;
let paymentResultCopyValue = '';
let operationRunning = false;
let pendingPasswordMnemonic = '';
let errorTimer;
let noticeTimer;
let lastRawError = '';
let lastErrorDetail = '';
let inactivityTimer;
let deleteWalletConfirmationStep = 0;
let acceptedTerms;
let activeNetwork = NETWORKS.signet;
let pendingPasswordNetwork = '';
let pendingPasswordShouldScan = false;
let notificationHolder;
let notificationGeneration = 0;
let notificationRestartTimer;
let notificationRefreshTimer;
let roundCountdownTimer;
let roundCountdownTarget = 0;
let roundCountdownRetryAt = 0;
let qrScannerStream;
let qrScannerTimer;
let qrScannerTarget = 'ark';
let jsQrPromise;
const qrScannerCanvas = document.createElement('canvas');
let pushServiceAvailable = false;
const seenIncomingMovements = new Set();
const PUSH_API = 'https://notify.satoshi.si/wallet-notifications/v1';
const PUSH_STATE_PREFIX = 'satoshiBarkPushV1:';
const MAX_ACTIVITY_ITEMS = 50;

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

function showTimedError(message, detail = '') {
  clearTimeout(errorTimer);
  lastErrorDetail = String(detail || lastRawError || '').trim();
  lastRawError = '';
  elements.walletErrorMessage.textContent = message;
  elements.retryWalletConnection.hidden = !message.includes('chain-data service');
  elements.walletErrorDetailWrapper.hidden = !lastErrorDetail;
  elements.walletErrorDetail.textContent = lastErrorDetail;
  elements.walletErrorCopyState.hidden = true;
  // The dialog no longer closes itself: it carries a report to copy now, and a
  // dialog that disappears mid-read cannot be copied from.
  showDialog(elements.walletErrorDialog);
}

function setNotice(message, tone = 'neutral', detail = '') {
  clearTimeout(noticeTimer);
  elements.walletNotice.textContent = message;
  elements.walletNotice.dataset.tone = tone;
  elements.walletNotice.hidden = false;
  noticeTimer = setTimeout(() => {
    elements.walletNotice.hidden = true;
    elements.walletNotice.textContent = '';
  }, 6000);
  if (tone === 'error') showTimedError(message, detail);
}

function errorMessage(error, fallback = 'The wallet operation failed.') {
  // Keep what the browser actually said. The sentence on screen is written for a
  // person; a report needs the untranslated error, its stack, and any detail the
  // throwing site attached (a push failure carries the raw service error).
  lastRawError = error instanceof Error
    ? [error.detail ? `detail: ${error.detail}` : '', `${error.name || 'Error'}: ${error.stack || error.message}`]
        .filter(Boolean).join('\n')
    : String(error ?? '');
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
  document.querySelectorAll('.wallet-primary, .wallet-secondary, .wallet-danger, .wallet-delete, .wallet-actions button')
    .forEach(button => {
      button.disabled = running || ((button === elements.createWallet || button === elements.showRestore) && !acceptedTerms);
    });
  if (message) setNotice(message);
}

async function ensureSdk() {
  if (!window.isSecureContext || !globalThis.crypto?.subtle || !globalThis.indexedDB) {
    throw new Error('This Ark wallet requires HTTPS or localhost with WebAssembly, Web Crypto, and IndexedDB enabled.');
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
  return Object.freeze({
    serverAddress: network.serverAddress,
    esploraAddress: network.esploraAddress,
    userAgent: 'satoshi-si/1.0.0',
    vtxoRefreshExpiryThreshold: readRefreshThresholdBlocks(network.id),
  });
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

function showWalletView(view = 'home', {focus = true} = {}) {
  const views = {receive: elements.receiveView, send: elements.sendView, move: elements.moveView};
  Object.entries(views).forEach(([name, section]) => { section.hidden = name !== view; });
  document.querySelectorAll('[data-wallet-view]').forEach(button => button.classList.toggle('active', button.dataset.walletView === view));
  if (view !== 'home' && focus) views[view]?.scrollIntoView({behavior: 'smooth', block: 'start'});
}

function updateNetworkProfileStatuses() {
  [['signet', elements.signetProfileStatus], ['mainnet', elements.mainnetProfileStatus]].forEach(([networkId, output]) => {
    const saved = Boolean(readWalletProfile(networkId));
    output.textContent = saved ? 'Encrypted wallet saved in this browser' : 'No wallet saved';
    output.classList.toggle('has-wallet', saved);
  });
}

function applyNetworkUi() {
  currentArkInfo = undefined;
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
  elements.walletFeeSlow.textContent = '-- sat/vB';
  elements.walletFeeRegular.textContent = '-- sat/vB';
  elements.walletFeeFast.textContent = '-- sat/vB';
  elements.walletArkFeePolicy.textContent = 'Quoted during review';
  elements.walletArkFeeQuote.textContent = 'Separate server rate and VTXO age apply';
  elements.walletArkFeeQuote.dataset.warning = 'false';
  elements.walletArkFeeQuote.dataset.quoted = 'false';
  elements.walletFeesUpdated.textContent = 'Available after sync';
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

function showNetworkEntryNotice() {
  if (readWalletProfile()) {
    setNotice(`${activeNetwork.shortLabel} wallet found. Enter its password to unlock it.`, 'success');
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

function showPasswordSetup(mnemonic, {scanOnchain = false} = {}) {
  pendingPasswordMnemonic = mnemonic;
  pendingPasswordNetwork = activeNetwork.id;
  pendingPasswordShouldScan = scanOnchain;
  elements.passwordTitle.textContent = `Create a ${activeNetwork.shortLabel} wallet password`;
  pendingMnemonic = '';
  elements.newWalletPassword.value = '';
  elements.confirmWalletPassword.value = '';
  showDialog(elements.passwordDialog);
  elements.newWalletPassword.focus();
}

function showReceivePayment({title, method, value, details, copyLabel = 'Payment request'}) {
  elements.receivePaymentTitle.textContent = title;
  elements.receivePaymentMethod.textContent = method;
  elements.receivePaymentValue.textContent = value;
  elements.copyReceivePayment.dataset.copyLabel = copyLabel;
  elements.copyReceivePayment.setAttribute('aria-label', `Copy ${copyLabel.toLowerCase()}`);
  elements.copyReceivePayment.title = `Copy ${copyLabel.toLowerCase()}`;
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

function shortReference(value) {
  const text = String(value || '');
  return text.length > 24 ? `${text.slice(0, 12)}...${text.slice(-10)}` : text;
}

function transactionExplorerUrl(txid) {
  if (!txid) return '';
  return activeNetwork.id === 'mainnet'
    ? `https://mempool.space/tx/${encodeURIComponent(txid)}`
    : `https://mempool.space/signet/tx/${encodeURIComponent(txid)}`;
}

function movementMetadata(movement) {
  try { return JSON.parse(movement.metadataJson || '{}'); } catch { return {}; }
}

function appendHistoryDetails(item, rows) {
  const available = rows.filter(row => row.value !== undefined && row.value !== null && String(row.value) !== '');
  if (!available.length) return;
  const details = document.createElement('details');
  details.className = 'history-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Details and IDs';
  const list = document.createElement('dl');
  available.forEach(row => {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    const value = String(row.value);
    dt.textContent = row.label;
    const code = document.createElement('code');
    code.textContent = row.shorten === false ? value : shortReference(value);
    code.title = value;
    dd.append(code);
    if (row.copy !== false) {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'history-copy';
      copy.textContent = 'Copy';
      copy.addEventListener('click', () => copyText(value, row.label));
      dd.append(copy);
    }
    if (row.txid) {
      const link = document.createElement('a');
      link.href = transactionExplorerUrl(value);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Explorer';
      dd.append(link);
    }
    list.append(dt, dd);
  });
  details.append(summary, list);
  item.append(details);
}

function renderHistory(movements) {
  elements.walletHistory.replaceChildren();
  if (!Array.isArray(movements) || !movements.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No wallet activity yet.';
    elements.walletHistory.append(empty);
    return;
  }

  movements.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, MAX_ACTIVITY_ITEMS).forEach(movement => {
    const item = document.createElement('article');
    item.className = 'history-item';
    const title = document.createElement('strong');
    title.textContent = movement.subsystemName || movement.subsystemKind || 'Ark activity';
    const amountValue = Number(movement.effectiveBalanceSats || movement.intendedBalanceSats || 0);
    const amount = document.createElement('strong');
    amount.className = `wallet-private-value ${amountValue > 0 ? 'positive' : amountValue < 0 ? 'negative' : ''}`;
    amount.textContent = `${amountValue > 0 ? '+' : ''}${formatSats(amountValue)}`;
    const status = document.createElement('span');
    status.textContent = movement.status || 'Recorded';
    const time = document.createElement('time');
    const date = new Date(movement.completedAt || movement.updatedAt || movement.createdAt);
    time.dateTime = Number.isNaN(date.valueOf()) ? '' : date.toISOString();
    time.textContent = Number.isNaN(date.valueOf()) ? '' : date.toLocaleString();
    item.append(title, amount, status, time);
    const metadata = movementMetadata(movement);
    const chainAnchor = metadata.chain_anchor && typeof metadata.chain_anchor === 'object' ? metadata.chain_anchor : {};
    const txid = metadata.offboard_txid || metadata.funding_txid || chainAnchor.txid;
    appendHistoryDetails(item, [
      {label: 'Movement ID', value: movement.id, shorten: false},
      {label: 'Bitcoin txid', value: txid, txid: true},
      {label: 'Lightning payment hash', value: movement.paymentHash || metadata.payment_hash},
      {label: 'Ark fee', value: Number(movement.offchainFeeSats) ? formatSats(movement.offchainFeeSats) : '', copy: false, shorten: false},
      {label: 'Sent to', value: movement.sentToAddresses?.join('\n')},
      {label: 'Received on', value: movement.receivedOnAddresses?.join('\n')},
      {label: 'Input VTXO IDs', value: movement.inputVtxoIds?.join('\n')},
      {label: 'Output VTXO IDs', value: movement.outputVtxoIds?.join('\n')},
      {label: 'Exited VTXO IDs', value: movement.exitedVtxoIds?.join('\n')},
    ]);
    elements.walletHistory.append(item);
  });
}

function renderOnchainHistory(transactions) {
  elements.onchainHistory.replaceChildren();
  if (!Array.isArray(transactions) || !transactions.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No on-chain activity yet.';
    elements.onchainHistory.append(empty);
    return;
  }

  transactions.slice().sort((a, b) => Number(b.confirmation?.height || 0) - Number(a.confirmation?.height || 0)).slice(0, MAX_ACTIVITY_ITEMS).forEach(transaction => {
    const item = document.createElement('article');
    item.className = 'history-item';
    const title = document.createElement('strong');
    title.textContent = Number(transaction.balanceChangeSats) >= 0 ? 'Received on-chain' : 'Sent on-chain';
    const amountValue = Number(transaction.balanceChangeSats) || 0;
    const amount = document.createElement('strong');
    amount.className = `wallet-private-value ${amountValue > 0 ? 'positive' : amountValue < 0 ? 'negative' : ''}`;
    amount.textContent = `${amountValue > 0 ? '+' : ''}${formatSats(amountValue)}`;
    const status = document.createElement('span');
    status.textContent = transaction.confirmation ? `Confirmed in block ${Number(transaction.confirmation.height).toLocaleString()}` : 'Unconfirmed';
    const reference = document.createElement('code');
    reference.title = transaction.txid || '';
    reference.textContent = shortReference(transaction.txid);
    item.append(title, amount, status, reference);
    appendHistoryDetails(item, [
      {label: 'Bitcoin txid', value: transaction.txid, txid: true},
      {label: 'Mining fee', value: transaction.onchainFeeSats === undefined ? 'Unavailable for this transaction' : formatSats(transaction.onchainFeeSats), copy: false, shorten: false},
      {label: 'Block', value: transaction.confirmation?.height, copy: false, shorten: false},
      {label: 'CPFP fee transaction', value: transaction.isCpfp ? 'Yes' : 'No', copy: false, shorten: false},
    ]);
    elements.onchainHistory.append(item);
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

// A payment that arrives while the wallet is open is announced in the middle of
// the screen and stays until it is dismissed, so a tab in the background cannot
// swallow it the way an eight-second toast did.
function showPaymentAlert(movement, amount) {
  const state = readPushState();
  const content = paymentAlertContent({
    amountSats: amount,
    method: movementMethod(movement),
    networkLabel: activeNetwork.label,
    at: Date.now(),
    pushExpiresAt: Number(state?.expiresAt) || 0,
    pushPeriodSeconds: Number(state?.lifetimeSeconds) || 0,
  });
  elements.paymentAlertTitle.textContent = content.title;
  elements.paymentAlertBody.textContent = 'Payment received while the wallet was open.';
  const metadata = movementMetadata(movement);
  const alertDetails = [
    ...content.details,
    ['Movement ID', String(movement.id ?? 'Unavailable')],
    ...(movement.paymentHash || metadata.payment_hash ? [['Payment hash', shortReference(movement.paymentHash || metadata.payment_hash)]] : []),
    ...(metadata.offboard_txid ? [['Bitcoin txid', shortReference(metadata.offboard_txid)]] : []),
  ];
  elements.paymentAlertMeta.replaceChildren(...alertDetails.map(([label, value]) => {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = label;
    const definition = document.createElement('dd');
    definition.textContent = value;
    row.append(term, definition);
    return row;
  }));
  elements.paymentAlertExpiry.textContent = content.expiry;
  showDialog(elements.paymentAlertDialog);
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

// Brave exposes itself through navigator.brave, which is the only reliable way
// to tell it apart from Chrome for this purpose: it reports a Chrome user agent.
// Cached because the check is async and the answer never changes mid-session.
let braveBrowser = null;
async function detectBraveBrowser() {
  if (braveBrowser !== null) return braveBrowser;
  try {
    braveBrowser = Boolean(navigator.brave && await navigator.brave.isBrave());
  } catch {
    braveBrowser = false;
  }
  return braveBrowser;
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
  const applicationServerKey = vapidKeyBytes(config.vapidPublicKey);
  if (subscription?.options?.applicationServerKey) {
    const existingKey = new Uint8Array(subscription.options.applicationServerKey);
    const keyMatches = existingKey.length === applicationServerKey.length
      && existingKey.every((byte, index) => byte === applicationServerKey[index]);
    if (!keyMatches) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    } catch (error) {
      // The browser refuses to reach its own push service here, before any
      // request reaches our notifier — the access log proves it never arrives.
      // Say why, and what to change, instead of showing "push service error".
      const advice = describeBackgroundNotificationError(error, {isBrave: await detectBraveBrowser()});
      console.warn(`Background alert push registration failed [${advice.reason}] ${advice.detail}`);
      if (advice.hint) elements.enableWalletNotifications.title = advice.hint;
      throw Object.assign(new Error(advice.message), {detail: advice.detail});
    }
  }

  const existing = readPushState();
  // The period is the user's choice: the dialog offers the lifetimes the service
  // advertises, a renewal reuses the period already granted, and the service
  // refuses anything past a year on its own.
  const authorizationSeconds = selectAuthorizationSeconds(config, {
    requested: quiet ? 0 : Number(document.querySelector('input[name="notificationLifetime"]:checked')?.value) || 0,
    stored: Number(existing?.lifetimeSeconds) || 0,
  });
  const requestBody = JSON.stringify({
    network: activeNetwork.id,
    serverAddress: activeNetwork.serverAddress,
    mailboxIdentifier: wallet.mailboxIdentifier(),
    authorization: wallet.mailboxAuthorization(authorizationSeconds),
    subscription: subscription.toJSON(),
  });
  const sendRegistration = (method, url, secret = '') => fetch(url, {
    method,
    mode: 'cors',
    credentials: 'omit',
    headers: {'content-type': 'application/json', ...(secret ? {authorization: `Bearer ${secret}`} : {})},
    body: requestBody,
  });
  let response = existing
    ? await sendRegistration('PUT', `${PUSH_API}/subscriptions/${existing.id}`, existing.secret)
    : await sendRegistration('POST', `${PUSH_API}/subscriptions`);
  if (existing && response.status === 404) {
    response = await sendRegistration('POST', `${PUSH_API}/subscriptions`);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not register background notifications.');
  writePushState({id: result.id, secret: result.secret || existing?.secret, expiresAt: result.expiresAt, lifetimeSeconds: authorizationSeconds});
  updateNotificationPermissionUi();
  if (!quiet) setNotice(`Background payment alerts are active for ${notificationLifetimeLabel(authorizationSeconds)}.`, 'success');
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
  // Called whenever the wallet is opened, so a grant rolls forward from the last
  // time it was used instead of expiring silently while nobody was watching.
  const state = readPushState();
  if (!notificationRenewalDue(state)) return;
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
    showPaymentAlert(movement, amount);
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

function feeRateLabel(satsPerKwu) {
  const rate = Number(satsPerKwu) / 250;
  if (!Number.isFinite(rate) || rate <= 0) return '-- sat/vB';
  return `${rate.toLocaleString(undefined, {maximumFractionDigits: 2})} sat/vB`;
}

function renderCurrentFees(rates) {
  elements.walletFeeSlow.textContent = feeRateLabel(rates?.slowSatPerKwu);
  elements.walletFeeRegular.textContent = feeRateLabel(rates?.regularSatPerKwu);
  elements.walletFeeFast.textContent = feeRateLabel(rates?.fastSatPerKwu);
  const schedule = currentArkInfo?.feeSchedule?.offboard;
  const ppm = Array.isArray(schedule?.ppmExpiryTable) ? schedule.ppmExpiryTable.map(entry => Number(entry.ppm)).filter(Number.isFinite) : [];
  if (schedule) {
    const minimum = ppm.length ? Math.min(...ppm) / 10_000 : 0;
    const maximum = ppm.length ? Math.max(...ppm) / 10_000 : 0;
    const percentage = minimum === maximum ? `${minimum.toLocaleString()}%` : `${minimum.toLocaleString()}-${maximum.toLocaleString()}%`;
    elements.walletArkFeePolicy.textContent = `${percentage} + mining fee`;
    if (elements.walletArkFeeQuote.dataset.quoted !== 'true') {
      elements.walletArkFeeQuote.textContent = `${Number(schedule.fixedAdditionalVb).toLocaleString()} vB overhead; exact quote appears during review`;
    }
  } else {
    elements.walletArkFeePolicy.textContent = 'Quoted during review';
  }
  elements.walletFeesUpdated.textContent = rates
    ? `Updated ${new Date().toLocaleTimeString()}`
    : 'Mining rates temporarily unavailable';
}

function showArkWithdrawalQuote(amount, estimate) {
  const fee = Number(estimate?.feeSats) || 0;
  const gross = Number(estimate?.grossAmountSats) || amount + fee;
  elements.walletArkFeeQuote.textContent = `${formatSats(fee)} fee for ${formatSats(amount)} received; ${formatSats(gross)} total`;
  elements.walletArkFeeQuote.dataset.warning = String(fee >= amount);
  elements.walletArkFeeQuote.dataset.quoted = 'true';
}

function stopRoundCountdown() {
  clearInterval(roundCountdownTimer);
  roundCountdownTimer = undefined;
  roundCountdownTarget = 0;
  roundCountdownRetryAt = 0;
}

function renderRoundCountdown() {
  const seconds = Math.max(0, Math.ceil((roundCountdownTarget - Date.now()) / 1000));
  elements.nextRoundCountdown.textContent = seconds > 0 ? `${seconds}s` : 'Starting...';
}

async function refreshRoundCountdown() {
  if (!wallet) return;
  roundCountdownRetryAt = Date.now() + 5000;
  try {
    const value = Number(await wallet.nextRoundStartTime());
    const timestamp = value > 1e12 ? value : value > 1e9 ? value * 1000 : Date.now() + value * 1000;
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) throw new Error('No future round reported');
    roundCountdownTarget = timestamp;
    renderRoundCountdown();
  } catch {
    const cadence = Number(currentArkInfo?.roundIntervalSecs);
    elements.nextRoundCountdown.textContent = Number.isFinite(cadence) && cadence > 0 ? `Every ${cadence}s` : 'Unavailable';
  }
}

function startRoundCountdown() {
  stopRoundCountdown();
  void refreshRoundCountdown();
  roundCountdownTimer = setInterval(() => {
    if (roundCountdownTarget > Date.now()) renderRoundCountdown();
    else if (Date.now() >= roundCountdownRetryAt) void refreshRoundCountdown();
  }, 1000);
}

async function renderArkServerInfo() {
  try {
    const info = await wallet.arkInfo();
    if (!info) return;
    currentArkInfo = info;
    const roundSeconds = Number(info.roundIntervalSecs);
    elements.arkRoundInterval.textContent = Number.isFinite(roundSeconds) && roundSeconds > 0
      ? `${roundSeconds.toLocaleString()} seconds`
      : 'Not reported';
    elements.arkVtxoLifetime.textContent = formatBlocksAsTime(info.vtxoLifetime || info.vtxoExpiryDelta);
    elements.arkExitDelay.textContent = formatBlocksAsTime(info.vtxoExitDelta);
  } catch {
    currentArkInfo = undefined;
    elements.arkRoundInterval.textContent = 'Could not read server policy';
    elements.arkVtxoLifetime.textContent = 'Could not read server policy';
    elements.arkExitDelay.textContent = 'Could not read server policy';
  }
}

async function refreshWallet({announce = true, seedIncoming = false} = {}) {
  if (!wallet || !onchain || operationRunning) return;
  setOperationState(true, 'Synchronizing Ark wallet...');
  try {
    await wallet.sync();
    await onchain.sync();
    const [balance, history, chainBalance, chainHistory, feeRates] = await Promise.all([
      wallet.balance(), wallet.history(), onchain.balance(), onchain.transactions(), onchain.feeRates().catch(() => null),
    ]);
    const spendable = Number(balance.spendableSats) || 0;
    const total = balanceTotal(balance);
    const confirmedOnchain = Number(chainBalance.confirmedSats) || 0;
    const pendingOnchain = Number(chainBalance.pendingSats) || 0;
    elements.spendableBalance.textContent = formatSats(spendable);
    elements.btcBalance.textContent = `${(spendable / 100_000_000).toFixed(8)} BTC`;
    elements.onchainBalance.textContent = formatSats(confirmedOnchain);
    elements.onchainPending.textContent = pendingOnchain ? `${formatSats(pendingOnchain)} pending` : 'No pending funds';
    elements.lastSync.textContent = `Synced ${new Date().toLocaleTimeString()}`;
    renderHistory(history);
    renderOnchainHistory(chainHistory);
    renderCurrentFees(feeRates);
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
  stopRoundCountdown();
  stopQrScanner();
  stopWalletNotifications();
  if (elements.revealSeedDialog.open) closeDialog(elements.revealSeedDialog);
  clearRevealedSeed();
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
  elements.onchainSendDestination.value = '';
  elements.onchainSendAmount.value = '';
  elements.boardAmount.value = '';
  elements.offboardAmount.value = '';
  elements.spendableBalance.textContent = '0 sats';
  elements.btcBalance.textContent = '0 BTC';
  elements.onchainBalance.textContent = '0 sats';
  elements.onchainPending.textContent = 'No pending funds';
  elements.receivePaymentQr.replaceChildren();
  elements.walletDashboard.hidden = true;
  elements.walletOnboarding.hidden = false;
  updateEntryState();
  if (announce || message) setNotice(message, 'success');
}

async function openWalletWithMnemonic(mnemonic, {passwordToSave = '', scanOnchain = false} = {}) {
  const openingNetwork = activeNetwork;
  const config = networkConfig(openingNetwork);
  setOperationState(true, `Opening the ${openingNetwork.shortLabel} wallet and scanning for recoverable funds...`);
  let localOnchain;
  let localWallet;
  try {
    await ensureSdk();
    const normalized = normalizeMnemonic(mnemonic);
    if (!validateMnemonic(normalized)) throw new Error('The recovery phrase is not a valid BIP39 mnemonic.');
    await checkChainSource(openingNetwork);
    const names = await walletDatabaseNames(normalized, openingNetwork);
    localOnchain = await OnchainWallet.default({network: openingNetwork.sdkName, mnemonic: normalized, config, dbName: names.chain});
    if (scanOnchain) {
      setNotice('Scanning past addresses for restored on-chain bitcoin...');
      await localOnchain.initialScan();
    }
    localWallet = await Wallet.openWithOnchain(openingNetwork.sdkName, normalized, config, localOnchain, {
      runDaemon: true,
      indexedDbName: names.ark,
      createIfNotExists: true,
      createWithoutServer: false,
      skipRecovery: false,
    });
    if (passwordToSave) {
      const profile = await encryptWalletSecret(normalized, passwordToSave, {network: openingNetwork.id});
      localStorage.setItem(walletProfileKey(openingNetwork.id), JSON.stringify(profile));
      updateNetworkProfileStatuses();
    }
    wallet = localWallet;
    onchain = localOnchain;
    pendingMnemonic = '';
    pendingPasswordMnemonic = '';
    pendingPasswordNetwork = '';
    pendingPasswordShouldScan = false;
    clearRestoreInputs();
    elements.walletFingerprint.textContent = `Wallet ${wallet.fingerprint()}`;
    elements.walletOnboarding.hidden = true;
    elements.walletDashboard.hidden = false;
    showWalletView('home', {focus: false});
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
    pendingPasswordShouldScan = false;
    updateEntryState();
    setNotice(`Wallet could not open: ${errorMessage(error)}`, 'error');
    return;
  } finally {
    setOperationState(false);
  }
  await refreshWallet({announce: true, seedIncoming: true});
  startRoundCountdown();
  startWalletNotifications();
  void renewBackgroundNotifications();
}

function renderMnemonicInto(container, mnemonic) {
  const words = mnemonic.split(' ');
  container.replaceChildren(...words.map((word, index) => {
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

function renderMnemonicWords(mnemonic) {
  renderMnemonicInto(elements.mnemonicWords, mnemonic);
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
  return ({
    ark: 'Ark payment',
    'lightning-invoice': 'Lightning invoice',
    'lightning-address': 'Lightning Address',
    'on-chain': 'Bitcoin on-chain payment from Ark',
    'native-onchain': 'Bitcoin on-chain payment',
    board: 'Move on-chain bitcoin to Ark',
    'offboard-self': 'Move Ark bitcoin on-chain',
    'offboard-all': 'Send entire Ark balance on-chain',
  })[type] || 'Unknown destination';
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
  const supportsMaximum = type === 'on-chain';
  elements.arkSendMaxOption.hidden = !supportsMaximum;
  if (!supportsMaximum) elements.arkSendMax.checked = false;
  if (supportsMaximum && !elements.arkSendMax.checked) {
    elements.destinationHint.textContent = 'Ark withdrawal to Bitcoin. The Ark server sets this withdrawal fee rate.';
  }
  if (supportsMaximum && elements.arkSendMax.checked) {
    elements.sendAmount.disabled = true;
    elements.sendAmount.value = '';
    elements.destinationHint.textContent = 'Entire Ark balance; the server-set withdrawal fee is deducted from what arrives.';
  }
}

function renderPaymentSummary(payment) {
  elements.confirmPaymentTitle.textContent = payment.source === 'move'
    ? 'Confirm balance move'
    : activeNetwork.id === 'mainnet' ? 'Confirm real bitcoin payment' : 'Confirm Signet test payment';
  elements.confirmPayment.textContent = payment.source === 'move' ? 'Confirm move' : 'Send bitcoin';
  const list = document.createElement('dl');
  list.className = 'payment-summary-list';
  const rows = [['Method', destinationTypeLabel(payment.type)]];
  if (payment.grossAmount) rows.push(['Ark balance spent', formatSats(payment.grossAmount)]);
  rows.push([payment.type === 'offboard-all' ? 'On-chain balance receives' : 'Amount', formatSats(payment.amount, {fractional: true})]);
  if (payment.feeRate) {
    rows.push(['Fee rate', `${payment.feeRate} sat/vB`]);
  } else if (payment.type === 'board') {
    rows.push(
      ['Ark service fee', payment.fee ? formatSats(payment.fee) : 'None'],
      ['Bitcoin mining fee', 'Calculated by the on-chain wallet when submitted'],
    );
  } else {
    rows.push(['Estimated fee', formatSats(payment.fee)]);
  }
  rows.push(['Destination', payment.destination]);
  rows
    .forEach(([term, value]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = term;
      dd.textContent = value;
      list.append(dt, dd);
    });
  const warning = document.createElement('p');
  warning.className = payment.fee >= payment.amount ? 'payment-fee-warning' : '';
  warning.textContent = payment.fee >= payment.amount
    ? 'The quoted fee is at least as large as the payment. This comes from the current Ark server withdrawal quote. Consider waiting for lower fees.'
    : payment.type === 'board'
      ? 'Boarding has no separate Ark service fee, but it still creates an irreversible Bitcoin transaction and pays its mining fee.'
      : payment.type === 'offboard-self' || payment.type === 'offboard-all'
        ? 'This is a normal cooperative withdrawal, not an emergency exit. The Ark server sets the quoted fee.'
        : 'Bitcoin payments cannot be reversed. Check the destination and amount before sending.';
  elements.paymentSummary.replaceChildren(list, warning);
}

function showPaymentResult(payment, result) {
  const txid = typeof result === 'string' ? result : result?.txid;
  const paymentHash = result?.payment_hash || result?.paymentHash;
  const vtxoId = result?.vtxoId;
  const rows = [
    ['Method', destinationTypeLabel(payment.type)],
    ['Amount', formatSats(payment.amount, {fractional: true})],
    ...(payment.fee ? [['Fee', formatSats(payment.fee)]] : []),
    ...(txid ? [['Bitcoin txid', txid]] : []),
    ...(paymentHash ? [['Lightning payment hash', paymentHash]] : []),
    ...(vtxoId ? [['VTXO ID', vtxoId]] : []),
    ['Destination', payment.destination],
  ];
  elements.paymentResultTitle.textContent = txid ? 'Transaction submitted' : 'Payment submitted';
  elements.paymentResultDetails.replaceChildren();
  rows.forEach(([label, value]) => {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    elements.paymentResultDetails.append(dt, dd);
  });
  paymentResultCopyValue = txid || paymentHash || vtxoId || payment.destination || '';
  elements.copyPaymentResult.hidden = !paymentResultCopyValue;
  elements.openPaymentResultExplorer.hidden = !txid;
  if (txid) elements.openPaymentResultExplorer.href = transactionExplorerUrl(txid);
  showDialog(elements.paymentResultDialog);
}

async function estimatePayment(destination, type, amount) {
  if (type === 'ark') return wallet.estimateArkoorPaymentFee(amount);
  if (type === 'lightning-invoice' || type === 'lightning-address') return wallet.estimateLightningSendFee(Math.ceil(amount));
  return wallet.estimateSendOnchainFee(destination, amount);
}

async function executePayment(payment) {
  if (payment.type === 'native-onchain') return onchain.send(payment.destination, payment.amount, payment.feeRate);
  if (payment.type === 'board') return wallet.boardAmount(payment.amount);
  if (payment.type === 'offboard-self') return wallet.sendOnchain(payment.destination, payment.amount);
  if (payment.type === 'offboard-all') return wallet.offboardAll(payment.destination);
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
elements.openWalletSettings.addEventListener('click', () => {
  elements.walletAutoLockSetting.value = String(readAutoLockMinutes());
  elements.walletRefreshThreshold.value = String(readRefreshThresholdBlocks(activeNetwork.id));
  elements.walletPrivacyMode.checked = readPrivacyMode();
  const hasProfile = Boolean(readWalletProfile());
  elements.walletDangerZone.hidden = !hasProfile;
  elements.openEmergencyExit.disabled = !wallet;
  elements.openEmergencyExit.title = wallet ? '' : 'Unlock this wallet to use an emergency exit.';
  elements.walletSettingActions.hidden = !wallet;
  elements.openDeleteWallet.textContent = `Delete ${activeNetwork.shortLabel} wallet`;
  showDialog(elements.walletSettingsDialog);
});

elements.openMoveBalances.addEventListener('click', () => {
  if (!wallet) return;
  closeDialog(elements.walletSettingsDialog);
  showWalletView('move');
});
elements.walletAutoLockSetting.addEventListener('change', () => {
  try {
    localStorage.setItem(AUTO_LOCK_KEY, elements.walletAutoLockSetting.value);
  } catch {
    setNotice('The lock setting could not be saved in this browser.', 'error');
    return;
  }
  resetInactivityTimer();
  setNotice(elements.walletAutoLockSetting.value === '0' ? 'Automatic wallet locking is off.' : `Wallet will lock after ${elements.walletAutoLockSetting.selectedOptions[0].textContent.toLowerCase()} of inactivity.`, 'success');
});

elements.walletRefreshThreshold.addEventListener('change', () => {
  localStorage.setItem(refreshThresholdKey(activeNetwork.id), elements.walletRefreshThreshold.value);
  setNotice(`VTXOs will refresh below ${elements.walletRefreshThreshold.selectedOptions[0].textContent.toLowerCase()}. This takes effect the next time the wallet opens.`, 'success');
});

function applyPrivacyMode(enabled) {
  document.body.classList.toggle('wallet-privacy', enabled);
  elements.walletPrivacyMode.checked = enabled;
}

elements.walletPrivacyMode.addEventListener('change', () => {
  localStorage.setItem(PRIVACY_MODE_KEY, String(elements.walletPrivacyMode.checked));
  applyPrivacyMode(elements.walletPrivacyMode.checked);
});

function clearRevealedSeed() {
  elements.revealSeedPassword.value = '';
  elements.revealedMnemonicWords.replaceChildren();
  elements.revealedMnemonicWords.hidden = true;
  elements.confirmRevealSeed.hidden = false;
  elements.closeRevealedSeed.textContent = 'Cancel';
}

elements.openRevealSeed.addEventListener('click', () => {
  const profile = readWalletProfile();
  if (!profile) return setNotice('No encrypted wallet profile is saved for this network.', 'error');
  closeDialog(elements.walletSettingsDialog);
  clearRevealedSeed();
  showDialog(elements.revealSeedDialog);
  elements.revealSeedPassword.focus();
});
elements.cancelRevealSeed.addEventListener('click', () => closeDialog(elements.revealSeedDialog));
elements.closeRevealedSeed.addEventListener('click', () => closeDialog(elements.revealSeedDialog));
elements.revealSeedDialog.addEventListener('close', clearRevealedSeed);
elements.revealSeedForm.addEventListener('submit', async event => {
  event.preventDefault();
  const profile = readWalletProfile();
  if (!profile) return setNotice('No encrypted wallet profile is saved for this network.', 'error');
  elements.confirmRevealSeed.disabled = true;
  try {
    const mnemonic = await decryptWalletSecret(profile, elements.revealSeedPassword.value, {network: activeNetwork.id});
    elements.revealSeedPassword.value = '';
    renderMnemonicInto(elements.revealedMnemonicWords, mnemonic);
    elements.revealedMnemonicWords.hidden = false;
    elements.confirmRevealSeed.hidden = true;
    elements.closeRevealedSeed.textContent = 'Hide words';
    setNotice('Recovery words revealed. Hide them as soon as your backup is complete.');
  } catch (error) {
    elements.revealSeedPassword.value = '';
    setNotice(errorMessage(error), 'error');
  } finally {
    elements.confirmRevealSeed.disabled = false;
  }
});

let emergencyExitCanStart = false;

function renderEmergencyExitFees(rows = []) {
  elements.emergencyExitFees.replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const definition = document.createElement('dd');
    term.textContent = label;
    definition.textContent = value;
    row.append(term, definition);
    return row;
  }));
}

async function inspectEmergencyExit({progress = false} = {}) {
  if (!wallet || !onchain) throw new Error('Unlock this wallet before using an emergency exit.');
  elements.emergencyExitStatus.textContent = progress ? 'Progressing exit transactions and checking the Bitcoin chain...' : 'Checking exit state and fees...';
  elements.progressEmergencyExit.disabled = true;
  elements.claimEmergencyExit.disabled = true;
  elements.confirmEmergencyExit.disabled = true;
  emergencyExitCanStart = false;
  if (progress) await wallet.progressExits({});

  const [tracked, claimable, pending] = await Promise.all([
    wallet.getExitVtxos(),
    wallet.listClaimableExits(),
    wallet.hasPendingExits(),
  ]);
  const terminalStates = new Set(['claimed', 'vtxo-already-spent', 'canceled']);
  const liveExits = tracked.filter(exit => !terminalStates.has(exit.state?.type));
  if (liveExits.length) {
    const total = liveExits.reduce((sum, exit) => sum + (Number(exit.amountSats) || 0), 0);
    const claimableTotal = claimable.reduce((sum, exit) => sum + (Number(exit.amountSats) || 0), 0);
    elements.emergencyExitStatus.textContent = claimable.length
      ? `${claimable.length} exit ${claimable.length === 1 ? 'output is' : 'outputs are'} ready to claim on-chain.${pending ? ' Other exits still need more blocks.' : ''}`
      : 'The emergency exit is in progress. Keep this wallet open and check again after new blocks arrive.';
    renderEmergencyExitFees([
      ['Tracked exits', String(liveExits.length)],
      ['Value in exit', formatSats(total)],
      ['Ready to claim', formatSats(claimableTotal)],
    ]);
    elements.emergencyExitAgreementLabel.hidden = true;
    elements.confirmEmergencyExit.hidden = true;
    elements.progressEmergencyExit.hidden = false;
    elements.claimEmergencyExit.hidden = !claimable.length;
    elements.progressEmergencyExit.disabled = false;
    elements.claimEmergencyExit.disabled = !claimable.length;
    return;
  }

  const balance = await wallet.balance();
  if ((Number(balance.spendableSats) || 0) <= 0) {
    elements.emergencyExitStatus.textContent = tracked.some(exit => exit.state?.type === 'claimed')
      ? 'The previous emergency exit has been claimed. There is no spendable Ark balance to exit.'
      : 'There is no spendable Ark balance to exit.';
    renderEmergencyExitFees();
    elements.emergencyExitAgreementLabel.hidden = true;
    elements.confirmEmergencyExit.hidden = true;
    elements.progressEmergencyExit.hidden = true;
    elements.claimEmergencyExit.hidden = true;
    return;
  }

  const estimate = await wallet.estimateEmergencyExitFee([], null, null);
  renderEmergencyExitFees([
    ['Broadcast fees paid now', formatSats(estimate.exitBroadcastFeeSats)],
    ['Final claim fee', formatSats(estimate.claimFeeSats)],
    ['Estimated total', formatSats(estimate.totalFeeSats)],
    ['Transactions to broadcast', String(estimate.txsToBroadcast)],
  ]);
  elements.emergencyExitStatus.textContent = estimate.fundable
    ? 'The confirmed on-chain balance can fund the estimated exit transactions.'
    : `The confirmed on-chain balance cannot cover the estimated ${formatSats(estimate.exitBroadcastFeeSats)} broadcast cost. Receive on-chain bitcoin before starting.`;
  emergencyExitCanStart = Boolean(estimate.fundable);
  elements.emergencyExitAgreementLabel.hidden = false;
  elements.emergencyExitAgreement.checked = false;
  elements.confirmEmergencyExit.hidden = false;
  elements.progressEmergencyExit.hidden = true;
  elements.claimEmergencyExit.hidden = true;
  elements.confirmEmergencyExit.disabled = true;
}

async function openEmergencyExitDialog() {
  if (!wallet) return setNotice('Unlock this wallet before using an emergency exit.', 'error');
  closeDialog(elements.walletSettingsDialog);
  showDialog(elements.emergencyExitDialog);
  try {
    await inspectEmergencyExit();
  } catch (error) {
    elements.emergencyExitStatus.textContent = `Emergency exit check failed: ${errorMessage(error)}`;
    renderEmergencyExitFees();
  }
}

elements.openEmergencyExit.addEventListener('click', openEmergencyExitDialog);
elements.closeEmergencyExit.addEventListener('click', () => closeDialog(elements.emergencyExitDialog));
elements.cancelEmergencyExit.addEventListener('click', () => closeDialog(elements.emergencyExitDialog));
elements.emergencyExitAgreement.addEventListener('change', () => {
  elements.confirmEmergencyExit.disabled = !(emergencyExitCanStart && elements.emergencyExitAgreement.checked);
});
elements.confirmEmergencyExit.addEventListener('click', async () => {
  if (!wallet || !emergencyExitCanStart || !elements.emergencyExitAgreement.checked) return;
  elements.confirmEmergencyExit.disabled = true;
  try {
    elements.emergencyExitStatus.textContent = 'Starting the emergency exit and broadcasting the first stage...';
    await wallet.startExitForEntireWallet();
    await inspectEmergencyExit({progress: true});
    setNotice('Emergency exit started. Keep the wallet open and check its progress after new blocks.', 'success');
    await refreshWallet({announce: false});
  } catch (error) {
    elements.emergencyExitStatus.textContent = `Emergency exit could not start: ${errorMessage(error)}`;
    elements.confirmEmergencyExit.disabled = false;
  }
});
elements.progressEmergencyExit.addEventListener('click', async () => {
  try {
    await inspectEmergencyExit({progress: true});
    await refreshWallet({announce: false});
  } catch (error) {
    elements.emergencyExitStatus.textContent = `Exit progress failed: ${errorMessage(error)}`;
    elements.progressEmergencyExit.disabled = false;
  }
});
elements.claimEmergencyExit.addEventListener('click', async () => {
  if (!wallet || !onchain) return;
  elements.claimEmergencyExit.disabled = true;
  try {
    elements.emergencyExitStatus.textContent = 'Building and broadcasting the final claim transaction...';
    const address = await onchain.newAddress();
    const claim = await wallet.drainExits({vtxoIds: [], drainAll: true, address});
    const txid = await wallet.broadcastTx(extractTxFromPsbt(claim.psbtBase64));
    await wallet.syncExits();
    await onchain.sync();
    setNotice(`Emergency exit claimed to this wallet's on-chain balance. Transaction: ${txid}`, 'success');
    await inspectEmergencyExit();
    await refreshWallet({announce: false});
  } catch (error) {
    elements.emergencyExitStatus.textContent = `Exit claim failed: ${errorMessage(error)}`;
    elements.claimEmergencyExit.disabled = false;
  }
});

const deleteWalletPrompts = networkLabel => [
  {
    title: `Delete the ${networkLabel} wallet?`,
    message: 'This removes its saved profile and local wallet data from this browser. Wallets do not grow back when watered.',
    action: 'Yes, continue',
  },
  {
    title: 'Still absolutely sure?',
    message: 'The undo button has packed its bags. You will need the recovery words to recover anything recoverable later.',
    action: 'I am still sure',
  },
  {
    title: 'Last chance',
    message: 'After this click, even Ctrl+Z will shrug. Deleting this browser wallet cannot be undone.',
    action: `Delete ${networkLabel} wallet`,
  },
];

function renderDeleteWalletPrompt() {
  const prompt = deleteWalletPrompts(activeNetwork.shortLabel)[deleteWalletConfirmationStep];
  elements.deleteWalletStep.textContent = `${deleteWalletConfirmationStep + 1} of 3`;
  elements.deleteWalletTitle.textContent = prompt.title;
  elements.deleteWalletPrompt.textContent = prompt.message;
  elements.confirmDeleteWallet.textContent = prompt.action;
}

function deleteIndexedDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error(`Could not delete ${name}.`));
    request.onblocked = () => reject(new Error(`Close other Satoshi.si tabs before deleting ${name}.`));
  });
}

async function removeWalletDatabases(networkId) {
  if (typeof indexedDB.databases !== 'function') return false;
  const databases = await indexedDB.databases();
  const names = databases
    .map(database => database.name)
    .filter(name => walletDatabaseBelongsToNetwork(name, networkId));
  await Promise.all(names.map(deleteIndexedDatabase));
  return true;
}

function removeWalletPushRegistration(networkId) {
  const state = readPushState(networkId);
  writePushState(null, networkId);
  if (!state) return;
  void fetch(`${PUSH_API}/subscriptions/${state.id}`, {
    method: 'DELETE', mode: 'cors', credentials: 'omit', headers: {authorization: `Bearer ${state.secret}`},
  }).catch(() => {});
}

async function deleteCurrentWallet() {
  const network = activeNetwork;
  elements.confirmDeleteWallet.disabled = true;
  elements.cancelDeleteWallet.disabled = true;
  let databaseWarning = '';
  try {
    if (wallet || onchain) await disposeWallet({announce: false, message: ''});
    try {
      const removed = await removeWalletDatabases(network.id);
      if (!removed) databaseWarning = ' This browser could not remove the older wallet database.';
    } catch (error) {
      databaseWarning = ` Older wallet data could not be removed: ${errorMessage(error)}`;
    }
    removeWalletPushRegistration(network.id);
    localStorage.removeItem(walletProfileKey(network.id));
    if (network.id === 'mainnet') localStorage.removeItem(LEGACY_WALLET_PROFILE_KEY);
    pendingMnemonic = '';
    pendingPasswordMnemonic = '';
    pendingPasswordNetwork = '';
    pendingPasswordShouldScan = false;
    closeDialog(elements.deleteWalletDialog);
    closeDialog(elements.walletSettingsDialog);
    updateNetworkProfileStatuses();
    updateEntryState();
    setNotice(`${network.shortLabel} wallet deleted from this browser. You can create or restore another wallet.${databaseWarning}`, databaseWarning ? 'neutral' : 'success');
  } catch (error) {
    setNotice(`Wallet deletion stopped: ${errorMessage(error)}`, 'error');
  } finally {
    elements.confirmDeleteWallet.disabled = false;
    elements.cancelDeleteWallet.disabled = false;
  }
}

elements.openDeleteWallet.addEventListener('click', () => {
  if (!readWalletProfile()) return setNotice(`No ${activeNetwork.shortLabel} wallet is saved in this browser.`);
  deleteWalletConfirmationStep = 0;
  renderDeleteWalletPrompt();
  closeDialog(elements.walletSettingsDialog);
  showDialog(elements.deleteWalletDialog);
});
elements.cancelDeleteWallet.addEventListener('click', () => {
  closeDialog(elements.deleteWalletDialog);
  deleteWalletConfirmationStep = 0;
});
elements.deleteWalletDialog.addEventListener('cancel', () => { deleteWalletConfirmationStep = 0; });
elements.confirmDeleteWallet.addEventListener('click', async () => {
  if (deleteWalletConfirmationStep < 2) {
    deleteWalletConfirmationStep += 1;
    renderDeleteWalletPrompt();
    return;
  }
  await deleteCurrentWallet();
});
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
  showPasswordSetup(mnemonic, {scanOnchain: true});
});

elements.passwordForm.addEventListener('submit', async event => {
  event.preventDefault();
  const password = elements.newWalletPassword.value;
  const problem = validateWalletPassword(password);
  if (problem) return setNotice(problem, 'error');
  if (password !== elements.confirmWalletPassword.value) return setNotice('The two wallet passwords do not match.', 'error');
  if (pendingPasswordNetwork !== activeNetwork.id) return setNotice('The selected network changed. Start wallet setup again.', 'error');
  const mnemonic = pendingPasswordMnemonic;
  const scanOnchain = pendingPasswordShouldScan;
  closeDialog(elements.passwordDialog);
  elements.newWalletPassword.value = '';
  elements.confirmWalletPassword.value = '';
  await openWalletWithMnemonic(mnemonic, {passwordToSave: password, scanOnchain});
});

elements.cancelPasswordSetup.addEventListener('click', () => {
  pendingPasswordMnemonic = '';
  pendingPasswordNetwork = '';
  pendingPasswordShouldScan = false;
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

function parsedQrPayment(value) {
  let destination = String(value || '').trim();
  let amountSats;
  if (/^bitcoin:/i.test(destination)) {
    const request = destination.slice(destination.indexOf(':') + 1);
    const [address, query = ''] = request.split('?');
    destination = decodeURIComponent(address);
    const btcAmount = Number(new URLSearchParams(query).get('amount'));
    if (Number.isFinite(btcAmount) && btcAmount > 0) amountSats = Math.round(btcAmount * 100_000_000);
  } else {
    destination = destination.replace(/^(lightning|ark):/i, '');
  }
  return {destination, amountSats};
}

function stopQrScanner() {
  clearTimeout(qrScannerTimer);
  qrScannerTimer = undefined;
  qrScannerStream?.getTracks().forEach(track => track.stop());
  qrScannerStream = undefined;
  elements.qrScannerVideo.srcObject = null;
}

function acceptScannedPayment(rawValue) {
  const {destination, amountSats} = parsedQrPayment(rawValue);
  if (!destination) return;
  if (qrScannerTarget === 'onchain') {
    elements.onchainSendDestination.value = destination;
    if (amountSats) elements.onchainSendAmount.value = String(amountSats);
  } else {
    elements.sendDestination.value = destination;
    if (amountSats) elements.sendAmount.value = String(amountSats);
    updateDestinationHint();
  }
  stopQrScanner();
  closeDialog(elements.qrScannerDialog);
  setNotice('Payment QR scanned. Check every detail before sending.', 'success');
}

async function scanQrFrame(detector) {
  if (!qrScannerStream || elements.qrScannerVideo.readyState < 2) {
    qrScannerTimer = setTimeout(() => scanQrFrame(detector), 250);
    return;
  }
  try {
    if (detector) {
      const codes = await detector.detect(elements.qrScannerVideo);
      if (codes[0]?.rawValue) return acceptScannedPayment(codes[0].rawValue);
    } else {
      const video = elements.qrScannerVideo;
      const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
      qrScannerCanvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      qrScannerCanvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = qrScannerCanvas.getContext('2d', {willReadFrequently: true});
      context.drawImage(video, 0, 0, qrScannerCanvas.width, qrScannerCanvas.height);
      const pixels = context.getImageData(0, 0, qrScannerCanvas.width, qrScannerCanvas.height);
      const code = globalThis.jsQR(pixels.data, pixels.width, pixels.height, {inversionAttempts: 'attemptBoth'});
      if (code?.data) return acceptScannedPayment(code.data);
    }
  } catch (error) {
    console.warn('QR frame could not be read:', error);
  }
  qrScannerTimer = setTimeout(() => scanQrFrame(detector), detector ? 250 : 350);
}

function loadJsQr() {
  if (typeof globalThis.jsQR === 'function') return Promise.resolve();
  if (!jsQrPromise) jsQrPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/jsqr/jsQR.js';
    script.onload = () => typeof globalThis.jsQR === 'function' ? resolve() : reject(new Error('QR reader did not initialize'));
    script.onerror = () => reject(new Error('QR reader could not load'));
    document.head.append(script);
  });
  return jsQrPromise;
}

async function openQrScanner(target) {
  qrScannerTarget = target;
  try {
    let detector;
    if ('BarcodeDetector' in globalThis) {
      const formats = await globalThis.BarcodeDetector.getSupportedFormats?.();
      if (!Array.isArray(formats) || formats.includes('qr_code')) detector = new globalThis.BarcodeDetector({formats: ['qr_code']});
    }
    if (!detector) await loadJsQr();
    qrScannerStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: 'environment'}}, audio: false});
    elements.qrScannerVideo.srcObject = qrScannerStream;
    elements.qrScannerStatus.textContent = 'Center the payment QR inside the frame.';
    showDialog(elements.qrScannerDialog);
    await elements.qrScannerVideo.play();
    void scanQrFrame(detector);
  } catch (error) {
    stopQrScanner();
    setNotice(`Camera could not scan the QR code: ${errorMessage(error)}`, 'error');
  }
}

document.querySelectorAll('[data-wallet-view]').forEach(button => button.addEventListener('click', () => showWalletView(button.dataset.walletView)));
document.querySelectorAll('[data-wallet-home]').forEach(button => button.addEventListener('click', () => showWalletView('home')));
elements.openWalletActivity.addEventListener('click', () => showDialog(elements.activityDialog));
document.querySelectorAll('[data-scan-target]').forEach(button => button.addEventListener('click', () => void openQrScanner(button.dataset.scanTarget)));
elements.closeQrScanner.addEventListener('click', () => closeDialog(elements.qrScannerDialog));
elements.qrScannerDialog.addEventListener('close', stopQrScanner);

document.querySelectorAll('[data-receive-mode]').forEach(button => button.addEventListener('click', () => {
  const mode = button.dataset.receiveMode;
  elements.arkReceivePanel.hidden = mode !== 'ark';
  elements.lightningReceivePanel.hidden = mode !== 'lightning';
  elements.onchainReceivePanel.hidden = mode !== 'onchain';
  document.querySelectorAll('[data-receive-mode]').forEach(candidate => {
    const selected = candidate === button;
    candidate.classList.toggle('active', selected);
    candidate.setAttribute('aria-selected', String(selected));
  });
}));

document.querySelectorAll('[data-send-source]').forEach(button => button.addEventListener('click', () => {
  const source = button.dataset.sendSource;
  document.querySelectorAll('[data-send-panel]').forEach(panel => { panel.hidden = panel.dataset.sendPanel !== source; });
  document.querySelectorAll('[data-send-source]').forEach(candidate => {
    const selected = candidate === button;
    candidate.classList.toggle('active', selected);
    candidate.setAttribute('aria-selected', String(selected));
  });
}));

document.querySelectorAll('[data-history-mode]').forEach(button => button.addEventListener('click', () => {
  const mode = button.dataset.historyMode;
  elements.walletHistory.hidden = mode !== 'ark';
  elements.onchainHistory.hidden = mode !== 'onchain';
  document.querySelectorAll('[data-history-mode]').forEach(candidate => {
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
      title: `${activeNetwork.shortLabel} Ark receive address`,
      method: 'Ark payment',
      value: currentArkAddress,
      details: {Network: activeNetwork.label, Amount: 'Any amount'},
      copyLabel: `${activeNetwork.shortLabel} Ark address`,
    });
    setNotice('Fresh Ark address ready.', 'success');
  } catch (error) {
    setNotice(`Could not generate an Ark address: ${errorMessage(error)}`, 'error');
  } finally {
    setOperationState(false);
  }
});

elements.newOnchainAddress.addEventListener('click', async () => {
  if (!onchain || operationRunning) return;
  setOperationState(true, 'Generating a fresh Bitcoin address...');
  try {
    const address = await onchain.newAddress();
    showReceivePayment({
      title: `${activeNetwork.shortLabel} Bitcoin receive address`,
      method: 'On-chain Bitcoin',
      value: address,
      details: {Network: activeNetwork.label, Amount: 'Any amount'},
      copyLabel: `${activeNetwork.shortLabel} Bitcoin address`,
    });
    setNotice('Fresh on-chain address ready.', 'success');
  } catch (error) {
    setNotice(`Could not generate a Bitcoin address: ${errorMessage(error)}`, 'error');
  } finally {
    setOperationState(false);
  }
});

elements.copyReceivePayment.addEventListener('click', () => copyText(
  elements.receivePaymentValue.textContent,
  elements.copyReceivePayment.dataset.copyLabel || 'Payment request',
));

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
      title: `${activeNetwork.shortLabel} Lightning invoice`,
      method: 'Lightning invoice',
      value: currentInvoice,
      details: {Amount: formatSats(amount), 'Payment hash': invoice.paymentHash, 'Estimated fee': formatSats(estimate.feeSats), Status: 'Keep this wallet open until it settles'},
      copyLabel: `${activeNetwork.shortLabel} Lightning invoice`,
    });
    setNotice('Lightning invoice ready. Keep this wallet open until it settles.', 'success');
  } catch (error) {
    setNotice(`Could not create a Lightning invoice: ${errorMessage(error)}`, 'error');
  } finally {
    setOperationState(false);
  }
});

elements.sendDestination.addEventListener('input', updateDestinationHint);
elements.arkSendMax.addEventListener('change', updateDestinationHint);

elements.sendForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!wallet || operationRunning) return;
  const destination = elements.sendDestination.value.trim().replace(/^lightning:/i, '');
  let type;
  try { type = classifyPaymentDestination(destination, validateArkAddress); } catch { type = null; }
  const sendEntireBalance = type === 'on-chain' && elements.arkSendMax.checked;
  const encodedAmount = type === 'lightning-invoice' ? parseBolt11AmountSats(destination) : null;
  const amount = encodedAmount || Number(elements.sendAmount.value);
  if (!type) {
    setNotice(`Enter a valid ${activeNetwork.shortLabel} Ark address, Lightning invoice, Lightning Address, or Bitcoin address.`, 'error');
    return;
  }
  if (!sendEntireBalance && (!Number.isSafeInteger(amount) || amount <= 0)) {
    setNotice('The payment amount must be a positive whole number of satoshis.', 'error');
    return;
  }
  setOperationState(true, 'Checking the destination and estimating the fee...');
  try {
    await wallet.sync();
    if (type === 'ark' && !(await wallet.validateArkoorAddress(destination))) {
      throw new Error('This Ark address is not compatible with the connected Ark server.');
    }
    if (sendEntireBalance) {
      const [estimate, balance] = await Promise.all([wallet.estimateOffboardAllFee(destination), wallet.balance()]);
      const grossAmount = Number(estimate.grossAmountSats) || Number(balance.spendableSats) || 0;
      const fee = Number(estimate.feeSats) || 0;
      const netAmount = Number(estimate.netAmountSats) || grossAmount - fee;
      showArkWithdrawalQuote(netAmount, estimate);
      if (grossAmount <= 0 || netAmount <= 0) throw new Error('The Ark balance is too small to cover the server-set withdrawal fee.');
      pendingPayment = {source: 'ark', destination, type: 'offboard-all', amount: netAmount, grossAmount, fee};
      renderPaymentSummary(pendingPayment);
      showDialog(elements.confirmPaymentDialog);
      setNotice('Review the full-balance Ark withdrawal before confirming.');
      return;
    }
    const [estimate, balance] = await Promise.all([estimatePayment(destination, type, amount), wallet.balance()]);
    const fee = Number(estimate.feeSats) || 0;
    const spendable = Number(balance.spendableSats) || 0;
    const required = requiredSatsForEstimate(estimate, amount);
    if (type === 'on-chain') showArkWithdrawalQuote(amount, estimate);
    if (spendable < required) {
      throw new Error(`This payment needs ${formatSats(required)}, including the fee, but only ${formatSats(spendable)} is spendable. Reduce the amount or select "Send entire Ark balance" for an on-chain withdrawal.`);
    }
    pendingPayment = {source: 'ark', destination, type, amount, fee};
    renderPaymentSummary(pendingPayment);
    showDialog(elements.confirmPaymentDialog);
    setNotice('Review the irreversible payment before confirming.');
  } catch (error) {
    setNotice(`Payment review failed: ${errorMessage(error)}`, 'error');
  } finally {
    setOperationState(false);
  }
});

async function useSuggestedOnchainFee() {
  if (!onchain || operationRunning) return;
  elements.useSuggestedOnchainFee.disabled = true;
  try {
    const feeRate = recommendedOnchainFeeRate(await onchain.feeRates(), 'regular');
    elements.onchainFeeRate.value = String(feeRate);
    elements.onchainFeeHint.textContent = `Current normal estimate: ${feeRate} sat/vB. You may edit it.`;
  } catch (error) {
    setNotice(`Could not load a fee estimate: ${errorMessage(error)}`, 'error');
  } finally {
    elements.useSuggestedOnchainFee.disabled = false;
  }
}

elements.useSuggestedOnchainFee.addEventListener('click', useSuggestedOnchainFee);
elements.onchainFeeRate.addEventListener('input', () => {
  const feeRate = Number(elements.onchainFeeRate.value);
  elements.onchainFeeHint.textContent = Number.isFinite(feeRate) && feeRate > 0 && feeRate < 1
    ? 'A fee below 1 sat/vB will be attempted, but peers may reject it or confirmation may take a long time.'
    : 'Enter a fee rate or use the current normal estimate.';
});

elements.onchainSendForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!onchain || operationRunning) return;
  const destination = elements.onchainSendDestination.value.trim();
  const amount = Number(elements.onchainSendAmount.value);
  if (!bitcoinAddressMatchesNetwork(destination, activeNetwork.id)) {
    setNotice(`Enter a valid-looking ${activeNetwork.shortLabel} Bitcoin address.`, 'error');
    return;
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    setNotice('The payment amount must be a positive whole number of satoshis.', 'error');
    return;
  }
  setOperationState(true, 'Checking on-chain funds and the current fee rate...');
  try {
    await onchain.sync();
    const balance = await onchain.balance();
    let feeRate = Number(elements.onchainFeeRate.value);
    if (!elements.onchainFeeRate.value) {
      feeRate = recommendedOnchainFeeRate(await onchain.feeRates(), 'regular');
      elements.onchainFeeRate.value = String(feeRate);
    }
    if (!Number.isFinite(feeRate) || feeRate <= 0) throw new Error('Enter a fee rate greater than 0 sat/vB.');
    if ((Number(balance.confirmedSats) || 0) <= amount) throw new Error('Confirmed on-chain funds must cover the amount and its mining fee.');
    elements.onchainFeeHint.textContent = feeRate < 1
      ? `${feeRate} sat/vB will be attempted. Very low fees may be rejected by peers or remain unconfirmed.`
      : `${feeRate} sat/vB will be used for this transaction.`;
    pendingPayment = {source: 'onchain', destination, type: 'native-onchain', amount, feeRate};
    renderPaymentSummary(pendingPayment);
    showDialog(elements.confirmPaymentDialog);
    setNotice('Review the irreversible on-chain payment before confirming.');
  } catch (error) {
    setNotice(`Payment review failed: ${errorMessage(error)}`, 'error');
  } finally {
    setOperationState(false);
  }
});

elements.boardForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!wallet || !onchain || operationRunning) return;
  const amount = Number(elements.boardAmount.value);
  if (!Number.isSafeInteger(amount) || amount <= 0) return setNotice('Enter a positive whole-satoshi amount to move.', 'error');
  setOperationState(true, 'Estimating the move into Ark...');
  try {
    await wallet.sync();
    await onchain.sync();
    const [balance, estimate] = await Promise.all([onchain.balance(), wallet.estimateBoardFee(amount)]);
    const fee = Number(estimate.feeSats) || 0;
    const required = requiredSatsForEstimate(estimate, amount);
    const available = Number(balance.confirmedSats) || 0;
    if (available < required) throw new Error(`This move needs at least ${formatSats(required)}, but only ${formatSats(available)} is confirmed on-chain. A Bitcoin mining fee is also calculated when the boarding transaction is submitted.`);
    pendingPayment = {source: 'move', type: 'board', amount, fee, destination: 'Your Ark balance'};
    renderPaymentSummary(pendingPayment);
    showDialog(elements.confirmPaymentDialog);
  } catch (error) {
    setNotice(`Move review failed: ${errorMessage(error)}`, 'error');
  } finally {
    setOperationState(false);
  }
});

function updateOffboardAllState() {
  const moveAll = elements.offboardAll.checked;
  elements.offboardAmount.disabled = moveAll;
  elements.offboardAmount.required = !moveAll;
  if (moveAll) elements.offboardAmount.value = '';
}

elements.offboardAll.addEventListener('change', updateOffboardAllState);

elements.offboardForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!wallet || !onchain || operationRunning) return;
  const moveAll = elements.offboardAll.checked;
  const amount = Number(elements.offboardAmount.value);
  if (!moveAll && (!Number.isSafeInteger(amount) || amount <= 0)) return setNotice('Enter a positive whole-satoshi amount to receive.', 'error');
  setOperationState(true, 'Estimating the move back on-chain...');
  try {
    await wallet.sync();
    const destination = await onchain.newAddress();
    const [balance, estimate] = await Promise.all([
      wallet.balance(),
      moveAll ? wallet.estimateOffboardAllFee(destination) : wallet.estimateSendOnchainFee(destination, amount),
    ]);
    const fee = Number(estimate.feeSats) || 0;
    const available = Number(balance.spendableSats) || 0;
    const grossAmount = Number(estimate.grossAmountSats) || available;
    const receivedAmount = moveAll ? Number(estimate.netAmountSats) || grossAmount - fee : amount;
    showArkWithdrawalQuote(receivedAmount, estimate);
    if (moveAll) {
      if (grossAmount <= 0 || receivedAmount <= 0) throw new Error(`The ${formatSats(available)} Ark balance is too small to cover the ${formatSats(fee)} withdrawal fee.`);
      pendingPayment = {source: 'move', type: 'offboard-all', amount: receivedAmount, grossAmount, fee, destination};
    } else {
      const required = requiredSatsForEstimate(estimate, amount);
      if (available < required) throw new Error(`To receive ${formatSats(amount)} on-chain, this move needs ${formatSats(required)} from Ark: ${formatSats(amount)} plus a ${formatSats(fee)} fee. Only ${formatSats(available)} is spendable. Choose “Move my entire Ark balance” to deduct the fee instead.`);
      pendingPayment = {source: 'move', type: 'offboard-self', amount, fee, destination};
    }
    renderPaymentSummary(pendingPayment);
    showDialog(elements.confirmPaymentDialog);
  } catch (error) {
    setNotice(`Move review failed: ${errorMessage(error)}`, 'error');
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
    if (payment.source === 'onchain') elements.onchainSendForm.reset();
    else if (payment.source === 'move') {
      elements.boardForm.reset();
      elements.offboardForm.reset();
      updateOffboardAllState();
    } else {
      elements.sendForm.reset();
      updateDestinationHint();
    }
    showPaymentResult(payment, result);
    setNotice('Payment submitted. Its available identifiers are shown in the payment record.', 'success');
  } catch (error) {
    const message = errorMessage(error);
    const spentVtxoIds = spentVtxoIdsFromError(error);
    if (spentVtxoIds.length) {
      try {
        await wallet.recoverVtxos(spentVtxoIds, null);
        await wallet.sync();
        setNotice('This attempt was rejected because an earlier wallet action had already spent part of the Ark balance. The local balance has been repaired. Review the activity and balance before trying again.');
      } catch (recoveryError) {
        const recoveryMessage = errorMessage(recoveryError);
        setNotice(
          'The Ark server says part of this balance was already spent, but the wallet could not repair its local record. Lock and reopen the wallet before trying again.',
          'error',
          `Original payment error:\n${message}\n\nState repair error:\n${recoveryMessage}`,
        );
      }
    } else {
      setNotice(`Payment failed: ${message}`, 'error');
    }
  } finally {
    setOperationState(false);
  }
  await refreshWallet({announce: false});
});

elements.syncWallet.addEventListener('click', () => refreshWallet({announce: true}));
elements.copyPaymentResult.addEventListener('click', () => copyText(paymentResultCopyValue, 'Payment ID'));
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
async function currentAssetVersion() {
  try {
    const names = await caches.keys();
    return names.filter(name => name.startsWith('satoshi-static-')).sort().pop() || 'unknown';
  } catch {
    return 'unknown';
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const scratch = document.createElement('textarea');
      scratch.value = text;
      scratch.setAttribute('readonly', '');
      scratch.style.position = 'fixed';
      scratch.style.opacity = '0';
      // Anything outside an open <dialog> is inert, so a scratch element parked on
      // document.body cannot be selected or copied while the dialog is up. It has
      // to live inside the dialog that triggered the copy.
      (document.querySelector('dialog[open]') || document.body).append(scratch);
      scratch.select();
      const ok = document.execCommand('copy');
      scratch.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

elements.closePaymentAlert.addEventListener('click', () => closeDialog(elements.paymentAlertDialog));
elements.dismissPaymentAlert.addEventListener('click', () => closeDialog(elements.paymentAlertDialog));
elements.copyWalletError.addEventListener('click', async () => {
  const report = formatErrorReport({
    message: elements.walletErrorMessage.textContent,
    detail: lastErrorDetail,
    network: `${activeNetwork.label} (${activeNetwork.id})`,
    page: location.href,
    browser: navigator.userAgent,
    assets: await currentAssetVersion(),
  });
  const copied = await copyToClipboard(report);
  elements.walletErrorCopyState.hidden = false;
  elements.walletErrorCopyState.textContent = copied ? 'Copied to clipboard' : 'Could not copy — select the detail above';
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
  stopRoundCountdown();
  stopQrScanner();
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
setNotice(elements.walletNotice.textContent);
if (!supported) setNotice('Wallet engine unavailable in this browser context.', 'error');

const requestedNetworkId = new URLSearchParams(location.search).get('network');
const initialNetworkId = NETWORKS[requestedNetworkId] ? requestedNetworkId : storedNetworkId();
activeNetwork = NETWORKS[initialNetworkId] || NETWORKS.signet;
applyPrivacyMode(readPrivacyMode());
renderRestoreInputs();
applyNetworkUi();
updateEntryState();
updateNotificationPermissionUi();
void probePushService();
if (!acceptedTerms) showDialog(elements.barkHelpDialog);
else if (!initialNetworkId) openNetworkSelection();
else await showNetworkEntryNotice();

window.addEventListener('load', () => globalThis.lucide?.createIcons?.());
