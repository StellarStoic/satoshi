export const SINTRA_CURRENCIES = Object.freeze(['USD', 'EUR', 'GBP', 'CAD', 'AUD']);

export function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function normaliseSintraPrices(payload = {}) {
  const prices = {};
  for (const [code, value] of Object.entries(payload)) {
    const currency = code.toUpperCase();
    const price = positiveNumber(value);
    if (/^[A-Z]{3}$/.test(currency) && price) prices[currency] = price;
  }
  return prices;
}

export function parseFrankfurterRates(rows = []) {
  const rates = {USD: 1};
  if (!Array.isArray(rows)) return rates;
  for (const row of rows) {
    const currency = String(row?.quote || '').toUpperCase();
    const rate = positiveNumber(row?.rate);
    if (row?.base === 'USD' && /^[A-Z]{3}$/.test(currency) && rate) rates[currency] = rate;
  }
  return rates;
}

export function moscowTimeValue(currency, sintraPrices = {}, fxRates = {}) {
  const code = String(currency || 'USD').toUpperCase();
  const directPrice = SINTRA_CURRENCIES.includes(code) ? positiveNumber(sintraPrices[code]) : null;
  if (directPrice) {
    return {sats: Math.round(100_000_000 / directPrice), source: 'Provided by Sintra', direct: true};
  }

  const usdPrice = positiveNumber(sintraPrices.USD);
  const fiatPerUsd = positiveNumber(fxRates[code]);
  if (!usdPrice || !fiatPerUsd) return null;
  return {
    sats: Math.round(100_000_000 / (usdPrice * fiatPerUsd)),
    source: 'Sintra + Frankfurter',
    direct: false,
  };
}
