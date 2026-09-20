# Price Scanner

`priceScanner.html` provides live-camera OCR, preferring the rear camera. There is no shutter, upload, recording or photo history. Currency selection persists locally; BTC/sats displays, camera switching, torch and zoom are available where supported.

## Recognition and privacy

Tesseract.js 7.0.0 runs in a Web Worker with self-hosted English LSTM data and WebAssembly. Temporary in-memory video frames, at most 1280 pixels wide, are recognized serially. No frames or recognized text are uploaded or persisted. Only anonymous price/rate requests leave the browser.

Word bounding boxes position labels over detected prices, accounting for video letterboxing. Two matching readings are required. Movement, currency changes and resizing clear labels; labels expire after 1.5 seconds without new results. OCR jobs taking over 2.5 seconds or spanning detected movement are discarded. Speed depends on the device: this is periodically refreshed OCR, not frame-rate augmented-reality tracking.

The parser supports decimal commas/dots, thousands separators, explicit whole-currency amounts and close superscript cents. Likely barcodes, dates, percentages, quantities and mismatched currency symbols are rejected. Ambiguous unmarked whole numbers are omitted. OCR can still misread reflective, crossed-out, curved or blurry labels; verify the recognized fiat amount beneath each BTC estimate.

Stopping, hiding or leaving the page releases camera tracks and terminates the worker. A pending permission request cannot reactivate scanning after Stop. Permission denial, busy cameras and failed model loads have retryable errors.

## Rates

- Sintra public WebSocket: `wss://api.sintra.fi/ws`, documented free updates every 10 seconds.
- Sintra HTTP initial/fallback: `https://api.sintra.fi/v1/prices/btcusd`.
- Frankfurter FX: `https://api.frankfurter.dev/v2/rates?base=USD`.
- Conversion: `fiat amount / fiat units per USD / USD per BTC`.

Fresh converter `exchangeRatesCache` and `exchangeRatesCacheExpiry` values avoid another FX request. Existing `BTC` reciprocal values and `btcCacheTimestamp` are accepted if fresh. New snapshots use separate `priceScannerBtcCache` and `priceScannerFxCache` keys; converter data is unchanged. Denied/corrupt storage does not prevent live use.

BTC values older than two minutes and expired FX caches cannot produce overlays. FX caches last 24 hours; fetched observations must be within seven days to accommodate central-bank non-publication days. Rates are daily FX references, not live trading quotes. Failures use bounded reconnects and HTTP fallback, never third-party proxies or client API secrets.

## PWA and testing

The scanner shell and icons are precached. Large OCR files download only on first use, then cache on demand. Offline OCR can subsequently work, but conversions stop when the short-lived BTC cache expires. PWA installation alone does not download the OCR model.

`vendor/ocr` contains pinned upstream distributions and licenses. Lucide 1.47.0 supplies icons. No bundler/application server is needed. Camera access requires HTTPS or localhost; a phone opening an ordinary LAN HTTP address cannot access its camera.

Run `node --test tests/priceScanner.test.mjs`. Browser verification uses actual Tesseract on generated live camera streams for overlays, currency/unit changes, movement clearing, desktop/mobile geometry, cache reuse, Stop and permission denial. Physical device cameras and torch hardware still need real-device testing.
