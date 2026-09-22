# On-device PaddleOCR assets

The price scanner uses PaddleOCR.js 0.4.2 with the English PP-OCRv5 mobile
recognizer and PP-OCRv5 mobile detector through ONNX Runtime Web 1.30.0.
Everything runs locally in a Web Worker. Camera pixels are never uploaded.

Models are Apache-2.0 and pinned to official PaddlePaddle revisions:

- Detector: `PaddlePaddle/PP-OCRv5_mobile_det_onnx` at
  `e6f4fa85f00e168c862bc462aebca69eef9b3d3d`
- Recognizer: `PaddlePaddle/en_PP-OCRv5_mobile_rec_onnx` at
  `3fafbc3b5dcf93dd72add9f48368be8a3a2cd33b`

Archive hashes:

- `det.tar`: `e0033de339f1bde65981569561dbb098c8f8f52a1aa825f81ad0125c0f8bbe1b`
- `rec.tar`: `b65e3fe76fb8c83a15fbeb6e5ee12025aebd858dcd35ee86623931a0e7382507`

`paddle.mjs` is generated from pinned packages by `tools/price-scanner`.
The bundle contains PaddleOCR.js, OpenCV.js, ONNX Runtime Web, js-yaml and
clipper-lib. Upstream license files are stored beside this README.

Sources:

- https://github.com/PaddlePaddle/PaddleOCR
- https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det_onnx
- https://huggingface.co/PaddlePaddle/en_PP-OCRv5_mobile_rec_onnx
- https://github.com/microsoft/onnxruntime
- https://github.com/TechStark/opencv-js
