#!/usr/bin/env python3
"""Build a static, normalized snapshot of public Bitcoin P2P offers."""

from __future__ import annotations

from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path
import time
from urllib.parse import urlencode

import requests


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "offers-data.json"
SESSION = requests.Session()
SESSION.headers.update({"Accept": "application/json", "User-Agent": "satoshi.si public P2P order-book mirror"})
SOURCE_LINKS = {
    "hodlhodl": "https://hodlhodl.com/join/L4HT",
    "peach": "https://peachbitcoin.com/referral?code=PRC876",
    "robosats": "https://robosats.com/",
    "mostro": "https://mostro.network/",
    "lnp2pbot": "https://t.me/lnp2pbot",
    "bisq": "https://bisq.network/",
}


def number(value):
    try:
        parsed = float(value)
        return parsed if parsed == parsed else None
    except (TypeError, ValueError):
        return None


def normalized_offer(**values):
    offer = {
        "id": str(values.get("id") or ""), "source": values.get("source"),
        "side": values.get("side"), "currency": str(values.get("currency") or "").upper(),
        "price": number(values.get("price")), "fiat_min": number(values.get("fiat_min")),
        "fiat_max": number(values.get("fiat_max")), "sats_min": number(values.get("sats_min")),
        "sats_max": number(values.get("sats_max")), "premium": number(values.get("premium")),
        "payment_methods": [str(item) for item in values.get("payment_methods", []) if item],
        "country": values.get("country"), "trader": values.get("trader"),
        "trades": number(values.get("trades")), "rating": number(values.get("rating")),
        "online": values.get("online"), "layer": values.get("layer") or "onchain",
        "created_at": values.get("created_at"), "expires_at": values.get("expires_at"),
        "url": values.get("url") or SOURCE_LINKS[values["source"]],
    }
    if not offer["id"] or offer["side"] not in {"buy", "sell"} or not offer["currency"]:
        return None
    return offer


def collect_hodlhodl():
    result = []
    for side in ("sell", "buy"):
        query = urlencode({"filters[asset_code]": "BTC", "filters[side]": side,
                           "filters[include_global]": "true", "pagination[limit]": "100",
                           "pagination[offset]": "0"})
        response = SESSION.get(f"https://hodlhodl.com/api/v1/offers?{query}", timeout=35)
        response.raise_for_status()
        for raw in response.json().get("offers", []):
            methods = raw.get("payment_method_instructions") or raw.get("payment_methods") or []
            trader = raw.get("trader") or {}
            offer = normalized_offer(
                id=raw.get("id"), source="hodlhodl", side=side, currency=raw.get("currency_code"),
                price=raw.get("price"), fiat_min=raw.get("min_amount"), fiat_max=raw.get("max_amount"),
                sats_min=raw.get("min_amount_sats"), sats_max=raw.get("max_amount_sats"),
                premium=raw.get("exchange_price_deviation"),
                payment_methods=[m.get("payment_method_name") or m.get("name") for m in methods],
                country=raw.get("country"), trader=trader.get("login"), trades=trader.get("trades_count"),
                rating=trader.get("rating"), online=trader.get("online_status") == "online",
                layer=raw.get("asset_layer"), url=f"https://hodlhodl.com/offers/{raw.get('id')}")
            if offer:
                result.append(offer)
    return result


def collect_peach():
    result = []
    request_options = {}
    for offer_type, side in (("ask", "sell"), ("bid", "buy")):
        for page in range(3):
            response = SESSION.post(
                f"https://api.peachbitcoin.com/v1/offer/search?page={page}&size=100&sortBy=lowestPremium",
                json={"type": offer_type}, timeout=35, **request_options)
            if response.status_code == 451 and not request_options:
                request_options = {"proxies": {"http": "socks5h://127.0.0.1:9050", "https": "socks5h://127.0.0.1:9050"}}
                response = SESSION.post(
                    f"https://api.peachbitcoin.com/v1/offer/search?page={page}&size=100&sortBy=lowestPremium",
                    json={"type": offer_type}, timeout=45, **request_options)
            response.raise_for_status()
            payload = response.json()
            rows = payload.get("offers", [])
            for raw in rows:
                sats = raw.get("amount")
                sats_min, sats_max = (sats if isinstance(sats, list) else [sats, sats])[:2]
                user = raw.get("user") or {}
                prices = raw.get("prices") or {}
                for currency, methods in (raw.get("meansOfPayment") or {}).items():
                    fiat = number(prices.get(currency))
                    price = fiat * 100_000_000 / number(sats_min) if fiat and number(sats_min) else None
                    offer = normalized_offer(
                        id=f"{raw.get('id')}:{currency}", source="peach", side=side, currency=currency,
                        price=price, fiat_min=fiat, fiat_max=fiat, sats_min=sats_min, sats_max=sats_max,
                        premium=raw.get("premium") or raw.get("maxPremium"), payment_methods=methods,
                        trader=str(user.get("id") or "")[:10], trades=user.get("trades"),
                        rating=user.get("rating"), online=raw.get("online"),
                        created_at=raw.get("publishingDate"), url=SOURCE_LINKS["peach"])
                    if offer:
                        result.append(offer)
            if not rows or not payload.get("remaining"):
                break
    return result


def valid_nostr_event(event):
    try:
        from coincurve import PublicKeyXOnly
        serialized = json.dumps([0, event["pubkey"], event["created_at"], event["kind"], event["tags"], event["content"]], separators=(",", ":"), ensure_ascii=False)
        event_id = hashlib.sha256(serialized.encode()).hexdigest()
        return event_id == event["id"] and PublicKeyXOnly(bytes.fromhex(event["pubkey"])).verify(bytes.fromhex(event["sig"]), bytes.fromhex(event_id))
    except Exception:
        return False


def collect_nip69():
    import websocket

    events = {}
    since = int(time.time()) - 108_000
    author_sources = {
        "a47457722e10ba3a271fbe7040259a3c4da2cf53bfd1e198138214d235064fc2": "peach",
        "fcc2a0bd8f5803f6dd8b201a1ddb67a4b6e268371fe7353d41d2b6684af7a61e": "lnp2pbot",
        "82fa8cb978b43c79b2156585bac2c011176a21d2aead6d9f7c575c005be88390": "mostro",
    }
    relays = {"wss://relay.mostro.network", "wss://relay.damus.io", "wss://nos.lol"}
    try:
        registry = SESSION.get("https://raw.githubusercontent.com/RoboSats/robosats/main/frontend/static/federation.json", timeout=35).json()
        for profile in registry.values():
            clearnet = (profile.get("mainnet") or {}).get("clearnet")
            if clearnet:
                relays.add(clearnet.replace("https://", "wss://").replace("http://", "ws://").rstrip("/") + "/relay/")
    except Exception as error:
        print(f"RoboSats relay registry failed: {error}")

    def fetch_relay(relay):
        found = []
        try:
            ws = websocket.create_connection(relay, timeout=8, origin="https://satoshi.si")
            sub = f"satoshi-{int(time.time())}"
            query = {"kinds": [38383], "since": since, "limit": 2000}
            if relay.endswith("/relay/"):
                query["authors"] = list(author_sources)
            else:
                query["#s"] = ["pending"]
                query["#z"] = ["order"]
            ws.send(json.dumps(["REQ", sub, query]))
            deadline = time.time() + 7
            while time.time() < deadline:
                message = json.loads(ws.recv())
                if message[0] == "EOSE":
                    break
                if message[0] == "EVENT" and valid_nostr_event(message[2]):
                    found.append(message[2])
            ws.close()
        except Exception as error:
            print(f"Nostr relay {relay} failed: {error}")
        return found

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(fetch_relay, relay) for relay in relays]
        for future in as_completed(futures):
            for event in future.result():
                events[event["id"]] = event

    result = []
    now = time.time()
    aliases = {"lnp2pbot": "lnp2pbot", "mostro": "mostro", "robosats": "robosats", "peach": "peach"}
    for event in events.values():
        tags = {tag[0]: tag[1:] for tag in event.get("tags", []) if len(tag) > 1}
        source = author_sources.get(event.get("pubkey")) or aliases.get((tags.get("y") or [""])[0].lower().replace("@", ""))
        if not source:
            continue
        if (tags.get("s") or [None])[0] != "pending":
            continue
        expires = number((tags.get("expires_at") or tags.get("expiration") or [None])[0])
        if expires and expires < now:
            continue
        fiat = [number(value) for value in (tags.get("fa") or []) if number(value) is not None]
        sats = [number(value) for value in (tags.get("amt") or []) if number(value) is not None]
        methods = tags.get("pm") or []
        if len(methods) == 1:
            methods = [item.strip() for item in methods[0].split(",")]
        offer = normalized_offer(
            id=(tags.get("d") or [event["id"]])[0], source=source,
            side=(tags.get("k") or [None])[0], currency=(tags.get("f") or [None])[0],
            fiat_min=fiat[0] if fiat else None, fiat_max=fiat[-1] if fiat else None,
            sats_min=sats[0] if sats else None, sats_max=sats[-1] if sats else None,
            premium=(tags.get("premium") or [None])[0], payment_methods=methods,
            trader=(tags.get("name") or [None])[0], layer=(tags.get("layer") or ["lightning"])[0],
            created_at=datetime.fromtimestamp(event["created_at"], timezone.utc).isoformat(),
            expires_at=datetime.fromtimestamp(expires, timezone.utc).isoformat() if expires else None,
            url=(tags.get("source") or [SOURCE_LINKS[source]])[0])
        if offer:
            result.append(offer)
    return result


def collect_robosats():
    registry = SESSION.get("https://raw.githubusercontent.com/RoboSats/robosats/main/frontend/static/federation.json", timeout=35).json()
    currency_map = SESSION.get(
        "https://raw.githubusercontent.com/RoboSats/robosats/main/frontend/static/assets/currencies.json",
        timeout=35,
    ).json()
    proxies = {"http": "socks5h://127.0.0.1:9050", "https": "socks5h://127.0.0.1:9050"}
    def fetch_coordinator(coordinator, profile):
        network = profile.get("mainnet") or {}
        endpoint = network.get("onion") or network.get("clearnet")
        if not endpoint:
            return []
        collected = []
        try:
            response = SESSION.get(f"{endpoint.rstrip('/')}/api/book/", timeout=22,
                                   proxies=proxies if ".onion" in endpoint else None)
            response.raise_for_status()
            payload = response.json()
            rows = payload.get("orders", payload) if isinstance(payload, dict) else payload
            for raw in rows:
                side = raw.get("type")
                if side is None:
                    side = raw.get("side") or raw.get("direction")
                if isinstance(side, int):
                    side = "buy" if side == 0 else "sell"
                currency = raw.get("currency") or raw.get("currency_code") or raw.get("currency_symbol")
                currency = currency_map.get(str(currency), currency)
                offer = normalized_offer(
                    id=f"{coordinator}:{raw.get('id')}", source="robosats", side=str(side).lower(),
                    currency=currency,
                    price=raw.get("price"), fiat_min=raw.get("min_amount") or raw.get("fiat_min"),
                    fiat_max=raw.get("max_amount") or raw.get("fiat_max") or raw.get("amount"),
                    sats_min=raw.get("min_satoshis") or raw.get("sats_min"),
                    sats_max=raw.get("max_satoshis") or raw.get("satoshis"), premium=raw.get("premium"),
                    payment_methods=[raw.get("payment_method")], trader=raw.get("maker_nick") or coordinator,
                    layer="lightning", created_at=raw.get("created_at") or raw.get("created"),
                    url=f"https://robosats.com/order/{coordinator}/{raw.get('id')}")
                if offer:
                    collected.append(offer)
        except Exception as error:
            print(f"RoboSats coordinator {coordinator} failed: {error}")
        return collected

    result = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(fetch_coordinator, name, profile) for name, profile in registry.items()]
        for future in as_completed(futures):
            result.extend(future.result())
    return result


def collect_bisq():
    result = []
    books = {}
    for currency in ("usd", "eur", "gbp", "chf", "cad", "aud", "jpy", "brl"):
        try:
            response = SESSION.get(f"https://bisq.markets/api/offers?market=btc_{currency}", timeout=15)
            response.raise_for_status()
            books.update(response.json())
        except Exception as error:
            print(f"Bisq BTC/{currency.upper()} failed: {error}")
    for market, book in books.items():
        currency = next((part for part in market.upper().split("_") if part != "BTC"), None)
        if not currency or not isinstance(book, dict):
            continue
        for group, side in (("buys", "buy"), ("sells", "sell")):
            for raw in book.get(group, []):
                offer = normalized_offer(
                    id=raw.get("offer_id"), source="bisq", side=side, currency=currency,
                    price=raw.get("price"), fiat_min=raw.get("min_volume"), fiat_max=raw.get("volume"),
                    payment_methods=[raw.get("payment_method")], created_at=raw.get("offer_date"))
                if offer:
                    result.append(offer)
    if not result:
        raise RuntimeError("Bisq returned no public offers")
    return result


def main():
    collectors = [("hodlhodl", collect_hodlhodl), ("peach", collect_peach),
                  ("nostr", collect_nip69), ("robosats", collect_robosats), ("bisq", collect_bisq)]
    offers, statuses, seen = [], {}, set()
    for name, collector in collectors:
        started = time.time()
        try:
            collected = collector()
            for offer in collected:
                key = (offer["source"], offer["id"], offer["currency"])
                if key not in seen:
                    offers.append(offer)
                    seen.add(key)
            statuses[name] = {"ok": True, "count": len(collected), "milliseconds": round((time.time() - started) * 1000)}
        except Exception as error:
            statuses[name] = {"ok": False, "count": 0, "error": str(error)[:180]}
            print(f"{name} failed: {error}")
    if not offers:
        raise RuntimeError("All P2P sources failed; keeping the previous snapshot")
    data = {
        "schema": 2, "generated_at": datetime.now(timezone.utc).isoformat(), "offers": offers,
        "currencies": sorted({offer["currency"] for offer in offers}),
        "payment_methods": sorted({method for offer in offers for method in offer["payment_methods"]}, key=str.casefold),
        "sources": sorted({offer["source"] for offer in offers}), "source_status": statuses,
    }
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Saved {len(offers)} normalized offers from {len(data['sources'])} markets")


if __name__ == "__main__":
    main()
