import {DEFAULT_PRICING, percentageRange} from './barkTxCostModel.mjs';
import {SCRIPT_TYPES, feeShare} from './bitcoinTxCostModel.mjs';
import {estimateRoute, isOnchainType} from './txCostRouteModel.mjs';

const PRECISE_FEES_URL = 'https://mempool.space/api/v1/fees/precise';
const RECOMMENDED_FEES_URL = 'https://mempool.space/api/v1/fees/recommended';
const PRICING_URL = '/bark-pricing.json';
const FALLBACK_FEES = Object.freeze({economyFee: 1, hourFee: 2, halfHourFee: 3, fastestFee: 5, minimumFee: 1});

const fields = {
  amount: document.getElementById('paymentAmount'),
  source: document.getElementById('sourceType'),
  destination: document.getElementById('destinationType'),
  inputCount: document.getElementById('inputCount'),
  recipientCount: document.getElementById('recipientCount'),
  includeChange: document.getElementById('includeChange'),
  feeRate: document.getElementById('feeRate'),
};
const output = {
  fee: document.getElementById('estimatedFee'),
  size: document.getElementById('estimatedSize'),
  rate: document.getElementById('usedFeeRate'),
  total: document.getElementById('estimatedTotal'),
  share: document.getElementById('feeShare'),
  source: document.getElementById('feeSource'),
  breakdown: document.getElementById('routeBreakdown'),
  note: document.getElementById('routeNote'),
  pricingRows: document.getElementById('pricingRows'),
  pricingStatus: document.getElementById('pricingStatus'),
};
const speedButtons = [...document.querySelectorAll('[data-fee-speed]')];
const shapeControls = document.getElementById('onchainShape');
const recipientField = fields.recipientCount.closest('.tx-field');
const feeControls = document.getElementById('feeControls');
let lightningOption;

let fees = {...FALLBACK_FEES};
let pricing = DEFAULT_PRICING;
let pricingCheckedAt = null;
let liveFees = false;
let selectedSpeed = 'halfHourFee';

function sats(value) {
  return `${new Intl.NumberFormat('en-US').format(Math.max(0, Math.ceil(Number(value) || 0)))} sats`;
}

function selectedRate() {
  if (selectedSpeed === 'custom') return Math.max(0.01, Number(fields.feeRate.value) || 1);
  return Math.max(0.01, Number(fees[selectedSpeed]) || 1);
}

function syncRateField() {
  speedButtons.forEach(button => {
    const key = button.dataset.feeSpeed;
    const active = key === selectedSpeed;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
    button.querySelector('strong').textContent = `${fees[key]} sat/vB`;
  });
  if (selectedSpeed !== 'custom') fields.feeRate.value = selectedRate();
  fields.feeRate.closest('.fee-rate-field').classList.toggle('is-custom', selectedSpeed === 'custom');
}

function routeCopy(route, estimate) {
  return {
    'ark-to-ark': ['Ark payment', 'Second currently publishes a 0% send fee for Ark payments.', 'No on-chain fee rate is used. Future refresh or offboarding can still cost money.'],
    'ark-to-lightning': ['Ark to Lightning', `Published Bark service fee: ${sats(estimate.serviceMin)}-${sats(estimate.serviceMax)}.`, 'The exact fee depends on VTXO expiry and the available Lightning route.'],
    'ark-to-onchain': ['Ark offboard', `Published Bark service fee: ${sats(estimate.serviceMin)}-${sats(estimate.serviceMax)}, plus an illustrative ${sats(estimate.mining)} mining component.`, 'The Ark server selects the real offboard construction and fee. Its wallet review quote is authoritative.'],
    'onchain-to-onchain': ['On-chain transaction', 'Typical transaction-size estimate using the selected source, destination, inputs, recipients, and change.', 'The signed transaction can differ because of wallet coin selection and signature or script details.'],
    'onchain-to-ark': ['Board into Ark', `Estimated Bitcoin mining fee for one Ark boarding output${fields.includeChange.checked ? ' and one change output' : ''}.`, 'Second publishes no separate boarding service fee. The actual Bark wallet transaction is authoritative.'],
  }[route];
}

function renderPricing() {
  const lightning = percentageRange(pricing.lightning?.sendPercentByExpiry);
  const onchain = percentageRange(pricing.onchain?.sendPercentByExpiry);
  output.pricingRows.innerHTML = `
    <div><span>Ark send / receive</span><strong>${pricing.ark?.sendPercent || 0}% / ${pricing.ark?.receivePercent || 0}%</strong></div>
    <div><span>Lightning send</span><strong>${lightning.min}-${lightning.max}% <small>min ${pricing.lightning?.minimumSats || 20} sats</small></strong></div>
    <div><span>Ark to on-chain</span><strong>${onchain.min}-${onchain.max}% <small>+ mining fee</small></strong></div>
    <div><span>On-chain to Ark</span><strong>Mining fee only</strong></div>`;
  const date = pricingCheckedAt ? new Date(pricingCheckedAt) : null;
  output.pricingStatus.textContent = date && !Number.isNaN(date.valueOf())
    ? `Official pricing checked ${date.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'})}`
    : 'Using the bundled official pricing fallback';
}

function render() {
  syncRateField();
  const source = fields.source.value;
  const sourceOnchain = isOnchainType(source);
  lightningOption.hidden = sourceOnchain;
  lightningOption.disabled = sourceOnchain;
  if (sourceOnchain && fields.destination.value === 'lightning') fields.destination.value = 'ark';
  const destination = fields.destination.value;
  const destinationOnchain = isOnchainType(destination);
  const usesMiningFee = sourceOnchain || (source === 'ark' && destinationOnchain);
  shapeControls.hidden = !sourceOnchain;
  recipientField.hidden = !sourceOnchain || !destinationOnchain;
  feeControls.hidden = !usesMiningFee;

  const amount = Math.max(0, Math.floor(Number(fields.amount.value) || 0));
  const estimate = estimateRoute({
    source, destination, amount,
    inputCount: fields.inputCount.value,
    recipientCount: fields.recipientCount.value,
    includeChange: fields.includeChange.checked,
    feeRate: selectedRate(), pricing,
  });
  const same = estimate.min === estimate.max;
  const shareMin = feeShare(amount, estimate.min);
  const shareMax = feeShare(amount, estimate.max);
  const copy = routeCopy(estimate.route, estimate);
  output.fee.textContent = same ? sats(estimate.min) : `${sats(estimate.min)} - ${sats(estimate.max)}`;
  output.size.textContent = estimate.vbytes ? `${estimate.vbytes} vB${estimate.route.startsWith('ark-to-') ? ' assumed' : ''}` : 'Off-chain';
  output.rate.textContent = usesMiningFee ? `${selectedRate()} sat/vB` : 'Not used';
  output.total.textContent = amount ? (same ? sats(amount + estimate.min) : `${sats(amount + estimate.min)} - ${sats(amount + estimate.max)}`) : 'Add an amount';
  output.share.textContent = shareMin === null ? 'Add an amount' : same
    ? `${shareMin < 0.01 ? '<0.01' : shareMin.toFixed(2)}%`
    : `${shareMin.toFixed(2)}-${shareMax.toFixed(2)}%`;
  output.breakdown.textContent = copy[1];
  output.note.textContent = copy[2];
  document.getElementById('resultLabel').textContent = copy[0];
}

function addOption(select, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.append(option);
}

addOption(fields.source, 'ark', 'Ark balance (Bark)');
addOption(fields.destination, 'ark', 'Ark balance (Bark)');
addOption(fields.destination, 'lightning', 'Lightning');
Object.entries(SCRIPT_TYPES).forEach(([value, type]) => {
  addOption(fields.source, value, `${type.label} (${value === 'p2tr' ? 'P2TR key path' : type.detail})`);
  addOption(fields.destination, value, `${type.label} (${type.detail})`);
});
fields.source.value = 'p2wpkh';
fields.destination.value = 'p2wpkh';
lightningOption = fields.destination.querySelector('option[value="lightning"]');

Object.values(fields).forEach(field => {
  if (field === fields.feeRate) return;
  field.addEventListener('input', render);
  field.addEventListener('change', render);
});
speedButtons.forEach(button => button.addEventListener('click', () => {
  selectedSpeed = button.dataset.feeSpeed;
  render();
}));
fields.feeRate.addEventListener('input', () => {
  selectedSpeed = 'custom';
  render();
});

async function loadData() {
  const feeRequest = (async () => {
    for (const url of [PRECISE_FEES_URL, RECOMMENDED_FEES_URL]) {
      try {
        const response = await fetch(url, {cache: 'no-store'});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!Number.isFinite(Number(data.fastestFee))) throw new Error('Invalid fee response');
        fees = {...FALLBACK_FEES, ...data};
        liveFees = true;
        return;
      } catch (error) {
        console.warn('Fee source unavailable:', url, error);
      }
    }
  })();
  const pricingRequest = fetch(PRICING_URL, {cache: 'no-store'})
    .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then(data => { pricing = data; pricingCheckedAt = data.checkedAt; })
    .catch(error => console.warn('Using bundled Bark pricing:', error));
  await Promise.allSettled([feeRequest, pricingRequest]);
  output.source.textContent = liveFees ? 'Live fee rates from mempool.space' : 'Using offline example fee rates';
  output.source.classList.toggle('offline', !liveFees);
  renderPricing();
  render();
}

renderPricing();
render();
loadData();
