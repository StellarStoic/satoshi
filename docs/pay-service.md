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

A sticky note is a note pinned to the satoshi.si board. Publishing or removing one costs
**11 sats** for an ordinary signed-in Nostr user and is **free** when that pubkey owns an
active satoshi.si NIP-05 name. A browser-generated 24-hour anonymous identity costs
**42 sats**. Paid orders are payable over Ark and Lightning.

## Price

| action   | signed-in Nostr user | satoshi.si NIP-05 member | anonymous identity |
| -------- | -------------------- | ------------------------- | ------------------ |
| `pin`    | 11 sats              | free                      | 42 sats            |
| `remove` | 11 sats              | free                      | 42 sats            |

Fixed server-side. The desk checks its authoritative NIP-05 records using the order
pubkey; it never trusts a browser claim, a submitted NIP-05 string, or a kind-0 profile.
The eligibility decision, price and pubkey are bound to the order. For removal, the desk
also reads the target event: its signed `anonymous` marker determines the 42-sat tier.

## GET /sticky/v1/quote?pubkey={64-hex-key}

Returns the current display price before checkout. An active satoshi.si member receives:

```json
{ "ok": true, "baseSats": 11, "sats": 0,
  "discount": { "applied": true, "reason": "satoshi.si NIP-05 member" } }
```

An ordinary signed-in key receives 11 sats and `applied: false`. This quote is informational;
order creation checks the authoritative records again.

## Order lifecycle

```
paid (free member) ───────────────────────────────► published
        ▲
awaiting_invoice ──► awaiting_payment ────────────► paid ──► published
        │                    │
        │                    └────► expired   (invoice window closed)
        └──────────────────────────► (pruned an hour after expiry)
```

For an 11- or 42-sat order, `paid` means BTCPay reports the invoice **Settled**;
`Processing` does not count. A verified zero-sat member order starts in `paid` without
creating an invoice or worker job. `published` means the signed event was accepted by
the relay.

## POST /sticky/v1/orders

Create an order. Unauthenticated by design; the pubkey is the identity.

**request**

```json
{ "action": "pin",
  "pubkey": "a127e1254181099aa2891a9b0a15823777a2e0ce666ba618d53a07b890de56af",
  "contentHash": "f85b3318961505a15465bd9bfca8ce0fa45336ed68cf53b4564643db6c14d1e9",
  "geohash": "u0qj7z0y1",
  "geohashes": ["u0qj7z0y1", "u0qj7z0z1"],
  "geohashMode": "prefix" }
```

```json
{ "action": "remove",
  "pubkey": "a127e1254181099aa2891a9b0a15823777a2e0ce666ba618d53a07b890de56af",
  "targetEventId": "3afcf930479f3f1f4a9b614423ba9e83938efea78849ee111717e0d0c664eeef" }
```

`action` is exactly `pin` or `remove`. `pubkey`, `contentHash` and `targetEventId` are
64-character lowercase hex. Every pin requires a lowercase geohash of **4 through 9**
characters from the geohash alphabet: below 4 a cell is a region rather than a place, and
9 is as deep as the grid is useful.

A pin may cover **one cell or a clump of them**, which is what lets one note sit on a
building that straddles two or three cells. Send either `geohash` (one cell, the older
shape, still accepted) or `geohashes` (an array, one to nine cells). When both are sent
they have to agree, and `geohash` must be the first entry of `geohashes`. The rules for a
clump: every cell cut to the **same depth**, each cell listed **once**, no more than
**nine** cells, and the cells must **touch** — sharing an edge or a corner — so that the
clump is one connected piece. Any violation is `bad_geohash`, before anything is priced.
The first cell is the *primary*: the one the note is written on, and the one the `["i"]`
tag names. The whole clump is what is bought, and it is **one note on one price** — a
clump costs exactly what a single cell costs.

`geohashMode` is required for a pin and is exactly `prefix` or `exact`. `anonymous: true`
is optional and valid only for `pin`; it selects the fixed 42-sat price. Nothing else is
accepted. The created order binds every cell of the clump, the geohash mode and the
identity mode alongside the pubkey and commitment; the publish token is derived from
all of them.

**response — `201`**

```json
{ "ok": true,
  "id": "03ad90da9fc3716c0dad4fd5",
  "action": "pin",
  "status": "paid",
  "sats": 0,
  "discount": { "applied": true, "reason": "satoshi.si NIP-05 member" },
  "paymentMethod": null,
  "paymentMethods": [],
  "expiresAt": 1791352314,
  "payment": null,
  "commitment": { "contentHash": "f85b33…" },
  "paid": true,
  "publishToken": "eyJ…",
  "publishTokenExpiresAt": 1791353214,
  "publishedEventId": null,
  "note": "No payment required. Place and sign the note before the publish token expires."
}
```

The response above is the zero-sat member path. It must return the publish token in the
creation response because there is nothing to poll or settle. An 11- or 42-sat response
keeps the existing `awaiting_invoice` / `awaiting_payment` shape and payment rails.

**Paid orders have no `checkoutLink`, deliberately.** BTCPay on this box reports a LAN-only
checkout URL (`http://10.0.3.1:52143/i/<invoice>`): a browser on the internet cannot open
it, and BTCPay is intentionally not published. What a Bark wallet can act on is the rail
itself, so `payment.arkAddress` and `payment.paymentLink` are payable things.
`paymentLink` is BTCPay's own `bitcoin:` URI carrying the exact amount. Lightning wallets
use `payment.lightningUri` or the bare `payment.bolt11`.

**Paid-order latency.** The desk holds this request for up to about 8 seconds while the worker
attaches the invoice. If `payment` is still `null` (`status: "awaiting_invoice"`), the
browser keeps the already-open payment sheet visible and polls the same order every
3 seconds. It must never create a second order.

**Refusals**

| HTTP | reason             | when                                                     |
| ---- | ------------------ | -------------------------------------------------------- |
| 400  | (validation text)  | bad `action`, a key or hash that is not 64 hex, a `sats` field |
| 400  | `bad_geohash`      | a pin has no geohash or uses an invalid geohash alphabet/length |
| 400  | `bad_geohash_mode` | a pin does not choose exactly `prefix` or `exact`          |
| 409  | `target_missing`   | a removal for a note the relay does not have             |
| 409  | `target_not_owned` | a removal for a note written by a different pubkey       |
| 409  | `already_pinned`   | the same note on the same key is already pinned and live  |

A removal is checked **before** it is priced: the desk reads the note from the relay and
compares its author. A stranger cannot even buy a removal for your note.

## GET /sticky/v1/orders/{id}

```json
{ "ok": true, "id": "03ad90da9fc3716c0dad4fd5", "action": "pin",
  "status": "paid", "sats": 11, "paymentMethod": "BARK", "paymentMethods": ["BARK", "BTC-LN"],
  "expiresAt": 1791352314,
  "payment": { "arkAddress": "ark1…", "bolt11": "lnbc210n1…",
               "lightningUri": "lightning:lnbc210n1…", "paymentLink": "bitcoin:…", "invoiceId": "…" },
  "commitment": { "contentHash": "f85b33…" },
  "paid": true,
  "publishToken": "eyJ…",
  "publishTokenExpiresAt": 1791353214,
  "publishedEventId": null }
```

For paid orders, `publishToken` is `null` until the invoice is **Settled**. For a free
member order it is issued immediately. It disappears from this response once used or
expired (15 minutes after settlement or free authorization). Poll only paid orders.

## POST /sticky/v1/orders/{id}/publish

```http
POST /sticky/v1/orders/03ad90da9fc3716c0dad4fd5/publish
Authorization: Bearer eyJ…
Content-Type: application/json

{ "event": { "id": "…", "pubkey": "…", "created_at": 1791350494, "kind": 1,
             "tags": [["t","satoshi-sticky"],["client","satoshi.si"],
                      ["g","u0qj7z0y1"],["g","u0qj7z0z1"],
                      ["g","u0qj7z0y"],["g","u0qj7z0"],["g","u0qj7"],["g","u0qj"],
                      ["i","geo:u0qj7z0y1"],["k","geo"],["geohash","prefix"],
                      ["sticky","v1","yellow","0.42","0.99","-2.00","typewriter"],
                      ["alt","A sticky note pinned on satoshi.si"]],
             "content": "sticky e2e test note", "sig": "…" } }
```

The token may go in the header (preferred) or in the body as `publishToken`.

The desk checks, in this order, **before** anything reaches the relay:

1. the token — valid for *this* order, *this* pubkey, *this* action, *this* clump of cells, *this* geohash mode and *this* commitment, unused, unexpired;
2. the event — id matches its contents, and the BIP-340 signature verifies;
3. the signer equals the pubkey that ordered the note;
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
| 403  | `not_paid`            | no Settled invoice or valid zero-sat authorization          |
| 400  | `bad_event`           | malformed event, or its id/signature does not check out     |
| 400  | `wrong_signer`        | signed by a key other than the one that paid                |
| 400  | `stale_event`         | signed more than an hour before the order                   |
| 400  | `future_event`        | timestamp too far ahead                                     |
| 400  | `wrong_kind`          | pin must be kind 1, removal kind 5                          |
| 400  | `too_long`            | content over 501 characters                                 |
| 400  | `bad_marker`          | missing, duplicated or wrong `satoshi-sticky` marker        |
| 400  | `bad_sticky_tag`      | missing sticky tag or unknown format version                |
| 400  | `bad_color` / `bad_font` | appearance is not in the allowed list                    |
| 400  | `bad_placement` / `bad_rotation` | placement is outside its allowed range             |
| 400  | `empty_note`          | the note carries no text                                    |
| 400  | `geohash_mismatch`    | required geo tags do not match the paid order               |
| 400  | `fingerprint_mismatch`| the note does not hash to the commitment that was paid      |
| 400  | `wrong_target`        | the deletion does not reference the paid `targetEventId`     |
| 400  | `target_missing` / `target_not_owned` / `target_mismatch` | as above    |
| 502  | `relay_rejected`      | the relay refused the write; `error` carries its reason     |

`502 relay_rejected` deserves a sentence in the UI rather than a generic failure. A paid
or zero-sat order is the only path that can publish (see below). A 502 is worth retrying
and, if it persists, showing the relay's message.

## The commitment (what the order authorizes)

`contentHash` is the fingerprint of the note text and appearance bought by the order.
Placement happens after payment, so it is deliberately not part of this commitment:

```js
async function stickyFingerprint(content, color, font) {
  const payload = `v1\n${color}\n${font}\n${content.trim()}`;
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
| `g`       | every cell the order paid for, and in `prefix` mode the boards above them | exact set |
| `i`       | `geo:` followed by one of the paid cells                     | exactly one |
| `k`       | `geo`                                                        | exactly one |
| `geohash` | order's `exact` or `prefix` mode                             | exactly one |
| `sticky`  | `v1`, color, x, y, rotation, font                            | exactly one |
| `expiration` | unix seconds, NIP-40: the moment the note is deleted       | exactly one |
| `alt`     | `A sticky note pinned on satoshi.si`                         | exactly one |
| `anonymous` | `24h-local-key`                                             | anonymous orders only |

Colors are `yellow`, `pink`, `blue`, `green`, or `orange`. Allowed font keys are
`typewriter`, `handwritten`, `patrick-hand`, `kalam`, `comfortaa`, `noto-sans`,
`noto-serif`, `noto-mono`, `roboto`, `mono`, `roboto-slab`, `open-sans`, `source-sans`,
`ubuntu`, `pt-sans`, `pt-serif`, `fira-mono`, `ibm-plex-mono`, `merriweather`, `atkinson`,
and `serif`. Positions are decimal fractions from 0 through 1 and rotation is from -12
through 12 degrees.

Relay tag matching is exact, not a string-prefix search. In `prefix` mode a note on the
cell `u24jed` carries `g` tags for `u24jed`, `u24je`, `u24j`, and `u24` — every parent that
is still a code, so the chain stops at four characters rather than walking up to `u2` and
`u`, which are regions and are not boards. In `exact` mode it carries only `u24jed`. For a
clump, every paid cell is named, and in `prefix` mode so is each of their parent boards.

Reading those tags back, the **deepest** `g` values are the cells the note was pinned to
and anything shallower is a board above them — that is how a clump of the same depth is
told apart from the parents that were added for reach. The payment service must reject a
missing cell, a duplicate, an extra `g` value that is neither a paid cell nor a board
above one, and any mode mismatch. The `i` and `k` pair follows NIP-73's external-content
identifier, naming one of the cells that was paid for. These tags sort public events into
corkboards; they do not encrypt a note or restrict who can fetch it.

Every note is temporary. `["expiration", "<unix seconds>"]` is **mandatory** (NIP-40): the
moment the note stops existing, computed as the event's `created_at` plus the term the writer
chose from the ladder the board offers — a day, a week, a month (30 days), six months (180
days) or a year (365 days). There is no third option and no way to ask for longer. The desk
enforces the **range**, not the rungs, so a frontend may compute a month its own way: the term
`expiration - created_at` must fall between one day and 365 days, allowing two minutes of clock
skew, and the moment itself must still be in the future when the note is published. The relay
drops an event that arrives expired, never serves an expired event, and deletes expired events
from its store, so a note published after its own moment would be paid for and lost.

A **removal must not carry `expiration`**. The relay records the hiding in the kind-5 row; NIP-40
cleanup deletes expired rows, so an expiring deletion would be swept away with the record of what
it hid and the note would come back.

`content` is the note text: **at most 501 characters**, counted as the UI counts them
(Unicode code points, so one emoji is one character).

### remove — kind `5` (NIP-09)

One `["e", "<targetEventId>"]` tag referencing the note being removed. Only the author
of that note can order the removal, and the desk checks that against the relay before
pricing it. `content` may hold a short reason.

## Paying

* Price: posting is a **subscription** — **10 sats a week** or **411 a year** (52 weeks less
  21%), **5 / 205** with a satoshi.si NIP-05 name — and while it runs, every pin and removal is
  included, so a covered note is created already settled at 0 sats. A registered key with no
  subscription gets `subscription_required` (402). A temporary anonymous identity cannot
  subscribe and pays **42 sats per message**.
* Free orders never create a BTCPay invoice or enter the invoice worker queue. The service
  marks them paid and returns their short-lived publish token directly.
* Paid rails: **Ark and Lightning**. The invoice requests `BARK` and `BTC-LN`; on-chain is
  not offered. The desk refuses an invoice that provides neither an Ark address nor BOLT11.
* The service verifies the amount encoded in every BOLT11 instead of trusting the worker.
  Amount-less, sub-satoshi, and wrong-value invoices are rejected.
* The browser shows every usable rail returned by the invoice and hides unavailable ones.
* The amount lives in the service. The worker reads paid amounts from the order queue and
  never accepts one from the browser.
* Expiry: the invoice window is 30 minutes. `expiresAt` on the order is the authoritative
  time, in Unix seconds.

## Relay write access

`wss://nostr.satoshi.si` remains publicly readable and write-restricted. Sticky-note
authors, including temporary anonymous identities, must never be added to the relay's
general pubkey whitelist. The payment service validates the signed event and registers
only its exact event ID with a fail-closed admission service. That one-time grant permits
the original user-signed pin or deletion and nothing else from the same key. Existing
authorized satoshi.si NIP-05 writers retain their normal relay access.

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
GET  /sticky/v1/worker/queue?wait=20   sticky orders; ?wait is seconds, held up to 25 s when empty
POST /sticky/v1/worker/orders/{id}/invoice   attach the available Ark and Lightning rails
POST /sticky/v1/worker/orders/{id}/status    paid | expired | cancelled
GET  /sticky/v1/health                 sticky liveness and counts
GET  /sticky/v1/config                 price, styles, bounds, 501-char limit, commitment
```

`GET /sticky/v1/config` is the public one: a frontend should read the styles, the board
bounds and the character limit from it rather than keeping its own copy.


## Refusal codes you will actually see (pin orders and publication)

| Code | Where | Means |
| --- | --- | --- |
| `bad_geohash` | `POST /orders` 400 | a pin with no cells, a cell outside `[0123456789bcdefghjkmnpqrstuvwxyz]` or outside 4–9 characters, cells of mixed depth, a repeated cell, more than nine cells, cells that do not touch, or a `geohash` that disagrees with the first entry of `geohashes`. A `remove` that sends either field is refused the same way. |
| `bad_anonymous` | `POST /orders` 400 | `anonymous` was not a boolean, or was sent for a `remove`. |
| `geohash_mismatch` | `publish` 400 | the note does not carry one `["g", <cell>]` for every cell the order paid for (and, in `exact` mode, nothing else), `["i","geo:<cell>"]` naming one of those cells, and `["k","geo"]`. A missing cell, a duplicate, or a cell nobody paid for — all the same refusal, because the note would otherwise land in a cell that was not bought. |
| `identity_mismatch` | `publish` 400 | an anonymous order published a note without `["anonymous","24h-local-key"]`, or a named order published one carrying it. |
| `bad_marker` | `publish` 400 | the `["t","satoshi-sticky"]` marker or the `["client","satoshi.si"]` tag is missing, duplicated or wrong. |
| `bad_expiration` | `publish` 400 | the note carries no `["expiration"]`, more than one, a value that is not a positive whole number of seconds, a term outside one day to a year, or a moment that has already passed. A removal carrying one is refused with this code too. |

The client tag is enforced, not decorative: exactly one `["client","satoshi.si"]` per pin, so a note
that reached the relay some other way can be told apart. Removals stay geohash-free — a NIP-09
deletion has no place on the board, so there is nothing to bind.

`GET /sticky/v1/config` additionally publishes `anonymousSats: 42`, the geohash rules
(`requiredForPin`, `alphabet`, `minLength`, `maxLength`, `maxCells`, the three tag names), the
liveliness rules (`requiredForPin`, `tag`, `standard`, `default`, the five `options` with their
seconds, `minSeconds`, `maxSeconds`, `measuredFrom`, `removals`) and the tag map
(`clientValue`, `anonymousTagValue`), so a frontend never keeps its own copy of any of it.

## The relay's half of NIP-40 (already live)

The relay is `nostr-rs-relay` 0.10 on the same box, and it implements the
expiration side of NIP-40 itself — nothing here depends on the desk policing it
after the fact:

* it advertises `40` in `supported_nips` (NIP-11), so a client can tell;
* an event that arrives already expired is **dropped** at the door rather than stored;
* an expired event is never **served**, even while it is still on disk, because every
  query carries `(expires_at IS NULL OR expires_at > now)`;
* `delete_expired` removes expired rows from the store, and the cleanup task runs
  every ten minutes.

So a note that reaches its moment stops being readable immediately and leaves the
database within the next cleanup. That is why the desk refuses a note whose moment has
already passed rather than letting the relay silently drop it: by then it has been paid
for. It is also why a **removal carries no expiration** — the relay records the hiding in
the kind-5 row itself, and the cleanup would delete that row along with everything else
that expired.

## Relay write access — how it is actually enforced

The relay does not keep a list of who may write. It asks an admission gate about every event it is
offered, and the gate is the only thing that decides.

* **`satoshi-admit`** (systemd unit on the VPS, `/opt/satoshi-admit/admit.mjs`, loopback only):
  answers `nauthz.Authorization/EventAdmit` on `127.0.0.1:7791` and takes registrations on
  `127.0.0.1:7792` with a bearer token. It permits exactly two things: an author on the
  satoshi.si NIP-05 key list, or **one event id** that the payment desk registered after the event
  passed every rule above. A grant is spent by the first write that uses it and expires after 15
  minutes; registering one does not make the key able to write anything else.
* **The relay's own `pubkey_whitelist` is absent on purpose.** With `pay_to_relay` off, the relay
  checks its own list *before* it consults the gate, so a whitelist there would make the gate
  unreachable for every key not already on it — including a paid anonymous pin. The key list lives
  in `/etc/satoshi-admit-whitelist.toml`, written by `nostr_whitelist_sync.py` from `nostr.json`.
* **It fails closed.** If the gate cannot answer, the relay refuses the event
  (`blocked: admission service unavailable`) rather than admitting it ungated.

Consequences worth stating plainly: a buyer's key never joins any list, a throwaway anonymous key
never joins any list, and a paid note is admissible only from the moment the desk registers it until
the first write that uses that registration.
