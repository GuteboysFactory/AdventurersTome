# Adventurer's Tome Roadmap

## DONE

- Home dashboard and Home Builder
- Sessions and Quest archive/detail views
- Cross-links and navigation
- Search, Favorites, and Recents
- Import 2.0 with preview/history/undo
- Campaign configuration
- Foundry permissions/discovery layer
- World profile ↔ Journal synchronization
- Rules creation/linking/search and chat/whisper sharing
- Group presentation and custom links
- Exporter: Portable / Player-safe / Full GM Archive
- GM Notebook, Scratchpad, Quick Capture, Next Session Dashboard
- Reveal Queue / Show to Players
- Post-Session Assistant
- Health Check / Safe Repair
- Role-aware in-app Manual
- Custom per-GM Workspace Builder
- Foundry Scene Glass UI with Normal / 25 / 50 / 75 / 90%
- Movable per-user Tome launcher
- Stable Window Rollback: experimental minimize/restore removed from the v1.0 line

## CURRENT — v1.0.0-rc.1

Release-candidate hardening only. No new major runtime features.

Final gates:

- clean install from the hosted GitHub manifest/package
- upgrade regression from the established v0.20.x test world
- GM/player permissions and discovery regression
- World ↔ Journal synchronization
- Rules public chat + whisper
- Reveal Queue / Show to Players with two clients
- Import / Undo regression
- Portable Export → re-import round trip
- Player-safe Export and Full GM Archive smoke tests
- GM-private per-user persistence/isolation
- Glass UI / movable launcher persistence
- final console/error sweep on Foundry VTT 13.351

If no release blocker is found, promote the same runtime line to **v1.0.0**.

## POST 1.0

- Separate Tome dock/minibar architecture; do not revive ApplicationV2 resize-based minimize
- Animated Home/Hero media and atmospheric presentation
- Additional GM workflow polish based on real campaign use
- Deeper World/campaign management
- Optional game-system adapters kept outside Core
- JS/CSS modularization and maintainability work
- Fuller localization coverage
- Possible shared-GM-vault mode if multi-GM campaigns request it

## CORE RULE

Adventurer's Tome remains system-agnostic. Core uses generic Foundry Documents, ownership, settings, and `flags.adventurers-tome.*`; it must not depend on `actor.system.*` or any game-system schema.
