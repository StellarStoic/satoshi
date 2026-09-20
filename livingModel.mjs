const eligible = new Set('AT BE BG CY CZ DE DK EE EL ES FI FR HU IE IT LT LU LV MT NL PL PT RO SE SI SK'.split(' '));
const positive = value => Number.isFinite(value) && value > 0;
const quantities = {electricity: 100, petrol: 1, diesel: 1};

export function validateBundle(bundle) {
    if (bundle?.schemaVersion !== 3 || bundle.priceBasis !== 'observed' || bundle.currency !== 'EUR' || bundle.baseYear !== '2010' ||
        !Array.isArray(bundle.years) || bundle.years.length < 2 || bundle.years.some((year, i) => year !== String(2010 + i)) ||
        Number(bundle.years.at(-1)) >= new Date().getUTCFullYear() ||
        !bundle.btcEurAnnual || bundle.years.some(year => !positive(bundle.btcEurAnnual[year])) ||
        !Array.isArray(bundle.countries) || bundle.countries.length !== eligible.size) {
        throw new Error('Invalid observed EU price snapshot');
    }
    const codes = new Set();
    if (bundle.euInflation?.geo !== 'EU27_2020' || bundle.euInflation.series !== 'TOTAL' ||
        !bundle.euInflation.indices || bundle.years.some(year => !positive(bundle.euInflation.indices[year]))) {
        throw new Error('Incomplete EU inflation history');
    }
    const categories = bundle.countries[0]?.items?.map(item => item.id);
    if (categories?.join(',') !== Object.keys(quantities).join(',')) throw new Error('Invalid items');
    for (const country of bundle.countries) {
        if (!eligible.has(country.code) || codes.has(country.code) || !country.name ||
            !Array.isArray(country.items) || country.items.length !== categories.length) throw new Error('Invalid country');
        codes.add(country.code);
        country.items.forEach((item, i) => {
            if (item.id !== categories[i] || item.priceBasis !== 'observed' || item.quantity !== quantities[item.id] ||
                !item.prices || !item.unitPrices || !item.observationCounts || !item.source || !item.sourceUrl ||
                bundle.years.some(year => !positive(item.prices[year]) || !positive(item.unitPrices[year]) ||
                    !Number.isInteger(item.observationCounts[year]) ||
                    (item.id === 'electricity' ? item.observationCounts[year] !== 2 : item.observationCounts[year] < 48) ||
                    Math.abs(item.prices[year] - item.quantity * item.unitPrices[year]) > 0.00001)) {
                throw new Error('Incomplete observed-price history');
            }
        });
    }
    return bundle;
}

export function bitcoinChanges(beforeBtc, afterBtc) {
    if (!positive(beforeBtc) || !positive(afterBtc)) throw new Error('Invalid Bitcoin cost');
    const purchasingPowerMultiple = beforeBtc / afterBtc;
    return {
        bitcoinChange: (afterBtc / beforeBtc - 1) * 100,
        purchasingPowerMultiple,
        purchasingPowerChange: (purchasingPowerMultiple - 1) * 100,
    };
}

export function inflationChanges(beforeIndex, afterIndex) {
    if (!positive(beforeIndex) || !positive(afterIndex)) throw new Error('Invalid inflation index');
    return {
        priceRise: (afterIndex / beforeIndex - 1) * 100,
        buyingPowerLoss: (1 - beforeIndex / afterIndex) * 100,
        equivalentCost: 100 * afterIndex / beforeIndex,
    };
}

export function compareCost(bundle, countryCode, itemId) {
    const item = bundle.countries.find(country => country.code === countryCode)?.items.find(entry => entry.id === itemId);
    if (!item) throw new Error('Unknown country or category');
    const from = bundle.years[0], to = bundle.years.at(-1);
    const before = item.prices[from], after = item.prices[to];
    const beforeBtc = before / bundle.btcEurAnnual[from], afterBtc = after / bundle.btcEurAnnual[to];
    return {item, from, to, before, after, beforeBtc, afterBtc,
        euInflation: inflationChanges(bundle.euInflation.indices[from], bundle.euInflation.indices[to]),
        priceChange: (after / before - 1) * 100, ...bitcoinChanges(beforeBtc, afterBtc)};
}
