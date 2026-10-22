/**
 * The agent contract, kept honest.
 *
 * AGENTS.md is the only thing an autonomous writer reads before spending sats, so it is checked the
 * way the board's own pages are: it must describe the board the code actually implements, name every
 * paper and font the board draws, carry the exact commitment recipe, and be discoverable from the
 * board's head, llms.txt and the OpenAPI document beside it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { STICKY_COLORS, STICKY_FONTS } from '../stickyNotesModel.mjs';

const read = name => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');

test('the agent contract describes the board the code implements', async () => {
  const agents = read('AGENTS.md');

  // The commitment is the one thing that cannot be guessed, and getting it wrong costs sats.
  assert.match(agents, /sha256_hex\("v1\\n" \+ color \+ "\\n" \+ font \+ "\\n" \+ normalisedText\)/,
    'the document states the exact contentHash recipe');
  assert.match(agents, /trailing spaces and tabs before each\s+newline removed, and the whole trimmed/,
    'and what "normalised" means, because the desk hashes the normalised text');

  // Every paper and every font the board draws, or a writer picks one the desk refuses.
  for (const color of STICKY_COLORS) {
    assert.ok(agents.includes(`\`${color}\``), `the document names the ${color} paper`);
  }
  for (const font of STICKY_FONTS) {
    assert.ok(agents.includes(`\`${font}\``), `the document names the ${font} font`);
  }

  // The wire facts: where the desk is, what it costs, how hard the mining is, what the tags are.
  assert.match(agents, /https:\/\/pay\.satoshi\.si\/pinstr\/v1/, 'the API base is named');
  assert.match(agents, /69/, 'the anonymous price is named');
  assert.match(agents, /29 leading zero bits/, 'the difficulty is named');
  for (const tag of ['["t","pinstr"]', '["expiration"', '["g",', '["i",', '["k","geo"]',
    '["client","satoshi.si"]', '["anonymous","24h-local-key"]', '["sticky"', '["nonce"']) {
    assert.ok(agents.includes(tag), `the tag ${tag} is documented`);
  }

  // The refusals an agent will actually meet, with the code the desk really sends.
  for (const code of ['fingerprint_mismatch', 'bad_expiration', 'geohash_mismatch', 'bad_marker',
    'bad_color', 'bad_font', 'bad_placement', 'bad_rotation', 'wrong_signer', 'insufficient_pow',
    'already_pinned']) {
    assert.ok(agents.includes(code), `the document names the ${code} refusal`);
  }

  // It has to say the thing that protects a reader: notes are public and outlive the board.
  assert.match(agents, /public and permanent where it counts/);
  assert.match(agents, /Never put a secret/);
});

test('an agent can find the contract from the board, llms.txt and the desk config', async () => {
  const head = read('stickyNotes.html');
  assert.match(head, /<link rel="alternate" type="text\/markdown" href="\/AGENTS\.md"/,
    'the board head points at the contract');
  assert.match(head, /<link rel="alternate" type="application\/json" href="\/pinstr-api\.json"/,
    'and at the machine-readable spec');

  const llms = read('llms.txt');
  assert.match(llms, /AGENTS\.md/, 'llms.txt links the contract');
  assert.match(llms, /pinstr-api\.json/, 'llms.txt links the spec');
  assert.match(llms, /GET https:\/\/pay\.satoshi\.si\/pinstr\/v1\/config/, 'and the live config');
});

test('the OpenAPI document is valid JSON and covers the calls the contract makes', async () => {
  const spec = JSON.parse(read('pinstr-api.json'));
  assert.equal(spec.openapi.slice(0, 4), '3.1.', 'it is an OpenAPI 3.1 document');
  assert.deepEqual(spec.servers.map(server => server.url), ['https://pay.satoshi.si/pinstr/v1']);

  // Every call the documented flow makes must exist, or a generator will build a client that 404s.
  for (const path of ['/config', '/orders', '/orders/{id}', '/orders/{id}/publish', '/quote',
    '/subscription', '/board-index', '/boards/{cells}', '/health']) {
    assert.ok(spec.paths[path], `the spec describes ${path}`);
  }
  assert.ok(spec.paths['/orders'].post, 'ordering is a POST');
  assert.ok(spec.paths['/orders/{id}/publish'].post, 'publishing is a POST');
  assert.ok(spec.paths['/orders/{id}/publish'].post.security.some(rule => 'publishToken' in rule),
    'publishing is the call that needs the token');
  assert.ok(spec.components.schemas.OrderRequest.properties.contentHash, 'the commitment is a field');
  assert.ok(spec.components.schemas.Order.properties.publishToken, 'and the token is in the answer');
  assert.equal(spec.components.schemas.NostrEvent.properties.kind.const, 1, 'a pin is kind 1');
});

test('the document warns about the wait the desk really makes a writer wait', async () => {
  // The invoice is minted by a worker that ticks once a minute, not inline. A writer that gives up
  // after ten seconds will call a healthy desk broken, or worse, order a second note.
  const agents = read('AGENTS.md');
  assert.match(agents, /ticks once a minute/, 'the reason for the wait is stated');
  assert.match(agents, /every 5 seconds for up to two minutes/, 'and how long to wait for it');
  assert.match(agents, /"status":"awaiting_invoice"/, 'the real order answer is shown, not a hopeful one');
  assert.match(agents, /attempt < 24/, 'the example waits as long as the prose says');
  // The order step cannot check the words against the commitment: it has not seen them yet.
  assert.match(agents, /the desk has not seen the note/);
});

test('the MCP server is named where an agent looks, and its tools are the ones that exist', async () => {
  // The tools live in a Python service on the VPS, so the contract cannot import them; instead both
  // sides name the same eight tools and the service's own suite asserts its list. Two anchors, one
  // list: a tool added on the server without a mention here is caught by review, and a mention of a
  // tool that does not exist is caught by tools/list disagreeing with this document.
  const agents = read('AGENTS.md');
  assert.match(agents, /## Tools instead of HTTP: MCP/);
  assert.match(agents, /https:\/\/pinstr\.si\/mcp/);
  assert.match(agents, /stateless/i);
  for (const tool of ['pinstr_config', 'pinstr_list_boards', 'pinstr_board_notes', 'pinstr_quote',
    'pinstr_prepare_note', 'pinstr_order_note', 'pinstr_order_status',
    'pinstr_publish_signed_note']) {
    assert.ok(agents.includes('`' + tool + '`'), `the document names the ${tool} tool`);
  }
  for (const uri of ['pinstr://AGENTS.md', 'pinstr://pinstr-api.json', 'pinstr://llms.txt']) {
    assert.ok(agents.includes(uri), `the document names the ${uri} resource`);
  }
  // The one promise that keeps the server safe to expose: it never holds what it could sign with.
  assert.match(agents, /will not do: hold a key/);
  assert.match(agents, /rate limited per address/i);

  const llms = read('llms.txt');
  assert.match(llms, /https:\/\/pinstr\.si\/mcp/);

  const spec = JSON.parse(read('pinstr-api.json'));
  assert.equal(spec['x-mcp'].url, 'https://pinstr.si/mcp');
  assert.equal(spec['x-mcp'].tools.length, 8, 'the spec lists eight tools');
  for (const tool of spec['x-mcp'].tools) {
    assert.ok(agents.includes('`' + tool + '`'), `${tool} in the spec and in the contract`);
  }
});
