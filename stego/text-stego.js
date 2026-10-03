// Alternative Zero-Width characters for hiding data
const ZWSP = '\u200B';  // Zero Width Space
const ZWNJ = '\u200C';  // Zero Width Non-Joiner
const ZWJ = '\u200D';   // Zero Width Joiner
const MARKER = ZWSP + ZWNJ + ZWJ;  // Unique marker to identify hidden text
const UTF8_PAYLOAD_PREFIX = ZWSP + ZWSP;

// Encrypt function
function encrypt(text, key) {
    return CryptoJS.AES.encrypt(text, key).toString();
}

// Decrypt function
function decrypt(text, key) {
    try {
        return CryptoJS.AES.decrypt(text, key).toString(CryptoJS.enc.Utf8) || "Invalid Key!";
    } catch {
        return "Invalid Key!";
    }
}

// Legacy encoder retained so messages created by earlier versions remain testable.
function textToLegacyBinary(text) {
    return Array.from(text)
        .map(char => char.codePointAt(0).toString(2).padStart(32, '0'))  // 32-bit Unicode binary
        .join(ZWSP);
}

function textToCompactBinary(text) {
    return Array.from(new TextEncoder().encode(text), byte => byte.toString(2).padStart(8, '0')).join('');
}

function clearEncodeOutput() {
    const encodedOutput = document.getElementById("encodedOutput");
    if (encodedOutput) encodedOutput.textContent = "";
}

function clearDecodeOutput() {
    const decodedOutput = document.getElementById("decodedOutput");
    if (decodedOutput) decodedOutput.textContent = "";
}

/**
 * Returns the UTF-8 byte length of a single emoji or string.
 * Useful for debugging emoji-based steganography limits.
 */
function getEmojiBytes(emoji) {
  const encoder = new TextEncoder(); // UTF-8 by default
  const bytes = encoder.encode(emoji);
  return bytes.length;
}

// Convert binary back to text
// function binaryToText(binaryString) {
//     if (!binaryString) return "";
//     return binaryString.split(ZWSP)
//         .map(bin => String.fromCodePoint(parseInt(bin, 2)))
//         .join('');
// }
function legacyBinaryToText(binaryString) {
    if (!binaryString) return "";

    return binaryString.split(ZWSP).map(bin => {
        const codePoint = parseInt(bin, 2);
        if (isNaN(codePoint) || codePoint < 0 || codePoint > 0x10FFFF) {
            console.warn(`⚠️ Skipping invalid code point: ${codePoint}`);
            return "";  // or maybe "�"
        }
        return String.fromCodePoint(codePoint);
    }).join('');
}

function compactBinaryToText(binaryString) {
    if (!binaryString || binaryString.length % 8 !== 0 || /[^01]/.test(binaryString)) return null;
    const bytes = new Uint8Array(binaryString.length / 8);
    for (let index = 0; index < bytes.length; index++) {
        bytes[index] = parseInt(binaryString.slice(index * 8, index * 8 + 8), 2);
    }
    try {
        return new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    } catch {
        return null;
    }
}

function decodeZeroWidthPayload(hiddenPart) {
    if (hiddenPart.startsWith(UTF8_PAYLOAD_PREFIX)) {
        const compactBits = hiddenPart.slice(UTF8_PAYLOAD_PREFIX.length)
            .replace(new RegExp(ZWNJ, 'g'), '0')
            .replace(new RegExp(ZWJ, 'g'), '1');
        return compactBinaryToText(compactBits);
    }
    const legacyBits = hiddenPart
        .replace(new RegExp(ZWNJ, 'g'), '0')
        .replace(new RegExp(ZWJ, 'g'), '1');
    return legacyBinaryToText(legacyBits);
}

// **Encode Function** - Handles encryption and text-only steganography
async function encodeMessage() {
    clearEncodeOutput(); // Clear the output area before encoding

    let msg1 = document.getElementById('visibleMessage').value.trim().split(MARKER)[0];  // 💥 strip old marker
    let hiddenText = document.getElementById('hiddenMessage').value.trim();
    let key = document.getElementById('encryptionKey').value;

    if (!msg1) {
        showToast("Visible message cannot be empty!");
        return;
    }
    if (!hiddenText) {
        showToast("Hidden message cannot be empty!");
        return;
    }

    // An npub selects recipient-only NIP-44 encryption; ordinary values keep
    // the original password encryption format for backwards compatibility.
    if (/^npub/i.test(key)) {
        try {
            hiddenText = window.StegoNostrRecipient.encryptForRecipient(hiddenText, key);
        } catch (error) {
            showToast(error.message || "Invalid recipient npub.");
            return;
        }
    } else if (key) {
        hiddenText = encrypt(hiddenText, key);
    }
    const hiddenBinary = textToCompactBinary(hiddenText);

    let stegoText = msg1 + MARKER + UTF8_PAYLOAD_PREFIX + hiddenBinary.replace(/0/g, ZWNJ).replace(/1/g, ZWJ);
    document.getElementById('encodedOutput').textContent = stegoText;

    showToast("Message encoded successfully!");
}


// **Decode Function** - Extracts and displays hidden text
function showDecodedText(decodedText) {
    const decodedOutput = document.getElementById('decodedOutput');
    displayTruncatedText(decodedOutput, decodedText, 300);

    const confettiTriggered = checkForConfettiTrigger(decodedText);
    if (!confettiTriggered) triggerSparkleEffect();
}

function getNostrEnvelopeFromInput() {
    const encodedMsg = document.getElementById('encodedMessage').value.trim();
    if (!encodedMsg.includes(MARKER)) return null;
    const markerIndex = encodedMsg.indexOf(MARKER);
    const payload = decodeZeroWidthPayload(encodedMsg.slice(markerIndex + MARKER.length));
    return payload === null ? null : window.StegoNostrRecipient?.parseEnvelope(payload);
}

async function decryptNostrEnvelope(envelope, method, bunkerUrl = '', source = 'text') {
    if (method === 'extension') return window.StegoNostrRecipient.decryptWithPreferredSigner(envelope, source);
    return window.StegoNostrRecipient.decryptWithBunker(envelope, bunkerUrl, authUrl => {
        window.open(authUrl, '_blank', 'noopener,noreferrer');
        showToast("Approve the request in your Nostr signer.");
    });
}

async function unlockNostrMessage(method) {
    clearDecodeOutput();
    showLoader();
    try {
        const envelope = getNostrEnvelopeFromInput();
        if (!envelope) throw new Error("Paste a Nostr-locked hidden message first.");
        const bunkerUrl = document.getElementById('bunkerUrl')?.value.trim() || '';
        const plaintext = await decryptNostrEnvelope(envelope, method, bunkerUrl, 'text');
        if (plaintext === null) return;
        showDecodedText(plaintext);
        showToast("Message unlocked for this Nostr account.");
    } catch (error) {
        showToast(error.message || "The Nostr signer could not decrypt this message.");
    } finally {
        hideLoader();
    }
}

async function decodeMessage() {
    clearDecodeOutput(); // Clear only decoding output
    showLoader(); // Show loader when decoding starts (if defined)
    
    let encodedMsg = document.getElementById('encodedMessage').value.trim();
    let key = document.getElementById('decryptionKey').value;

    // Check if the encoded message is too large to decode safely.
    const MAX_ENCODED_LENGTH = 10000000;
    if (encodedMsg.length > MAX_ENCODED_LENGTH) {
        showToast("Encoded message is too large to decode safely. Please use a smaller message.");
        hideLoader();
        return;
    }

    if (!encodedMsg.includes(MARKER)) {
        // Try alternative three-char method
        const altDecoded = decodeMessageWithThreeChar(encodedMsg, key);
        if (altDecoded) {
            document.getElementById('decodedOutput').textContent = `\n${altDecoded}`;
            // ✅ First, check for confetti trigger
            let confettiTriggered = checkForConfettiTrigger(altDecoded);
            
            // ✅ If confetti was NOT triggered, then trigger sparkles
            if (!confettiTriggered) {
                triggerSparkleEffect();
            }
        } else {
            // Last resort: try emoji-based decoding
            const emojiDecoded = decodeEmoji(encodedMsg);
            if (emojiDecoded && emojiDecoded !== "No secrets found.") {
                document.getElementById('decodedOutput').textContent = `\n${emojiDecoded}`;
                // ✅ First, check for confetti trigger
                let confettiTriggered = checkForConfettiTrigger(emojiDecoded);
                
                // ✅ If confetti was NOT triggered, then trigger sparkles
                if (!confettiTriggered) {
                    triggerSparkleEffect();
                }
            } else {
                document.getElementById('decodedOutput').textContent = "No hidden message found using any method.";
            }
        }
        hideLoader();
        return;
     }

    const markerIndex = encodedMsg.indexOf(MARKER);
    const hiddenPart = encodedMsg.slice(markerIndex + MARKER.length);
    let decodedText = decodeZeroWidthPayload(hiddenPart);
    if (decodedText === null) {
        hideLoader();
        showToast("The hidden message is incomplete or was changed by the platform.");
        return;
    }
    let nostrEnvelope = null;
    try {
        nostrEnvelope = window.StegoNostrRecipient?.parseEnvelope(decodedText);
    } catch (error) {
        hideLoader();
        showToast(error.message);
        return;
    }

    if (nostrEnvelope) {
        if (!key) {
            displayTruncatedText(document.getElementById('decodedOutput'), "This message is locked to a Nostr account. Use Sign with Nostr, a bunker, or your private key.", 300);
            hideLoader();
            return;
        }
        try {
            document.getElementById('decryptionKey').value = '';
            const warning = document.getElementById('privateKeyWarning');
            if (warning) warning.hidden = true;
            decodedText = window.StegoNostrRecipient.decryptWithSecret(nostrEnvelope, key);
        } catch (error) {
            hideLoader();
            showToast(error.message || "This private key cannot unlock the message.");
            return;
        }
    }

    const isEncrypted = decodedText.startsWith("U2FsdGVkX1"); // Detect if the message is encrypted (starts with AES prefix)

    if (isEncrypted && !key) {
        const decodedOutput = document.getElementById('decodedOutput');
        displayTruncatedText(decodedOutput, decodedText, 300); // Show it first
        hideLoader();
    
        // Slight delay ensures output renders before showToast appears
        setTimeout(() => {
            showToast("This message appears to be encrypted. Enter a decryption key to decode it.");
        }, 100);
    
        return; // ✅ Stop here, no sparkles/confetti
    }
    
    if (key && !nostrEnvelope) {
        const decrypted = decrypt(decodedText, key);
        if (decrypted === "Invalid Key!") {
            hideLoader();
            showToast("Invalid decryption key!");
            return;
        }
        decodedText = decrypted;
    }
    
    showDecodedText(decodedText);

    hideLoader(); // Hide loader when decoding is done
}



// Attach Event Listeners
document.getElementById("encodeButton")?.addEventListener("click", encodeMessage);
document.getElementById("decodeButton")?.addEventListener("click", decodeMessage);
document.getElementById("nostrSignerButton")?.addEventListener("click", () => unlockNostrMessage('extension'));
document.getElementById("showBunkerButton")?.addEventListener("click", () => {
    const controls = document.getElementById('bunkerControls');
    controls.hidden = !controls.hidden;
    if (!controls.hidden) document.getElementById('bunkerUrl').focus();
});
document.getElementById("bunkerDecryptButton")?.addEventListener("click", () => unlockNostrMessage('bunker'));
document.getElementById("nostrEventBunkerButton")?.addEventListener("click", () => {
    const controls = document.getElementById('nostrEventBunkerControls');
    controls.hidden = !controls.hidden;
    if (!controls.hidden) document.getElementById('nostrEventBunkerUrl').focus();
});

function renderRecipientPreview(state, profile, npub, previewId = 'nostrRecipientPreview') {
    const preview = document.getElementById(previewId);
    if (!preview) return;
    preview.replaceChildren();
    preview.hidden = false;
    preview.classList.toggle('is-error', state === 'error');

    if (state === 'error') {
        preview.textContent = 'That does not look like a valid npub.';
        return;
    }

    const avatar = document.createElement('img');
    avatar.className = 'nostr-recipient-avatar';
    avatar.alt = '';
    avatar.referrerPolicy = 'no-referrer';
    avatar.src = profile?.picture || '/android-chrome-192x192.png';
    avatar.addEventListener('error', () => { avatar.src = '/android-chrome-192x192.png'; }, {once: true});

    const copy = document.createElement('div');
    const label = profile?.display_name || profile?.name || profile?.nip05 || window.StegoNostrRecipient.shortNpub(npub);
    const name = document.createElement('span');
    name.className = 'nostr-recipient-name';
    name.textContent = label;
    if (profile?.nip05 && profile.nip05 !== label) {
        const nip05 = document.createElement('span');
        nip05.className = 'nostr-recipient-nip05';
        nip05.textContent = profile.nip05;
        copy.append(name, nip05);
    } else {
        copy.append(name);
    }
    const note = document.createElement('span');
    note.textContent = `Only ${label} will be able to decrypt this message.`;
    copy.append(note);
    preview.append(avatar, copy);
}

const recipientInput = document.getElementById('encryptionKey');
let recipientPreviewTimer;
let recipientPreviewRequest = 0;
recipientInput?.addEventListener('input', () => {
    clearTimeout(recipientPreviewTimer);
    const preview = document.getElementById('nostrRecipientPreview');
    const value = recipientInput.value.trim();
    if (!/^npub/i.test(value)) {
        if (preview) preview.hidden = true;
        return;
    }
    recipientPreviewTimer = setTimeout(async () => {
        const request = ++recipientPreviewRequest;
        try {
            const recipient = window.StegoNostrRecipient.parseNpub(value);
            renderRecipientPreview('ready', null, recipient.npub);
            const profile = await window.StegoNostrRecipient.fetchProfile(recipient.pubkey);
            if (request === recipientPreviewRequest) renderRecipientPreview('ready', profile, recipient.npub);
        } catch {
            if (request === recipientPreviewRequest) renderRecipientPreview('error');
        }
    }, 350);
});

const fileRecipientInput = document.getElementById('fileEncryptionKey');
let fileRecipientPreviewTimer;
let fileRecipientPreviewRequest = 0;
fileRecipientInput?.addEventListener('input', () => {
    clearTimeout(fileRecipientPreviewTimer);
    const preview = document.getElementById('fileNostrRecipientPreview');
    const value = fileRecipientInput.value.trim();
    if (!/^npub/i.test(value)) {
        if (preview) preview.hidden = true;
        return;
    }
    fileRecipientPreviewTimer = setTimeout(async () => {
        const request = ++fileRecipientPreviewRequest;
        try {
            const recipient = window.StegoNostrRecipient.parseNpub(value);
            renderRecipientPreview('ready', null, recipient.npub, 'fileNostrRecipientPreview');
            const profile = await window.StegoNostrRecipient.fetchProfile(recipient.pubkey);
            if (request === fileRecipientPreviewRequest) {
                renderRecipientPreview('ready', profile, recipient.npub, 'fileNostrRecipientPreview');
            }
        } catch {
            if (request === fileRecipientPreviewRequest) {
                renderRecipientPreview('error', null, '', 'fileNostrRecipientPreview');
            }
        }
    }, 350);
});

const decryptionInput = document.getElementById('decryptionKey');
decryptionInput?.addEventListener('input', () => {
    const warning = document.getElementById('privateKeyWarning');
    if (!warning) return;
    const value = decryptionInput.value.trim();
    warning.hidden = !(/^nsec1/i.test(value) || /^[0-9a-f]{64}$/i.test(value));
});

const nostrDecryptionInput = document.getElementById('nostrDecryptionKey');
nostrDecryptionInput?.addEventListener('input', () => {
    const warning = document.getElementById('nostrPrivateKeyWarning');
    if (!warning) return;
    const value = nostrDecryptionInput.value.trim();
    warning.hidden = !(/^nsec1/i.test(value) || /^[0-9a-f]{64}$/i.test(value));
});

const fileDecryptionInput = document.getElementById('fileDecryptionKey');
fileDecryptionInput?.addEventListener('input', () => {
    const warning = document.getElementById('filePrivateKeyWarning');
    if (!warning) return;
    const value = fileDecryptionInput.value.trim();
    warning.hidden = !(/^nsec1/i.test(value) || /^[0-9a-f]{64}$/i.test(value));
});

function handleAmberCallback() {
try {
    const amberResult = window.StegoNostrRecipient?.resumeAndroidDecryption();
    if (amberResult) {
        if (amberResult.source === 'file' && amberResult.plaintext !== undefined) {
            window.renderDecodedNostrFilePayload(amberResult.plaintext, amberResult.context);
            showToast('File secret unlocked with Amber.');
            return;
        }
        const outputId = amberResult.source === 'nostr-event' ? 'nostrOutput' :
            amberResult.source === 'file' ? 'decodedHiddenText' : 'decodedOutput';
        const output = document.getElementById(outputId);
        output.style.display = 'block';
        if (amberResult.continueId) {
            output.textContent = 'Amber confirmed the correct Nostr account. Continue to approve decryption.';
            const continueButton = document.createElement('button');
            continueButton.type = 'button';
            continueButton.className = 'amber-continue-button';
            continueButton.textContent = 'Continue in Amber';
            continueButton.addEventListener('click', () => {
                try {
                    window.StegoNostrRecipient.continueAndroidDecryption(amberResult.continueId);
                } catch (error) {
                    showToast(error.message || 'Could not reopen Amber.');
                }
            });
            output.appendChild(continueButton);
        } else {
            displayTruncatedText(output, amberResult.plaintext, 300);
            showToast('Message unlocked with Amber.');
        }
        output.scrollIntoView({behavior: 'smooth', block: 'center'});
    }
} catch (error) {
    showToast(error.message || 'Amber could not decrypt this message.');
}
}

window.addEventListener?.('load', handleAmberCallback);

document.getElementById('encodedMessage').addEventListener('focus', function() {
    let currentValue = this.value;
    if (currentValue.includes(MARKER)) {
      // Keep only the visible (carrier) text
      this.value = currentValue.split(MARKER)[0];
    }
  });
