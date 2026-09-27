import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import collect


SOURCE = {"id": "test", "label": "Test", "kind": "news"}


class NewsCollectorTests(unittest.TestCase):
    def test_parses_rss_and_strips_markup(self):
        payload = b'''<rss><channel><item><title>Bitcoin update</title><link>https://example.com/a</link><description>&lt;b&gt;Useful&lt;/b&gt; details</description><pubDate>Sat, 26 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>'''
        item = collect.parse_feed(payload, SOURCE)[0]
        self.assertEqual(item["summary"], "Useful details")
        self.assertEqual(item["published"], "2026-09-26T10:00:00Z")

    def test_parses_atom_href(self):
        payload = b'''<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Release</title><link href="https://example.com/r"/><updated>2026-09-25T12:30:00Z</updated><summary>Notes</summary></entry></feed>'''
        item = collect.parse_feed(payload, SOURCE)[0]
        self.assertEqual(item["url"], "https://example.com/r")

    def test_parses_reddit_and_ignores_stickies(self):
        payload = json.dumps({"data": {"children": [{"data": {"stickied": True, "title": "Pinned", "permalink": "/p"}}, {"data": {"title": "Discussion", "permalink": "/r/Bitcoin/x", "created_utc": 1}}]}}).encode()
        items = collect.parse_reddit(payload, SOURCE)
        self.assertEqual([item["title"] for item in items], ["Discussion"])

    def test_discovers_feed_link(self):
        parser = collect.FeedLinkParser()
        parser.feed('<link rel="alternate" type="application/rss+xml" href="/feed.xml">')
        self.assertEqual(parser.links, ["/feed.xml"])

    def test_parses_hacker_news(self):
        payload = json.dumps({"hits": [{"objectID": "42", "title": "Bitcoin discussion", "created_at": "2026-09-01T00:00:00Z"}]}).encode()
        item = collect.parse_hackernews(payload, SOURCE)[0]
        self.assertEqual(item["url"], "https://news.ycombinator.com/item?id=42")


if __name__ == "__main__":
    unittest.main()
