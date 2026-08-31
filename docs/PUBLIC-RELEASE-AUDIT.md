# Adventurer's Tome — Public Release Audit

Target: **v1.0.0-rc.1**

## Content and architecture

- [x] Original neutral default artwork (`assets/default-hero.webp`).
- [x] Original system-independent demo campaign (The Ashen Road).
- [x] System-agnostic Core; no game-system schema dependency.
- [x] Public package excludes legacy private `assets/Bree.webp`.
- [x] Foundry compatibility remains minimum 13 / verified 13.351 / maximum generation 13.
- [x] Manifest socket support enabled.
- [x] Experimental minimize/restore code is not part of the release UX.

## Runtime gates

- [ ] Install the exact RC artifact into a clean Foundry VTT 13.351 environment.
- [ ] Upgrade an existing v0.20.8 test world and confirm content/settings persist.
- [ ] Two-client GM/player permissions regression.
- [ ] Show to Players multiplayer smoke test (strongly recommended).
- [ ] Portable Export → re-import round trip.
- [ ] Player-safe Export review.
- [ ] Full GM Archive review from a GM account.
- [ ] Health Check + Safe Repair regression.
- [ ] Console free of Adventurer's Tome errors during the full smoke pass.

## Publication gates

- [ ] Choose and add a software license.
- [ ] Finalize GitHub repository owner/name.
- [ ] Add stable repository/support URLs.
- [ ] Produce release-stamped `manifest` and `download` URLs.
- [ ] Install RC through the hosted GitHub manifest, not only from a local ZIP.

## Exact public artifacts

A public release should expose:

- `module.json` — release-stamped manifest.
- `adventurers-tome.zip` — package for that exact version.

The final stable manifest should point to the latest hosted manifest while `download` is pinned to the exact release tag.
