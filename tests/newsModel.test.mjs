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
test('search requires every word across title, summary, and source', () => {
  assert.equal(filterNews(items, {query: 'lightning channel'}).length, 1);
  assert.equal(filterNews(items, {query: 'optech update'}).length, 1);
  assert.equal(filterNews(items, {query: 'lightning ETF'}).length, 0);
});
test('deduplication keeps the first matching URL', () => assert.equal(deduplicateNews([items[0], {...items[0]}]).length, 1));

// ------------------------------------------------------------------------------- images in the text
import {imageUrlFrom, isImageUrl, mediaUrlFromTags, stripImageUrls, withMedia} from '../newsModel.mjs';

const BLOSSOM = 'https://blossom.primal.net/f15b7690333b8cde51ec7a800d75b98ef3f91a891df8649fe7e1a4b53d';

test('a blossom hash is an image even though it has no file extension', () => {
  assert.equal(isImageUrl(BLOSSOM), true);
  assert.equal(isImageUrl('https://nostr.build/i/abc123.png'), true);
  assert.equal(isImageUrl('https://example.com/story.html'), false);
  assert.equal(isImageUrl('https://njump.me/note1abc'), false);
  assert.equal(isImageUrl('not a url'), false);
});

test('a file extension decides on any other host, query string and all', () => {
  assert.equal(imageUrlFrom('see https://example.com/photo.JPG?w=200&h=200 here'), 'https://example.com/photo.JPG?w=200&h=200');
  assert.equal(imageUrlFrom('https://cdn.example.com/a/b.webp'), 'https://cdn.example.com/a/b.webp');
});

test('the picture is lifted out of a Nostr title and the title is left readable', () => {
  const item = withMedia({title: `#6 📰 Nostr in the Media ${BLOSSOM}`, summary: ''});
  assert.equal(item.title, '#6 📰 Nostr in the Media');
  assert.equal(item.image, BLOSSOM);
});

test('image urls are removed and the surrounding text keeps its shape', () => {
  assert.equal(stripImageUrls(`A picture ${BLOSSOM} and words`), 'A picture and words');
  assert.equal(stripImageUrls('keep https://example.com/story.html this link'), 'keep https://example.com/story.html this link');
});

test('an item with no image is untouched', () => {
  const item = withMedia({title: 'Lightning update', summary: 'Channel changes'});
  assert.equal(item.title, 'Lightning update');
  assert.equal(item.summary, 'Channel changes');
  assert.equal('image' in item, false);
});

test('an enclosure image survives, and a title picture is preferred over nothing', () => {
  assert.equal(withMedia({title: 'x', image: 'https://cdn.example.com/e.jpg'}).image, 'https://cdn.example.com/e.jpg');
  assert.equal(withMedia({title: 'x', image: 'https://example.com/notanimage'}).image, undefined);
  assert.equal(withMedia({title: `words ${BLOSSOM}`, image: 'https://cdn.example.com/e.jpg'}).image,
               'https://cdn.example.com/e.jpg');
});

test('the search text no longer contains the image url', () => {
  const item = withMedia({sourceId: 's', source: 'Nostr', title: `Headline ${BLOSSOM}`, summary: ''});
  assert.equal(filterNews([item], {query: 'blossom'}).length, 0);
  assert.equal(filterNews([item], {query: 'headline'}).length, 1);
});

test('a note carries its picture in an imeta tag, and that is what a thumbnail uses', () => {
  const tags = [['t', 'nostr'], ['imeta', `url ${BLOSSOM}`, 'm image/png'], ['title', 'Just a headline']];
  assert.equal(mediaUrlFromTags(tags), BLOSSOM);
});

test('older media tags still work, and a note without an image yields nothing', () => {
  assert.equal(mediaUrlFromTags([['image', 'https://cdn.example.com/i.jpg']]), 'https://cdn.example.com/i.jpg');
  assert.equal(mediaUrlFromTags([['r', 'https://example.com/story.html']]), '');
  assert.equal(mediaUrlFromTags(undefined), '');
  assert.equal(mediaUrlFromTags([['title', 'Text only'], ['t', 'bitcoin']]), '');
});

test('an imeta text url is not mistaken for a picture', () => {
  const tags = [['imeta', 'url https://example.com/article', 'alt a link'], ['imeta', `url ${BLOSSOM}`]];
  assert.equal(mediaUrlFromTags(tags), BLOSSOM);
});
