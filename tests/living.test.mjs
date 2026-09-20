import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {compareCost, validateBundle, bitcoinChanges, inflationChanges} from '../livingModel.mjs';

const data = JSON.parse(readFileSync(new URL('../historical_data/generated/living-EU-observed.json', import.meta.url)));

test('only current EU countries with membership before 2010', () => {
    assert.equal(validateBundle(data), data);
    assert.equal(data.countries.length, 26);
    assert.ok(data.countries.some(country => country.code === 'SI'));
    assert.ok(data.countries.some(country => country.code === 'IE'));
    for (const excluded of ['HR', 'GB', 'EU', 'US']) assert.ok(!data.countries.some(country => country.code === excluded));
    assert.equal(data.years[0], '2010');
    assert.ok(Number(data.years.at(-1)) < new Date().getUTCFullYear());
});

test('every country/item/year has observed prices and BTC references', () => {
    for (const country of data.countries) {
        assert.deepEqual(country.items.map(item => item.id), ['electricity', 'petrol', 'diesel']);
        for (const item of country.items) {
            assert.equal(item.priceBasis, 'observed');
            assert.ok(!('baseline' in item) && !('indices' in item));
            assert.ok(existsSync(new URL(`../${item.image}`, import.meta.url)));
            for (const year of data.years) {
                assert.equal(item.prices[year], item.quantity * item.unitPrices[year]);
                assert.ok(item.prices[year] > 0);
                assert.ok(Number.isFinite(item.prices[year] / data.btcEurAnnual[year]));
                assert.ok(item.id === 'electricity' ? item.observationCounts[year] === 2 : item.observationCounts[year] >= 48);
            }
            const result = compareCost(data, country.code, item.id);
            assert.equal(result.afterBtc, result.after / data.btcEurAnnual[result.to]);
            assert.equal(result.priceChange, (result.after / result.before - 1) * 100);
        }
    }
});

test('missing data, index snapshots, duplicates and inconsistent units fail validation', () => {
    const mutations = [
        bundle => { delete bundle.countries[0].items[0].prices['2012']; },
        bundle => { bundle.btcEurAnnual['2010'] = 0; },
        bundle => { bundle.countries[0].code = 'HR'; },
        bundle => { bundle.countries[0].code = bundle.countries[1].code; },
        bundle => { bundle.countries[1].items[0].quantity = 50; },
        bundle => { bundle.countries[0].items.pop(); },
        bundle => { bundle.countries[0].items[0].prices['2010'] = NaN; },
        bundle => { bundle.countries[0].items[1].observationCounts['2010'] = 12; },
        bundle => { bundle.years.splice(2, 1); },
        bundle => { bundle.schemaVersion = 2; },
        bundle => { bundle.countries[0].items[0].priceBasis = 'index'; },
        bundle => { delete bundle.euInflation.indices['2012']; },
        bundle => { bundle.euInflation.series = 'CP01'; },
    ];
    for (const mutate of mutations) {
        const broken = structuredClone(data);
        mutate(broken);
        assert.throws(() => validateBundle(broken));
    }
    assert.throws(() => compareCost(data, 'HR', 'electricity'));
    assert.throws(() => compareCost(data, 'SI', 'car'));
});

test('observed starting prices differ between countries', () => {
    const a = compareCost(data, 'SI', 'electricity');
    const b = compareCost(data, 'DE', 'electricity');
    assert.notEqual(a.before, b.before);
    assert.ok(Math.abs(a.before - 14.135) < 0.00001);
    assert.ok(Math.abs(a.after - 19.655) < 0.00001);
});

test('cost reduction and purchasing-power growth use inverse ratios', () => {
    assert.deepEqual(bitcoinChanges(50, 10), {bitcoinChange: -80, purchasingPowerMultiple: 5, purchasingPowerChange: 400});
    assert.deepEqual(bitcoinChanges(10, 50), {bitcoinChange: 400, purchasingPowerMultiple: 0.2, purchasingPowerChange: -80});
    assert.equal(bitcoinChanges(10, 10).purchasingPowerChange, 0);
    const example = bitcoinChanges(144492.06, 0.13472119);
    assert.ok(Math.abs(example.bitcoinChange - (-99.999906762)) < 0.000001);
    assert.ok(Math.abs(example.purchasingPowerChange - 107252560.1049) < 0.001);
    assert.ok(example.purchasingPowerMultiple > 1000000);
    for (const value of [0, -1, NaN, Infinity]) assert.throws(() => bitcoinChanges(value, 1));
});

test('EU inflation measures buying-power loss, not the price-rise percentage', () => {
    const example = inflationChanges(100, 150);
    assert.equal(example.priceRise, 50);
    assert.ok(Math.abs(example.buyingPowerLoss - 100 / 3) < 0.000001);
    assert.equal(example.equivalentCost, 150);
    assert.equal(inflationChanges(100, 100).buyingPowerLoss, 0);
    assert.equal(inflationChanges(100, 50).buyingPowerLoss, -100);
    assert.throws(() => inflationChanges(0, 100));
    const a = compareCost(data, 'SI', 'electricity');
    const b = compareCost(data, 'DE', 'petrol');
    assert.deepEqual(a.euInflation, b.euInflation);
    assert.ok(Math.abs(a.euInflation.buyingPowerLoss - 29.97) < 0.001);
    assert.ok(Math.abs(a.euInflation.equivalentCost - 142.7959) < 0.001);
});
