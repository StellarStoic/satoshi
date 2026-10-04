# Wallet push service

This service turns Bark unified-mailbox events into generic Web Push notifications. It never receives a mnemonic, password, private spending key, address, amount, or transaction body. The browser delegates temporary mailbox read access with a Bark authorization that expires after at most 24 hours.

## Configuration

The service generates its VAPID signing key on first start and stores it beside the subscription state with mode `0600`. To supply an existing VAPID identity instead, provide:

```text
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@satoshi.si
ALLOWED_ORIGIN=https://satoshi.si
PORT=8788
STATE_FILE=/var/lib/satoshi-wallet-push/subscriptions.json
```

Run `npm ci`, then `npm test` and `npm start`. The process binds only to `127.0.0.1`; expose `/wallet-notifications/` through the TLS reverse proxy at `https://notify.satoshi.si`. Keep this public wallet API separate from the privileged MCP host.

Deployment templates are in `deploy/`. Install only this directory at `/opt/satoshi-wallet-push/app`, install a pinned Node.js LTS runtime at `/opt/node`, and use `/var/lib/satoshi-wallet-push/subscriptions.json` for the expiring state and generated VAPID identity. Back up `vapid.json`: replacing that identity invalidates existing browser push subscriptions. The checked-in systemd unit applies filesystem, namespace, capability, and kernel restrictions and matches the Hermes log allowlist name `satoshi-wallet-push`. If keys are supplied through `/etc/satoshi-wallet-push.env`, keep that file root-readable only.

Mailbox authorizations are read capabilities and cannot be revoked at the Ark server before expiry. The service stores them in a mode-0600 state file, redacts capabilities, URLs, and bearer tokens from logs, and starts with a 30-second checkpoint overlap so clock skew cannot hide a just-arrived payment. Registration refuses recovery-phrase and private-key fields outright. Authenticated renewal preserves the existing client secret. Only incoming Ark and Lightning mailbox events produce pushes; maintenance, recovery, and sent-payment events do not.
