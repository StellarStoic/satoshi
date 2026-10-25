/**
 * One price list, in two places, saying the same thing.
 *
 * The explainer is what a person reads before signing up; AGENTS.md is what an agent reads before
 * spending. If they disagree, one of the two is lying about money, so every figure in the table is
 * asserted in both documents — and the name ladder, which is the part that is easiest to leave stale,
 * is asserted against the numbers the board itself was priced from.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = name => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');

const about = read('about.html');
const agents = read('AGENTS.md');

/** The table rows as written, so a missing row fails by name instead of by vague substring. */
const situations = [
  ['A subscribed key', '10 sats a week', '411 sats a year'],
  ['With a 5+ character satoshi.si name', '7 sats a week', '308 a year'],
  ['With a 4-character satoshi.si name', '5 sats a week', '205 a year'],
  ['With a 3-character satoshi.si name', 'free'],
  ['An anonymous note', '10 sats per note'],
  ['A note from a key with its own NIP-05 name', 'free', '/.well-known/nostr.json'],
  ['A note from an AI agent', '10 sats'],
  ['A named key that would rather not wait on its domain', '29 bits'],
];

test('the explainer prices every way of pinning', () => {
  assert.match(about, /<h2>What it costs<\/h2>/, 'the explainer has a section about money');
  assert.match(about, /<table class="costs">/, 'and it is a table, not a paragraph to hunt through');
  assert.match(about, /<caption>[^<]*worked out by the board/i,
    'the table says where the numbers come from: the board, not the page');

  for (const [situation, ...prices] of situations) {
    assert.ok(about.includes(situation), `the table has a row for "${situation}"`);
    for (const price of prices) {
      const row = about.slice(about.indexOf(situation), about.indexOf(situation) + 400);
      assert.ok(row.includes(price), `the row for "${situation}" states ${price}`);
    }
  }
});

test('the free ways in are stated as free, not implied', () => {
  // Three characters, an active subscription and proof of work all cost nothing; a reader who is
  // broke has to be able to see that without reading the code.
  assert.match(about, /<span class="free">free<\/span>/, 'the table marks free prices as free');
  assert.match(about, /pay in work instead: <strong>29 bits<\/strong> of proof of work/,
    'and says what the work is, since "free" alone reads like a trick');
  // The NIP-05 row is the newest free door, and the one easiest to state as magic: it names the
  // file the site actually asks for, so a reader can check that their name is where it looks.
  assert.match(about, /<span class="free">free<\/span> — the site asks your domain's <code>\/\.well-known\/nostr\.json<\/code>/,
    'the free-by-name row says which file decides it');
  assert.match(about, /instead of sats, the note's id must start with enough zero bits/,
    'the proof-of-work paragraph explains what the work actually is');
});

test('the name ladder is priced in both documents, the same way round', () => {
  // A 3-character name is the expensive one and the free subscription; losing that inversion would
  // send a reader to buy the wrong name.
  for (const sats of ['50,000', '21,000', '5,000']) {
    assert.ok(about.includes(sats), `the explainer prices a name at ${sats} sats`);
  }
  assert.match(about, /3-character name costs 50,000 sats, a 4-character one 21,000, and anything from 5 to 30 characters 5,000/,
    'shortest name, dearest; and the range that is sold');
  assert.match(about, /Names of one or two characters are not sold/,
    'and the lengths that cannot be bought at all');

  assert.match(agents, /3 characters 50,000 sats, 4 characters 21,000, 5 to 30 characters 5,000/,
    'AGENTS.md prices the same names with the same figures');
});

test('no price in the explainer is missing from the agent contract, or the other way round', () => {
  // The cheap set is shared: every figure the human is shown must also be the figure an agent is
  // told to expect, so a change to one document fails here rather than in a stranger's wallet.
  const shared = ['10', '411', '5', '205', '7', '308', '29 bits', '50,000', '21,000', '5,000'];
  for (const figure of shared) {
    assert.ok(about.includes(figure), `the explainer states ${figure}`);
    assert.ok(agents.includes(figure), `AGENTS.md states ${figure}`);
  }
  assert.match(agents, /A note mined instead of paid \(proof of work\) \| 0, at 29 bits/,
    'AGENTS.md has the free row too');
  // The free door has a meter, and both readers are told the figure: a limit discovered by being
  // refused is a limit that looks like a bug.
  assert.match(about, /<strong>69 notes a day<\/strong>/, 'the explainer states the daily allowance');
  assert.match(agents, /69 free notes per key in a\s+rolling 24 hours/, 'AGENTS.md states it too');
  assert.match(agents, /nip05_daily_limit/, 'and names the refusal an agent will meet');
  // The one price that differs by who is asking, said in both documents: a name makes a person's
  // note free and an agent's note costs 10 whatever name it carries.
  assert.match(agents, /One note from an agent \(`agent: true`\) \| 10 — always, whatever name the key carries/,
    'AGENTS.md states the agent price and that a name does not change it');
  assert.match(agents, /A note whose own NIP-05 name answers for its key \(`nip05`\) \| 0 — free for a person, never for an agent/,
    'and the free door, with its one exclusion');
});

test('both documents agree that a clump is one note, and that expiry is not priced', () => {
  // The claim this replaced ("the prices of the cells are summed, so a clump costs more") was wrong
  // for a year: the desk prices an order once, whatever its cells.
  assert.ok(!/prices of the cells are summed/.test(agents), 'the summed-cells claim is gone');
  assert.match(agents, /A clump is priced as \*\*one\*\* note, not per cell/, 'and is replaced by this');
  assert.match(about, /a note that straddles several cells costs the same as one that fits inside a single cell/,
    'the explainer says the same thing in the reader\'s words');
  assert.match(about, /the expiry you choose — a day or a year — does not change it/,
    'and that expiry does not move the price');
});
