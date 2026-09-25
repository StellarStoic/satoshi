export { entropyToMnemonic, mnemonicToSeed, validateMnemonic } from '@scure/bip39';
import { wordlist as czechWordlist } from '@scure/bip39/wordlists/czech.js';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { wordlist as frenchWordlist } from '@scure/bip39/wordlists/french.js';
import { wordlist as italianWordlist } from '@scure/bip39/wordlists/italian.js';
import { wordlist as japaneseWordlist } from '@scure/bip39/wordlists/japanese.js';
import { wordlist as koreanWordlist } from '@scure/bip39/wordlists/korean.js';
import { wordlist as portugueseWordlist } from '@scure/bip39/wordlists/portuguese.js';
import { wordlist as simplifiedChineseWordlist } from '@scure/bip39/wordlists/simplified-chinese.js';
import { wordlist as spanishWordlist } from '@scure/bip39/wordlists/spanish.js';
import { wordlist as traditionalChineseWordlist } from '@scure/bip39/wordlists/traditional-chinese.js';

export {
  czechWordlist,
  englishWordlist,
  frenchWordlist,
  italianWordlist,
  japaneseWordlist,
  koreanWordlist,
  portugueseWordlist,
  simplifiedChineseWordlist,
  spanishWordlist,
  traditionalChineseWordlist,
};

// Keep the original export for the seed phrase playground and its tests.
export const wordlist = englishWordlist;
