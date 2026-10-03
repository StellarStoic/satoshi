/**
 * Decode a hidden message from text using emoji variation selectors.
 * Returns the hidden message, or "No secrets found." if none is present.
 */
function decodeEmoji(text) {
    // Unicode variation selector ranges for 0–255
    const VS_START = 0xFE00, VS_END = 0xFE0F;         // U+FE00 ... U+FE0F (16 values)
    const VS_SUP_START = 0xE0100, VS_SUP_END = 0xE01EF; // U+E0100 ... U+E01EF (240 values)
  
    let bytes = [];
    for (const char of text) {
      const code = char.codePointAt(0);
      let byteVal = null;
      if (code >= VS_START && code <= VS_END) {
        // Map U+FE00..FE0F -> 0..15
        byteVal = code - VS_START;
      } else if (code >= VS_SUP_START && code <= VS_SUP_END) {
        // Map U+E0100..E01EF -> 16..255
        byteVal = code - VS_SUP_START + 16;
      }
  
      if (byteVal !== null) {
        // Collect the byte value
        bytes.push(byteVal);
      } else if (bytes.length > 0) {
        // Found the end of the variation sequence; stop decoding
        break;
      } else {
        // No bytes collected yet, continue skipping until the first variation selector is found
        continue;
      }
    }
  
    if (bytes.length === 0) {
      return "No secrets found.";
    }
  
    // Convert byte array to UTF-8 text
    const decoder = new TextDecoder();  // uses UTF-8 by default
    const hiddenMessage = decoder.decode(new Uint8Array(bytes));
    return hiddenMessage;
  }
  