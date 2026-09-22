import {build} from 'esbuild';
import {copyFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../vendor/paddle/', import.meta.url));
const runtime = require.resolve('onnxruntime-web/ort-wasm-simd-threaded.mjs');
await mkdir(root, {recursive: true});
await build({
    entryPoints: [fileURLToPath(new URL('./paddle-entry.mjs', import.meta.url))],
    bundle: true, format: 'esm', platform: 'browser', minify: true,
    external: ['fs', 'path', 'crypto'],
    alias: {'onnxruntime-web': join(dirname(runtime), 'ort.wasm.min.mjs')},
    outfile: root + 'paddle.mjs',
});
for (const filename of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
    await copyFile(require.resolve('onnxruntime-web/' + filename), root + filename);
}
