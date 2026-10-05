export function normalizeMnemonic(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function parseBolt11AmountSats(value) {
  const invoice = String(value || '').trim().toLowerCase().replace(/^lightning:/, '');
  const match = invoice.match(/^ln(?:bc|tb|bcrt)(\d*)([munp]?)1/);
  if (!match || !match[1]) return null;
  const units = {m: 100_000, u: 100, n: 0.1, p: 0.0001, '': 100_000_000};
  const amount = Number(match[1]) * units[match[2]];
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function classifyPaymentDestination(value, isArkAddress = () => false) {
  const destination = String(value || '').trim().replace(/^lightning:/i, '');
  const lower = destination.toLowerCase();
  if (!destination) return null;
  if (isArkAddress(destination)) return 'ark';
  if (/^ln(?:bc|tb|bcrt)/.test(lower)) return 'lightning-invoice';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destination)) return 'lightning-address';
  if (/^(bc1|tb1|bcrt1|[123mn])[a-z0-9]{20,}$/i.test(destination)) return 'on-chain';
  return null;
}

export function formatSats(value, options = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '--';
  return `${amount.toLocaleString(undefined, {maximumFractionDigits: options.fractional ? 3 : 0})} sats`;
}

export function balanceTotal(balance = {}) {
  return ['spendableSats', 'pendingInRoundSats', 'pendingExitSats', 'pendingLightningSendSats', 'claimableLightningReceiveSats', 'pendingBoardSats']
    .reduce((total, key) => total + (Number(balance[key]) || 0), 0);
}

export function recommendedOnchainFeeRate(rates = {}, priority = 'regular') {
  const field = ({slow: 'slowSatPerKwu', fast: 'fastSatPerKwu'})[priority] || 'regularSatPerKwu';
  const satsPerKwu = Number(rates[field]);
  return Number.isFinite(satsPerKwu) && satsPerKwu > 0
    ? Math.max(0.01, Math.ceil((satsPerKwu / 250) * 100) / 100)
    : 1;
}

export function requiredSatsForEstimate(estimate = {}, fallbackAmount = 0) {
  const gross = Number(estimate.grossAmountSats);
  if (Number.isFinite(gross) && gross > 0) return gross;
  return (Number(fallbackAmount) || 0) + (Number(estimate.feeSats) || 0);
}

export function spentVtxoIdsFromError(error) {
  const message = error instanceof Error ? `${error.message}\n${error.cause || ''}` : String(error || '');
  const ids = [...message.matchAll(/vtxo\s+([0-9a-f]{64}:\d+)\s+is not spendable\s+\(state:\s*spent\)/gi)]
    .map(match => match[1].toLowerCase());
  return [...new Set(ids)];
}

export function bitcoinAddressMatchesNetwork(address, network = 'mainnet') {
  const value = String(address || '').trim().toLowerCase();
  if (!/^(?:bc1|tb1|bcrt1|[123mn])[a-z0-9]{20,}$/i.test(value)) return false;
  if (network === 'mainnet') return /^(?:bc1|1|3)/.test(value);
  return /^(?:tb1|bcrt1|m|n|2)/.test(value);
}

export function receivedMovementAmount(movement = {}) {
  const amount = Number(movement.effectiveBalanceSats);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function notificationMovement(notification = {}) {
  const type = String(notification.type || '').toLowerCase();
  if (type !== 'movementcreated' && type !== 'movementupdated') return null;
  return notification.movement && typeof notification.movement === 'object' ? notification.movement : null;
}

const LIFETIME_LABELS = [[86_400, '24 hours'], [7_776_000, '3 months'], [15_552_000, '6 months'], [31_536_000, '1 year']];

// The period is the user's choice, offered against the list the service
// advertises. A value that is not on that list is clamped to the closest offered
// period rather than refused: a page cached from an older build must never leave
// the wallet unable to switch alerts on, and the service enforces its own
// one-year ceiling whatever the page asks for.
export function selectAuthorizationSeconds(config = {}, {requested = 0, stored = 0} = {}) {
  const offered = (Array.isArray(config?.authorizationOptions) ? config.authorizationOptions : [])
    .map(option => Number(option?.seconds))
    .filter(seconds => Number.isSafeInteger(seconds) && seconds > 0)
    .sort((a, b) => a - b);
  const advertised = Number(config?.authorizationSeconds);
  const ceiling = offered.length ? offered[offered.length - 1]
    : (Number.isSafeInteger(advertised) && advertised > 0 ? advertised : 86_400);
  const wanted = Number(requested) > 0 ? Number(requested) : (Number(stored) > 0 ? Number(stored) : ceiling);
  if (!offered.length) return Math.min(wanted, ceiling);
  if (offered.includes(wanted)) return wanted;
  return offered.reduce((best, seconds) => (Math.abs(seconds - wanted) < Math.abs(best - wanted) ? seconds : best), offered[0]);
}

export function notificationLifetimeLabel(seconds) {
  const value = Number(seconds);
  const known = LIFETIME_LABELS.find(([option]) => option === value);
  if (known) return known[1];
  const hours = Math.max(1, Math.round(value / 3600));
  return hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`;
}

// Alerts only keep working while the mailbox authorization stays valid, and the
// wallet is the only place that can re-sign one. Renewing on every unlock would
// tell the notification service each time the wallet is opened and would reissue
// a read capability far more often than necessary, so the clock is reset once a
// tenth of the period has passed, and always once under half of it remains. A
// lapse then needs the wallet to be ignored for over half the chosen period.
const RENEWAL_ELAPSED_FRACTION = 10;
const RENEWAL_REMAINING_FRACTION = 2;

export function notificationRenewalDue(state, nowSeconds = Math.floor(Date.now() / 1000)) {
  const expiresAt = Number(state?.expiresAt);
  if (!state?.id || !Number.isFinite(expiresAt) || expiresAt <= 0) return false;
  const period = Number(state?.lifetimeSeconds) > 0 ? Number(state.lifetimeSeconds) : 86_400;
  const remaining = expiresAt - nowSeconds;
  // Expired: renewing cannot revive it, the user has to enable alerts again.
  if (remaining <= 0) return false;
  const elapsed = period - remaining;
  return remaining <= period / RENEWAL_REMAINING_FRACTION || elapsed >= period / RENEWAL_ELAPSED_FRACTION;
}

// What the centred alert says when a payment arrives while the wallet is open:
// what arrived, how, when, and how long background alerts are still watching.
export function paymentAlertContent({amountSats = 0, method = 'Ark', networkLabel = '', at = Date.now(), pushExpiresAt = 0, pushPeriodSeconds = 0, nowMs = Date.now()} = {}) {
  const amount = Number(amountSats);
  const title = Number.isFinite(amount) && amount > 0 ? `${formatSats(amount)} received` : 'Bitcoin received';
  const details = [['Method', String(method || 'Ark')]];
  if (networkLabel) details.push(['Network', String(networkLabel)]);
  details.push(['Received', new Date(at).toLocaleString()]);
  const expires = Number(pushExpiresAt);
  let expiry;
  if (Number.isFinite(expires) && expires * 1000 > nowMs) {
    const period = Number(pushPeriodSeconds) > 0 ? ` (${notificationLifetimeLabel(pushPeriodSeconds)})` : '';
    expiry = `Background alerts are on until ${new Date(expires * 1000).toLocaleString()}${period}.`;
  } else {
    expiry = 'Background alerts are off, so this only shows while the page is open.';
  }
  return {title, details, expiry};
}

// A paste-ready error report. The user sees one friendly sentence; whoever reads
// the report needs the browser's own words, the build served, and the page.
export function formatErrorReport({message = '', detail = '', network = '', page = '', browser = '', assets = '', at = new Date().toISOString()} = {}) {
  const lines = ['satoshi.si wallet error', `when: ${at}`];
  if (page) lines.push(`page: ${page}`);
  if (network) lines.push(`network: ${network}`);
  if (assets) lines.push(`assets: ${assets}`);
  if (browser) lines.push(`browser: ${browser}`);
  const shown = String(message).replace(/\s+/g, ' ').trim();
  lines.push('', `message: ${shown || '(none)'}`);
  const extra = String(detail || '').trim();
  if (extra && extra.replace(/\s+/g, ' ').trim() !== shown) lines.push('', 'detail:', extra);
  return lines.join('\n');
}

const PUSH_UNREACHABLE = /push service error|registration failed/i;

// Turns the browser's opaque "Registration failed - push service error" into
// something the user can act on. Brave is called out by name because it ships
// with Google's push service switched off deliberately, so the failure there is
// fixed by one setting rather than by a different browser.
export function describeBackgroundNotificationError(error, {isBrave = false} = {}) {
  const name = String(error?.name || 'Error');
  const raw = String(error?.message || error || 'Unknown error');
  const serviceUnreachable = PUSH_UNREACHABLE.test(raw) || name === 'AbortError';

  if (!serviceUnreachable) {
    // Never blame Brave for a failure that is not about the push service.
    return {message: raw, hint: '', reason: 'other', detail: `${name}: ${raw}`};
  }

  if (isBrave) {
    return {
      message: 'Brave blocks background alerts by default: it disables Google\'s push service, so the alert could not register. '
        + 'Open brave://settings/privacy and turn on "Use Google services for push messaging" (search the settings for "push"), '
        + 'then reload this page and try again.',
      hint: 'Brave: enable "Use Google services for push messaging" in brave://settings/privacy, then reload',
      reason: 'brave-push-disabled',
      detail: `${name}: ${raw}`,
    };
  }

  return {
    message: 'This browser could not reach its push service, so background alerts stayed off. '
      + 'Possible causes include a temporary push-provider outage, a content blocker, a DNS filter, a VPN, or browser or operating-system restrictions. '
      + 'Alerts while the wallet is open are unaffected. Technical details were written to the browser console.',
    hint: 'This browser could not reach its push service',
    reason: 'push-service-unreachable',
    detail: `${name}: ${raw}`,
  };
}
