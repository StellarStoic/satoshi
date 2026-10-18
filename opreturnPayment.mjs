function satsToBitcoin(sats) {
  return (Number(sats || 0) / 1e8).toFixed(8);
}

function destination(rail) {
  return String(rail?.destination || '').trim();
}

export function unifiedPaymentUri(order = {}) {
  const rails = order.rails || {};
  const onchain = destination(rails.onchain);
  const ark = destination(rails.ark);
  const lightning = destination(rails.lightning).replace(/^lightning:/i, '');
  if (!onchain && !ark && !lightning) return '';
  const params = new URLSearchParams();
  params.set('amount', satsToBitcoin(order.sats));
  if (ark) params.set('ark', ark);
  if (lightning) params.set('lightning', lightning);
  return `bitcoin:${onchain}?${params.toString()}`;
}

export function opReturnPaymentOptions(order = {}) {
  const rails = order.rails || {};
  const onchain = destination(rails.onchain);
  const ark = destination(rails.ark);
  const lightning = destination(rails.lightning).replace(/^lightning:/i, '');
  const individual = [];
  if (ark) {
    const uri = `bitcoin:?amount=${satsToBitcoin(order.sats)}&ark=${encodeURIComponent(ark)}`;
    individual.push({ id: 'ark', label: 'Ark', uri, copyValue: uri });
  }
  if (lightning) individual.push({
    id: 'lightning', label: 'Lightning', uri: `lightning:${lightning}`, copyValue: lightning,
  });
  if (onchain) {
    const uri = `bitcoin:${onchain}?amount=${satsToBitcoin(order.sats)}`;
    individual.push({ id: 'onchain', label: 'On-chain', uri, copyValue: uri });
  }
  if (individual.length < 2) return individual;
  const unified = unifiedPaymentUri(order);
  return [
    { id: 'unified', label: 'Any wallet', uri: unified, copyValue: unified, unified: true },
    ...individual,
  ];
}
