# Price Scanner

`priceScanner.html` provides full-screen live-camera OCR, preferring the rear camera on phones and falling back to the available webcam on computers. Camera selection is automatic; old saved front-camera preferences are ignored. The shutter starts the camera when it is off and captures photos while scanning. Without valid saved preferences, the first shutter tap opens settings with a setup warning; saving settings does not start the camera. Returning users arrive with settings closed and tap the shutter to start. Settings can be reopened with the gear beside the shutter. Currency, BTC/sats display and zoom persist in local storage. If storage is blocked, configured preferences remain usable for the current page session. Torch always starts off. Pinch the camera to digitally zoom from 1x to 4x; tap the zoom indicator to reset. The focused camera also accepts +/- and 0 for keyboard zoom/reset.

During scanning, photo capture is enabled when a fresh converted price is visible. It captures the current preview crop with the visible Bitcoin labels and a watermark using the existing satoshi.si logo. A preview dialog offers a PNG download, up to 1920 pixels on its longest side. Camera controls are not included in the image. Photos remain in memory until the preview closes, or can be downloaded explicitly; there is no upload, recording or stored photo history. No camera image is placed in local storage.

## Recognition and privacy

Tesseract.js 7.0.0 runs in a Web Worker with self-hosted English LSTM data and WebAssembly. Temporary in-memory video frames, at most 1280 pixels wide, are recognized serially. No frames or recognized text are uploaded. They are saved only when the user explicitly downloads a captured photo. Only anonymous price/rate requests leave the browser.

Word bounding boxes position labels over detected prices. Recognition and the edge-to-edge preview use the same centered crop and digital zoom. High-confidence readings can appear immediately; lower-confidence readings require two matching results. Scene changes, currency changes, zoom and resizing clear labels. Expiry adapts to recognition time (4 to 10 seconds); slower jobs are no longer discarded solely for exceeding 2.5 seconds. Small exposure changes no longer reset recognition. Speed depends on the device: this is periodically refreshed OCR, not frame-rate augmented-reality tracking.

The parser supports decimal commas/dots (including separated OCR tokens), thousands separators, explicit whole-currency amounts and close superscript cents. Currency symbols and codes may precede or follow the number. Likely barcodes, dates, percentages, quantities and mismatched currency symbols are rejected. Ambiguous unmarked whole numbers are omitted. Printed and handwritten tags use the same parser, but Tesseract is designed for print: clear handwritten digits may work, while general handwriting recognition is not reliable. No ambiguous letters are silently substituted with digits. OCR can still misread reflective, crossed-out, curved or blurry labels; verify the recognized fiat amount beneath each BTC estimate. See the [Tesseract handwriting limitation](https://tesseract-ocr.github.io/tessdoc/FAQ.html#can-i-use-tesseract-for-handwriting-recognition).

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
