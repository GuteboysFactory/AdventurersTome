# Adventurer's Tome — v1.0 Release Readiness Audit

Audit target: **v0.20.8 → v1.0.0-rc.1**  
Foundry target: **VTT 13.351**  
Core rule: **system-agnostic; no game-system schema dependency such as `actor.system.*`**

## Executive verdict

**Code line:** RELEASE CANDIDATE READY.  
**Private/table use:** READY FOR FINAL RC REGRESSION.  
**Public GitHub release:** NOT YET FINAL — repository metadata, a software-license decision, and the exact hosted clean-install test remain external release gates.

v1.0.0-rc.1 intentionally introduces no new runtime feature. It is the live-approved v0.20.8 Stable Window Rollback promoted into a frozen release-candidate line.

## Runtime baseline already established during development

The following areas have been exercised during the v0.x cycle in Foundry VTT 13.351 and are retained in the RC:

| Area | RC status | Final RC action |
|---|---|---|
| Module launch / ApplicationV2 Tome | Established | Smoke test after clean install and upgrade |
| Glass UI | Established | Verify Normal/25/50/75/90% over an active Scene |
| Movable launcher | Established | Verify drag, persistence, reload, right-click reset |
| Window close / reopen | Established | Verify X then launcher reopen; minimize is intentionally absent |
| Home Builder | Established | Regression |
| Sessions | Established | Regression |
| Quests | Established | Regression |
| Group / Actor profiles | Established | Regression + sheet open permissions |
| World profiles / Journal sync | Established | Regression from GM and player accounts |
| Rules | Established | Regression + public chat / whisper |
| Search / Favorites / Recents | Established | Regression + client isolation |
| Permissions / discovery | Established | Two-client GM/player regression |
| GM Notes / private vault | Established | Verify per-GM isolation and persistence |
| GM Workspace Builder | Established | Verify reorder, hide/restore, 1/4-1/2-3/4-Full, custom pads |
| Next Session / Quick Capture | Established | Workflow smoke test |
| Reveal Queue / Show to Players | Implemented | Multiplayer smoke test strongly recommended before final 1.0 |
| Post-Session Assistant | Established | Workflow smoke test |
| Import / Undo | Established | Regression |
| Export | Implemented | Final Portable round-trip + Player-safe + Full GM Archive smoke |
| Health Check / Safe Repair | Established | Regression |
| In-app Manual | Established | GM/player role-aware smoke |

## Release-critical boundaries retained in the RC

### System agnosticism

Core uses generic Foundry Documents, ownership, settings, and `flags.adventurers-tome.*`. It does not inspect game-system data models. Optional system adapters remain a post-1.0 concern.

### Permission boundary

Player-facing Tome content requires Foundry Observer-or-better access in addition to Tome discovery/visibility rules. World-profile **Open Sheet** remains GM-only.

### Private GM data

GM Notes, private facts/relations, Reveal Queue, import history/undo, Scratchpad, Custom Notepads, and GM Workspace configuration use per-user storage where intended. This means two GM accounts have separate private workspaces by design.

### Player-safe export

Player-safe packages exclude the private GM vault, raw secret Journal material, and links to hidden/non-viewable targets.

### Socket behavior

The manifest declares socket support. Show to Players still re-checks recipient-side visibility/permission before opening content.

### Window UX decision

The experimental minimize/restore implementation from v0.20.3–v0.20.7 is retired. The supported compact workflow for v1.0 is: **close with X → reopen with the movable launcher**. A separate dock/minibar architecture is explicitly post-1.0.

## Public package boundary

The v1.0 public candidate package should contain the module under an `adventurers-tome/` root and include:

- `module.json`
- `scripts/`
- `styles/`
- `templates/`
- `lang/`
- original neutral `assets/default-hero.webp`
- original The Ashen Road demo assets
- documentation

The legacy private `assets/Bree.webp` compatibility file is deliberately excluded from the public RC ZIP.

## External gates before public v1.0.0

1. Finalize the public GitHub repository owner/name.
2. Choose and add the software license.
3. Add stable repository/support/manifest/download metadata to the release manifest/workflow.
4. Host **1.0.0-rc.1** and install that exact manifest into a clean Foundry VTT 13.351 instance.
5. Run the final RC regression protocol from both GM and player clients.
6. Smoke-test Portable Export → re-import, Player-safe Export, and Full GM Archive.
7. Preferably smoke-test Show to Players with two live clients.
8. If no blocker is found, stamp the same runtime line as **v1.0.0**.

## Deferred / non-blocking post-1.0 work

- Separate Tome dock/minibar instead of ApplicationV2 minimize geometry manipulation.
- Animated Home/Hero media and richer atmospheric presentation.
- JS/CSS modularization for maintainability.
- Fuller localization coverage.
- Optional game-system adapters kept outside Core.
- Possible shared-GM-vault mode if multi-GM campaigns request it.

## Promotion rule

Do not add a new major feature between RC and 1.0. Fix release blockers only. If a fix materially changes data, permissions, import/export, or application lifecycle behavior, issue another release candidate rather than silently promoting it.
