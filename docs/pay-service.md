# satoshi.si payments — service contract

One payment service now fronts everything satoshi.si charges for. It lives on the VPS
that already ran the NIP-05 order desk and reuses that desk's BTCPay store, its Bark
payment method, and its worker on D's Start9. Nothing here creates a second wallet or a
second invoice pipeline.

```
pay.satoshi.si      canonical      https://pay.satoshi.si
nip05.satoshi.si    compatibility  https://nip05.satoshi.si
```

Both hostnames serve the *same* API through the same nginx location blocks
(`/etc/nginx/snippets/satoshi-pay-locations.conf`), so they cannot drift. The old hostname
stays up until the migration is confirmed. Do not hard-code either host in more than one
place: the page should read it from a single constant.

## Rules that apply to every endpoint

* **CORS is only `https://satoshi.si` and `https://www.satoshi.si`.** A request from any
  other origin is answered `403` by nginx before it reaches the service. Curl with no
  `Origin` header is allowed (that is how the worker talks).
* **The service is the only place a price exists.** A client that sends `sats` or `amount`
  is refused with `400 unexpected field`, not politely ignored: a page must never believe
  it can name its own price.
* **Rate limits** (per IP, nginx): reads 60/min, order creation 4/min, worker routes 60/min.
  A `503` means you are over the limit, so back off.
* **Errors** are always JSON: `{"ok": false, "reason": "<machine-readable>", "error": "<human sentence>"}`.
  Show `error` to the user; branch on `reason`.
* **Nothing secret is ever logged or echoed.** Payment destinations appear in responses
  because the buyer has to pay them; they are never written to a log line.

---

# 1. Sticky notes

A sticky note is a note pinned to the satoshi.si board. Publishing one, or removing one,
costs **21 sats**, paid on the Bark rail.

## Price

| action   | price     |
| -------- | --------- |
| `pin`    | 21 sats   |
| `remove` | 21 sats   |

Fixed server-side. The desk prices every order from its own constants.

## Order lifecycle

```
awaiting_invoice ──► awaiting_payment ──► paid ──► published
        │                    │
        │                    └────► expired   (invoice window closed)
        └──────────────────────────► (pruned an hour after expiry)
```

`paid` means BTCPay reports the invoice **Settled**. `Processing` (seen, not confirmed)
does not count. `published` means the signed note was accepted by the relay.

## POST /sticky/v1/orders

Create an order. Unauthenticated by design; the pubkey is the identity.

**request**

```json
{ "action": "pin",
  "pubkey": "a127e1254181099aa2891a9b0a15823777a2e0ce666ba618d53a07b890de56af",
  "contentHash": "f85b3318961505a15465bd9bfca8ce0fa45336ed68cf53b4564643db6c14d1e9" }
```

```json
{ "action": "remove",
  "pubkey": "a127e1254181099aa2891a9b0a15823777a2e0ce666ba618d53a07b890de56af",
  "targetEventId": "3afcf930479f3f1f4a9b614423ba9e83938efea78849ee111717e0d0c664eeef" }
```

`action` is exactly `pin` or `remove`. `pubkey`, `contentHash` and `targetEventId` are
64-character lowercase hex. Nothing else is accepted.

**response — `201`**

```json
{ "ok": true,
  "id": "03ad90da9fc3716c0dad4fd5",
  "action": "pin",
  "status": "awaiting_payment",
  "sats": 21,
  "paymentMethod": "BARK",
  "expiresAt": 1791352314,
  "payment": {
    "arkAddress": "ark1…",
    "paymentLink": "bitcoin:?amount=0.00000021&ark=ark1…",
    "invoiceId": "Rb7aCbq1e3W9qAbitdyEQZ"
  },
  "commitment": { "contentHash": "f85b33…" },
  "paid": false,
  "publishToken": null,
  "publishTokenExpiresAt": null,
  "publishedEventId": null,
  "note": "Pay the Bark rail, then poll this order for your publish token."
}
```

**There is no `checkoutLink`, deliberately.** BTCPay on this box reports a LAN-only
checkout URL (`http://10.0.3.1:52143/i/<invoice>`): a browser on the internet cannot open
it, and BTCPay is intentionally not published. What a Bark wallet can act on is the rail
itself, so `payment.arkAddress` and `payment.paymentLink` are the payable things.
`paymentLink` is BTCPay's own `bitcoin:` URI carrying the exact amount.

**Latency.** The desk holds this request for up to ~20 s while the worker attaches the
rail, so a normal call already comes back payable. If `payment` is `null`
(`status: "awaiting_invoice"`), the worker has not got to it yet — poll
`GET /sticky/v1/orders/{id}` every ~5 s rather than creating another order.

**Refusals**

| HTTP | reason             | when                                                     |
| ---- | ------------------ | -------------------------------------------------------- |
| 400  | (validation text)  | bad `action`, a key or hash that is not 64 hex, a `sats` field |
| 409  | `target_missing`   | a removal for a note the relay does not have             |
| 409  | `target_not_owned` | a removal for a note written by a different pubkey       |
| 409  | `already_pinned`   | the same note on the same key is already pinned and live  |

A removal is checked **before** it is priced: the desk reads the note from the relay and
compares its author. A stranger cannot even buy a removal for your note.

## GET /sticky/v1/orders/{id}

```json
{ "ok": true, "id": "03ad90da9fc3716c0dad4fd5", "action": "pin",
  "status": "paid", "sats": 21, "paymentMethod": "BARK", "expiresAt": 1791352314,
  "payment": { "arkAddress": "ark1…", "paymentLink": "bitcoin:…", "invoiceId": "…" },
  "commitment": { "contentHash": "f85b33…" },
  "paid": true,
  "publishToken": "eyJ…",
  "publishTokenExpiresAt": 1791353214,
  "publishedEventId": null }
```

`publishToken` is `null` until the invoice is **Settled**, then it is present exactly once
per order: it disappears from this response the moment it has been used successfully or
once it expires (15 minutes after settlement). Poll this endpoint after paying.

## POST /sticky/v1/orders/{id}/publish

```http
POST /sticky/v1/orders/03ad90da9fc3716c0dad4fd5/publish
Authorization: Bearer eyJ…
Content-Type: application/json

{ "event": { "id": "…", "pubkey": "…", "created_at": 1791350494, "kind": 30078,
             "tags": [["t","sticky"],["style","yellow"],["pos","42","99"],["d","f85b…"],["x","f85b…"]],
             "content": "sticky e2e test note", "sig": "…" } }
```

The token may go in the header (preferred) or in the body as `publishToken`.

The desk checks, in this order, **before** anything reaches the relay:

1. the token — valid for *this* order, *this* pubkey, *this* action, *this* commitment, unused, unexpired;
2. the event — id matches its contents, and the BIP-340 signature verifies;
3. the signer equals the pubkey that paid;
4. freshness — signed at most an hour before publishing, not stamped more than 5 minutes into the future;
5. the shape for the action (see below);
6. for a removal, that the target note exists on the relay and was written by the same pubkey.

Then it publishes to `wss://nostr.satoshi.si`, and reports what actually happened.

**`200`** — published. The note is on the relay and the pin is live for 30 days:

```json
{ "ok": true, "status": "published", "publishedEventId": "…", "action": "pin" }
```

**Refusals** — nothing was published, and the token was **not** consumed, so a client can
fix the problem and retry with the same token:

| HTTP | reason                | meaning                                                     |
| ---- | --------------------- | ----------------------------------------------------------- |
| 403  | `token_missing`       | no token presented                                          |
| 403  | `token_invalid`       | token does not belong to this order/pubkey/action/commitment |
| 403  | `token_used`          | already spent on a successful publish                       |
| 403  | `token_expired`       | older than 15 minutes                                       |
| 403  | `not_paid`            | the invoice is not Settled                                  |
| 400  | `bad_event`           | malformed event, or its id/signature does not check out     |
| 400  | `wrong_signer`        | signed by a key other than the one that paid                |
| 400  | `stale_event`         | signed more than an hour before the order                   |
| 400  | `future_event`        | timestamp too far ahead                                     |
| 400  | `wrong_kind`          | pin must be kind 30078, removal kind 5                      |
| 400  | `too_long`            | content over 501 characters                                 |
| 400  | `bad_marker`          | missing or duplicated `["t","sticky"]`                      |
| 400  | `bad_style`           | style not in the allowed list                               |
| 400  | `bad_placement`       | `pos` not two integers, or outside the board                |
| 400  | `fingerprint_mismatch`| the note does not hash to the commitment that was paid      |
| 400  | `bad_d_tag` / `bad_x_tag` | the paid hash is not in `d` (and `x`)                   |
| 400  | `wrong_target`        | the deletion does not reference the paid `targetEventId`     |
| 400  | `target_missing` / `target_not_owned` / `target_mismatch` | as above    |
| 502  | `relay_rejected`      | the relay refused the write; `error` carries its reason     |

`502 relay_rejected` deserves a sentence in the UI rather than a generic failure: before
settlement the buyer's key is not yet in the relay's whitelist, so a *paid* order is the
only one that can publish (see below). A 502 from a paid order is worth retrying and, if it
persists, showing the relay's message.

## The commitment (what the 21 sats buy)

`contentHash` is the fingerprint of the note you intend to publish. Compute it exactly
like this — a JS one-liner, no JSON key-ordering traps:

```js
async function stickyFingerprint(content, style, x, y) {
  const payload = `sticky/v1\n${style}\n${x}\n${y}\n${content}`;
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
```

`sha256(utf8("sticky/v1\n" + style + "\n" + x + "\n" + y + "\n" + content))`, lowercase hex.
`content` is last so its own newlines are unambiguous. Change any of the four inputs and
the seller cannot publish what you paid for — that is the point.

## The events

### pin — kind `30078`

| tag       | value                                    | rule                                   |
| --------- | ---------------------------------------- | -------------------------------------- |
| `t`       | `sticky`                                 | exactly one                            |
| `style`   | `yellow` `green` `blue` `pink` `purple` `orange` | exactly one, from that list    |
| `pos`     | `x`, `y`                                 | exactly two integers, each `0…1000`    |
| `d`       | the paid `contentHash`                   | exactly one — makes repins replaceable |
| `x`       | the paid `contentHash`                   | exactly one                            |

`content` is the note text: **at most 501 characters**, counted as the UI counts them
(Unicode code points, so one emoji is one character).

Because `d` is the content hash, publishing the same note again replaces it rather than
duplicating it — and the desk refuses to sell a pin for a note that is already pinned and
live on the same key.

### remove — kind `5` (NIP-09)

One `["e", "<targetEventId>"]` tag referencing the note you paid to remove. Only the author
of that note can order the removal, and the desk checks that against the relay before
pricing it. `content` may hold a short reason.

## Paying

* Rail: **Bark only**. The invoice is created with the `BARK` payment method pinned, and
  the desk refuses an invoice that comes back without an ark address — so a sticky order
  never shows a rail the flow would not look for.
* Lightning and on-chain are **not** offered for stickies; they are neither required nor
  watched here.
* Amount: exactly 21 sats (`0.00000021 BTC`). The amount lives in the service; the worker
  reads it from the order queue and never invents one.
* Expiry: the invoice window is 30 minutes. `expiresAt` on the order is the authoritative
  time, in Unix seconds.

## Relay write access

`wss://nostr.satoshi.si` only accepts events from whitelisted pubkeys, and the list is
rebuilt hourly from `nostr.json` plus keys that paid for a sticky:

* **paid, not yet published** — allowed, so the note you just paid for can be published at
  all; kept for the 15-minute publish window plus an hour of grace;
* **published** — allowed while the pin is live (30 days);
* **expired or removed** — dropped at the next sync, so 21 sats is not permanent write access.

The worker kicks that sync the moment an invoice settles, so a paid buyer can publish
within seconds instead of waiting for the hour to pass.

---

# 2. NIP-05 names (unchanged)

Served identically on both hostnames; the only change is that `pay.satoshi.si` is now the
canonical address.

* `GET /nip05/v1/config` — prices, reserved names, held-back lengths
* `GET /nip05/v1/names/{name}` — is this name for sale right now
* `GET /nip05/v1/keys/{pubkey}` — does this key already own a name here
* `POST /nip05/v1/orders` — `{name, pubkey}` → order + `note`, then poll for rails
* `GET /nip05/v1/orders/{id}` — status plus the rails (`address`, `bolt11`, `ark`)
* `GET /nip05/v1/health` — liveness

Prices: 3 characters 50000 sats, 4 characters 21000 sats, 5+ characters 5000 sats;
1–2 characters are held back. One key, one name. A name that already exists under a
different key is never overwritten.

# 3. Worker-only endpoints

Presented for completeness; they require `Authorization: Bearer <worker token>` and are
never called from a browser.

```
GET  /nip05/v1/worker/queue            orders needing an invoice or a status check
POST /nip05/v1/worker/names            publish the names snapshot
POST /nip05/v1/worker/orders/{id}/invoice    attach the payment rails
POST /nip05/v1/worker/orders/{id}/status     new | paid | expired | conflict
GET  /sticky/v1/worker/queue?wait=20   sticky orders; long-polls up to 25 s when empty
POST /sticky/v1/worker/orders/{id}/invoice   attach the Bark rail
POST /sticky/v1/worker/orders/{id}/status    paid | expired | cancelled
GET  /sticky/v1/health                 sticky liveness and counts
GET  /sticky/v1/config                 price, styles, bounds, 501-char limit, commitment
```

`GET /sticky/v1/config` is the public one: a frontend should read the styles, the board
bounds and the character limit from it rather than keeping its own copy.
