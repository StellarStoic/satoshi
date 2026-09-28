export function normalizeBits(value) {
  return String(value || '').replace(/[^01]/g, '');
}

export function analyzeBits(value) {
  const bits = normalizeBits(value);
  if (!bits.length) return {length: 0, ones: 0, zeros: 0, balance: 0, transitions: 0, longestRun: 0};
  let ones = 0;
  let transitions = 0;
  let longestRun = 1;
  let run = 1;
  for (let index = 0; index < bits.length; index += 1) {
    if (bits[index] === '1') ones += 1;
    if (index && bits[index] !== bits[index - 1]) {
      transitions += 1;
      run = 1;
    } else if (index) {
      run += 1;
      longestRun = Math.max(longestRun, run);
    }
  }
  return {length: bits.length, ones, zeros: bits.length - ones, balance: Math.min(ones, bits.length - ones) * 2 / bits.length, transitions, longestRun};
}

export function bytesToBits(bytes) {
  return [...bytes].map(byte => byte.toString(2).padStart(8, '0')).join('');
}

export function bytesToHex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function diceEntropy(rollCount) {
  return Math.floor(Math.max(0, Number(rollCount) || 0) * Math.log2(6));
}

export function textEntropy(value) {
  const text = String(value || '');
  if (!text.length) return 0;
  const counts = new Map();
  for (const character of text) counts.set(character, (counts.get(character) || 0) + 1);
  const entropyPerCharacter = [...counts.values()].reduce((sum, count) => {
    const probability = count / text.length;
    return sum - probability * Math.log2(probability);
  }, 0);
  return entropyPerCharacter * text.length;
}

export function guessTime(bits, guessesPerSecond = 1e12) {
  const numericBits = Math.max(0, Number(bits) || 0);
  const logSeconds = Math.max(0, numericBits - 1) * Math.log10(2) - Math.log10(guessesPerSecond);
  if (logSeconds < 0) return 'less than a second';
  const logYears = logSeconds - Math.log10(31557600);
  if (logYears < 0) {
    const seconds = 10 ** logSeconds;
    if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} seconds`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} hours`;
    return `${Math.round(seconds / 86400)} days`;
  }
  if (logYears < 6) return `${Math.round(10 ** logYears).toLocaleString()} years`;
  return `about 10^${Math.floor(logYears)} years`;
}

export function bip39Shape(entropyBits) {
  const entropy = Number(entropyBits);
  if (![128, 160, 192, 224, 256].includes(entropy)) return null;
  const checksum = entropy / 32;
  return {entropy, checksum, words: (entropy + checksum) / 11};
}
