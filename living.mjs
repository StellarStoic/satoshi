import {validateBundle, compareCost} from './livingModel.mjs';

const $ = id => document.getElementById(id);
const euro = new Intl.NumberFormat('en-IE', {style: 'currency', currency: 'EUR', maximumFractionDigits: 2});
const bitcoinSmall = new Intl.NumberFormat('en-GB', {maximumFractionDigits: 8});
const bitcoinLarge = new Intl.NumberFormat('en-GB', {maximumFractionDigits: 2});
const bitcoin = value => `${(value >= 1 ? bitcoinLarge : bitcoinSmall).format(value)} BTC`;
const percentage = value => `${value > 0 ? '+' : ''}${new Intl.NumberFormat('en-GB', {maximumFractionDigits: value < -99.95 ? 6 : 1}).format(value)}%`;
const plainPercent = new Intl.NumberFormat('en-GB', {maximumFractionDigits: 1});
let data;

function render() {
    const result = compareCost(data, $('living-country').value, $('living-item').value);
    const {item} = result;
    $('living-item-title').textContent = item.name;
    $('living-item-description').textContent = item.description;
    $('living-item-unit').textContent = item.unit;
    $('living-photo').src = item.image;
    $('living-photo').alt = `${item.name}, illustrative photograph`;
    $('living-then-year').textContent = result.from;
    $('living-now-year').textContent = `${result.to} · latest complete data`;
    $('living-then-fiat').textContent = euro.format(result.before);
    $('living-now-fiat').textContent = euro.format(result.after);
    $('living-then-btc').textContent = bitcoin(result.beforeBtc);
    $('living-now-btc').textContent = bitcoin(result.afterBtc);
    $('living-fiat-change').textContent = percentage(result.priceChange);
    $('living-fiat-change').className = result.priceChange < 0 ? 'decrease' : 'increase';
    const {buyingPowerLoss, equivalentCost} = result.euInflation;
    $('living-inflation-loss').textContent = `${plainPercent.format(Math.abs(buyingPowerLoss))}%`;
    $('living-inflation-loss').className = buyingPowerLoss >= 0 ? 'increase' : 'decrease';
    $('living-inflation-meaning').textContent = buyingPowerLoss >= 0 ? 'Buying power your money lost.' : 'Buying power your money gained.';
    $('living-inflation-example').textContent = `EU average: what ${euro.format(100)} bought in ${result.from} costs ${euro.format(equivalentCost)} in ${result.to}.`;
    $('living-buying-power').textContent = percentage(result.purchasingPowerChange);
    $('living-buying-power').className = result.purchasingPowerChange >= 0 ? 'decrease' : 'increase';
    $('living-buying-meaning').textContent = result.purchasingPowerChange >= 0 ? 'This much BTC purchasing power increased.' : 'This much BTC purchasing power decreased.';
    $('living-price-source').textContent = item.source;
    $('living-price-source').href = item.sourceUrl;
}

try {
    const response = await fetch('historical_data/generated/living-EU-observed.json');
    if (!response.ok) throw new Error(`Price snapshot: HTTP ${response.status}`);
    data = validateBundle(await response.json());
    for (const country of data.countries) $('living-country').add(new Option(country.name, country.code));
    $('living-country').value = 'SI';
    for (const item of data.countries[0].items) $('living-item').add(new Option(item.name, item.id));
    $('living-country').addEventListener('change', render);
    $('living-item').addEventListener('change', render);
    render();
    $('living-loading').hidden = true;
    $('living-content').hidden = false;
} catch (error) {
    console.error(error);
    $('living-loading').hidden = true;
    $('living-error').hidden = false;
    $('living-error').textContent = 'The saved comparison could not be loaded. Please reconnect and reload.';
}
