#!/usr/bin/env python3
"""Publishes paid OP_RETURN messages with the BTCPay server D runs.

This runs on the Start9 box because that is the only machine that can reach BTCPay. It
claims orders from the public service on the VPS, turns each into a BTCPay invoice, watches
that invoice, and when the money has arrived writes the message into a transaction from the
store's on-chain wallet and broadcasts it.

    python3 opreturn_worker.py --check        # show the wiring and stop
    python3 opreturn_worker.py --once         # one pass over the queue
    python3 opreturn_worker.py --dry-run      # one pass, never broadcasts
    python3 opreturn_worker.py                # loop

Files it reads, none of which belong in the repo:

    /opt/data/.btcpay/wallet-key      BTCPay API key (wallet + invoice scopes)
    /opt/data/.btcpay/store-id        the store
    /opt/data/.opreturn/worker-token  shared secret for the service's worker routes
"""
from __future__ import annotations

import argparse
import json
import pathlib
import time
import urllib.error
import urllib.request

BTCPAY_BASE = "http://10.0.3.1:52143"
SERVICE_BASE = "https://pay.satoshi.si/opreturn/v1"
CONF = pathlib.Path("/opt/data/.btcpay")
TOKEN_FILE = pathlib.Path("/opt/data/.opreturn/worker-token")
STATE_FILE = pathlib.Path("/opt/data/.opreturn/worker-state.json")
CRYPTO = "BTC"
ONCHAIN_METHOD = "BTC-CHAIN"
# What the buyer may pay with: Ark (Bark) and Lightning arrive in seconds; on-chain is
# offered too, so a plain wallet works but the message waits for a confirmation.
PAYMENT_METHODS = ["BTC-ARK", "BTC-LN", ONCHAIN_METHOD]
POLL_SECONDS = 3
MAX_PUBLISH_ATTEMPTS = 120
# 80 bytes is one standard OP_RETURN output; the service applies the same rule.
MAX_MESSAGE_BYTES = 80


def secret(path: pathlib.Path) -> str:
    if not path.exists():
        return ""
    return path.read_text().strip()


def http(method: str, url: str, key: str = "", body=None, timeout=25, auth: str = ""):
    """Returns (status, parsed_or_text). Transport failure returns status 0."""
    data = None
    headers = {"accept": "application/json", "user-agent": "satoshi-opreturn-worker/1.0"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["content-type"] = "application/json"
    if auth:
        headers["authorization"] = auth
    elif key:
        headers["authorization"] = f"token {key}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    # This box exports http_proxy/https_proxy pointing at Tor's SOCKS port, which urllib
    # reads as an HTTP proxy and refuses ("Tor is not an HTTP Proxy"). BTCPay is on the LAN
    # and the service is reached directly, so no proxy belongs on either connection.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", "replace")
            status = response.status
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        status = exc.code
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return 0, str(exc)
    try:
        return status, json.loads(raw) if raw.strip() else None
    except json.JSONDecodeError:
        return status, raw[:400]


def op_return_script(text: str) -> str:
    """OP_RETURN (0x6a) then the message as a push, hex-encoded."""
    data = text.encode("utf-8")
    if not data:
        raise ValueError("empty message")
    if len(data) > MAX_MESSAGE_BYTES:
        raise ValueError(f"message is {len(data)} bytes, over the {MAX_MESSAGE_BYTES} limit")
    push = f"{len(data):02x}" if len(data) <= 75 else "4c" + f"{len(data):02x}"
    return "6a" + push + data.hex()


class Worker:
    def __init__(self, note_key: str, token: str, dry_run: bool = False):
        self.key = note_key
        self.token = token
        self.dry_run = dry_run
        self.store = secret(CONF / "store-id")
        self.state = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}

    # ---- service ----
    def service(self, method: str, path: str, body=None):
        return http(method, SERVICE_BASE + path, body=body, auth="Bearer " + self.token)

    def report(self, order_id: str, **fields):
        if self.dry_run:
            print(f"    [dry-run] would report {order_id}: {fields}")
            return True
        status, body = self.service("POST", f"/worker/orders/{order_id}", fields)
        if status != 200:
            print(f"    report failed for {order_id}: {status} {str(body)[:160]}")
            return False
        return True

    # ---- btcpay ----
    def btcpay(self, method: str, path: str, body=None):
        return http(method, BTCPAY_BASE + path, key=self.key, body=body)

    def create_invoice(self, order: dict):
        sats = int(order["sats"])
        payload = {
            # Amount in BTC, because BTCPay's invoice API is currency-first.
            "amount": f"{sats / 100000000:.8f}",
            "currency": "BTC",
            "metadata": {
                "orderId": order["id"],
                "itemDesc": "OP_RETURN message",
                "message": order["message"][:120],
            },
            "checkout": {
                "paymentMethods": PAYMENT_METHODS,
                "expirationMinutes": 90,
                "redirectAutomatically": False,
            },
        }
        status, body = self.btcpay("POST", f"/api/v1/stores/{self.store}/invoices", payload)
        if status != 200 or not isinstance(body, dict):
            return None, f"invoice failed: {status} {str(body)[:200]}"
        return body, None

    def rails_for(self, invoice_id: str) -> dict:
        status, body = self.btcpay("GET", f"/api/v1/invoices/{invoice_id}/payment-methods")
        rails = {}
        if status != 200 or not isinstance(body, list):
            return rails
        for method in body:
            name = (method.get("paymentMethod") or method.get("paymentMethodId") or "").upper()
            destination = method.get("destination") or ""
            due = method.get("due") or method.get("amount") or ""
            if not destination:
                continue
            if "ARK" in name or "BARK" in name:
                rails["ark"] = {"destination": destination, "amount": due}
            elif "LN" in name or "LIGHTNING" in name:
                rails["lightning"] = {"destination": destination, "amount": due}
            elif "CHAIN" in name:
                rails["onchain"] = {"destination": destination, "amount": due}
        return rails

    def invoice_state(self, invoice_id: str):
        status, body = self.btcpay("GET", f"/api/v1/stores/{self.store}/invoices/{invoice_id}")
        if status != 200 or not isinstance(body, dict):
            return None
        return body

    # ---- publishing ----
    def publish(self, order: dict):
        """One call: BTCPay builds, signs with the store seed and broadcasts."""
        script = op_return_script(order["message"])
        payload = {
            "destinations": [{"destination": script, "amount": "0", "subtractFromAmount": False}],
            "feerate": 2.0,
            "proceedWithBroadcast": not self.dry_run,
            "signWithSeed": True,
            "noChange": False,
            "rbf": True,
        }
        url = f"/api/v1/stores/{self.store}/payment-methods/{ONCHAIN_METHOD}/wallet/transactions"
        if self.dry_run:
            print("    [dry-run] would POST", url)
            print("    [dry-run] payload:", json.dumps(payload)[:300])
            return None, "dry-run"
        status, body = self.btcpay("POST", url, payload)
        if status in (200, 201) and isinstance(body, dict):
            txid = body.get("transactionHash") or body.get("txid") or ""
            return txid or None, None
        return None, f"broadcast failed: {status} {str(body)[:240]}"

    # ---- one pass ----
    def pass_once(self) -> int:
        status, body = self.service("GET", "/worker/pending")
        if status != 200 or not isinstance(body, dict):
            print(f"queue unavailable: {status} {str(body)[:200]}")
            return 0
        handled = 0
        for order in body.get("pending", []):
            handled += 1
            invoice, error = self.create_invoice(order)
            if error:
                print(f"  {order['id']}: {error}")
                self.report(order["id"], state="failed", reason="Could not open an invoice.")
                continue
            invoice_id = invoice.get("id")
            rails = self.rails_for(invoice_id)
            print(f"  {order['id']}: invoice {invoice_id} for {order['sats']} sats, rails: {sorted(rails)}")
            self.report(order["id"], state="awaiting_payment", invoiceId=invoice_id, rails=rails)

        for order in body.get("watching", []):
            handled += 1
            order_id = order["id"]
            invoice_id = order.get("invoiceId")
            if not invoice_id:
                continue
            invoice = self.invoice_state(invoice_id)
            if invoice is None:
                continue
            invoice_status = str(invoice.get("status", ""))
            if invoice_status in ("Expired", "Invalid"):
                print(f"  {order_id}: invoice {invoice_status.lower()}, closing it")
                self.report(order_id, state="expired")
                continue
            if invoice_status not in ("Settled", "Processing"):
                continue
            attempts = int(self.state.get(order_id, {}).get("attempts", 0))
            if attempts >= MAX_PUBLISH_ATTEMPTS:
                self.report(order_id, state="failed", reason="The message could not be broadcast.")
                continue
            self.state[order_id] = {"attempts": attempts + 1}
            STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
            STATE_FILE.write_text(json.dumps(self.state, indent=1))
            print(f"  {order_id}: paid, publishing after {attempts + 1} attempt(s)")
            txid, error = self.publish(order)
            if error:
                print(f"    {error}")
                self.report(order_id, state="paid", reason="Waiting to broadcast; the wallet needs spendable coins.")
                continue
            print(f"    published: {txid}")
            self.report(order_id, state="published", opReturnTxid=txid, reason=None)
        return handled


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish paid OP_RETURN messages via BTCPay.")
    parser.add_argument("--once", action="store_true", help="one pass, then exit")
    parser.add_argument("--dry-run", action="store_true", help="one pass, never broadcast")
    parser.add_argument("--check", action="store_true", help="explain the wiring and exit")
    args = parser.parse_args()

    note_key = secret(CONF / "wallet-key")
    token = secret(TOKEN_FILE)
    worker = Worker(note_key, token, dry_run=args.dry_run)

    if args.check:
        print("btcpay key:", "present" if note_key else "MISSING", f"({len(note_key)} chars)")
        print("store id:", worker.store or "MISSING")
        print("worker token:", "present" if token else "MISSING", f"({len(token)} chars)")
        print("service:", SERVICE_BASE)
        status, body = worker.service("GET", "/health")
        print("service health:", status, json.dumps(body)[:200] if isinstance(body, dict) else str(body)[:200])
        onchain = http("GET", f"{BTCPAY_BASE}/api/v1/stores/{worker.store}/payment-methods/{ONCHAIN_METHOD}/wallet",
                       key=note_key)
        print("on-chain wallet:", onchain[0], json.dumps(onchain[1])[:160] if isinstance(onchain[1], dict) else "")
        return 0

    if not note_key or not worker.store or not token:
        print("missing configuration: need wallet-key, store-id and worker-token")
        return 2

    if args.once or args.dry_run:
        handled = worker.pass_once()
        print(f"{handled} order(s) looked at")
        return 0

    print(f"watching the queue every {POLL_SECONDS}s")
    while True:
        try:
            worker.pass_once()
        except Exception as exc:  # keep the loop alive: the next pass retries
            print("pass failed:", exc)
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
