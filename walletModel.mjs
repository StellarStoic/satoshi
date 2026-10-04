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
