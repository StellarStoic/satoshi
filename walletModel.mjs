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

export function receivedMovementAmount(movement = {}) {
  const amount = Number(movement.effectiveBalanceSats);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function notificationMovement(notification = {}) {
  const type = String(notification.type || '').toLowerCase();
  if (type !== 'movementcreated' && type !== 'movementupdated') return null;
  return notification.movement && typeof notification.movement === 'object' ? notification.movement : null;
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
