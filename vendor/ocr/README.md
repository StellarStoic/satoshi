# On-device OCR assets

Vendored Tesseract.js 7.0.0 and tesseract.js-core 7.0.0, Apache-2.0.
English LSTM model: `@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz`.

Sources:
- https://github.com/naptha/tesseract.js
- https://github.com/naptha/tesseract.js-core
- https://github.com/naptha/tessdata

`tesseract.min.js` and `worker.min.js` are the upstream browser distributions.
The six core `.wasm.js` files embed their WebAssembly. The worker selects the
compatible SIMD/relaxed-SIMD/LSTM variant automatically. Do not point `corePath`
at one device-specific file. The scanner uses OEM 1 (LSTM only).

These large files are warmed in the background when the scanner page opens,
unless the browser requests data saving. They are not loaded during PWA install.
No camera permission is requested until the user starts the camera. One worker
is reused while the page remains visible and terminated on hiding/leaving it.
The original model and IndexedDB cache key are retained so existing downloads can be reused.
The service worker caches requested same-origin assets for subsequent use.
Camera frames are never sent to these sources or written to persistent storage.
