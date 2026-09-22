import {PaddleOCR, cvModule} from './vendor/paddle/paddle.mjs';

let engine;
self.onmessage = async ({data: {id, type, image}}) => {
    try {
        if (type === 'init') {
            const base = new URL('./vendor/paddle/', import.meta.url).href;
            engine = await PaddleOCR.create({
                worker: false,
                textDetectionModelName: 'PP-OCRv5_mobile_det',
                textRecognitionModelName: 'en_PP-OCRv5_mobile_rec',
                textDetectionModelAsset: {url: base + 'det.tar'},
                textRecognitionModelAsset: {url: base + 'rec.tar'},
                ortOptions: {backend: 'wasm', wasmPaths: base, numThreads: 1},
            });
            self.postMessage({id, result: true});
        } else if (type === 'recognize') {
            if (!engine) throw new Error('OCR has not initialized');
            const pixels = new ImageData(new Uint8ClampedArray(image.buffer), image.width, image.height);
            // cv.Mat is the SDK's documented DOM-free input; ImageData input uses document.
            const cv = cvModule instanceof Promise ? await cvModule : cvModule;
            const mat = cv.matFromImageData(pixels);
            try {
                const [result] = await engine.predict(mat, {
                    textDetLimitSideLen: 320, textDetLimitType: 'max', textRecScoreThresh: 0.5, textDetUnclipRatio: 1.1,
                });
                self.postMessage({id, result: {items: result.items, metrics: result.metrics}});
            } finally { mat.delete(); }
        } else throw new Error('Unknown OCR request');
    } catch (error) {
        self.postMessage({id, error: error.message || 'OCR failed'});
    }
};
