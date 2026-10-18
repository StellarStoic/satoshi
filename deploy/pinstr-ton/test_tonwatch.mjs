import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseTransactions, reconcile, fetchIncoming } from './tonwatch.mjs';

const RAW = '0:5a6e909fcfa7439937c3230d530ce76dd77a51004303df95778601c523fec44f';

const payload = {
  result: [
    { utime: 1_800_000_100, transaction_id: { hash: 'aa11', lt: '1001' }, in_msg: { source: 'src1', destination: RAW, value: '42099860', message: 'pin_abc' } },
    { utime: 1_800_000_050, transaction_id: { hash: 'bb22', lt: '1000' }, in_msg: { source: 'src2', destination: RAW, value: '250768000', message: 'pin_def' } },
    { utime: 1_800_000_040, transaction_id: { hash: 'cc33', lt: '999' }, in_msg: { source: 'src3', destination: '0:other', value: '900000000', message: 'pin_abc' } },
    { utime: 1_800_000_030, transaction_id: { hash: 'dd44', lt: '998' }, in_msg: { source: 'src4', destination: RAW, value: '500000000', message: '' } },
    { utime: 1_800_000_020, transaction_id: { hash: 'ee55', lt: '997' }, in_msg: null },
  ],
};

test('keeps only incoming, commented transfers to the merchant wallet', () => {
  const txs = normaliseTransactions(payload, RAW);
  assert.equal(txs.length, 2);
  assert.deepEqual(txs.map((t) => t.comment), ['pin_abc', 'pin_def']);
  assert.equal(txs[0].key, 'aa11:1001');
});

test('payments are matched by comment and amount', () => {
  const txs = normaliseTransactions(payload, RAW);
  const { paid, unmatched, orphanPayments } = reconcile({
    orders: [
      { id: 'pin_abc', expectedNano: '42099860' },
      { id: 'pin_def', expectedNano: '250768000' },
      { id: 'pin_missing', expectedNano: '1000', expiresAtMs: Date.now() - 1000 },
    ],
    transactions: txs,
    now: Date.now(),
  });
  assert.deepEqual(paid.map((p) => p.id).sort(), ['pin_abc', 'pin_def']);
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].id, 'pin_missing');
  assert.equal(orphanPayments.length, 0);
  assert.equal(paid.find((p) => p.id === 'pin_abc').overpaid, false);
});

test('one transfer can never pay two orders', () => {
  const txs = normaliseTransactions(payload, RAW);
  const { paid } = reconcile({
    orders: [{ id: 'pin_abc', expectedNano: '42099860' }, { id: 'pin_abc', expectedNano: '42099860' }],
    transactions: txs,
    now: Date.now(),
  });
  assert.equal(paid.filter((p) => p.id === 'pin_abc').length, 1);
});

test('an already credited transfer is never credited again', () => {
  const txs = normaliseTransactions(payload, RAW);
  const { paid } = reconcile({
    orders: [{ id: 'pin_abc', expectedNano: '42099860' }],
    transactions: txs,
    creditedKeys: ['aa11:1001'],
    now: Date.now(),
  });
  assert.equal(paid.length, 0);
});

test('underpayment beyond tolerance does not count, overpayment does', () => {
  const txs = [{ key: 'k1', txHash: 'k1', lt: '1', valueNano: '90000000', comment: 'o1', timestamp: 0 }];
  assert.equal(reconcile({ orders: [{ id: 'o1', expectedNano: '100000000' }], transactions: txs }).paid.length, 0);
  const big = [{ key: 'k2', txHash: 'k2', lt: '2', valueNano: '200000000', comment: 'o1', timestamp: 0 }];
  const r = reconcile({ orders: [{ id: 'o1', expectedNano: '100000000' }], transactions: big });
  assert.equal(r.paid.length, 1);
  assert.equal(r.paid[0].overpaid, true);
});

test('unmatched transfers are reported, not dropped', () => {
  const txs = [{ key: 'k3', txHash: 'k3', lt: '3', valueNano: '5000', comment: 'goodbye', timestamp: 0 }];
  const r = reconcile({ orders: [], transactions: txs });
  assert.equal(r.orphanPayments.length, 1);
});

test('fetchIncoming refuses a bad wallet address before any network call', async () => {
  await assert.rejects(() => fetchIncoming({ address: 'nonsense', fetchImpl: () => { throw new Error('should not be called'); } }), /bad merchant address/);
});

test('fetchIncoming normalises a toncenter response', async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => payload });
  const { transactions, raw } = await fetchIncoming({ address: 'UQBabpCfz6dDmTfDIw1TDOdt13pRAEMD35V3hgHFI_7ETxRf', fetchImpl: fakeFetch });
  assert.equal(raw, RAW);
  assert.equal(transactions.length, 2);
});
