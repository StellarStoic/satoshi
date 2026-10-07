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
costs **21 sats**, or **11 sats** when the paying pubkey owns an active satoshi.si NIP-05
name. Payment uses the Bark rail.

## Price

| action   | standard | satoshi.si NIP-05 member |
| -------- | -------- | ------------------------- |
| `pin`    | 21 sats  | 11 sats                   |
| `remove` | 21 sats  | 11 sats                   |

Fixed server-side. Half of 21 is not a whole satoshi, so the 50% member discount rounds
up to 11 sats. The desk checks its authoritative NIP-05 records using the order pubkey;
it never trusts a browser claim or a kind-0 profile. The eligibility decision, price and
pubkey are bound to the order.

## GET /sticky/v1/quote?pubkey={64-hex-key}

Returns the current display price before checkout:

```json
{ "ok": true, "baseSats": 21, "sats": 11,
  "discount": { "applied": true, "reason": "satoshi.si NIP-05 member" } }
```

An ineligible key receives 21 sats and `applied: false`. This quote is informational;
order creation checks the authoritative records again.

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
  "sats": 11,
  "discount": { "applied": true, "reason": "satoshi.si NIP-05 member" },
  "paymentMethod": "BARK",
  "paymentMethods": ["BARK", "BTC-LN"],
  "expiresAt": 1791352314,
  "payment": {
    "arkAddress": "ark1…",
    "bolt11": "lnbc110n1p…",
    "lightningUri": "lightning:lnbc110n1p…",
    "paymentLink": "bitcoin:?amount=0.00000011&ark=ark1…",
    "methods": ["BARK", "BTC-LN"],
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
`paymentLink` is BTCPay's own `bitcoin:` URI carrying the exact amount (and, when the
Lightning rail is present, a `lightning=` parameter as well). A Lightning wallet acts on
`payment.lightningUri`, or on the bare `payment.bolt11`; both are passed through unchanged,
so a wallet can scan one QR or paste one invoice without the page having to know which rail
the buyer prefers.

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
  "status": "paid", "sats": 21, "paymentMethod": "BARK", "paymentMethods": ["BARK", "BTC-LN"],
  "expiresAt": 1791352314,
  "payment": { "arkAddress": "ark1…", "bolt11": "lnbc210n1…", "lightningUri": "lightning:lnbc210n1…",
               "paymentLink": "bitcoin:…", "methods": ["BARK", "BTC-LN"], "invoiceId": "…" },
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

{ "event": { "id": "…", "pubkey": "…", "created_at": 1791350494, "kind": 1,
             "tags": [["t","satoshi-sticky"],["client","satoshi.si"],
                      ["sticky","v1","yellow","0.42","0.99","-2.00","typewriter"],
                      ["alt","A paid sticky note pinned on satoshi.si"]],
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
| 400  | `wrong_kind`          | pin must be kind 1, removal kind 5                          |
| 400  | `too_long`            | content over 501 characters                                 |
| 400  | `bad_marker`          | missing, duplicated or wrong `["t","satoshi-sticky"]` tag    |
| 400  | `bad_sticky_tag`      | missing the `["sticky","v1",…]` tag, or an unknown version   |
| 400  | `bad_color`           | color not in the allowed list                               |
| 400  | `bad_font`            | font not in the allowed list                                |
| 400  | `bad_placement`       | x/y not two fractions between 0 and 1                       |
| 400  | `bad_rotation`        | rotation outside -12 through 12 degrees                     |
| 400  | `empty_note`          | the note carries no text                                    |
| 400  | `fingerprint_mismatch`| the note does not hash to the commitment that was paid      |
| 400  | `wrong_target`        | the deletion does not reference the paid `targetEventId`     |
| 400  | `target_missing` / `target_not_owned` / `target_mismatch` | as above    |
| 502  | `relay_rejected`      | the relay refused the write; `error` carries its reason     |

`502 relay_rejected` deserves a sentence in the UI rather than a generic failure: before
settlement the buyer's key is not yet in the relay's whitelist, so a *paid* order is the
only one that can publish (see below). A 502 from a paid order is worth retrying and, if it
persists, showing the relay's message.

## The commitment (what the order buys)

`contentHash` is the fingerprint of the note text and appearance bought by the order.
Placement happens after payment, so it is deliberately not part of this commitment:

```js
async function stickyFingerprint(content, color, font) {
  const payload = `v1\n${color}\n${font}\n${normaliseStickyText(content)}`;
  const bytes = new TextEncoder().encode(payload);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
```

Line endings are normalized to `\n`, trailing horizontal whitespace before a newline is
removed, and the whole note is trimmed before hashing. Change the text, color or font and
the event no longer matches the paid commitment.

## The events

### pin — kind `1`

| tag       | value                                                        | rule        |
| --------- | ------------------------------------------------------------ | ----------- |
| `t`       | `satoshi-sticky`                                             | exactly one |
| `client`  | `satoshi.si`                                                 | exactly one |
| `sticky`  | `v1`, color, x, y, rotation, font                            | exactly one |
| `alt`     | `A paid sticky note pinned on satoshi.si`                    | exactly one |

Colors are `yellow`, `pink`, `blue`, `green`, or `orange`; fonts are `typewriter`,
`mono`, `handwritten`, or `serif`. Positions are decimal fractions from 0 through 1 and
rotation is from -12 through 12 degrees.

`content` is the note text: **at most 501 characters**, counted as the UI counts them
(Unicode code points, so one emoji is one character).

### remove — kind `5` (NIP-09)

One `["e", "<targetEventId>"]` tag referencing the note you paid to remove. Only the author
of that note can order the removal, and the desk checks that against the relay before
pricing it. `content` may hold a short reason.

## Paying

* Rails: **Bark and Lightning**. The invoice is created with `checkout.paymentMethods`
  pinned to `["BARK", "BTC-LN"]`, so exactly those two are offered and on-chain is not
  (21 sats is far below dust anyway). The desk refuses an invoice that comes back with
  neither an ark address nor a BOLT11, so a sticky order never shows a rail the flow would
  not look for.
* **The Lightning amount is read, not trusted.** The desk decodes the sats out of the
  BOLT11 human-readable part (`lnbc210n1…` is 210 nano-BTC, i.e. 21 sats) and refuses an
  invoice asking for anything else — or one that is amount-less or sub-satoshi, which
  cannot carry a fixed price. A discounted 11-sat order therefore cannot be handed a
  21-sat Lightning invoice, and a full-price order cannot be handed an 11-sat one.
* `payment` carries every destination the invoice offers; the board shows them as a
  two-way choice. `paymentMethod` remains `"BARK"` (the native rail, and what the earlier
  response shape carried) while `paymentMethods` lists what is actually on offer.
* Amount: 21 sats normally or 11 sats for a currently eligible satoshi.si NIP-05 pubkey.
  The amount lives in the service; the worker reads it from the order queue and never
  accepts one from the browser.
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
GET  /sticky/v1/worker/queue?wait=20   sticky orders; ?wait is in SECONDS, held up to 25 s when empty
POST /sticky/v1/worker/orders/{id}/invoice   attach the payment rails (ark and/or BOLT11)
POST /sticky/v1/worker/orders/{id}/status    paid | expired | cancelled
GET  /sticky/v1/health                 sticky liveness and counts
GET  /sticky/v1/config                 price, styles, bounds, 501-char limit, commitment
```

`GET /sticky/v1/config` is the public one: a frontend should read the styles, the board
bounds and the character limit from it rather than keeping its own copy.
