
import test from 'node:test';
import assert from 'node:assert/strict';
import { boardPatternCss } from '../stickyNotesModel.mjs';

test('a pattern pasted as a whole rule is unwrapped, not refused', () => {
  const pasted = `html {
  --s: 140px; /* control the size*/
  --c1: #170409;
  --c2: #67917a;
  --_g: #0000 52%,var(--c1) 54% 57%,#0000 59%;
  background:
   radial-gradient(farthest-side at -33.33% 50%,var(--_g)) 0 calc(var(--s)/2),
   radial-gradient(farthest-side at 50% 133.33%,var(--_g)) calc(var(--s)/2) 0,
   radial-gradient(farthest-side at 133.33% 50%,var(--_g)),
   radial-gradient(farthest-side at 50% -33.33%,var(--_g)),
   var(--c2);
  background-size: calc(var(--s)/4.667) var(--s),var(--s) calc(var(--s)/4.667);
}`;
  const result = boardPatternCss(pasted);
  assert.equal(result.ok, true, result.error);
  assert.ok(result.properties.some((p) => p.startsWith('--_g:')), 'the private variable survives');
  assert.ok(result.properties.some((p) => p.startsWith('background:')), 'the shorthand survives');
  assert.ok(result.properties.some((p) => p.startsWith('background-size:')), 'the size survives');
});

test('declarations on their own are still accepted', () => {
  const result = boardPatternCss('--s: 9px; background: red');
  assert.equal(result.ok, true, result.error);
});

test('two rules are refused rather than half-applied', () => {
  const result = boardPatternCss('html{--a:1px} div{--b:2px}');
  assert.equal(result.ok, false);
  assert.match(result.error, /one pattern/u);
});

test('an empty rule is named as such', () => {
  const result = boardPatternCss('html { }');
  assert.equal(result.ok, false);
  assert.match(result.error, /empty/u);
});

test('unwrapping does not open the door to a fetch', () => {
  const result = boardPatternCss('html { background: url(https://example.com/a.png) }');
  assert.equal(result.ok, false);
});
