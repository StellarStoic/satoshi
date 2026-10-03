(function () {
  'use strict';

  const ENVELOPE_PREFIX = 'n44|';
  const PROFILE_RELAYS = [
    'wss://relay.damus.io/',
    'wss://nos.lol/',
    'wss://relay.ditto.pub/'
  ];
  const NIP55_STORAGE_PREFIX = 'satoshi:nip55:';
  const NIP55_SESSION_PUBKEY = 'satoshi:nip55:pubkey';
  const NIP55_MAX_AGE = 30 * 60 * 1000;

  function requireTools() {
    if (!window.NostrTools) throw new Error('Nostr encryption tools did not load.');
    return window.NostrTools;
  }

  function parseNpub(value) {
    const clean = String(value || '').trim().toLowerCase();
    const decoded = requireTools().nip19.decode(clean);
    if (decoded.type !== 'npub' || !/^[0-9a-f]{64}$/.test(decoded.data)) {
      throw new Error('Enter a valid Nostr npub.');
    }
    return {npub: clean, pubkey: decoded.data};
  }

  function shortNpub(npub) {
    return `${npub.slice(0, 9)}...${npub.slice(-4)}`;
  }

  function parseEnvelope(value) {
    if (!String(value || '').startsWith(ENVELOPE_PREFIX)) return null;
    const parts = value.split('|');
    if (parts.length !== 4 || !/^[0-9a-f]{64}$/.test(parts[1]) ||
        !/^[0-9a-f]{64}$/.test(parts[2]) || !parts[3]) {
      throw new Error('The Nostr-locked message is incomplete or damaged.');
    }
    return {recipientPubkey: parts[1], senderPubkey: parts[2], ciphertext: parts[3]};
  }

  function hexToBytes(hex) {
    if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('Private key must be an nsec or 64 hexadecimal characters.');
    return Uint8Array.from(hex.match(/.{2}/g), byte => Number.parseInt(byte, 16));
  }

  function secretBytes(value) {
    const clean = String(value || '').trim();
    if (/^nsec1/i.test(clean)) {
      const decoded = requireTools().nip19.decode(clean.toLowerCase());
      if (decoded.type !== 'nsec' || !(decoded.data instanceof Uint8Array)) throw new Error('Invalid nsec private key.');
      return new Uint8Array(decoded.data);
    }
    return hexToBytes(clean);
  }

  function conversationKey(secretKey, publicKey) {
    return requireTools().nip44.v2.utils.getConversationKey(secretKey, publicKey);
  }

  function encryptForRecipient(plaintext, npub) {
    const tools = requireTools();
    const recipient = parseNpub(npub);
    const ephemeralSecret = tools.generateSecretKey();
    try {
      const senderPubkey = tools.getPublicKey(ephemeralSecret);
      const ciphertext = tools.nip44.v2.encrypt(plaintext, conversationKey(ephemeralSecret, recipient.pubkey));
      return `${ENVELOPE_PREFIX}${recipient.pubkey}|${senderPubkey}|${ciphertext}`;
    } finally {
      ephemeralSecret.fill(0);
    }
  }

  function assertRecipient(actual, expected) {
    if (actual !== expected) throw new Error('This message is locked to a different Nostr account.');
  }

  function decryptWithSecret(envelope, value) {
    const tools = requireTools();
    const secret = secretBytes(value);
    try {
      assertRecipient(tools.getPublicKey(secret), envelope.recipientPubkey);
      return tools.nip44.v2.decrypt(envelope.ciphertext, conversationKey(secret, envelope.senderPubkey));
    } finally {
      secret.fill(0);
    }
  }

  async function decryptWithExtension(envelope) {
    if (!window.nostr?.getPublicKey || !window.nostr?.nip44?.decrypt) {
      throw new Error('No NIP-07 signer with NIP-44 support was found.');
    }
    const publicKey = await window.nostr.getPublicKey();
    assertRecipient(publicKey, envelope.recipientPubkey);
    return window.nostr.nip44.decrypt(envelope.senderPubkey, envelope.ciphertext);
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || '');
  }

  function requestId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function callbackUrl(id) {
    return `${location.origin}${location.pathname}#nip55_result=${id}.`;
  }

  function saveNip55State(id, state) {
    const value = JSON.stringify(state);
    let saved = false;
    for (const storageName of ['localStorage', 'sessionStorage']) {
      try {
        const storage = window[storageName];
        storage.setItem(NIP55_STORAGE_PREFIX + id, value);
        saved = true;
      } catch {}
    }
    if (!saved) throw new Error('Browser storage is required to return safely from Amber.');
  }

  function loadNip55State(id) {
    for (const storageName of ['localStorage', 'sessionStorage']) {
      try {
        const storage = window[storageName];
        const value = storage.getItem(NIP55_STORAGE_PREFIX + id);
        if (value) return JSON.parse(value);
      } catch {}
    }
    return null;
  }

  function clearNip55State(id) {
    for (const storageName of ['localStorage', 'sessionStorage']) {
      try { window[storageName].removeItem(NIP55_STORAGE_PREFIX + id); } catch {}
    }
  }

  function rememberedAndroidPubkey() {
    try { return sessionStorage.getItem(NIP55_SESSION_PUBKEY); } catch { return null; }
  }

  function rememberAndroidPubkey(pubkey) {
    try { sessionStorage.setItem(NIP55_SESSION_PUBKEY, pubkey); } catch {}
  }

  function openAndroidSigner(type, payload, options, id) {
    const params = new URLSearchParams({
      type,
      callbackUrl: callbackUrl(id),
      ...options
    });
    location.assign(`nostrsigner:${encodeURIComponent(payload)}?${params.toString()}`);
  }

  function beginAndroidDecryption(envelope, source = 'text', context = null) {
    if (!isAndroid()) throw new Error('No NIP-07 browser signer was found. On Android, this button opens Amber.');
    const id = requestId();
    const knownPubkey = rememberedAndroidPubkey();
    const hasMatchingSession = knownPubkey === envelope.recipientPubkey;
    saveNip55State(id, {
      stage: hasMatchingSession ? 'nip44_decrypt' : 'get_public_key',
      createdAt: Date.now(),
      source,
      envelope,
      context,
      currentUser: hasMatchingSession ? knownPubkey : null
    });
    if (hasMatchingSession) {
      openAndroidSigner('nip44_decrypt', envelope.ciphertext, {
        pubkey: envelope.senderPubkey,
        current_user: knownPubkey
      }, id);
      return;
    }
    openAndroidSigner('get_public_key', '', {
      permissions: JSON.stringify([{type: 'nip44_decrypt'}])
    }, id);
  }

  function readNip55Callback() {
    const match = location.hash.match(/^#nip55_result=([a-z0-9-]+)\.(.*)$/i);
    if (!match) return null;
    let result;
    try {
      result = decodeURIComponent(match[2]);
    } catch {
      result = match[2];
    }
    history.replaceState(null, '', location.pathname + location.search);
    return {id: match[1], result};
  }

  function resumeAndroidDecryption() {
    const callback = readNip55Callback();
    if (!callback) return null;
    const state = loadNip55State(callback.id);
    if (!state) throw new Error('The Amber request expired or belongs to another browser. Please try again.');
    if (!state.createdAt || Date.now() - state.createdAt > NIP55_MAX_AGE) {
      clearNip55State(callback.id);
      throw new Error('The Amber request expired. Please try again.');
    }

    if (state.stage === 'get_public_key') {
      const publicKey = callback.result.trim().toLowerCase();
      try {
        assertRecipient(publicKey, state.envelope.recipientPubkey);
      } catch (error) {
        clearNip55State(callback.id);
        throw error;
      }
      state.stage = 'nip44_decrypt';
      state.currentUser = publicKey;
      saveNip55State(callback.id, state);
      rememberAndroidPubkey(publicKey);
      return {continueId: callback.id, source: state.source};
    }

    if (state.stage !== 'nip44_decrypt') {
      clearNip55State(callback.id);
      throw new Error('Amber returned an unknown request state.');
    }
    clearNip55State(callback.id);
    return {plaintext: callback.result, source: state.source, context: state.context || null};
  }

  function continueAndroidDecryption(id) {
    const state = loadNip55State(id);
    if (!state || state.stage !== 'nip44_decrypt' || !state.currentUser) {
      throw new Error('The Amber request expired. Please start again.');
    }
    openAndroidSigner('nip44_decrypt', state.envelope.ciphertext, {
      pubkey: state.envelope.senderPubkey,
      current_user: state.currentUser
    }, id);
  }

  async function decryptWithPreferredSigner(envelope, source = 'text', context = null) {
    if (window.nostr?.getPublicKey && window.nostr?.nip44?.decrypt) {
      return decryptWithExtension(envelope);
    }
    beginAndroidDecryption(envelope, source, context);
    return null;
  }

  function withTimeout(promise, milliseconds, message) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function decryptWithBunker(envelope, bunkerUrl, onAuth) {
    if (!window.NostrBunker) throw new Error('Nostr bunker tools did not load.');
    const pointer = await window.NostrBunker.parseBunkerInput(String(bunkerUrl || '').trim());
    if (!pointer?.pubkey || !pointer.relays?.length) throw new Error('Enter a bunker:// link containing at least one relay.');

    const clientSecret = requireTools().generateSecretKey();
    const signer = window.NostrBunker.BunkerSigner.fromBunker(clientSecret, pointer, {
      onauth: url => {
        if (typeof onAuth === 'function') onAuth(url);
        else window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
    try {
      await withTimeout(signer.connect({name: 'satoshi.si Steganography', url: location.origin + '/stego.html'}), 90000,
        'The bunker did not approve the connection in time.');
      const publicKey = await withTimeout(signer.getPublicKey(), 90000, 'The bunker did not return its public key in time.');
      assertRecipient(publicKey, envelope.recipientPubkey);
      return await withTimeout(signer.nip44Decrypt(envelope.senderPubkey, envelope.ciphertext), 90000,
        'The bunker did not approve decryption in time.');
    } finally {
      await signer.close().catch(() => {});
      clientSecret.fill(0);
    }
  }

  function fetchProfile(pubkey, timeoutMs = 5500) {
    return new Promise(resolve => {
      const sockets = [];
      const subscription = `profile-${Math.random().toString(36).slice(2)}`;
      let finished = false;
      const finish = profile => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        sockets.forEach(socket => {
          try { socket.send(JSON.stringify(['CLOSE', subscription])); } catch {}
          try { socket.close(); } catch {}
        });
        resolve(profile);
      };
      const timer = setTimeout(() => finish(null), timeoutMs);

      PROFILE_RELAYS.forEach(relay => {
        try {
          const socket = new WebSocket(relay);
          sockets.push(socket);
          socket.addEventListener('open', () => socket.send(JSON.stringify([
            'REQ', subscription, {kinds: [0], authors: [pubkey], limit: 1}
          ])));
          socket.addEventListener('message', event => {
            try {
              const message = JSON.parse(event.data);
              if (message[0] !== 'EVENT' || message[1] !== subscription || message[2]?.pubkey !== pubkey ||
                  !requireTools().verifyEvent(message[2])) return;
              finish(JSON.parse(message[2].content));
            } catch {}
          });
        } catch {}
      });
    });
  }

  window.StegoNostrRecipient = {
    ENVELOPE_PREFIX,
    parseNpub,
    shortNpub,
    parseEnvelope,
    encryptForRecipient,
    decryptWithSecret,
    decryptWithExtension,
    decryptWithPreferredSigner,
    beginAndroidDecryption,
    resumeAndroidDecryption,
    continueAndroidDecryption,
    decryptWithBunker,
    fetchProfile
  };
})();
