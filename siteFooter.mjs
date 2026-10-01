const footer = document.querySelector('.footer');

const state = {
  blocks: [],
  fees: null,
  blockIndex: 0,
  mode: 'block',
  controller: new AbortController()
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function replaceControl(node, attributes = {}) {
  if (!node) return null;
  const replacement = node.cloneNode(true);
  for (const name of ['href', 'target', 'rel', 'onclick']) replacement.removeAttribute(name);
  Object.entries(attributes).forEach(([name, value]) => replacement.setAttribute(name, value));
  node.replaceWith(replacement);
  return replacement;
}

function normalizeFooter() {
  if (!footer) return {};
  let email = footer.querySelector('a[href^="mailto:"]');
  if (!email) {
    email = document.createElement('a');
    email.href = 'mailto:one@satoshi.si';
    email.textContent = 'one@satoshi.si';
    footer.append(email);
  }

  let block = footer.querySelector('#block-height');
  if (!block) {
    block = document.createElement('span');
    block.id = 'block-height';
    block.textContent = 'Block --';
    footer.insertBefore(block, email);
  }
  block = replaceControl(block, {role: 'button', tabindex: '0', 'aria-label': 'Open recent Bitcoin block details'});

  let fee = footer.querySelector('#fee-rate');
  if (!fee) {
    fee = document.createElement('span');
    fee.id = 'fee-rate';
    fee.textContent = '-- sat/vB';
    footer.append(fee);
  }
  fee = replaceControl(fee, {role: 'button', tabindex: '0', 'aria-label': 'Open current Bitcoin fee estimates'});

  const oldBolt = footer.querySelector('.site-footer-bolt, .lni-bolt-2, [data-support-trigger]');
  const bolt = document.createElement('i');
  bolt.className = 'lni lni-bolt-2 site-footer-bolt';
  bolt.setAttribute('aria-label', 'Support satoshi.si');
  bolt.setAttribute('title', 'Support satoshi.si');
  bolt.setAttribute('role', 'button');
  bolt.setAttribute('tabindex', '0');
  bolt.setAttribute('data-support-trigger', '');
  if (oldBolt) oldBolt.replaceWith(bolt);
  else email.after(bolt);
  return {block, fee, bolt};
}

function bindDismiss(modal) {
  const close = () => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.description-modal.active')) document.body.classList.remove('modal-open');
  };
  modal.querySelector('[data-modal-close]')?.addEventListener('click', close);
  modal.addEventListener('click', event => {
    if (event.target === modal) close();
  });
  return close;
}

function openModal(modal) {
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  modal.querySelector('[data-modal-close]')?.focus();
}

function ensureSupportModal() {
  let modal = document.getElementById('qrCodeModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'qrCodeModal';
    document.body.append(modal);
  }
  modal.className = 'description-modal footer-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-hidden', 'true');
  modal.setAttribute('aria-labelledby', 'supportModalTitle');
  modal.innerHTML = `
    <div class="modal-content footer-modal-content support-modal-content">
      <button class="close-icon" data-modal-close type="button" aria-label="Close support QR codes">&times;</button>
      <span class="footer-modal-kicker">Support the project</span>
      <h2 id="supportModalTitle">Send a sat or two</h2>
      <p class="footer-modal-intro">If satoshi.si has been useful, contributions help keep it independent.</p>
      <div class="qr-code-container">
        <div class="qr-code-wrapper"><img src="/img/qrLND.svg" alt="Lightning QR code" class="qr-code"><strong>Lightning</strong><p class="qr-code-text">one@satoshi.si</p></div>
        <div class="qr-code-wrapper"><img src="/img/qrOC.svg" alt="On-chain Bitcoin QR code" class="qr-code"><strong>On-chain</strong><p class="qr-code-text">bc1q2ytw4gwrkw5jg6ekutcwrgw8x5nlkahyk54l5e</p></div>
      </div>
    </div>`;
  bindDismiss(modal);
  return modal;
}

function ensureDataModal() {
  let modal = document.getElementById('mempoolTinyDataModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mempoolTinyDataModal';
    document.body.append(modal);
  }
  modal.className = 'description-modal footer-modal mempool-data-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-hidden', 'true');
  modal.setAttribute('aria-labelledby', 'mempoolModalTitle');
  modal.innerHTML = `
    <div class="modal-content footer-modal-content mempool-modal-content">
      <button class="close-icon" data-modal-close type="button" aria-label="Close Bitcoin network data">&times;</button>
      <div id="mempoolModalBody" aria-live="polite"></div>
    </div>`;
  bindDismiss(modal);
  return modal;
}

async function getJson(url) {
  const response = await fetch(url, {cache: 'no-store', signal: state.controller.signal});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function formatAge(timestamp) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - Number(timestamp)));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatBtc(sats) {
  const value = Number(sats) / 100000000;
  return Number.isFinite(value) ? `${value.toLocaleString(undefined, {maximumFractionDigits: 8})} BTC` : '--';
}

function metric(label, value, className = '') {
  return `<div class="mempool-metric ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderBlock() {
  const body = document.getElementById('mempoolModalBody');
  const block = state.blocks[state.blockIndex];
  if (!body || !block) return;
  const extras = block.extras || {};
  const pool = extras.pool || {};
  const poolName = pool.name || 'Unknown pool';
  const slug = String(pool.slug || '').replace(/[^a-z0-9_-]/gi, '');
  const initial = poolName.trim().charAt(0).toUpperCase() || '?';
  const logo = slug ? `<img src="https://raw.githubusercontent.com/mempool/mining-pool-logos/master/${slug}.svg" alt="${escapeHtml(poolName)} logo" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="pool-logo-fallback" hidden>${escapeHtml(initial)}</span>` : `<span class="pool-logo-fallback">${escapeHtml(initial)}</span>`;
  const feeRange = Array.isArray(extras.feeRange) && extras.feeRange.length
    ? `${Number(extras.feeRange[0]).toFixed(1)}-${Number(extras.feeRange[extras.feeRange.length - 1]).toFixed(1)} sat/vB`
    : '--';
  body.innerHTML = `
    <span class="footer-modal-kicker">Bitcoin network</span>
    <div class="mempool-title-row"><div><h2 id="mempoolModalTitle">Block ${Number(block.height).toLocaleString()}</h2><p>${formatAge(block.timestamp)}</p></div>
      <div class="mempool-block-nav" aria-label="Browse recent blocks"><button type="button" data-newer aria-label="Newer block" ${state.blockIndex === 0 ? 'disabled' : ''}>‹</button><span>${state.blockIndex + 1}/${state.blocks.length}</span><button type="button" data-older aria-label="Older block" ${state.blockIndex >= state.blocks.length - 1 ? 'disabled' : ''}>›</button></div>
    </div>
    <div class="mempool-pool"><div class="pool-logo">${logo}</div><div><span>Mined by</span><strong>${escapeHtml(poolName)}</strong></div></div>
    <div class="mempool-metric-grid">
      ${metric('Median fee', Number.isFinite(Number(extras.medianFee)) ? `${Number(extras.medianFee).toFixed(1)} sat/vB` : '--', 'accent')}
      ${metric('Fee range', feeRange)}
      ${metric('Transactions', Number(block.tx_count || 0).toLocaleString())}
      ${metric('Total fees', formatBtc(extras.totalFees))}
      ${metric('Size', `${(Number(block.size || 0) / 1000000).toFixed(2)} MB`)}
      ${metric('Weight', `${(Number(block.weight || 0) / 1000000).toFixed(2)} MWU`)}
    </div>
    <div class="mempool-hash"><span>Block hash</span><code>${escapeHtml(block.id || '--')}</code></div>`;
  body.querySelector('[data-newer]')?.addEventListener('click', () => { state.blockIndex -= 1; renderBlock(); });
  body.querySelector('[data-older]')?.addEventListener('click', () => { state.blockIndex += 1; renderBlock(); });
}

function renderFees() {
  const body = document.getElementById('mempoolModalBody');
  if (!body || !state.fees) return;
  const fees = state.fees;
  const rows = [
    ['Next block', fees.fastestFee, 'Highest priority'],
    ['About 30 minutes', fees.halfHourFee, 'Good balance'],
    ['About 1 hour', fees.hourFee, 'Can wait'],
    ['Economy', fees.economyFee, 'Low priority'],
    ['Minimum', fees.minimumFee, 'May wait longer']
  ];
  body.innerHTML = `
    <span class="footer-modal-kicker">Bitcoin network</span>
    <div class="mempool-title-row"><div><h2 id="mempoolModalTitle">Current fee estimates</h2><p>Rates update when this panel opens.</p></div></div>
    <div class="fee-lanes">${rows.map(([label, value, note], index) => `<div class="fee-lane ${index === 1 ? 'recommended' : ''}"><div><strong>${escapeHtml(label)}</strong><span>${escapeHtml(note)}</span></div><b>${Number(value).toLocaleString()} <small>sat/vB</small></b></div>`).join('')}</div>
    <p class="mempool-note">These are estimates, not guarantees. A wallet can choose a different fee rate.</p>`;
}

function renderLoading(title) {
  const body = document.getElementById('mempoolModalBody');
  if (body) body.innerHTML = `<span class="footer-modal-kicker">Bitcoin network</span><h2 id="mempoolModalTitle">${escapeHtml(title)}</h2><div class="mempool-loader" aria-label="Loading"><i></i><i></i><i></i></div>`;
}

function renderError(message) {
  const body = document.getElementById('mempoolModalBody');
  if (body) body.innerHTML = `<span class="footer-modal-kicker">Bitcoin network</span><h2 id="mempoolModalTitle">Data is taking a breather</h2><p class="mempool-error">${escapeHtml(message)}</p><button class="mempool-retry" type="button">Try again</button>`;
  body?.querySelector('.mempool-retry')?.addEventListener('click', refreshNetworkData);
}

function updateFooter() {
  const block = footer?.querySelector('#block-height');
  const fee = footer?.querySelector('#fee-rate');
  if (block && state.blocks[0]) block.textContent = Number(state.blocks[0].height).toLocaleString();
  if (fee && state.fees) fee.textContent = `${Number(state.fees.halfHourFee).toLocaleString()} sat/vB`;
}

async function refreshNetworkData(mode) {
  if (mode) state.mode = mode;
  const activeMode = mode || state.mode;
  const wantsBlock = activeMode === 'block';
  try {
    if (wantsBlock && !state.blocks.length) renderLoading('Loading recent blocks');
    if (!wantsBlock && !state.fees) renderLoading('Loading fee estimates');
    const [blocksResult, feesResult] = await Promise.allSettled([
      getJson('https://mempool.space/api/v1/blocks'),
      getJson('https://mempool.space/api/v1/fees/recommended')
    ]);
    if (blocksResult.status === 'fulfilled' && Array.isArray(blocksResult.value)) state.blocks = blocksResult.value.slice(0, 10);
    if (feesResult.status === 'fulfilled') state.fees = feesResult.value;
    updateFooter();
    if (activeMode === 'block') {
      if (!state.blocks.length) throw new Error('Recent block data is unavailable right now.');
      state.blockIndex = 0;
      renderBlock();
    } else if (activeMode === 'fees') {
      if (!state.fees) throw new Error('Fee estimates are unavailable right now.');
      renderFees();
    }
  } catch (error) {
    renderError(error.message || 'Bitcoin network data is unavailable right now.');
  }
}

function bindAction(node, action) {
  if (!node) return;
  const activate = event => {
    event.preventDefault();
    event.stopPropagation();
    action();
  };
  node.addEventListener('click', activate);
  node.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') activate(event);
  });
}

if (footer) {
  const controls = normalizeFooter();
  const dataModal = ensureDataModal();
  const supportModal = ensureSupportModal();
  bindAction(controls.block, () => { openModal(dataModal); refreshNetworkData('block'); });
  bindAction(controls.fee, () => { openModal(dataModal); refreshNetworkData('fees'); });
  bindAction(controls.bolt, () => openModal(supportModal));
  refreshNetworkData();
  const refreshTimer = window.setInterval(() => refreshNetworkData(), 60000);
  window.addEventListener('beforeunload', () => { window.clearInterval(refreshTimer); state.controller.abort(); }, {once: true});
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll('.description-modal.active').forEach(modal => {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    });
    document.body.classList.remove('modal-open');
  });
}
