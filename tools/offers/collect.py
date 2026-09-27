#!/usr/bin/env python3
"""Build a browser-safe snapshot of public Hodl Hodl P2P offers."""

from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "offers-data.json"
API = "https://hodlhodl.com/api/v1/offers"


def fetch_side(side):
    query = urlencode({
        "filters[asset_code]": "BTC",
        "filters[side]": side,
        "filters[include_global]": "true",
        "pagination[limit]": "100",
        "pagination[offset]": "0",
    })
    request = Request(f"{API}?{query}", headers={
        "Accept": "application/json",
        "User-Agent": "satoshi.si P2P market mirror",
    })
    with urlopen(request, timeout=30) as response:
        payload = json.load(response)
    if payload.get("status") != "success":
        raise RuntimeError(f"Hodl Hodl returned an error for {side} offers")
    return payload.get("offers", [])


def main():
    offers = fetch_side("sell") + fetch_side("buy")
    if not offers:
        raise RuntimeError("Hodl Hodl returned no offers; keeping the previous snapshot")

    currencies = sorted({offer.get("currency_code") for offer in offers if offer.get("currency_code")})
    countries = {}
    payment_methods = {}
    for offer in offers:
        code = offer.get("country_code")
        if code and code != "Global":
            countries[code] = offer.get("country") or code
        methods = offer.get("payment_method_instructions") or offer.get("payment_methods") or []
        for method in methods:
            method_id = str(method.get("payment_method_id") or method.get("id") or "")
            if method_id:
                payment_methods[method_id] = {
                    "id": method_id,
                    "name": method.get("payment_method_name") or method.get("name") or "Payment method",
                    "type": method.get("payment_method_type") or method.get("type") or "Other",
                }

    data = {
        "source": "Hodl Hodl public API",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "offers": offers,
        "currencies": currencies,
        "countries": [{"code": code, "name": name} for code, name in sorted(countries.items(), key=lambda item: item[1])],
        "payment_methods": sorted(payment_methods.values(), key=lambda method: (method["name"], method["id"])),
    }
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Saved {len(offers)} offers to {OUTPUT}")


if __name__ == "__main__":
    main()
