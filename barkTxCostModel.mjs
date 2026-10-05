export const DEFAULT_PRICING = Object.freeze({
  ark: {sendPercent: 0, receivePercent: 0},
  lightning: {
    sendPercentByExpiry: [
      {remainingDays: 'less-than-7', percent: 0.2},
      {remainingDays: 'less-than-14', percent: 0.4},
      {remainingDays: '14-or-more', percent: 0.5},
    ],
    minimumSats: 20,
    receivePercent: 0,
  },
  onchain: {
    sendPercentByExpiry: [
      {remainingDays: 'less-than-7', percent: 0.2},
      {remainingDays: 'less-than-14', percent: 0.4},
      {remainingDays: '14-or-more', percent: 0.5},
    ],
    plusMiningFee: true,
    receivePercent: 0,
  },
});

export const ILLUSTRATIVE_ONCHAIN_VBYTES = 250;

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeAmount(value) {
  return Math.max(0, Math.floor(finiteNumber(value)));
}

export function percentageRange(tiers = []) {
  const values = tiers.map(tier => finiteNumber(tier?.percent, NaN)).filter(Number.isFinite);
  return values.length ? {min: Math.min(...values), max: Math.max(...values)} : {min: 0, max: 0};
}

function percentFee(amount, percent) {
  return Math.ceil(amount * percent / 100);
}

export function estimateBarkCost({amount, destination, pricing = DEFAULT_PRICING, feeRate = 0}) {
  const sats = normalizeAmount(amount);
  if (destination === 'ark') {
    const service = percentFee(sats, finiteNumber(pricing.ark?.sendPercent));
    return {kind: 'exact', min: service, max: service, serviceMin: service, serviceMax: service, mining: 0};
  }

  const section = destination === 'onchain' ? pricing.onchain : pricing.lightning;
  const range = percentageRange(section?.sendPercentByExpiry);
  const minimum = destination === 'lightning' ? normalizeAmount(section?.minimumSats) : 0;
  const serviceMin = Math.max(minimum, percentFee(sats, range.min));
  const serviceMax = Math.max(minimum, percentFee(sats, range.max));
  const mining = destination === 'onchain'
    ? Math.ceil(Math.max(0, finiteNumber(feeRate)) * ILLUSTRATIVE_ONCHAIN_VBYTES)
    : 0;

  return {
    kind: destination === 'onchain' ? 'illustrative' : 'range',
    min: serviceMin + mining,
    max: serviceMax + mining,
    serviceMin,
    serviceMax,
    mining,
  };
}

export function formatSats(value) {
  return `${new Intl.NumberFormat('en-US').format(normalizeAmount(value))} sats`;
}
