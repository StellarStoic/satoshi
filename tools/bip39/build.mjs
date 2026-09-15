import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

await build({
  absWorkingDir: fileURLToPath(new URL('.', import.meta.url)),
  entryPoints: ['entry.mjs'],
  outfile: '../../vendor/bip39.mjs',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'inline'
});
const licenses = await Promise.all(['@scure/bip39', '@noble/hashes'].map(async name => {
  const license = await readFile(new URL(`node_modules/${name}/LICENSE`, import.meta.url), 'utf8');
  return `${name}\n\n${license}`;
}));
await writeFile(new URL('../../vendor/bip39.LICENSE.txt', import.meta.url), licenses.join('\n\n'));
