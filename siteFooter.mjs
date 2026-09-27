const footer = document.querySelector('[data-live-footer]');

async function readText(url) {
  const response = await fetch(url, {cache: 'no-store'});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function updateBlockHeight() {
  const node = footer?.querySelector('#block-height');
  if (!node) return;
  const height = (await readText('https://mempool.space/api/blocks/tip/height')).trim();
  if (!/^\d+$/.test(height)) throw new Error('Invalid block height');
  node.textContent = height;
  node.href = `https://mempool.space/block-height/${height}`;
}

async function updateFeeRate() {
  const node = footer?.querySelector('#fee-rate');
  if (!node) return;
  const response = await fetch('https://mempool.space/api/v1/fees/recommended', {cache: 'no-store'});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const fees = await response.json();
  const rate = Number(fees.halfHourFee);
  if (!Number.isFinite(rate)) throw new Error('Invalid fee rate');
  node.textContent = `${rate} sat/vB`;
}

if (footer) {
  Promise.allSettled([updateBlockHeight(), updateFeeRate()]);
}
