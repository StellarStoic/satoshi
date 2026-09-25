# Archived BIP39 Playground

The advanced phrase playground is preserved in `archive/bip39-playground` and is not currently published. Its phrase construction, checksum checks, and seed derivation run locally. No phrase or passphrase is saved, sent to an API, or placed in a URL. The public `isBip39.html` page is now a simpler, fully local word checker with all ten official language lists.

Examples are for education, not wallet creation. The default counting-byte pattern and all-zero pattern are intentionally predictable. Random examples use the browser's cryptographic RNG, but the entire playground remains labeled for learning only.

## Implementation

- `bip39LabModel.mjs`: bit inspection and example transformations using `@scure/bip39` for checksum generation, validation, and PBKDF2 seed derivation.
- `bip39Lab.mjs`: word selection, entropy buttons, last-word alternatives, passphrase comparison, and stale-result protection.
- `bip39Lab.css`: page-scoped responsive styles loaded after the shared theme.
- `bip39Glossary.mjs`: inline technical-term explanations in a native modal dialog. Prose is enhanced after updates; editable fields, phrase words, existing controls, and code remain untouched. Escape, backdrop click, and Close dismiss the dialog and restore focus.
- `vendor/bip39.mjs`: locally bundled library and all official BIP39 wordlists, with licenses alongside it.

The passphrase is not an additional mnemonic word. Empty text is valid; case and spaces are preserved; the library applies BIP39's NFKD normalization. The output is a 64-byte seed, not a private key or address. The playground deliberately stops before wallet/address derivation.

## Rebuild the Vendor File

The rest of the website remains plain static HTML, CSS and JavaScript. Node is only needed to rebuild this committed library bundle or run tests:

```sh
npm ci --prefix tools/bip39 --ignore-scripts
npm run build --prefix tools/bip39
node --test tests/bip39Lab.test.mjs
```

Package versions and dependency integrity hashes are locked in `tools/bip39/package-lock.json`. After modifying precached files, bump the service worker cache version. The PWA precaches the public word checker and library so they work offline after installation.

## References

- [BIP39 specification](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki)
- [Reference test vectors](https://github.com/trezor/python-mnemonic/blob/master/vectors.json)
- [scure-bip39](https://github.com/paulmillr/scure-bip39)
