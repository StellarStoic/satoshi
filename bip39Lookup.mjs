export function readBip39Position(value, wordlistLength = 2048) {
  const input = String(value ?? '').trim();
  if (!/^\d+$/.test(input)) return {isPosition: false, valid: false};

  const position = Number(input);
  const valid = Number.isSafeInteger(position) && position >= 1 && position <= wordlistLength;
  return {
    isPosition: true,
    valid,
    position: valid ? position : null,
    index: valid ? position - 1 : null,
  };
}

export function wordAtBip39Position(wordlist, value) {
  const result = readBip39Position(value, wordlist.length);
  return {
    ...result,
    word: result.valid ? wordlist[result.index] : null,
  };
}
