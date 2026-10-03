// textObfuscator.js
(function() {
    const utf8Encoder = new TextEncoder();
    const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

    function showInvalidInput(message) {
      if (typeof showToast === "function") showToast(message);
      return null;
    }

    function reverseCharacters(text) {
      if (typeof Intl !== "undefined" && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
        return Array.from(segmenter.segment(text), part => part.segment).reverse().join("");
      }
      return Array.from(text).reverse().join("");
    }

    function bytesToBinary(bytes) {
      return Array.from(bytes, byte => byte.toString(2).padStart(8, "0")).join(" ");
    }

    function decodeUtf8(bytes, label) {
      try {
        return utf8Decoder.decode(Uint8Array.from(bytes));
      } catch (_error) {
        return showInvalidInput(`${label} does not contain valid UTF-8 text.`);
      }
    }

    const morseTable = {
      A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.",
      G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..",
      M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.",
      S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-",
      Y: "-.--", Z: "--..",
      0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-",
      5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.",
      ".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.",
      "!": "-.-.--", "/": "-..-.", "(": "-.--.", ")": "-.--.-",
      "&": ".-...", ":": "---...", ";": "-.-.-.", "=": "-...-",
      "+": ".-.-.", "-": "-....-", "_": "..--.-", "\"": ".-..-.",
      "$": "...-..-", "@": ".--.-."
    };
    const inverseMorse = Object.fromEntries(Object.entries(morseTable).map(([key, value]) => [value, key]));

    const leetMap = {
      A: "4", B: "8", C: "<", D: "|)", E: "3", F: "ph", G: "6", H: "#",
      I: "1", J: "_|", K: "|<", L: "/_", M: "/\\/\\", N: "|\\|", O: "0",
      P: "9", Q: "0_", R: "|2", S: "5", T: "7", U: "µ", V: "\\/",
      W: "\\/\\/", X: "><", Y: "`/", Z: "2"
    };
    const inverseLeet = Object.fromEntries(Object.entries(leetMap).map(([key, value]) => [value, key]));

    function encodeTokenStream(text, prefix, table) {
      const tokens = Array.from(text, character => {
        const upper = character.toUpperCase();
        if (Object.hasOwn(table, upper) && character === upper) return table[upper];
        if (Object.hasOwn(table, upper) && character === character.toLowerCase()) return `^${table[upper]}`;
        return `~${character.codePointAt(0).toString(16).toUpperCase()}`;
      });
      return `${prefix}:${tokens.join(" ")}`;
    }

    function decodeTokenStream(text, prefix, table, label) {
      if (!text.startsWith(`${prefix}:`)) {
        return showInvalidInput(`${label} input must start with ${prefix}:`);
      }
      const payload = text.slice(prefix.length + 1);
      if (!payload) return "";
      const output = [];
      for (const token of payload.split(" ")) {
        if (token.startsWith("~") && /^[0-9A-F]+$/i.test(token.slice(1))) {
          const point = Number.parseInt(token.slice(1), 16);
          if (point > 0x10ffff) return showInvalidInput(`Invalid character in ${label} input.`);
          output.push(String.fromCodePoint(point));
          continue;
        }
        const lowerCase = token.startsWith("^");
        const encoded = lowerCase ? token.slice(1) : token;
        const character = table[encoded];
        if (!character) return showInvalidInput(`Invalid token in ${label} input.`);
        output.push(lowerCase ? character.toLowerCase() : character);
      }
      return output.join("");
    }

    function legacyMorse(text) {
      const normalizeEU = char => char
        .replace(/[àáâãäåæ]/gi, "A").replace(/[çčć]/gi, "C")
        .replace(/[ðđ]/gi, "D").replace(/[èéêëě]/gi, "E").replace(/[íîï]/gi, "I")
        .replace(/ñ/gi, "N").replace(/[òóôõöø]/gi, "O").replace(/š/gi, "S")
        .replace(/[ùúûüů]/gi, "U").replace(/ý/gi, "Y").replace(/ž/gi, "Z");
      if (/^[\s.\-/]+$/.test(text)) {
        return text.trim().split(" ").map(code => code === "/" ? " " : (inverseMorse[code] || "")).join("");
      }
      return text.toUpperCase().split("").map(character => {
        const normalized = normalizeEU(character);
        return normalized === " " ? "/" : (morseTable[normalized] || "");
      }).join(" ");
    }

    function legacyLeet(text) {
      const pairs = Object.entries(leetMap).sort((a, b) => b[1].length - a[1].length);
      if (/[0-9|/\\()_<>#]/.test(text)) {
        let decoded = text;
        for (const [character, leet] of pairs) {
          decoded = decoded.replace(new RegExp(leet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), character);
        }
        return decoded;
      }
      return text.toUpperCase().split("").map(character => leetMap[character] || character).join("");
    }

    // Central mapping for obfuscation methods with explanations and conversion functions.
    const obfuscationMethods = {
      none: {
        title: "No Obfuscation",
        explanation: "No obfuscation will be applied.",
        mNumber: 0,
        reverseMethod: "none",
        notCompatible: [],
        color: "#eae7e6",
        func: function(text) { return text; }
      },
      fullFlip: {
        title: "Full Flip",
        explanation: "Flips the entire text so it reads completely backwards. From the last character to the first. "
        + "The entire message becomes a mirror of itself, making it readable only in reverse order. <hr> "
        + "setarcoS - .gnihton wonk uoy gniwonk ni si modsiw eurt ylno ehT",
        mNumber: 1,
        reverseMethod: "fullFlip",
        color: "#a9e726",
        notCompatible: ["base64Decoder", "binaryDecoder", "base32Decoder", "base58Decoder", "leetSpeak"],
        func: protectHiddenData(function(text) {
          return reverseCharacters(text);
        })
      },
      wordFlip: {
        title: "Flip Words",
        explanation: "Reverses each individual word in the sentence, but keeps the original word order. "
        + "The words appear flipped, but the sentence structure stays the same. "
        + "<hr> elihW ew tiaw rof ,efil efil sessap - aceneS",
        mNumber: 2,
        reverseMethod: "wordFlip",
        color: "#26e7e7",
        notCompatible: ["base64Decoder", "binaryDecoder", "base32Decoder", "base58Decoder", "leetSpeak"],
        func: protectHiddenData(function(text) {
          return text.split(" ").map(function(word) {
            return reverseCharacters(word);
          }).join(" ");
        })
      },
      readableReverser: {
        title: "Readable Reversal",
        explanation: "Reverses the order of words in the entire text, while keeping the letters "
        + "inside each word untouched. It's like flipping the sentence: the last word becomes "
        + "the first, the first becomes the last — but every word remains readable. <hr>"
        + "Epictetus you. ~ around on going is what matter no aspirations true your to Hold do. "
        + "or think people other what of regardless superior, spiritually is what to yourself Attach ",
        mNumber: 3,
        reverseMethod: "readableReverser",
        color: "#e72c96",
        notCompatible: ["base64Decoder", "binaryDecoder", "base32Decoder", "base58Decoder"],
        func: protectHiddenData(function(text) {
          return text.split(" ").reverse().join(" ");
        })
      },
      sentenceInverter: {
        title: "Sentence Inverter",
        explanation: "Reverses the word order inside each sentence (ending with ., ?, or !), while "
        + "preserving punctuation and spacing. Each sentence stays intact, just flipped word by word. "
        + "Works sentence by sentence, so each one is reversed independently."
        + "<br><br> Any fool can know. The point is to understand. - "
        + "Albert Einstein <hr> know can fool Any. understand to is point The. Einstein Albert -",
        mNumber: 4,
        reverseMethod: "sentenceInverter",
        color: "#c71cee",
        notCompatible: ["base64Decoder", "binaryDecoder", "base32Decoder", "base58Decoder"],
        func: protectHiddenData(function(text) {
          const sentenceRegex = /[^.?!]+[.?!]*[\s]*/g;
          const sentences = text.match(sentenceRegex);
          if (!sentences) return text;
      
          return sentences.map(sentence => {
            const match = sentence.match(/([.?!]+)?(\s*)$/);
            const punctuation = match ? (match[1] || "") : "";
            const space = match ? (match[2] || "") : "";
            const body = sentence.slice(0, sentence.length - punctuation.length - space.length);
            const words = body.match(/\S+/g) || [];
            const reversed = body.replace(/\S+/g, () => words.pop());
            return reversed + punctuation + space;
          }).join("");
        })
      },
      binaryEncoder: {
        title: "Binary Encoder",
        explanation: "Converts your text into binary code — the raw 1s and 0s that computers use "
        + "to represent information. Each character becomes an 8-bit binary block."
        + "<hr> 01110101 01101110 01100011 01101111 01101110 01100100 01101001 01110100 01101001 01101111 01101110 01100001 01101100 01111001",
        mNumber: 5,
        reverseMethod: "binaryDecoder",
        color: "#b4e2cc",
        notCompatible: ["base64Decoder", "base32Decoder", "base58Decoder"],
        func: protectHiddenData(function(text) {
          return bytesToBinary(utf8Encoder.encode(text));
        })
      },
    binaryDecoder: {
        title: "Binary Decoder",
        explanation: "01101100 01101111 01110110 01100101 <hr> Converts binary code back into normal, readable text. "
        + "Each group of 8 bits (a byte) is translated into the character it represents.",
        mNumber: 6,
        reverseMethod: "binaryEncoder",
        color: "#eeaa33",
        notCompatible: ["base64Encoder", "base32Encoder", "base58Encoder"],
        func: protectHiddenData(function(text) {

          // function looksLikeBinary(text) {
          //   // Remove extra spaces, split by spaces
          //   const bits = text.trim().split(/\s+/);
        
          //   // Check if all are exactly 8 bits
          //   return bits.every(b => /^[01]{8}$/.test(b));
          // }

          // if (!looksLikeBinary(text)) {
          //   showToast("This doesn't look like valid binary input.");
          //   return null;
          // }

          const normalized = text.trim();
          if (!normalized) return "";
          const chunks = normalized.split(/\s+/);
          if (!chunks.every(chunk => /^[01]{8}$/.test(chunk))) {
            return showInvalidInput("Binary input must contain complete 8-bit bytes.");
          }
          return decodeUtf8(chunks.map(chunk => Number.parseInt(chunk, 2)), "Binary input");
        })
    },
    base32Encoder: {
        title: "Base32 Encoder",
        explanation:
          "Encodes your hidden message using Base32 - a text-friendly encoding that uses only uppercase letters and numbers (A-Z, 2-7). Useful for file-safe or URL-safe encoding. <hr>"
          + "hello → NBSWY3DP",
        mNumber: 7,
        reverseMethod: "base32Decoder",
        color: "#1e8a33",
        notCompatible: ["base58Decoder", "base64Decoder", "binaryDecoder"],
        func: protectHiddenData(function (text) {
          const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
          const binary = Array.from(
            utf8Encoder.encode(text),
            byte => byte.toString(2).padStart(8, "0")
          ).join("");
      
          let base32 = "";
          for (let i = 0; i < binary.length; i += 5) {
            const chunk = binary.substring(i, i + 5);
            const index = parseInt(chunk.padEnd(5, "0"), 2);
            base32 += alphabet[index];
          }
      
          return base32;
        })
      },
      base32Decoder: {
        title: "Base32 Decoder",
        explanation:
          "Decodes a Base32-encoded string back into its original readable form. Works only with uppercase Base32 characters (A-Z, 2-7) and ignores padding. <hr>"
          + "NBSWY3DP → hello",
        mNumber: 8,
        reverseMethod: "base32Encoder",
        color: "#3b77aa",
        notCompatible: ["base64Encoder", "base58Encoder", "binaryEncoder"],
        func: protectHiddenData(function (text) {

          // function looksLikeBase32(text) {
          //   return /^[A-Z2-7=]+$/i.test(text.replace(/\s/g, ""));
          // }

          // if (!looksLikeBase32(text)) {
          //   showToast("This doesn't look like valid Base32.");
          //   return null;
          // }

          const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
          const normalized = text.replace(/\s/g, "").toUpperCase();
          if (!/^[A-Z2-7]*={0,6}$/.test(normalized)) {
            return showInvalidInput("This does not look like valid Base32 input.");
          }
          const unpadded = normalized.replace(/=+$/, "");
          if ([1, 3, 6].includes(unpadded.length % 8)) {
            return showInvalidInput("This Base32 input has an invalid length.");
          }
          let binary = "";
          for (const char of unpadded) {
            const index = alphabet.indexOf(char);
            binary += index.toString(2).padStart(5, "0");
          }

          const bytes = [];
          for (let i = 0; i < binary.length; i += 8) {
            const byte = binary.substring(i, i + 8);
            if (byte.length === 8) bytes.push(Number.parseInt(byte, 2));
          }
          return decodeUtf8(bytes, "Base32 input");
        })
      },      
      base58Encoder: {
        title: "Base58 Encoder",
        explanation:
          "Encodes your hidden message using Base58 — a human-friendly format that avoids confusing "
          + "characters like 0, O, I, and l. Commonly used in Bitcoin and crypto tools. <hr>"
          + "hello → StV1DL6CwTryKyV",
        mNumber: 9,
        reverseMethod: "base58Decoder",
        color: "#aef633",
        notCompatible: ["base64Decoder", "base32Decoder", "binaryDecoder"],
        func: protectHiddenData(function (text) {
          const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
          const encoder = new TextEncoder();
          const bytes = encoder.encode(text);
          
          if (!bytes.length) return "";
          let num = BigInt("0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(""));
          let base58 = "";
      
          while (num > 0) {
            const remainder = num % 58n;
            base58 = alphabet[Number(remainder)] + base58;
            num = num / 58n;
          }
      
          // Handle leading zero bytes
          for (let byte of bytes) {
            if (byte === 0) base58 = "1" + base58;
            else break;
          }
      
          return base58;
        })
      },
      base58Decoder: {
        title: "Base58 Decoder",
        explanation:
          "Decodes a Base58-encoded string back into its original text. Ignores ambiguous "
          + "characters and supports crypto-safe strings. <hr>"
          + "StV1DL6CwTryKyV → hello",
        mNumber: 10,
        reverseMethod: "base58Encoder",
        color: "#298891",
        notCompatible: ["base64Encoder", "base32Encoder", "binaryEncoder"],
        func: protectHiddenData(function (text) {

          // function looksLikeBase58(text) {
          //   return /^[1-9A-HJ-NP-Za-km-z]+$/.test(text.replace(/\s/g, ""));
          // }

          // if (!looksLikeBase58(text)) {
          //   showToast("This doesn't look like valid Base58.");
          //   return null;
          // }

          const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
          if (!/^[1-9A-HJ-NP-Za-km-z]*$/.test(text)) {
            return showInvalidInput("This does not look like valid Base58 input.");
          }
          if (!text) return "";
          let num = BigInt(0);
      
          for (let char of text) {
            const index = alphabet.indexOf(char);
            num = num * 58n + BigInt(index);
          }

          const bytes = [];
          if (num > 0n) {
            let hex = num.toString(16);
            if (hex.length % 2) hex = "0" + hex;
            for (let i = 0; i < hex.length; i += 2) {
              bytes.push(Number.parseInt(hex.slice(i, i + 2), 16));
            }
          }
      
          // Handle leading "1"s as zero bytes
          for (let char of text) {
            if (char === "1") bytes.unshift(0);
            else break;
          }
      
          return decodeUtf8(bytes, "Base58 input");
        })
      },
      base64Encoder: {
        title: "Base64 Encoder",
        explanation: "Encodes your hidden message using Base64 — a text-based format that converts "
        + "binary data into readable characters. This makes your message look scrambled to humans but reversible with decoding."
        + "<hr> V2h5IGRpZCBCYXNlNjQgYnJlYWsgdXAgd2l0aCBCYXNlMzI/CkJlY2F1c2UgaXQgY291bGRuJ3QgaGFuZGxlIHRoZSBleHRyYSBiaXRzIG9mIGNvbW1pdG1lbnQhIPCfmIM=",
        mNumber: 11,
        reverseMethod: "base64Decoder",
        color: "#5811f6",
        notCompatible: ["base58Decoder", "base32Decoder", "binaryDecoder"],
        func: protectHiddenData(function(text) {
          try {
            const bytes = utf8Encoder.encode(text);
            let binary = "";
            for (let offset = 0; offset < bytes.length; offset += 0x8000) {
              binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
            }
            return btoa(binary);
          } catch (err) {
            showToast("Base64 Encoding Error: " + err.message);
            return text; // Fallback to original text if encoding fails.
          }
        })
      },
      base64Decoder: {
        title: "Base64 Decoder",
        explanation: "4oCcWWVzdGVyZGF5IEkgd2FzIGNsZXZlciwgc28gSSB3YW50ZWQgdG8gY2hhbmdlIHRoZSB3b3JsZC4gVG9kYXkgSSBhbSB3aXNlLCBzbyBJIGFtIGNoYW5naW5nIG15c2VsZi7igJ0K4oCVIFJ1bWk= "
        + "<hr> Decodes a Base64 string back into its original, readable message. Useful for reversing  base64 encoded messages that look scrambled or unreadable. ",
        mNumber: 12,
        reverseMethod: "base64Encoder",
        color: "#1ae19a",
        notCompatible: ["base58Encoder", "base32Encoder", "binaryEncoder"],
        func: protectHiddenData(function(text) {

            // function looksLikeBase64(text) {
            //   return /^[A-Za-z0-9+/=]+$/.test(text.replace(/\s/g, "")) && text.length % 4 === 0;
            // }

            // if (!looksLikeBase64(text)) {
            //   showToast("This doesn't look like valid Base64.");
            //   return null;
            // }

            try {
              // 🔍 Step 1: Remove all invisible zero-width characters
              const cleaned = text.replace(/[\u200B\u200C\u200D]/g, '');
          
              // 🔍 Step 2: Strip normal whitespace just in case
              const sanitized = cleaned.replace(/\s/g, '');
          
              if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(sanitized)) {
                return showInvalidInput("This does not look like valid Base64 input.");
              }
              return decodeUtf8(Array.from(atob(sanitized), character => character.charCodeAt(0)), "Base64 input");
            } catch (err) {
              showToast("Base64 Decoding Error: " + err.message);
              return null;
            }
          })
      },
      scrambler: {
        title: "Scrambler",
        explanation: "Scrambles the middle letters of each word while keeping the first and last letter untouched. Use it again to reverse (descramble) the sentence back to its original form. Words with 3 or fewer letters are left unchanged."
        + "<hr> it deson't mttear in waht oderr the ltteres in a wrod are, the olny iportanmt tinhg is taht the frsit and lsat ltteer be at the rghit pacle.",
        mNumber: 13,
        reverseMethod: "scrambler",
        color: "#2be19a",
        notCompatible: ["base58Decoder", "base32Decoder", "base64Decoder", "binaryDecoder"],
        func: protectHiddenData(function(text) {

          return text.split(/\b/).map(word => {
              const match = word.match(/^([\p{L}]{2,})([\p{P}]*)$/u);
              if (!match) return word;
  
              const wordPart = match[1];
              const punctuation = match[2];
  
              if (wordPart.length <= 3) return word;
  
              const first = wordPart[0];
              const last = wordPart[wordPart.length - 1];
              let middle = wordPart.slice(1, -1).split('');
  
              // Swap pairs (involution)
              for (let i = 0; i < middle.length - 1; i += 2) {
                  [middle[i], middle[i + 1]] = [middle[i + 1], middle[i]];
              }
  
              return first + middle.join('') + last + punctuation;
  
          }).join("");
  
      })
  },
    morseCode: {
      title: "Text to Morse",
      explanation: "Encodes text as a reversible Morse token stream. Letter case, spaces, emoji, and accented characters are preserved.<hr>"
        + "The M1: prefix tells the decoder which exact format to use.",
      mNumber: 14,
      reverseMethod: "morseDecoder",
      color: "#cc9e11",
      notCompatible: ["sentenceInverter", "base64Decoder", "base58Decoder", "base32Decoder", "binaryDecoder", "leetSpeak"],
      legacyFunc: protectHiddenData(legacyMorse),
      func: protectHiddenData(function (text) {
        return encodeTokenStream(text, "M1", morseTable);
      })
    },
    leetSpeak: {
      title: "Text to Leet Speak",
      explanation: "Encodes text as an exact, reversible leetspeak token stream. Case, numbers, symbols, spaces, and emoji are preserved.<hr>"
        + "The L1: prefix prevents ordinary numbers from being mistaken for encoded letters.",
      mNumber: 15,
      reverseMethod: "leetDecoder",
      color: "#00cc00",
      notCompatible: ["base64Decoder", "base58Decoder", "base32Decoder", "binaryDecoder", "wordFlip", "fullFlip", "morseCode"],
      legacyFunc: protectHiddenData(legacyLeet),
      func: protectHiddenData(function (text) {
        return encodeTokenStream(text, "L1", leetMap);
      })
    },
    morseDecoder: {
      title: "Morse to Text",
      explanation: "Decodes the reversible M1: Morse format without guessing or discarding characters.",
      mNumber: 16,
      reverseMethod: "morseCode",
      color: "#e4bc42",
      notCompatible: ["morseCode"],
      func: protectHiddenData(function (text) {
        return decodeTokenStream(text, "M1", inverseMorse, "Morse");
      })
    },
    leetDecoder: {
      title: "Leet Speak to Text",
      explanation: "Decodes the reversible L1: leetspeak format without confusing literal numbers or symbols for letters.",
      mNumber: 17,
      reverseMethod: "leetSpeak",
      color: "#35e835",
      notCompatible: ["leetSpeak"],
      func: protectHiddenData(function (text) {
        return decodeTokenStream(text, "L1", inverseLeet, "Leet Speak");
      })
    },
            // Future options can be added here.
    };

    /**
     * Swaps the text content between the visible and hidden message fields.
     */
    function switchText() {
      const visibleTextArea = document.getElementById('visibleMessage');
      const hiddenTextArea  = document.getElementById('cipherHiddenMessage');
    
      if (visibleTextArea && hiddenTextArea) {
        const temp = visibleTextArea.value;
        visibleTextArea.value = hiddenTextArea.value;
        hiddenTextArea.value  = temp;
      }
    }
  
 /**
   * Opens the modal and updates the title and explanation text.
   * @param {string} title - The title of the obfuscation method.
   * @param {string} explanation - The explanation text to display.
   */
 function openObfuscationModal(title, explanation) {
    const modal = document.getElementById("obfuscationModal");
    const modalTitle = document.getElementById("modalMethodTitle");
    const modalDesc = document.getElementById("modalDescription");
    modalTitle.innerHTML = title;
    modalDesc.innerHTML = explanation;
    modal.style.display = "block";
  }

  // Every time method bubble is removed the dropdown will be refreshed with relevant restrictions
  function refreshDropdownRestrictions() {
    const dropdown = document.getElementById("textTransformationMethod");

    // Clear all restrictions first
    Array.from(dropdown.options).forEach(option => {
        option.disabled = false;
        option.textContent = option.textContent.replace(" ❌", "");
    });

    // Find the last method used (if any)
    const lastMethod = window.textObfuscator.methodHistory.slice(-1)[0];

    if (!lastMethod) return; // nothing to restrict if no method left

    if (lastMethod.notCompatible) {
        lastMethod.notCompatible.forEach(incompatibleKey => {
            const incompatibleOption = dropdown.querySelector(`option[value="${incompatibleKey}"]`);
            if (incompatibleOption) {
                incompatibleOption.disabled = true;
                if (!incompatibleOption.textContent.includes("❌")) {
                    incompatibleOption.textContent += " ❌";
                }
            }
        });
    }
}


  /**
   * Tiny modal when clicking on method bubble
   */
  function showMethodBubbleModal(method, index, bubbleElement) {
    const modal = document.getElementById("methodInfoModal");
    const title = document.getElementById("methodBubbleTitle");
    const removeBtn = document.getElementById("removeLastMethodBtn");
    const removeAllBtn = document.getElementById("removeAllMethodsBtn"); // ✅ new button

    title.textContent = method.title;

    const isLast = Array.isArray(window.textObfuscator.methodHistory) && index === window.textObfuscator.methodHistory.length - 1;

    // Handle single remove button
    if (isLast) {
        removeBtn.style.display = "block";
        removeAllBtn.style.display = "block"; // ✅ show removeAll button

        removeBtn.onclick = () => {
            // Reverse the method effect on hidden text
            const lastMethod = window.textObfuscator.methodHistory.pop();
            const reverseKey = lastMethod.reverseMethod;
            const reverseMethod = window.textObfuscator.obfuscationMethods[reverseKey];
            if (reverseMethod && typeof reverseMethod.func === "function") {
                const hiddenTextArea = document.getElementById("cipherHiddenMessage");
                hiddenTextArea.value = reverseMethod.func(hiddenTextArea.value);
            }

            bubbleElement.remove();
            refreshDropdownRestrictions();
            modal.style.display = "none";

            // Update the last bubble
            const bubbles = document.querySelectorAll(".method-bubble");
            if (bubbles.length > 0) {
                const lastBubble = bubbles[bubbles.length - 1];
                const newIndex = bubbles.length - 1;
                const lastMethod = window.textObfuscator.methodHistory[newIndex];
                showMethodBubbleModal(lastMethod, newIndex, lastBubble);
            } else {
                document.getElementById("methodControlButtons").style.display = "none";
            }
        };

        // ✅ Remove ALL methods button
        removeAllBtn.onclick = () => {
            // Reverse all methods in reverse order
            const hiddenTextArea = document.getElementById("cipherHiddenMessage");
            
            for (let i = window.textObfuscator.methodHistory.length - 1; i >= 0; i--) {
                const reverseKey = window.textObfuscator.methodHistory[i].reverseMethod;
                const reverseMethod = window.textObfuscator.obfuscationMethods[reverseKey];
                if (reverseMethod && typeof reverseMethod.func === "function") {
                    hiddenTextArea.value = reverseMethod.func(hiddenTextArea.value);
                }
            }

            // ✅ Clear cipherHiddenMessage content too!
            hiddenTextArea.value = "";

            // Clear method history and bubbles
            window.textObfuscator.methodHistory = [];
            document.getElementById("methodSequence").innerHTML = "";
            document.getElementById("methodControlButtons").style.display = "none";
            refreshDropdownRestrictions();
            modal.style.display = "none";
            showToast("All methods and text have been cleared.");
        };

    } else {
        removeBtn.style.display = "none";
        removeAllBtn.style.display = "none"; // ✅ hide removeAll button when not on last bubble
    }

    const rect = bubbleElement.getBoundingClientRect();
    modal.style.top = `${rect.bottom + 10}px`;
    modal.style.left = `${rect.left}px`;
    modal.style.display = "block";

    setTimeout(() => {
        modal.style.display = "none";
    }, 5000);
}


  /**
   * Click handler to close modal when clicked outside
   */
  document.addEventListener("click", function (event) {
    const modal = document.getElementById("methodInfoModal");
    if (modal.style.display === "block" && !modal.contains(event.target) && !event.target.classList.contains("method-bubble")) {
      modal.style.display = "none";
    }
  });

  function addMethodBubble(method) {
    const bubble = document.createElement("span");
    bubble.className = "method-bubble";
    bubble.style.backgroundColor = method.color;
    bubble.textContent = method.mNumber;

    bubble.addEventListener("click", function () {
      const index = Array.from(document.querySelectorAll(".method-bubble")).indexOf(bubble);
      showMethodBubbleModal(method, index, bubble);
    });

    document.getElementById("methodSequence").appendChild(bubble);
    // Show control buttons if at least one method used
    document.getElementById("methodControlButtons").style.display = "flex";
  }

    document.getElementById("copyMethodSequence").addEventListener("click", function () {
        const sequence = window.textObfuscator.methodHistory.map(m => m.mNumber).join(",");
        // const key = document.getElementById("encryptionKey")?.value?.trim(); // or whatever your encryption field ID is
        const exportString = "mSeq=v1:" + sequence;
        navigator.clipboard.writeText(exportString).then(() => showToast("Copied!"));
    });


  
  
  /**
   * Handles changes to the obfuscation dropdown menu.
   * If the user selects an obfuscation method other than "none",
   * it stores the current hidden text as original (if not already stored)
   * and opens the modal with the corresponding explanation.
   * If "none" is selected, it reverts the hidden text to the original.
     * @param {Event} event 
     */
  function handleObfuscationMethodChange(event) {
    const selectedOption = event.target.value;
    const method = obfuscationMethods[selectedOption];
    const dropdown = document.getElementById("textTransformationMethod");

    dropdown.addEventListener("click", () => {
        dropdown.classList.add("clicked");
        setTimeout(() => dropdown.classList.remove("clicked"), 500);
      });

    const inputValue = document.getElementById("cipherHiddenMessage").value.trim();
    if (!inputValue) {
        showToast("Please enter a text first before selecting a transformation method.");
        dropdown.value = "none";  // reset dropdown
        return;
    }

    // ✅ Validator for methods
    const validators = {
      binaryDecoder: (text) => {
          const bits = text.trim().split(/\s+/);
          return bits.every(b => /^[01]{8}$/.test(b));
      },
      base32Decoder: (text) => {
          return /^[A-Z2-7=]+$/i.test(text.replace(/\s/g, ""));
      },
      base58Decoder: (text) => {
          return /^[1-9A-HJ-NP-Za-km-z]+$/.test(text.replace(/\s/g, ""));
      },
      base64Decoder: (text) => {
          const normalized = text.replace(/\s/g, "");
          return /^[A-Za-z0-9+/=]+$/.test(normalized) && normalized.length % 4 === 0;
      },
      morseDecoder: (text) => {
          return text.startsWith("M1:");
      },
      leetDecoder: (text) => {
          return text.startsWith("L1:");
      }
  };

      // ✅ Check if selected decoder needs validation
    if (validators[selectedOption]) {
        if (!validators[selectedOption](inputValue)) {
            showToast(`This doesn't look like valid ${selectedOption.replace('Decoder', '')} input.`);
            dropdown.value = "none";  // reset
            return;
        }
    }

  
  // ✅ Clear previous state
  Array.from(dropdown.options).forEach(option => {
    option.disabled = false;
    option.textContent = option.textContent.replace(" ❌", "");
  });
  
    if (selectedOption === "none") {
      window.textObfuscator.selectedMethod = null;
      window.textObfuscator.toggleState = false;
      return;
    }

    if (method) {
        openObfuscationModal(method.title, method.explanation);
        window.textObfuscator.selectedMethod = method;
        window.textObfuscator.toggleState = false;
  
    // Disable incompatible options for the last method used
    if (method.notCompatible) {
        method.notCompatible.forEach(incompatibleKey => {
          const incompatibleOption = dropdown.querySelector(`option[value="${incompatibleKey}"]`);
          if (incompatibleOption) {
            incompatibleOption.disabled = true;
            incompatibleOption.textContent += " ❌";
          }
        });
      }
    }
  }

      /**
     * Closes the obfuscation modal.
     */
      function closeObfuscationModal() {
        const modal = document.getElementById("obfuscationModal");
        modal.style.display = "none";
      }

        function protectHiddenData(methodFunc) {
            return function(text) {
              const markerIndex = text.indexOf(MARKER);
              if (markerIndex !== -1) {
                const visiblePart = text.substring(0, markerIndex);
                const hiddenPart = text.substring(markerIndex);
                const result = methodFunc(visiblePart);
                return result === null ? null : result + hiddenPart;
              }
              return methodFunc(text);
            };
          }
  
    // Attach event listeners once the DOM is fully loaded.
    document.addEventListener("DOMContentLoaded", function() {
      // Switch text button
      const switchButton = document.getElementById("switchTextButton");
      if (switchButton) {
        switchButton.addEventListener("click", switchText);
      }
  
      // Obfuscation dropdown
      const obfuscationSelect = document.getElementById("textTransformationMethod");
      if (obfuscationSelect) {
        // Initialize lastSelectedOption.
        window.textObfuscator.lastSelectedOption = obfuscationSelect.value;
      
        // On change, update the last selected option and handle new selections.
        obfuscationSelect.addEventListener("change", function(event) {
          const selectedOption = event.target.value;
          window.textObfuscator.lastSelectedOption = selectedOption;
          handleObfuscationMethodChange(event);
        });
      }  

      // Modal buttons and close functionality
      const useButton = document.getElementById("useObfuscation");
    //   const declineButton = document.getElementById("declineObfuscation");
      const closeButton = document.getElementById("closeObfuscationModal");
      const modal = document.getElementById("obfuscationModal");
  
      if (closeButton) {
        closeButton.addEventListener("click", closeObfuscationModal);
      }

      if (useButton) {
        useButton.addEventListener("click", function () {
          const hiddenTextArea = document.getElementById("cipherHiddenMessage");
          const obfuscationSelect = document.getElementById("textTransformationMethod");
          


          if (
            window.textObfuscator.selectedMethod &&
            typeof window.textObfuscator.selectedMethod.func === "function"
          ) {



            // const result = window.textObfuscator.selectedMethod.func(hiddenTextArea.value);

            // // ❌ BLOCK IT HERE
            // if (result === null) {
            //   window.textObfuscator.selectedMethod = null;
            //   obfuscationSelect.value = "none";
            //   closeObfuscationModal();
            //   return;
            // }
            // if (!window.textObfuscator.toggleState) {
            //     if (hiddenTextArea.value.includes(MARKER)) {
            //         showToast("⚠️ You're about to transform a message that contains hidden data. It will try to preserved it, but in most cases manipulating the carrier text usually corrupts the hidden part");
            //     }

            //   // Apply the selected obfuscation
            //   hiddenTextArea.value = window.textObfuscator.selectedMethod.func(hiddenTextArea.value);

            if (!window.textObfuscator.toggleState) {
              if (hiddenTextArea.value.includes(MARKER)) {
                  showToast("⚠️ You're about to transform a message that contains hidden data. It will try to preserve it, but manipulating the carrier text usually corrupts the hidden part.");
              }

              // ✅ Apply once, accept if it returns null or new value
              const result = window.textObfuscator.selectedMethod.func(hiddenTextArea.value);

              // ✅ Block if result is null (indicates validation failure)
              if (result === null) {
                  window.textObfuscator.selectedMethod = null;
                  obfuscationSelect.value = "none";
                  closeObfuscationModal();
                  return;
              }

              hiddenTextArea.value = result;

              window.textObfuscator.toggleState = true;
              window.textObfuscator.methodHistory.push(window.textObfuscator.selectedMethod);
              addMethodBubble(window.textObfuscator.selectedMethod);
            } else {
                // Just toggle state flag (optional)
                window.textObfuscator.toggleState = false;
            }
          }
      
          // Reset dropdown to "none" so the same method can be re-selected next time
          if (obfuscationSelect) {
            obfuscationSelect.value = "none";
          }
      
          // Clear stored method and close modal
          window.textObfuscator.selectedMethod = null;
          closeObfuscationModal();
        });
      }

    if (closeButton) {
        closeButton.addEventListener("click", function() {
          const obfuscationSelect = document.getElementById("textTransformationMethod");
          if (obfuscationSelect) {
            obfuscationSelect.value = "none";
          }
          window.textObfuscator.selectedMethod = null;
          closeObfuscationModal();
        });
      }

    // Close modal when clicking outside its content.
    window.addEventListener("click", function(event) {
        if (event.target === modal) {
          const obfuscationSelect = document.getElementById("textTransformationMethod");
          if (obfuscationSelect) {
            obfuscationSelect.value = "none";
          }
          window.textObfuscator.selectedMethod = null;
          closeObfuscationModal();
        }
      });
    });
    
      
  
    // Export our functions for future expansion.
    window.textObfuscator = {
      switchText: switchText,
      openObfuscationModal: openObfuscationModal,
      closeObfuscationModal: closeObfuscationModal,
      obfuscationMethods: obfuscationMethods,
      selectedMethod: null, // to store the current method, if needed.
      originalHiddenText: undefined,
      methodHistory: [],
      methodSequence: []
    };
  })();
  
