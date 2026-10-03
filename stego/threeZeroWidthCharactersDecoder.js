// Unwrap hidden data using three-char boundary method (boundary: U+FEFF)
function unwrapThreeChar(string) {
    const parts = string.split("\uFEFF");
    if (parts.length < 3) return null;
    return parts[1];  // hidden message is between markers
}

// Convert zero-width characters back to binary (three-char method)
function hidden2binThreeChar(str) {
    return str.replace(/\u2060/g, ' ')  // Word joiner to space
              .replace(/\u200B/g, '0')  // Zero width space to 0
              .replace(/\u200C/g, '1'); // Zero width non-joiner to 1
}

// Convert binary string to readable text
function binaryToTextThreeChar(binaryString) {
    return binaryString.split(' ')
                       .map(bin => String.fromCharCode(parseInt(bin, 2)))
                       .join('');
}

// Main decode function for three-char method
function decodeMessageWithThreeChar(encodedText, key = "") {
    const unwrapped = unwrapThreeChar(encodedText);
    if (!unwrapped) return null; // no boundary found, return null

    const binaryString = hidden2binThreeChar(unwrapped);
    let decodedText = binaryToTextThreeChar(binaryString);

    if (key) decodedText = decrypt(decodedText, key);
    return decodedText.trim() || null;
}
