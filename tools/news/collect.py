#!/usr/bin/env python3
"""Collect a compact Bitcoin news snapshot for the static site."""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "news-data.json"
USER_AGENT = "satoshi.si news collector (+https://satoshi.si)"
MAX_PER_SOURCE = 35

SOURCES = (
    {"id": "optech", "label": "Bitcoin Optech", "homepage": "https://bitcoinops.org/", "url": "https://bitcoinops.org/feed.xml", "kind": "engineering"},
    {"id": "bitcoin-core", "label": "Bitcoin Core Releases", "homepage": "https://github.com/bitcoin/bitcoin/releases", "url": "https://github.com/bitcoin/bitcoin/releases.atom", "kind": "release"},
    {"id": "blockstream", "label": "Blockstream", "homepage": "https://blog.blockstream.com/", "url": "https://blog.blockstream.com/rss/", "kind": "engineering"},
    {"id": "casa", "label": "Casa", "homepage": "https://blog.casa.io/", "url": "https://blog.casa.io/rss/", "kind": "self-custody"},
    {"id": "bitcoin-magazine", "label": "Bitcoin Magazine", "homepage": "https://bitcoinmagazine.com/", "url": "https://bitcoinmagazine.com/news/feed", "kind": "news"},
    {"id": "decrypt", "label": "Decrypt", "homepage": "https://decrypt.co/", "url": "https://decrypt.co/feed", "kind": "news"},
    {"id": "nobsbitcoin", "label": "No Bullshit Bitcoin", "homepage": "https://www.nobsbitcoin.com/", "url": "https://www.nobsbitcoin.com/rss/", "kind": "news"},
    {"id": "glassnode", "label": "Glassnode Research", "homepage": "https://research.glassnode.com/tag/newsletter/", "url": "https://research.glassnode.com/tag/newsletter/", "kind": "markets", "discover": True},
    {"id": "protos", "label": "Protos", "homepage": "https://protos.com/", "url": "https://protos.com/", "kind": "news", "discover": True},
    {"id": "nostr-compass", "label": "Nostr Compass", "homepage": "https://nostrcompass.org/en/newsletters/", "url": "https://nostrcompass.org/en/newsletters/feed.xml", "kind": "nostr"},
    {"id": "antoine-poinsot", "label": "Antoine Poinsot", "homepage": "https://antoinep.com/posts/", "url": "https://antoinep.com/posts/", "kind": "development", "discover": True},
    {"id": "bitcoin-tldr", "label": "Bitcoin TLDR", "homepage": "https://tldr.bitcoinsearch.xyz/", "url": "https://tldr.bitcoinsearch.xyz/", "kind": "development", "discover": True},
    {"id": "lopp", "label": "Jameson Lopp", "homepage": "https://blog.lopp.net/", "url": "https://blog.lopp.net/", "kind": "research", "discover": True},
    {"id": "jimmy-song", "label": "Jimmy Song", "homepage": "https://jimmysong.medium.com/", "url": "https://medium.com/feed/@jimmysong", "kind": "opinion"},
    {"id": "murch", "label": "Murch", "homepage": "https://murch.one/", "url": "https://murch.one/", "kind": "development", "discover": True},
    {"id": "morehouse", "label": "Brandon Black", "homepage": "https://morehouse.dev/", "url": "https://morehouse.dev/", "kind": "development", "discover": True},
    {"id": "mempool-research", "label": "mempool.space Research", "homepage": "https://mempool.space/research", "url": "https://mempool.space/research", "kind": "research", "discover": True},
    {"id": "peter-todd", "label": "Peter Todd", "homepage": "https://petertodd.org/", "url": "https://petertodd.org/", "kind": "development", "discover": True},
    {"id": "svetski", "label": "Aleksandar Svetski", "homepage": "https://hackernoon.com/u/AleksandarSvetski", "url": "https://hackernoon.com/feed/u/AleksandarSvetski", "kind": "opinion"},
    {"id": "bitcoin-hole", "label": "The Bitcoin Hole", "homepage": "https://thebitcoinhole.com/blog", "url": "https://thebitcoinhole.com/blog", "kind": "education", "discover": True},
    {"id": "dergigi", "label": "Gigi", "homepage": "https://dergigi.com/", "url": "https://dergigi.com/feed.xml", "kind": "culture"},
    {"id": "moneyness", "label": "Moneyness", "homepage": "https://www.moneyness.ca/", "url": "https://www.moneyness.ca/", "kind": "economics", "discover": True},
    {"id": "nakamoto-institute", "label": "Nakamoto Institute", "homepage": "https://nakamotoinstitute.org/mempool/", "url": "https://nakamotoinstitute.org/mempool/feed.xml", "kind": "research"},
    {"id": "unenumerated", "label": "Unenumerated", "homepage": "https://unenumerated.blogspot.com/", "url": "https://unenumerated.blogspot.com/feeds/posts/default", "kind": "economics"},
    {"id": "bitcoin-lightning", "label": "Bitcoin Lightning", "homepage": "https://www.bitcoinlightning.com/", "url": "https://www.bitcoinlightning.com/", "kind": "lightning", "discover": True},
    {"id": "stacker-bitcoin", "label": "Stacker News Bitcoin", "homepage": "https://stacker.news/~bitcoin", "url": "https://stacker.news/~bitcoin/rss", "kind": "community"},
    {"id": "stacker-nostr", "label": "Stacker News Nostr", "homepage": "https://stacker.news/~nostr", "url": "https://stacker.news/~nostr/rss", "kind": "nostr"},
    {"id": "european-bitcoiners", "label": "European Bitcoiners", "homepage": "https://europeanbitcoiners.com/", "url": "https://europeanbitcoiners.com/rss/", "kind": "news"},
    {"id": "nostr-uk", "label": "Nostr UK", "homepage": "https://nostr.co.uk/", "url": "https://nostr.co.uk/rss.xml", "kind": "nostr"},
    {"id": "hacker-news", "label": "Hacker News", "homepage": "https://news.ycombinator.com/", "url": "https://hn.algolia.com/api/v1/search_by_date?query=bitcoin&tags=story&hitsPerPage=35", "kind": "community", "format": "hackernews"},
    {"id": "reddit-bitcoin", "label": "Reddit r/Bitcoin", "homepage": "https://www.reddit.com/r/Bitcoin/", "url": "https://www.reddit.com/r/Bitcoin/hot.json?limit=40&raw_json=1", "kind": "community", "format": "reddit"},
    {"id": "reddit-nostr", "label": "Reddit r/nostr", "homepage": "https://www.reddit.com/r/nostr/", "url": "https://www.reddit.com/r/nostr/hot.json?limit=40&raw_json=1", "kind": "nostr", "format": "reddit"},
)


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/atom+xml, application/rss+xml, application/json;q=0.9, */*;q=0.8"})
    with urllib.request.urlopen(request, timeout=25) as response:
        return response.read()


class FeedLinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "link":
            return
        values = dict(attrs)
        if "alternate" in values.get("rel", "").lower() and values.get("type", "").lower() in {"application/rss+xml", "application/atom+xml"} and values.get("href"):
            self.links.append(values["href"])


def fetch_feed(source: dict) -> bytes:
    payload = fetch(source["url"])
    if not source.get("discover"):
        return payload
    parser = FeedLinkParser()
    parser.feed(payload.decode("utf-8", errors="ignore"))
    if not parser.links:
        raise ValueError("site does not advertise an RSS or Atom feed")
    return fetch(urljoin(source["url"], parser.links[0]))


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def child_text(element: ET.Element, *names: str) -> str:
    wanted = set(names)
    for child in element:
        if local_name(child.tag) in wanted:
            return "".join(child.itertext()).strip()
    return ""


def clean_text(value: str, limit: int = 420) -> str:
    value = re.sub(r"<[^>]+>", " ", value or "")
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value).strip()
    return value[:limit].rstrip()


def iso_date(value: str | int | float | None) -> str:
    if isinstance(value, (int, float)):
        date = datetime.fromtimestamp(value, timezone.utc)
    else:
        raw = (value or "").strip()
        try:
            date = parsedate_to_datetime(raw)
        except (TypeError, ValueError):
            try:
                date = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            except ValueError:
                date = datetime.now(timezone.utc)
    if date.tzinfo is None:
        date = date.replace(tzinfo=timezone.utc)
    return date.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_feed(payload: bytes, source: dict) -> list[dict]:
    try:
        root = ET.fromstring(payload)
    except ET.ParseError:
        text = payload.decode("utf-8", errors="replace")
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
        text = re.sub(r"&(?!#\d+;|#x[0-9a-fA-F]+;|\w+;)", "&amp;", text)
        root = ET.fromstring(text)
    entries = [element for element in root.iter() if local_name(element.tag) in {"item", "entry"}]
    items = []
    for entry in entries[:MAX_PER_SOURCE]:
        title = clean_text(child_text(entry, "title"), 180)
        link = child_text(entry, "link")
        if not link:
            for child in entry:
                if local_name(child.tag) == "link" and child.attrib.get("rel", "alternate") == "alternate":
                    link = child.attrib.get("href", "")
                    if link:
                        break
        if not title or not link.startswith(("http://", "https://")):
            continue
        published = child_text(entry, "pubdate", "published", "updated", "date")
        summary = child_text(entry, "description", "summary", "content", "encoded")
        items.append(make_item(source, title, link, clean_text(summary), iso_date(published)))
    return items


def parse_reddit(payload: bytes, source: dict) -> list[dict]:
    posts = json.loads(payload).get("data", {}).get("children", [])
    items = []
    for wrapper in posts:
        post = wrapper.get("data", {})
        if post.get("stickied"):
            continue
        title = clean_text(post.get("title", ""), 180)
        permalink = post.get("permalink", "")
        if not title or not permalink.startswith("/"):
            continue
        items.append(make_item(source, title, f"https://www.reddit.com{permalink}", clean_text(post.get("selftext", "")), iso_date(post.get("created_utc"))))
        if len(items) >= MAX_PER_SOURCE:
            break
    return items


def parse_hackernews(payload: bytes, source: dict) -> list[dict]:
    items = []
    for hit in json.loads(payload).get("hits", []):
        title = clean_text(hit.get("title", ""), 180)
        item_id = hit.get("objectID")
        url = hit.get("url") or (f"https://news.ycombinator.com/item?id={item_id}" if item_id else "")
        if title and url.startswith(("http://", "https://")):
            items.append(make_item(source, title, url, clean_text(hit.get("story_text", "")), iso_date(hit.get("created_at"))))
    return items[:MAX_PER_SOURCE]


def make_item(source: dict, title: str, url: str, summary: str, published: str) -> dict:
    item_id = hashlib.sha256(f"{source['id']}:{url}".encode()).hexdigest()[:20]
    return {"id": item_id, "sourceId": source["id"], "source": source["label"], "kind": source["kind"], "title": title, "summary": summary, "url": url, "published": published}


def collect_source(source: dict) -> tuple[dict, list[dict]]:
    public = {key: source[key] for key in ("id", "label", "homepage", "kind")}
    try:
        payload = fetch_feed(source)
        parser = {"reddit": parse_reddit, "hackernews": parse_hackernews}.get(source.get("format"), parse_feed)
        items = parser(payload, source)
        if not items:
            raise ValueError("feed contained no usable posts")
        public.update(status="ok", itemCount=len(items))
        return public, items
    except Exception as error:  # Keep healthy providers usable when one changes format.
        public.update(status="failed", itemCount=0, error=str(error)[:160])
        return public, []


def collect() -> dict:
    with ThreadPoolExecutor(max_workers=8) as executor:
        collected = list(executor.map(collect_source, SOURCES))
    source_status = [status for status, _ in collected]
    all_items = [item for _, items in collected for item in items]

    unique = {}
    for item in all_items:
        unique.setdefault(item["url"], item)
    items = sorted(unique.values(), key=lambda item: item["published"], reverse=True)
    if not items:
        raise RuntimeError("Every news source failed; previous snapshot retained")
    return {"generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "sources": source_status, "items": items}


def write_atomic(data: dict) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix="news-", suffix=".json", dir=ROOT)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=True, separators=(",", ":"))
            handle.write("\n")
        os.replace(temporary, OUTPUT)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == "__main__":
    result = collect()
    write_atomic(result)
    healthy = sum(source["status"] == "ok" for source in result["sources"])
    print(f"Collected {len(result['items'])} posts from {healthy}/{len(result['sources'])} sources")
