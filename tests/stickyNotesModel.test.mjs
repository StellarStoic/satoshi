
test('an answer the relay has not indexed yet is not taken off the screen', async () => {
  const {mergeRsvpAnswers} = await import('../stickyNotesModel.mjs');
  const mine = {status: 'tentative', at: 2000};
  const other = {status: 'accepted', at: 1500};
  const merged = mergeRsvpAnswers(new Map([['aaaa', mine]]), new Map([['bbbb', other]]));
  assert.deepEqual(merged.get('aaaa'), mine, 'the reader\'s own answer survives a lagging relay');
  assert.deepEqual(merged.get('bbbb'), other);
  // but a newer answer from the same key replaces the older one
  const newer = {status: 'declined', at: 2500};
  assert.deepEqual(mergeRsvpAnswers(new Map([['aaaa', mine]]), new Map([['aaaa', newer]])).get('aaaa'), newer);
  // and an older copy of the reader's own answer does not overwrite the newer one
  assert.deepEqual(mergeRsvpAnswers(new Map([['aaaa', newer]]), new Map([['aaaa', mine]])).get('aaaa'), newer);
});
