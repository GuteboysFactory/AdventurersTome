# Adventurer's Tome — Roadmap

## DONE — v0.x foundation

- System-agnostic Foundry VTT 13.351 Core.
- Home dashboard + Home Builder.
- Sessions and Quests with detail views, imports, links, and history.
- Group / Actor profiles.
- World profiles with Foundry Journal synchronization.
- Rules library, search, public chat sharing, and whispers.
- Foundry-aware visibility/discovery and player permissions.
- Search, Favorites, Recents, backlinks, and internal navigation.
- Import 2.0, dry-run preview, history, and Undo Last Import.
- Portable, Player-safe, and Full GM Archive export modes.
- GM Notes, Next Session Dashboard, Quick Capture, Reveal Queue, Show to Players, and Post-Session Assistant.
- Health Check / Safe Repair.
- Private per-GM Workspace Builder, Scratchpad, and Custom Notepads.
- Role-aware in-app Manual.
- Glass UI with Normal/25/50/75/90% Scene transparency.
- Movable per-client launcher.
- Stable window rollback: experimental ApplicationV2 minimize/restore retired.

## CURRENT — v1.0.0-rc.1

Freeze features and perform final release regression in Foundry VTT 13.351.

Exit gates:

1. Clean install of the exact RC artifact.
2. Upgrade test from v0.20.8.
3. GM/player permission regression.
4. World/Journal sync and Rules chat/whisper regression.
5. GM Workspace persistence/isolation regression.
6. Import/Export/Undo/Health Check regression.
7. Multiplayer Show to Players smoke if practical.
8. No release-blocking console/runtime errors.
9. Public repository metadata + software license before public distribution.

## NEXT — v1.0.0

Promote the RC line without adding new features. Only release-blocking fixes may enter between RC and 1.0; material fixes require another RC.

## POST-1.0

- Revisit minimize as a **separate Tome dock/minibar**, not ApplicationV2 geometry manipulation.
- Animated Home/Hero backgrounds and atmospheric media.
- Further GM workflow improvements based on real table use.
- Modularize the large JS/CSS codebase.
- Expand localization coverage.
- Optional system-specific adapters while keeping Core schema-independent.
- Evaluate optional shared-GM private workspace/vault mode.
- Additional campaign-management and QoL features driven by user feedback.
