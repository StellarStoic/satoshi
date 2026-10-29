import {
  REACTION_SET, ZAP_AMOUNTS, reactionTemplate, zapRequestTemplate, lud16ToLnurlpUrl,
  parseLnurlPay, clampZapAmount, zapCallbackUrl, parseInvoice, lnurlDecode, lnurlEncode,
  rsvpTemplate,
} from './noteGifts.mjs';
import {
  eventReferences, calendarEventFromEvent, pollFromEvent, tallyRsvps, mergeRsvpAnswers,
  tallyPollVotes, pollResponseTemplate, RSVP_KIND, RSVP_STATUSES, RSVP_LABELS, POLL_RESPONSE_KIND,
} from './stickyNotesModel.mjs';
import {getNostrSession, signNostrEvent} from './nostrSession.mjs';

const USER_RELAYS_KEY = 'satoshi:sticky:relays:v1';

function savedRelays(primary) {
  try {
    const stored = JSON.parse(localStorage.getItem(USER_RELAYS_KEY) || '[]');
    return [...new Set([primary, ...(Array.isArray(stored) ? stored : [])])]
      .filter(value => /^wss?:\/\/[^\s]+$/.test(String(value || '')));
  } catch { return [primary]; }
}

/**
 * Every event a filter answers with, from one relay.
 *
 * The same shape as the profile reader below — one socket, one subscription, EOSE or a timeout, and only events that
 * verify — but for a general filter, because the world now reads what a note points at as well as who wrote it.
 */
export function readEvents(relay, filter, {timeout = 4000} = {}) {
  return new Promise(resolve => {
    let socket;
    const found = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { socket?.close(); } catch {}
      resolve(found);
    };
    const timer = setTimeout(finish, timeout);
    try { socket = new WebSocket(relay); } catch { finish(); return; }
    const subscription = `pinstr-world-read-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    socket.addEventListener('open', () => socket.send(JSON.stringify(['REQ', subscription, filter])));
    socket.addEventListener('message', message => {
      let data;
      try { data = JSON.parse(message.data); } catch { return; }
      if (data[0] === 'EOSE' && data[1] === subscription) { finish(); return; }
      const event = data[2];
      if (data[0] !== 'EVENT' || data[1] !== subscription) return;
      if (!window.NostrTools?.verifyEvent?.(event)) return;
      found.push(event);
    });
    socket.addEventListener('error', finish);
    socket.addEventListener('close', finish);
  });
}

/** The same read, asked of every relay this reader has. */
export async function readEventsEverywhere(primary, filter) {
  const answers = await Promise.allSettled(savedRelays(primary).slice(0, 4).map(url => readEvents(url, filter)));
  const byId = new Map();
  for (const answer of answers) {
    if (answer.status !== 'fulfilled') continue;
    for (const event of answer.value) byId.set(event.id, event);
  }
  return [...byId.values()];
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
    'noteGiftDialog', 'closeNoteGift', 'noteGiftTitle', 'noteGiftAuthor', 'noteGiftStatus', 'noteGiftLogin',
    'noteGiftReactions', 'noteGiftZapTarget', 'noteGiftAmounts', 'noteGiftCustom', 'noteGiftZap', 'noteGiftInvoice',
    'noteGiftQr', 'noteGiftInvoiceHint', 'noteGiftInvoiceText', 'copyNoteGiftInvoice',
    // the two answers a note can ask for, beside its reactions
    'noteEventRsvp', 'noteEventRsvpTitle', 'noteEventRsvpWhen', 'noteEventRsvpButtons', 'noteEventRsvpCounts',
    'noteEventRsvpHint', 'notePollVote', 'notePollVoteQuestion', 'notePollVoteButtons', 'notePollVoteCounts',
    'notePollVoteHint',
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
  // What the open note points at, once a relay has said: a calendar event, a poll, or nothing.
  let reference = null;          // {kind:'calendar', card} | {kind:'poll', poll}
  let answers = new Map();       // coordinate → the answers read back (rsvp)
  let votes = [];                // the vote events read back (poll)

  const setStatus = message => { if (elements.noteGiftStatus) elements.noteGiftStatus.textContent = message || ''; };

  /** Draw the answer block this note's reference asks for, and hide the other one. */
  function paintReference() {
    if (!elements.noteEventRsvp || !elements.notePollVote) return;
    const session = getNostrSession();
    const card = reference?.kind === 'calendar' ? reference.card : null;
    const poll = reference?.kind === 'poll' ? reference.poll : null;
    elements.noteEventRsvp.hidden = !card;
    elements.notePollVote.hidden = !poll;
    if (elements.noteGiftTitle) {
      elements.noteGiftTitle.textContent = poll ? 'Vote on this poll'
        : card ? 'Respond to this event' : 'React or zap this note';
    }
    if (card) {
      elements.noteEventRsvpTitle.textContent = card.title;
      elements.noteEventRsvpWhen.textContent = [card.when, card.location].filter(Boolean).join(' · ');
      const {counts, total} = tallyRsvps(answers.get(card.coordinate) || new Map());
      const mine = session ? (answers.get(card.coordinate) || new Map()).get(session.pubkey)?.status : '';
      elements.noteEventRsvpButtons.replaceChildren(...RSVP_STATUSES.map(status => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.rsvpStatus = status;
        button.textContent = `${RSVP_LABELS[status]}${counts[status] ? ` · ${counts[status]}` : ''}`;
        button.setAttribute('aria-pressed', String(mine === status));
        button.disabled = !session;
        button.title = session ? `Answer ${RSVP_LABELS[status].toLowerCase()}` : 'Log in to respond to this event';
        button.addEventListener('click', () => answerEvent(card, status));
        return button;
      }));
      elements.noteEventRsvpCounts.textContent = total
        ? `${total} ${total === 1 ? 'person has answered' : 'people have answered'}` : 'Nobody has answered yet';
      elements.noteEventRsvpHint.textContent = session ? '' : 'Log in to respond to this event';
    }
    if (poll) {
      elements.notePollVoteQuestion.textContent = poll.question;
      const {counts, voters, total} = tallyPollVotes(votes, {type: poll.type});
      const mine = session ? voters.get(session.pubkey) || [] : [];
      elements.notePollVoteButtons.replaceChildren(...poll.options.map(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.pollOption = option.id;
        const count = counts.get(option.id) || 0;
        button.textContent = count ? `${option.label} · ${count}` : option.label;
        button.setAttribute('aria-pressed', String(mine.includes(option.id)));
        button.disabled = !session || poll.closed;
        button.title = poll.closed ? 'Voting on this poll has closed'
          : session ? `Vote for ${option.label}` : 'Log in to vote on this poll';
        button.addEventListener('click', () => voteOnPoll(poll, option.id));
        return button;
      }));
      elements.notePollVoteCounts.textContent = poll.closed
        ? `${total} ${total === 1 ? 'person voted' : 'people voted'} · voting has closed`
        : total ? `${total} ${total === 1 ? 'person has voted' : 'people have voted'}` : 'Nobody has voted yet';
      elements.notePollVoteHint.textContent = !session ? 'Log in to vote on this poll'
        : poll.type === 'multiplechoice' ? 'Pick as many as you like; your newest vote is the one that counts.' : '';
    }
  }

  /** Read the note's reference, and whichever answers belong to it. */
  async function loadReference(note) {
    reference = null;
    answers = new Map();
    votes = [];
    const bech32 = eventReferences(note?.content)[0] || '';
    if (!bech32) { paintReference(); return; }
    let decoded = null;
    try { decoded = window.NostrTools?.nip19?.decode?.(bech32); } catch { decoded = null; }
    if (!decoded) { paintReference(); return; }
    const filter = decoded.type === 'naddr'
      ? {kinds: [decoded.data.kind], authors: [decoded.data.pubkey], '#d': [decoded.data.identifier], limit: 1}
      : decoded.type === 'nevent' ? {ids: [decoded.data.id], limit: 1} : null;
    if (!filter) { paintReference(); return; }
    const events = await readEventsEverywhere(relay, filter);
    const event = events.sort((left, right) => right.created_at - left.created_at)[0];
    if (!event) { paintReference(); return; }
    const poll = pollFromEvent(event);
    if (poll) {
      reference = {kind:'poll', poll};
      votes = (await readEventsEverywhere(relay, {kinds:[POLL_RESPONSE_KIND], '#e':[poll.id], limit:500}))
        .filter(vote => vote.kind === POLL_RESPONSE_KIND);
    } else {
      const card = calendarEventFromEvent(event);
      if (!card) { paintReference(); return; }
      reference = {kind:'calendar', card};
      const read = await readEventsEverywhere(relay, {kinds:[RSVP_KIND], '#a':[card.coordinate], limit:500});
      answers = new Map([[card.coordinate, mergeRsvpAnswers(new Map(), read)]]);
    }
    paintReference();
  }

  const answerEvent = async (card, status) => {
    const session = getNostrSession();
    if (!session) { if (elements.noteEventRsvpHint) elements.noteEventRsvpHint.textContent = 'Log in to respond to this event'; return; }
    try {
      const template = rsvpTemplate({coordinate:card.coordinate, status, eventId:card.id, authorPubkey:card.pubkey,
        relay, pubkey:session.pubkey});
      const signed = await signNostrEvent(template, {action:'rsvp', coordinate:card.coordinate, status});
      if (!signed) { if (elements.noteEventRsvpHint) elements.noteEventRsvpHint.textContent = 'Approve the answer in your signer, then come back to this page.'; return; }
      const took = await publish(signed, relays());
      if (!took) { if (elements.noteEventRsvpHint) elements.noteEventRsvpHint.textContent = 'No relay took the answer. Try again in a moment.'; return; }
      const known = answers.get(card.coordinate) || new Map();
      known.set(signed.pubkey || session.pubkey, {status, at:signed.created_at || Math.floor(Date.now()/1000)});
      answers.set(card.coordinate, known);
      paintReference();
      if (elements.noteEventRsvpHint) elements.noteEventRsvpHint.textContent = `Answer sent: ${RSVP_LABELS[status]}.`;
    } catch (error) {
      if (elements.noteEventRsvpHint) elements.noteEventRsvpHint.textContent = error.message || 'That answer could not be sent.';
    }
  };

  const voteOnPoll = async (poll, optionId) => {
    const session = getNostrSession();
    if (!session) { if (elements.notePollVoteHint) elements.notePollVoteHint.textContent = 'Log in to vote on this poll'; return; }
    if (poll.closed) { if (elements.notePollVoteHint) elements.notePollVoteHint.textContent = 'Voting on this poll has closed.'; return; }
    try {
      const {voters} = tallyPollVotes(votes, {type:poll.type});
      const chosen = new Set(voters.get(session.pubkey) || []);
      let optionIds;
      if (poll.type === 'multiplechoice') {
        if (chosen.has(optionId)) chosen.delete(optionId); else chosen.add(optionId);
        optionIds = [...chosen];
        if (!optionIds.length) { if (elements.notePollVoteHint) elements.notePollVoteHint.textContent = 'A vote needs at least one answer picked.'; return; }
      } else {
        optionIds = [optionId];
      }
      const template = pollResponseTemplate({pollId:poll.id, optionIds, pollPubkey:poll.pubkey,
        relay, pubkey:session.pubkey});
      const signed = await signNostrEvent(template, {action:'vote', pollId:poll.id, optionIds});
      if (!signed) { if (elements.notePollVoteHint) elements.notePollVoteHint.textContent = 'Approve the vote in your signer, then come back to this page.'; return; }
      const took = await publish(signed, relays());
      if (!took) { if (elements.notePollVoteHint) elements.notePollVoteHint.textContent = 'No relay took your vote. Try again in a moment.'; return; }
      votes = [...votes.filter(vote => vote.id !== signed.id), signed];
      paintReference();
      const label = optionIds.map(id => poll.options.find(option => option.id === id)?.label).filter(Boolean).join(', ');
      if (elements.notePollVoteHint) elements.notePollVoteHint.textContent = `Your vote: ${label}.`;
    } catch (error) {
      if (elements.notePollVoteHint) elements.notePollVoteHint.textContent = error.message || 'That vote could not be sent.';
    }
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
    // The note may carry a calendar event or a poll: the answers are drawn as soon as the reference resolves, and they
    // are drawn for a reader with no identity too — disabled, with the sentence that says why, as on the 2D board.
    reference = null;
    answers = new Map();
    votes = [];
    paintReference();
    loadReference(current).catch(() => {});
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
