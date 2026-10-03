document.getElementById("decipherButton").addEventListener("click", async function () {
    const inputText = document.getElementById("decipheredInput").value;
    const key = document.getElementById("methodSequenceInput").value.trim();
    const outputEl = document.getElementById("decipheredOutput");

    if (!inputText.length || !key) {
      showToast("Please enter both text and a method sequence to decipher.");
      return;
    }

    const versionMatch = key.match(/^mSeq\s*=\s*v(\d+)\s*:/i);
    if (versionMatch && versionMatch[1] !== "1") {
      showToast(`Sequence version v${versionMatch[1]} is not supported by this page.`);
      return;
    }
    const version = versionMatch ? 1 : 0;
    const rawSeq = key
      .replace(/^mSeq\s*=\s*v1\s*:/i, "")
      .replace(/^mSeq\s*=\s*/i, "");
    const methodSequence = rawSeq
        .split(/[^0-9]+/)
        .filter(Boolean)
        .map(value => Number.parseInt(value, 10))
        .reverse();
    
    if (methodSequence.length === 0) {
      showToast("Invalid or empty method sequence.");
        return;
    }

    if (!window.textObfuscator?.obfuscationMethods) return;

    let decodedText = inputText;
    outputEl.dataset.fullText = inputText;

    // ✅ Immediately show the original encoded message first
    outputEl.textContent = `🔒 Original Cipher:\n${decodedText}`;

    // Small pause before starting the steps
    await new Promise(resolve => setTimeout(resolve, 3000));

    for (let num of methodSequence) {
      const method = Object.values(window.textObfuscator.obfuscationMethods).find(m => m.mNumber === num);
      if (!method) {
        showToast(`Unknown transformation #${num}. Nothing was decoded.`);
        outputEl.textContent = "Decoding stopped because the sequence contains an unknown transformation.";
        return;
      }
      const reverse = window.textObfuscator.obfuscationMethods[method.reverseMethod];
      if (!reverse || typeof reverse.func !== "function") {
        showToast(`Transformation #${num} has no decoder. Nothing was decoded.`);
        outputEl.textContent = "Decoding stopped because the sequence is incomplete.";
        return;
      }
      const decoder = version === 0 && typeof method.legacyFunc === "function"
        ? method.legacyFunc
        : reverse.func;
      decodedText = decoder(decodedText);

    // ✔ Check for graceful abort
    if (decodedText === null || decodedText === "") {
      showToast(`Decoding stopped! Method "${method.title}" (#${num}) reported invalid input.\nCheck if your method sequence is correct.`);
      outputEl.textContent += `\n\n🚫 Decoding stopped at: ${method.title}`;
      return;
    }

      outputEl.textContent = decodedText;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    displayTruncatedText(outputEl, decodedText, 300);

    document.getElementById("copyDecipheredOutput").style.display = "inline-block";

    if (typeof checkForConfettiTrigger === "function" && checkForConfettiTrigger(decodedText)) {
      // Confetti triggered
    } else if (typeof triggerSparkleEffect === "function") {
      triggerSparkleEffect();
    }
  });
