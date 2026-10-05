import {DEFAULT_PRICING, ILLUSTRATIVE_ONCHAIN_VBYTES, estimateBarkCost} from './barkTxCostModel.mjs';
import {SCRIPT_TYPES, estimateTransaction} from './bitcoinTxCostModel.mjs';

export function isOnchainType(value) {
  return Object.hasOwn(SCRIPT_TYPES, value);
}

export function estimateRoute({source, destination, amount, inputCount = 1, recipientCount = 1, includeChange = true, feeRate = 1, pricing = DEFAULT_PRICING}) {
  if (source === 'ark') {
    const barkDestination = destination === 'ark' ? 'ark' : destination === 'lightning' ? 'lightning' : 'onchain';
    const estimate = estimateBarkCost({amount, destination: barkDestination, pricing, feeRate});
    if (barkDestination !== 'onchain') return {...estimate, route: `ark-to-${barkDestination}`, vbytes: null};
    const outputVbytes = SCRIPT_TYPES[destination].outputWeight / 4;
    const vbytes = ILLUSTRATIVE_ONCHAIN_VBYTES - SCRIPT_TYPES.p2wpkh.outputWeight / 4 + outputVbytes;
    const mining = Math.ceil(vbytes * Math.max(0, Number(feeRate) || 0));
    return {
      ...estimate,
      route: 'ark-to-onchain',
      min: estimate.serviceMin + mining,
      max: estimate.serviceMax + mining,
      mining,
      vbytes,
    };
  }

  if (!isOnchainType(source)) throw new Error('Unsupported source');
  if (destination === 'lightning') throw new Error('Lightning payments require an Ark source');
  const boarding = destination === 'ark';
  const transaction = estimateTransaction({
    inputType: source,
    outputType: boarding ? 'p2tr' : destination,
    inputCount,
    recipientCount: boarding ? 1 : recipientCount,
    includeChange,
    feeRate,
  });

  return {
    route: destination === 'ark' ? 'onchain-to-ark' : 'onchain-to-onchain',
    kind: 'estimate', min: transaction.fee, max: transaction.fee,
    serviceMin: 0, serviceMax: 0, mining: transaction.fee, vbytes: transaction.vbytes,
  };
}
