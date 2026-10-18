# TON rail for the Pinstr Telegram door

Scope, decided by D: Telegram login and TON exist **only on pinstr.si**. satoshi.si
stays Bitcoin-only — no Telegram button, no TON bundle, no address, no mention.
Telegram-made pins *are* visible on the satoshi.si board mirror.

## What is built

- `tonQuote.mjs` — address validation (base64url, tag, CRC16), sats→nanoTON quoting
  with ceiling division, quote objects with a 5-minute expiry, and the comment
  matcher that reconciles a transfer against an order id.
- `test_tonQuote.mjs` — 8 tests against the configured wallet and real rates.

## What is not built yet

1. `api.pinstr.si` — Mini App `initData` verification (`HMAC_SHA256("WebAppData", bot_token)`),
   so satoshi.si's host never carries Telegram code.
2. `tonwatch` — poll toncenter for the merchant wallet, match the transfer comment
   against the order id, mark the order paid, let the existing Pinstr desk publish.
3. The Telegram door in the Pinstr checkout: TON Connect button beside the Lightning
   one, rendered only for sessions that proved they came from Telegram.
4. Bot: Mini App menu button, reply notifications, key export.

## Facts worth keeping

- Wallet is bounceable (`0x51`), workchain 0, wallet v5r1, active, 7.03 TON on it as
  of 2026-10-18. Bounceable is fine while the wallet is deployed; a non-bounceable
  form matters only for addresses that may not exist yet.
- TON transfers have no invoice object: the order id rides in the comment field.
- Fee for a plain transfer is 0.005–0.01 TON (8–16 sats at today's rates), paid by
  the sender, so the merchant wallet needs no float and nothing to top up.
