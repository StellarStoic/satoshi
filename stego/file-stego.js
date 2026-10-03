// Marker for file steganography payload
const FILE_MARKER = "STEGOFILE||";
let currentStegoObjectUrl = "";

const CARRIER_MIME_TYPES = {
  bmp: "image/bmp",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  ogg: "audio/ogg",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  wav: "audio/wav",
  webm: "video/webm",
  webp: "image/webp",
  zip: "application/zip"
};

function stegoCarrierName(name) {
  const safeName = String(name || "carrier.bin").split(/[\\/]/).pop() || "carrier.bin";
  return safeName.startsWith("stego_") ? safeName : `stego_${safeName}`;
}

function carrierMimeType(file) {
  if (file?.type && file.type !== "text/plain") return file.type;
  const extension = String(file?.name || "").split(".").pop().toLowerCase();
  return CARRIER_MIME_TYPES[extension] || file?.type || "application/octet-stream";
}

// Helper functions for Base64 conversion
function arrayBufferToBase64(buffer) {
  let binary = '';
  let bytes = new Uint8Array(buffer);
  let len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  let binary_string = window.atob(base64);
  let len = binary_string.length;
  let bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// Encrypt/decrypt functions for file steganography (using Base64 strings)
function encryptFileData(dataStr, key) {
  return CryptoJS.AES.encrypt(dataStr, key).toString();
}

function decryptFileData(encryptedData, key) {
  try {
    return CryptoJS.AES.decrypt(encryptedData, key).toString(CryptoJS.enc.Utf8) || "Invalid Key!";
  } catch (e) {
    return "Invalid Key!";
  }
}

function parseDecodedFilePayload(payloadText) {
  try {
    const payload = JSON.parse(payloadText);
    if (!payload || typeof payload !== "object" || !payload.data || !payload.type) {
      throw new Error("No valid hidden data found.");
    }
    return payload;
  } catch (error) {
    if (error.message === "No valid hidden data found.") throw error;
    throw new Error("Failed to parse hidden data.");
  }
}

function randomFileEncryptionKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return window.btoa(binary);
}

function createNostrFilePayload(hiddenMeta, npub) {
  const fileKey = randomFileEncryptionKey();
  return JSON.stringify({
    v: 1,
    key: window.StegoNostrRecipient.encryptForRecipient(fileKey, npub),
    data: encryptFileData(JSON.stringify(hiddenMeta), fileKey)
  });
}

function parseNostrFilePayload(payloadText) {
  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    throw new Error("The Nostr-locked file payload is damaged.");
  }
  if (payload?.v !== 1 || typeof payload.key !== 'string' || typeof payload.data !== 'string') {
    throw new Error("The Nostr-locked file payload is damaged.");
  }
  const envelope = window.StegoNostrRecipient.parseEnvelope(payload.key);
  if (!envelope) throw new Error("The Nostr recipient key is missing from this file.");
  return {envelope, encryptedData: payload.data};
}

function decryptNostrFilePayload(fileKey, encryptedData) {
  const decrypted = decryptFileData(encryptedData, fileKey);
  if (decrypted === "Invalid Key!") throw new Error("The file payload could not be decrypted.");
  return parseDecodedFilePayload(decrypted);
}

// Encode a file into a carrier file with extra info
function encodeFileStego() {
    clearFileStegoOutputs();  // ✅ Clear before encoding again
    showLoader(); // Show the loader when starting

  const carrierInput = document.getElementById('carrierFile');
  const hiddenInput = document.getElementById('fileHiddenFile');
  const hiddenTextInput = document.getElementById('hiddenText').value.trim();
  const encryptionKey = document.getElementById('fileEncryptionKey').value;



  if (carrierInput.files.length === 0) {
    showToast("Please select a carrier file.");
    hideLoader(); // Hide loader on error
    return;
  }

  if (hiddenInput.files.length > 0 && hiddenTextInput !== "") {
    showToast("You can only hide either a file or text, not both. Please choose one.");
    hideLoader();
    return;
  }

  if (hiddenInput.files.length === 0 && hiddenTextInput === "") {
    showToast("Please enter hidden text or select a hidden file.");
    hideLoader(); // Hide loader on error
    return;
  }

  const carrierFile = carrierInput.files[0];

  // 🖼️ If the carrier file is an image, show a thumbnail preview
  if (carrierFile.type.startsWith("image/")) {
    const thumbnail = document.getElementById("carrierThumbnail");
    thumbnail.src = URL.createObjectURL(carrierFile);
    thumbnail.style.display = "block";
  }

  let hiddenMeta = null;

  if (hiddenInput.files.length > 0) {
    const hiddenFile = hiddenInput.files[0];
    const readerHidden = new FileReader();

    readerHidden.onload = function (eHidden) {
      let hiddenData = hiddenFile.type.startsWith("image/")
        ? eHidden.target.result
        : arrayBufferToBase64(eHidden.target.result);

      hiddenMeta = {
        name: hiddenFile.name,
        type: hiddenFile.type,
        data: hiddenData,
      };

      proceedWithEncoding(hiddenMeta, carrierFile, encryptionKey);
    };

    if (hiddenFile.type.startsWith("image/")) {
      readerHidden.readAsDataURL(hiddenFile);
    } else {
      readerHidden.readAsArrayBuffer(hiddenFile);
    }
  } else {
    // Only hidden text is provided
    hiddenMeta = {
      name: "hidden_text.txt",
      type: "text/plain",
    //   data: window.btoa(hiddenTextInput),
    data: btoa(unescape(encodeURIComponent(hiddenTextInput))), // Ensure UTF-8 encoding,
    };
    proceedWithEncoding(hiddenMeta, carrierFile, encryptionKey);
  }
}

// Handles encoding process
function proceedWithEncoding(hiddenMeta, carrierFile, encryptionKey) {
  const readerCarrier = new FileReader();
  readerCarrier.onload = function (eCarrier) {
    let payloadStr;
    let flag;

    if (/^npub/i.test(encryptionKey.trim())) {
      try {
        payloadStr = createNostrFilePayload(hiddenMeta, encryptionKey);
        flag = "N44";
      } catch (error) {
        hideLoader();
        showToast(error.message || "Invalid recipient npub.");
        return;
      }
    } else if (encryptionKey.trim() !== "") {
      payloadStr = encryptFileData(JSON.stringify(hiddenMeta), encryptionKey);
      flag = "ENC";
    } else {
      payloadStr = JSON.stringify(hiddenMeta);
      flag = "RAW";
    }

    // Build payload string: marker + flag + delimiter + payloadStr
    const payload = FILE_MARKER + flag + "||" + payloadStr;

    const carrierBytes = new Uint8Array(eCarrier.target.result);
    const payloadBytes = new TextEncoder().encode(payload);
    const combined = new Uint8Array(carrierBytes.length + payloadBytes.length);
    combined.set(carrierBytes);
    combined.set(payloadBytes, carrierBytes.length);

    const outputName = stegoCarrierName(carrierFile.name);
    const outputType = carrierMimeType(carrierFile);
    const stegoFile = new File([combined], outputName, {
      type: outputType,
      lastModified: Date.now()
    });
    if (currentStegoObjectUrl) URL.revokeObjectURL(currentStegoObjectUrl);
    currentStegoObjectUrl = URL.createObjectURL(stegoFile);

    const encodedOutput = document.getElementById('encodedFileTextOutput');
    encodedOutput.textContent = `${outputName} is ready. It remains a ${outputType} carrier file with the secret appended to its original bytes.`;
    encodedOutput.style.display = 'block';

    const downloadLink = document.getElementById('stegoDownloadLink');
    downloadLink.href = currentStegoObjectUrl;
    downloadLink.download = outputName;
    downloadLink.type = outputType;
    downloadLink.style.display = 'block';
    downloadLink.textContent = `Download ${outputName}`;

    hideLoader(); // Hide the loader when finished
  };

  readerCarrier.readAsArrayBuffer(carrierFile);
}

// Decode a hidden file from a stego file and restore its original name and type
async function decodeFileStego(nostrMethod = '') {
    clearFileStegoOutputs(); // ✅ clear all old content
    showLoader(); // Show loader as early as possible
  const stegoInput = document.getElementById('stegoFile');
  const stegoUrl = document.getElementById('stegoFileUrl').value.trim();
  const decryptionKey = document.getElementById('fileDecryptionKey').value;
  window.pendingFileNostrPayload = null;

  let fileBuffer = null;

  // If user provides a URL and no local file, fetch from URL
  if (stegoInput.files.length === 0 && stegoUrl) {
    try {
      const response = await fetch(stegoUrl);
      if (!response.ok) throw new Error("Failed to fetch the file from the URL.");
      fileBuffer = await response.arrayBuffer();
    } catch (error) {
        hideLoader(); // ✅ hide on fetch fail
      showToast("Error fetching file: " + error.message);
      return;
    }
  } else if (stegoInput.files.length > 0) {
    fileBuffer = await stegoInput.files[0].arrayBuffer();
  } else {
    hideLoader(); // ✅ hide on fetch fail
    showToast("Please select a file or enter a file URL.");
    return;
  }

    const bytes = new Uint8Array(fileBuffer);
    let text = new TextDecoder().decode(bytes);

    // Look for the marker in the text
    const markerIndex = text.lastIndexOf(FILE_MARKER);
    if (markerIndex === -1) {
    hideLoader(); // ✅ hide on fetch fail
      showToast("No hidden file or text found.");
      return;
    }

    const payloadText = text.substring(markerIndex + FILE_MARKER.length);
    const firstDelimiter = payloadText.indexOf("||");

    if (firstDelimiter === -1) {
    hideLoader(); // ✅ hide on fetch fail  
      showToast("Invalid payload format.");
      return;
    }

    const flag = payloadText.substring(0, firstDelimiter).trim();
    const payloadStr = payloadText.substring(firstDelimiter + 2).trim();

    if (nostrMethod && flag !== "N44") {
      hideLoader();
      showToast("This carrier is not locked to a Nostr recipient. Use Decode File with its password, if one was set.");
      return;
    }

    let payloadJSON;
    if (flag === "N44") {
      let nostrPayload;
      try {
        nostrPayload = parseNostrFilePayload(payloadStr);
      } catch (error) {
        hideLoader();
        showToast(error.message || "The Nostr-locked file payload is damaged.");
        return;
      }
      window.pendingFileNostrPayload = nostrPayload;
      if (nostrMethod) {
        hideLoader();
        await unlockFileNostrPayload(nostrMethod);
        return;
      }
      if (decryptionKey.trim() === "") {
        hideLoader();
        showToast("This file secret is locked to a Nostr account. Use Sign with Nostr, a bunker, or your private key.");
        return;
      }
      try {
        document.getElementById('fileDecryptionKey').value = '';
        const warning = document.getElementById('filePrivateKeyWarning');
        if (warning) warning.hidden = true;
        const fileKey = window.StegoNostrRecipient.decryptWithSecret(nostrPayload.envelope, decryptionKey);
        payloadJSON = decryptNostrFilePayload(
          fileKey,
          nostrPayload.encryptedData
        );
      } catch (error) {
        hideLoader();
        showToast(error.message || "This private key cannot unlock the file secret.");
        return;
      }
    } else if (flag === "ENC") {
      if (decryptionKey.trim() === "") {
        hideLoader(); // ✅ hide on fetch fail
        showToast("Decryption key required for encrypted data.");
        return;
      }

      const decrypted = decryptFileData(payloadStr, decryptionKey);
      if (decrypted === "Invalid Key!") {
        hideLoader(); // ✅ hide on fetch fail
        showToast("Invalid decryption key!");
        return;
      }

      try {
        payloadJSON = JSON.parse(decrypted);
      } catch (e) {
        hideLoader(); // ✅ hide on fetch fail
        showToast("Failed to parse hidden data.");
        return;
      }
    } else {
      try {
        payloadJSON = JSON.parse(payloadStr);
      } catch (e) {
        hideLoader(); // ✅ hide on fetch fail
        showToast("Failed to parse hidden data.");
        return;
      }
    }

    renderDecodedFilePayload(payloadJSON);
}

function renderDecodedFilePayloadText(payloadText) {
  const payload = parseDecodedFilePayload(payloadText);
  renderDecodedFilePayload(payload);
}

function renderDecodedFilePayload(payloadJSON) {
    if (!payloadJSON || !payloadJSON.data || !payloadJSON.type) {
      hideLoader();
      showToast("No valid hidden data found.");
      return;
    }

    if (payloadJSON.type.startsWith("image/")) {
        // Display image preview as before
        const imgPreview = document.getElementById("decodedThumbnail");
        imgPreview.src = payloadJSON.data.startsWith("data:")
            ? payloadJSON.data
            : `data:${payloadJSON.type};base64,${payloadJSON.data}`;
        imgPreview.style.display = "block";
        hideLoader(); // ✅ hide on fetch fail

        // ✅ Ensure the download button exists and is placed correctly
        let downloadLink = document.getElementById("imageHiddenDownloadLink");

        if (!downloadLink) {
            downloadLink = document.createElement("a");
            downloadLink.id = "imageHiddenDownloadLink";
            downloadLink.textContent = "Download Decoded Image";
            downloadLink.className = "download-button";
            downloadLink.style.display = "none"; // Initially hidden
        }

        downloadLink.href = payloadJSON.data.startsWith("data:")
            ? payloadJSON.data
            : `data:${payloadJSON.type};base64,${payloadJSON.data}`;
        downloadLink.download = payloadJSON.name || "decoded_image.png";
        downloadLink.style.display = "block"; // Make it visible
        downloadLink.style.color = 'var(--background-reverse-color)'; // Make it visible

        // Place btn below the decoded image
        const thumbnailContainer = document.querySelector(".decodedImage-thumbnail-container");
        if (thumbnailContainer && !thumbnailContainer.contains(downloadLink)) {
            thumbnailContainer.appendChild(downloadLink);
        }

        // 🎇 Trigger sparkle effect for successful image extraction
        triggerSparkleEffect();


      } else if (payloadJSON.type === "text/plain") {
        // For plain text, decode and display in the text container
        // Convert Base64 to UTF-8 correctly
        const decodedText = decodeURIComponent(escape(atob(payloadJSON.data))); 
        const textContainer = document.getElementById("decodedHiddenText");
        displayTruncatedText(textContainer, decodedText, 300);
        textContainer.style.display = "block";


        // ✅ First, check if confetti should trigger
        let confettiTriggered = checkForConfettiTrigger(decodedText);
        
        // ✅ If confetti did NOT trigger, then trigger sparkles
        if (!confettiTriggered) {
            triggerSparkleEffect();
        }

        hideLoader(); // ✅ hide on fetch fail

        // ✅ Get the existing copy button and make it visible
        let copyButton = document.getElementById("copyDecodedTextButton");
        if (copyButton) {
            copyButton.style.display = "inline-block";
        }

        // ✅ Update the function to copy the correct text
        copyButton.onclick = function () {
            navigator.clipboard.writeText(decodedText).then(() => {
                showToast("Copied to clipboard!");
            }).catch(err => {
                showToast("Failed to copy!");
            });
        };

      } else {
        // For any other type, treat it as a downloadable file
        const hiddenBuffer = base64ToArrayBuffer(payloadJSON.data);
        const hiddenBlob = new Blob([hiddenBuffer], { type: payloadJSON.type || "application/octet-stream" });
        const downloadLink = document.getElementById('fileHiddenDownloadLink');
        downloadLink.download = payloadJSON.name || "extracted_hidden_file";
        downloadLink.href = URL.createObjectURL(hiddenBlob);
        downloadLink.style.display = 'block';
        downloadLink.style.color = 'var(--background-reverse-color)';
        downloadLink.textContent = "Download Hidden File";

        hideLoader(); // ✅ hide on fetch fail

        // 🎇 Trigger sparkle effect for extracted hidden files
        triggerSparkleEffect();
      }
}

window.renderDecodedFilePayloadText = renderDecodedFilePayloadText;
window.renderDecodedNostrFilePayload = function (fileKey, context) {
  if (!context?.encryptedData) throw new Error("The encrypted file payload was not preserved.");
  renderDecodedFilePayload(decryptNostrFilePayload(fileKey, context.encryptedData));
};

async function unlockFileNostrPayload(method) {
  const nostrPayload = window.pendingFileNostrPayload;
  if (!nostrPayload) {
    await decodeFileStego(method);
    return;
  }
  showLoader();
  try {
    let plaintext;
    if (method === 'extension') {
      plaintext = await window.StegoNostrRecipient.decryptWithPreferredSigner(
        nostrPayload.envelope,
        'file',
        {encryptedData: nostrPayload.encryptedData}
      );
      if (plaintext === null) return;
    } else {
      const bunkerUrl = document.getElementById('fileNostrBunkerUrl').value.trim();
      plaintext = await window.StegoNostrRecipient.decryptWithBunker(nostrPayload.envelope, bunkerUrl, authUrl => {
        window.open(authUrl, '_blank', 'noopener,noreferrer');
        showToast("Approve the request in your Nostr signer.");
      });
    }
    renderDecodedFilePayload(decryptNostrFilePayload(plaintext, nostrPayload.encryptedData));
    showToast("File secret unlocked for this Nostr account.");
  } catch (error) {
    showToast(error.message || "The Nostr signer could not unlock this file secret.");
  } finally {
    hideLoader();
  }
}

document.getElementById('decodeFileButton')?.addEventListener('click', () => decodeFileStego());
document.getElementById('fileNostrSignerButton')?.addEventListener('click', () => decodeFileStego('extension'));
document.getElementById('fileNostrBunkerButton')?.addEventListener('click', () => {
  const controls = document.getElementById('fileNostrBunkerControls');
  controls.hidden = !controls.hidden;
  if (!controls.hidden) document.getElementById('fileNostrBunkerUrl').focus();
});
document.getElementById('fileNostrBunkerDecryptButton')?.addEventListener('click', () => decodeFileStego('bunker'));


function clearFileStegoOutputs() {
    // Clear image preview
    const imgPreview = document.getElementById("decodedThumbnail");
    if (imgPreview) {
      imgPreview.src = "";
      imgPreview.style.display = "none";
    }
  
    // Remove dynamic download button if exists
    const imageDownloadLink = document.getElementById("imageHiddenDownloadLink");
    if (imageDownloadLink) imageDownloadLink.remove();
  
    // Hide generic file download link
    const fileDownloadLink = document.getElementById("fileHiddenDownloadLink");
    if (fileDownloadLink) {
      fileDownloadLink.href = "";
      fileDownloadLink.style.display = "none";
    }
  
    // Clear text output
    const textOutput = document.getElementById("decodedHiddenText");
    if (textOutput) {
      textOutput.textContent = "";
      textOutput.style.display = "none";
    }
  
    // Hide copy button
    const copyButton = document.getElementById("copyDecodedTextButton");
    if (copyButton) {
      copyButton.style.display = "none";
    }
  
    // Clear encoded output (if needed)
    const encodedOutput = document.getElementById("encodedFileTextOutput");
    if (encodedOutput) {
      encodedOutput.textContent = "";
      encodedOutput.style.display = "none";
    }
  
    // Hide stego download link
    const stegoDownload = document.getElementById("stegoDownloadLink");
    if (stegoDownload) {
      if (currentStegoObjectUrl) {
        URL.revokeObjectURL(currentStegoObjectUrl);
        currentStegoObjectUrl = "";
      }
      stegoDownload.href = "";
      stegoDownload.removeAttribute("download");
      stegoDownload.removeAttribute("type");
      stegoDownload.style.display = "none";
    }
  }
  
