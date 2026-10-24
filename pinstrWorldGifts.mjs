import {
  REACTION_SET, ZAP_AMOUNTS, reactionTemplate, zapRequestTemplate, lud16ToLnurlpUrl,
  parseLnurlPay, clampZapAmount, zapCallbackUrl, parseInvoice, lnurlDecode, lnurlEncode,
} from './noteGifts.mjs';
import {getNostrSession, signNostrEvent} from './nostrSession.mjs';

const USER_RELAYS_KEY = 'satoshi:sticky:relays:v1';

function savedRelays(primary) {
  try {
    const stored = JSON.parse(localStorage.getItem(USER_RELAYS_KEY) || '[]');
    return [...new Set([primary, ...(Array.isArray(stored) ? stored : [])])]
      .filter(value => /^wss?:\/\/[^\s]+$/.test(String(value || '')));
  } catch { return [primary]; }
}

function readProfiles(relay, pubkey) {
  return new Promise(resolve => {
    let socket;
    let newest = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket?.close(); } catch {}
      resolve(newest);
    };
    const timer = setTimeout(finish, 3500);
    try { socket = new WebSocket(relay); } catch { finish(); return; }
    const subscription = `pinstr-world-profile-${Date.now()}-${Math.random()}`;
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subscription,
      {authors:[pubkey], kinds:[0], limit:5}])));
    socket.addEventListener('message', message => {
      let data;
      try { data = JSON.parse(message.data); } catch { return; }
      if (data[0] === 'EOSE' && data[1] === subscription) { finish(); return; }
      const event = data[2];
      if (data[0] !== 'EVENT' || data[1] !== subscription || event?.pubkey !== pubkey
          || !window.NostrTools?.verifyEvent(event)) return;
      if (!newest || event.created_at > newest.created_at) newest = event;
    });
    socket.addEventListener('error', finish);
    socket.addEventListener('close', finish);
  });
}

async function authorZapTarget(pubkey, relay) {
  const answers = await Promise.allSettled(savedRelays(relay).slice(0, 4).map(url => readProfiles(url, pubkey)));
  const newest = answers.filter(answer => answer.status === 'fulfilled').map(answer => answer.value)
    .filter(Boolean).sort((left, right) => right.created_at - left.created_at)[0];
  if (!newest) return {ok:false, error:'Could not read this author\u2019s profile just now.'};
  let profile = {};
  try { profile = JSON.parse(newest.content || '{}'); } catch {}
  const address = String(profile.lud16 || '').trim();
  if (address) return {ok:true, address};
  const encoded = String(profile.lud06 || '').trim();
  if (encoded) {
    try { return {ok:true, address:'', url:lnurlDecode(encoded)}; } catch {}
  }
  return {ok:false, error:'This author has not published a lightning address.'};
}

async function zapEndpoint(target) {
  let url;
  try { url = target.url || lud16ToLnurlpUrl(target.address); }
  catch (error) { return {ok:false, error:error.message}; }
  try {
    const response = await fetch(url, {headers:{Accept:'application/json'}});
    if (!response.ok) return {ok:false, error:`That lightning address answered ${response.status}.`};
    const parsed = parseLnurlPay(await response.json());
    if (!parsed.ok) return parsed;
    return {...parsed, lnurl:lnurlEncode(url)};
  } catch { return {ok:false, error:'Could not reach that lightning address just now.'}; }
}

function publish(event, relays) {
  return Promise.all(relays.map(url => new Promise(resolve => {
    let socket;
    let done = false;
    const finish = accepted => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket?.close(); } catch {}
      resolve(accepted ? 1 : 0);
    };
    const timer = setTimeout(() => finish(false), 6000);
    try { socket = new WebSocket(url); } catch { finish(false); return; }
    socket.addEventListener('open', () => socket.send(JSON.stringify(['EVENT', event])));
    socket.addEventListener('message', message => {
      try {
        const data = JSON.parse(message.data);
        if (data[0] === 'OK' && data[1] === event.id) finish(data[2] !== false);
      } catch {}
    });
    socket.addEventListener('error', () => finish(false));
    socket.addEventListener('close', () => finish(false));
  }))).then(values => values.reduce((sum, value) => sum + value, 0));
}

function drawQr(container, text) {
  const qr = window.qrcode?.(0, 'M');
  if (!qr) return;
  qr.addData(text);
  qr.make();
  const quiet = 4;
  const modules = qr.getModuleCount();
  const cell = Math.max(2, Math.floor(300 / (modules + quiet * 2)));
  const side = (modules + quiet * 2) * cell;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = side;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0, 0, side, side);
  context.fillStyle = '#000';
  for (let row = 0; row < modules; row += 1) for (let column = 0; column < modules; column += 1) {
    if (qr.isDark(row, column)) context.fillRect((column + quiet) * cell, (row + quiet) * cell, cell, cell);
  }
  container.replaceChildren(canvas);
}

export function createWorldGiftDialog({relay, noteFor, authorFor, loginHref}) {
  const elements = Object.fromEntries([
    'noteGiftDialog', 'closeNoteGift', 'noteGiftAuthor', 'noteGiftStatus', 'noteGiftLogin', 'noteGiftReactions',
    'noteGiftZapTarget', 'noteGiftAmounts', 'noteGiftCustom', 'noteGiftZap', 'noteGiftInvoice',
    'noteGiftQr', 'noteGiftInvoiceHint', 'noteGiftInvoiceText', 'copyNoteGiftInvoice',
  ].map(id => [id, document.getElementById(id)]));
  let current = null;
  let pay = null;
  let amount = 0;
  const relays = () => savedRelays(relay);
  const status = (message, error = false) => {
    elements.noteGiftStatus.textContent = message || '';
    elements.noteGiftStatus.classList.toggle('is-error', error);
  };
  const showInvoice = (invoice, allowsNostr) => {
    elements.noteGiftInvoice.hidden = false;
    elements.noteGiftInvoiceText.textContent = invoice;
    drawQr(elements.noteGiftQr, invoice);
    elements.noteGiftInvoiceHint.textContent = allowsNostr
      ? 'Pay from any Lightning wallet. The receipt will be recorded on Nostr.'
      : 'Pay from any Lightning wallet.';
  };
  const react = async reaction => {
    if (!current) return;
    try {
      const session = getNostrSession();
      const template = reactionTemplate({noteId:current.id, noteKind:current.event?.kind || 1,
        authorPubkey:current.pubkey, reaction, relay, pubkey:session?.pubkey || ''});
      const signed = await signNostrEvent(template, {action:'react', noteId:current.id, reactionId:reaction.id});
      if (!signed) { status('Approve the reaction in your signer, then return here.'); return; }
      status('Sending your reaction\u2026');
      const accepted = await publish(signed, relays());
      status(accepted ? 'Reaction sent.' : 'No relay accepted the reaction.', !accepted);
    } catch (error) { status(error.message || 'The reaction could not be sent.', true); }
  };
  const zap = async sats => {
    if (!current || !pay) return;
    const fit = clampZapAmount(sats, pay);
    if (!fit.ok) { status(fit.error, true); return; }
    try {
      const session = getNostrSession();
      const template = zapRequestTemplate({noteId:current.id, noteKind:current.event?.kind || 1,
        authorPubkey:current.pubkey, amountSats:fit.sats, relays:relays(), pubkey:session?.pubkey || ''});
      const signed = await signNostrEvent(template, {action:'zap', noteId:current.id, sats:fit.sats});
      if (!signed) { status('Approve the zap in your signer, then return here for the invoice.'); return; }
      status('Asking for an invoice\u2026');
      const response = await fetch(zapCallbackUrl({callback:pay.callback, amountSats:fit.sats,
        event:signed, lnurl:pay.lnurl}), {headers:{Accept:'application/json'}});
      if (!response.ok) throw new Error(`That lightning address answered ${response.status}.`);
      const invoice = parseInvoice(await response.json());
      if (!invoice.ok) throw new Error(invoice.error);
      showInvoice(invoice.invoice, pay.allowsNostr);
      status(`Zapping ${fit.sats} sats.`);
    } catch (error) { status(error.message || 'The zap could not be prepared.', true); }
  };

  elements.closeNoteGift.addEventListener('click', () => elements.noteGiftDialog.close());
  elements.noteGiftZap.addEventListener('click', () => zap(Number(elements.noteGiftCustom.value) || amount));
  elements.copyNoteGiftInvoice.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(elements.noteGiftInvoiceText.textContent || '');
      elements.copyNoteGiftInvoice.querySelector('span').textContent = 'Invoice copied';
      setTimeout(() => { elements.copyNoteGiftInvoice.querySelector('span').textContent = 'Copy invoice'; }, 1800);
    } catch { status('Could not copy the invoice.', true); }
  });

  return async eventId => {
    current = noteFor(eventId);
    if (!current?.event) return;
    pay = null; amount = 0;
    elements.noteGiftAuthor.textContent = authorFor(current);
    elements.noteGiftInvoice.hidden = true;
    elements.noteGiftQr.replaceChildren();
    elements.noteGiftInvoiceText.textContent = '';
    elements.noteGiftCustom.value = '';
    const session = getNostrSession();
    elements.noteGiftLogin.href = loginHref;
    elements.noteGiftLogin.hidden = Boolean(session);
    elements.noteGiftReactions.replaceChildren(...REACTION_SET.map(reaction => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = reaction.emoji; button.title = reaction.label;
      button.setAttribute('aria-label', reaction.label); button.setAttribute('aria-checked', 'false');
      button.disabled = !session;
      button.addEventListener('click', () => react(reaction));
      return button;
    }));
    elements.noteGiftAmounts.replaceChildren(...ZAP_AMOUNTS.map(sats => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = String(sats); button.disabled = !session;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        amount = sats; elements.noteGiftCustom.value = '';
        [...elements.noteGiftAmounts.children].forEach(other => other.setAttribute('aria-pressed', String(other === button)));
      });
      return button;
    }));
    elements.noteGiftCustom.disabled = !session;
    elements.noteGiftZap.disabled = true;
    status(session ? '' : 'Log in to react or zap. Nostr signs the action as you.');
    elements.noteGiftZapTarget.textContent = session ? 'Reading how this author accepts sats\u2026' : '';
    if (!elements.noteGiftDialog.open) elements.noteGiftDialog.showModal();
    if (!session) return;
    const target = await authorZapTarget(current.pubkey, relay);
    if (!target.ok) { elements.noteGiftZapTarget.textContent = target.error; return; }
    const endpoint = await zapEndpoint(target);
    if (!endpoint.ok) { elements.noteGiftZapTarget.textContent = endpoint.error; return; }
    pay = {...endpoint, address:target.address || ''};
    const floor = Math.ceil(pay.minSendable / 1000);
    const ceiling = Math.floor(pay.maxSendable / 1000);
    elements.noteGiftZapTarget.textContent = `${target.address || 'This author'} accepts ${floor}\u2013${ceiling} sats.`;
    elements.noteGiftZap.disabled = false;
  };
}
