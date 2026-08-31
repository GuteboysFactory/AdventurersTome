# Adventurer's Tome

**Adventurer's Tome** is a system-agnostic campaign landing page and living campaign archive for Foundry VTT 13.351.

Current release line: **v1.0.0-rc.1**.

The RC is intentionally based on the live-approved v0.20.8 Stable Window Rollback and adds no new runtime feature. Its purpose is to freeze behavior, complete a full GM/player regression, verify clean installation from GitHub, and promote the same runtime line to v1.0.0 if no release-blocking defect is found.

## Core features

- Home Builder with Dashboard, Minimal, and Custom layouts
- Sessions and Quests with Tome-native detail views and cross-links
- Group and system-independent Actor presentation
- World profiles synchronized with Foundry Journals
- Rules library with public chat and whisper sharing
- Tome-wide Search, Favorites, and Recents
- Import 2.0 with preview, update/create/skip decisions, cross-links, history, and undo
- Portable, player-safe, and full GM exports
- GM Notebook, Scratchpad, Quick Capture, Next Session Dashboard, Reveal Queue, and Post-Session Assistant
- Health Check and safe repair tools
- Role-aware in-app Manual
- Foundry Scene glass transparency: Normal / 25 / 50 / 75 / 90%
- Movable per-user Tome launcher

## Core design contract

Adventurer's Tome Core never depends on a game system's schema. It uses generic Foundry Documents, ownership, settings, and `flags.adventurers-tome.*`. Core does not read or write `actor.system.*`.

## Foundry compatibility

- Minimum: Foundry VTT 13
- Verified: Foundry VTT 13.351
- Maximum: Foundry VTT 13

## Release candidate policy

Between RC and v1.0.0 we fix release blockers only. Major new features are deferred until after 1.0.

The experimental ApplicationV2 minimize/restore implementation is deliberately not part of v1.0. Closing Tome with **X** and reopening it from the movable launcher is the supported compact workflow. A separate dock/minibar architecture is parked for post-1.0.

## Public assets

The public build uses original neutral fantasy artwork and the original **The Ashen Road** demo campaign. The old private `assets/Bree.webp` compatibility asset is excluded from the public release candidate.

## Status

See [ROADMAP.md](ROADMAP.md) and [docs/V1-READINESS-AUDIT.md](docs/V1-READINESS-AUDIT.md) for the current release path.
