export const SCRIPT_TYPES = Object.freeze({
  p2pkh: {label: 'Legacy', detail: 'P2PKH', inputWeight: 592, outputWeight: 136, witness: false},
  p2shP2wpkh: {label: 'Nested SegWit', detail: 'P2SH-P2WPKH', inputWeight: 364, outputWeight: 128, witness: true},
  p2wpkh: {label: 'Native SegWit', detail: 'P2WPKH', inputWeight: 272, outputWeight: 124, witness: true},
  p2tr: {label: 'Taproot', detail: 'P2TR', inputWeight: 230, outputWeight: 172, witness: true},
});

function count(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.floor(number))) : fallback;
}

function scriptType(key, fallback = 'p2wpkh') {
  return SCRIPT_TYPES[key] || SCRIPT_TYPES[fallback];
}

export function estimateTransaction({inputType, outputType, inputCount, recipientCount, includeChange = true, feeRate = 1}) {
  const input = scriptType(inputType);
  const output = scriptType(outputType);
  const inputs = count(inputCount, 1);
  const recipients = count(recipientCount, 1);
  const changeOutputs = includeChange ? 1 : 0;
  const hasWitness = input.witness && inputs > 0;
  const overheadWeight = hasWitness ? 42 : 40;
  const changeWeight = includeChange ? input.outputWeight : 0;
  const weight = overheadWeight
    + (inputs * input.inputWeight)
    + (recipients * output.outputWeight)
    + changeWeight;
  const vbytes = Math.ceil(weight / 4);
  const rate = Math.max(0, Number(feeRate) || 0);
  const fee = Math.ceil(vbytes * rate);
  return {weight, vbytes, fee, feeRate: rate, inputs, recipients, changeOutputs};
}

export function feeShare(amount, fee) {
  const sats = Math.max(0, Number(amount) || 0);
  return sats > 0 ? (Math.max(0, Number(fee) || 0) / sats) * 100 : null;
}
