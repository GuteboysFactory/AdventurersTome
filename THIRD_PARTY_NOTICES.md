# Third-Party Notices

## Dice table sound effects

- `assets/dice/table.wav` and `assets/dice/token.wav` include edited fragments of [Wooden dice on wodden table roll by Wuzzy](https://opengameart.org/content/wooden-dice-on-wodden-table-roll), CC0.
- `assets/dice/roll-1.wav` is a trimmed and leveled clip from [rolling dice 2 by nettimato](https://freesound.org/people/nettimato/sounds/353974/), CC0.
- `assets/dice/roll-2.wav` is a trimmed and leveled clip from [Dice_Roll by schoman3](https://freesound.org/people/schoman3/sounds/506914/), CC0.
- `assets/dice/roll-3.wav` is a trimmed and leveled clip from [dice by JayeWilde](https://freesound.org/people/JayeWilde/sounds/505549/), CC0.
- `assets/dice/voice-male-1.wav` combines [Grunt by nomiqbomi](https://freesound.org/people/nomiqbomi/sounds/578788/) and [HEY VERY LOW 4 by metrostock99](https://freesound.org/people/metrostock99/sounds/345083/), CC0.
- `assets/dice/voice-female-1.wav` is an edited version of [Ouch ! by Legnalegna55](https://freesound.org/people/Legnalegna55/sounds/547344/), CC0.

## Portable Vault cryptography

The HTTP-compatible AES-GCM / PBKDF2-SHA-256 path uses @noble/hashes 1.8.0
and @noble/ciphers 1.3.0 by Paul Miller and contributors, under the MIT License.
Dependency-closed ESM source subsets and their upstream licenses are included
in vendor/noble-hashes-1.8.0 and vendor/noble-ciphers-1.3.0. The hashes utility's
package import @noble/hashes/crypto is changed to ./crypto.js for browser ESM.
Other source bodies are unchanged. Source package archives:
https://registry.npmjs.org/@noble/hashes/-/hashes-1.8.0.tgz
https://registry.npmjs.org/@noble/ciphers/-/ciphers-1.3.0.tgz

Quick Search is an independent Tome implementation inspired by the workflow of
Sunspots' Quick Insert. No Quick Insert source code is redistributed.

Adventurer's Tome remains proprietary software. The following third-party components are redistributed under their own licenses.

## compromise 14.17.0

- Project: compromise
- Author: Spencer Kelly and contributors
- Source: https://github.com/spencermountain/compromise
- Version: 14.17.0
- License: MIT
- Vendored runtime: `vendor/compromise-14.17.0.js`
- License text: `vendor/compromise-LICENSE.txt`
- Upstream build SHA: `f1ff6e40bf5e14928b8fa94ac1f94f117c17b463`

Adventurer's Tome uses compromise as a local, offline-capable NLP helper for grammatical tagging and candidate-boundary evidence. Compromise does not own or determine campaign identity; Tome's identity resolver and GM review remain authoritative.

The upstream MIT copyright notice and permission notice are included in `vendor/compromise-LICENSE.txt`.

## Local language models and reference data

- UDPipe / udpipe-wasm runtime: MPL-2.0. See `vendor/udpipe/NOTICE.txt`,
  `RUNTIME-LICENSE.txt` and `LICENSE-MPL-2.0.txt` for sources and terms.
- Unmodified BNOSAC Swedish/English UD 2.1 model weights: CC BY-SA 4.0.
  Authors, training resources and source links: `vendor/udpipe/MODEL-SOURCE-README.txt`.
- Derived Swedish/English word-class evidence: CC BY-SA 4.0, including SALDO
  forms under CC BY 4.0. Full attribution, source notices and input hashes:
  `data/language/ATTRIBUTION.txt` and `data/language/SOURCES.json`.
- Adapted Tolkien reference dataset: CC BY-SA 4.0 with retained CC0 components.
  Entry-level source links and terms: `data/world-packs/ATTRIBUTION.txt`.

These data/component licenses apply to their respective files, independently
of the proprietary Tome application source license. No private campaign data
is included in the bundled reference datasets.

## Secure GM Inbox and encrypted Tome whispers

TweetNaCl.js 1.0.3, TweetNaCl-js contributors, Unlicense. Upstream: https://github.com/dchest/tweetnacl-js/tree/1.0.3 . Source blob `7ea5fb5883289b49f8d543f2d48af7132c3c6a6d`. The upstream nacl-fast.js body is preserved inside a small ES module wrapper in `vendor/tweetnacl-1.0.3.mjs`; license in `vendor/tweetnacl-LICENSE.txt`. Used for recipient-key encryption of incoming GM notes and selected Tome text/image whispers, including browsers without WebCrypto. Whisper encryption and decryption run in dedicated module workers.
