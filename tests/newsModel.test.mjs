import test from 'node:test';
import assert from 'node:assert/strict';
import {deduplicateNews, filterNews, parseKeywords} from '../newsModel.mjs';

const items = [
  {sourceId: 'optech', source: 'Optech', title: 'Lightning update', summary: 'Channel changes', url: 'https://a'},
  {sourceId: 'reddit', source: 'Reddit', title: 'Bitcoin price', summary: 'ETF discussion', url: 'https://b'},
];

test('keyword parsing trims and deduplicates', () => assert.deepEqual(parseKeywords(' Lightning,etf, lightning '), ['lightning', 'etf']));
test('an empty enabled-source list shows no default sources', () => assert.deepEqual(filterNews(items, {enabledSources: []}), []));
test('source and keyword filters combine', () => {
  assert.deepEqual(filterNews(items, {enabledSources: ['optech', 'reddit'], required: ['bitcoin'], blocked: ['etf']}), []);
  assert.equal(filterNews(items, {enabledSources: ['optech'], required: ['lightning']}).length, 1);
});
test('deduplication keeps the first matching URL', () => assert.equal(deduplicateNews([items[0], {...items[0]}]).length, 1));
