# Adventurer's Tome — v1.0 Release Readiness Audit

Audit target: **v0.20.8 → v1.0.0-rc.1**  
Foundry target: **VTT 13.351**  
Core rule: **system-agnostic; no game-system schema dependency such as `actor.system.*`**

## Executive verdict

**Code line:** RELEASE CANDIDATE READY.  
**Private/table use:** READY FOR FINAL RC REGRESSION.  
**Public GitHub release:** NOT YET FINAL — repository metadata, a software-license decision, and the exact hosted clean-install test remain external release gates.

v1.0.0-rc.1 intentionally introduces no new runtime feature. It is the live-approved v0.20.8 Stable Window Rollback promoted into a frozen release-candidate line.

## Final RC regression

Verify:

- Module launch / ApplicationV2 Tome
- Glass UI: Normal / 25 / 50 / 75 / 90%
- Movable launcher: drag, persistence, reload, right-click reset
- Window close / reopen; minimize is intentionally absent
- Home Builder
- Sessions and Quests
- Group / Actor profiles
- World profiles / Journal sync from GM and player accounts
- Rules and public chat / whisper
- Search / Favorites / Recents and client isolation
- Permissions / discovery with GM and player clients
- GM Notes / private vault and per-GM isolation
- GM Workspace Builder: reorder, hide/restore, 1/4-1/2-3/4-Full, custom pads
- Next Session / Quick Capture
- Reveal Queue / Show to Players
- Post-Session Assistant
- Import / Undo
- Portable Export round-trip, Player-safe Export, Full GM Archive
- Health Check / Safe Repair
- In-app Manual from GM and player roles

## Release-critical boundaries

### System agnosticism

Core uses generic Foundry Documents, ownership, settings, and `flags.adventurers-tome.*`. It does not inspect game-system data models.

### Permission boundary

Player-facing Tome content requires Foundry Observer-or-better access in addition to Tome discovery/visibility rules. World-profile **Open Sheet** remains GM-only.

### Private GM data

GM Notes, private facts/relations, Reveal Queue, import history/undo, Scratchpad, Custom Notepads, and GM Workspace configuration use per-user storage where intended.

### Player-safe export

Player-safe packages exclude the private GM vault, raw secret Journal material, and links to hidden/non-viewable targets.

### Socket behavior

The manifest declares socket support. Show to Players re-checks recipient-side visibility/permission before opening content.

### Window UX decision

The experimental minimize/restore implementation from v0.20.3–v0.20.7 is retired. The supported compact workflow for v1.0 is **close with X → reopen with the movable launcher**. A separate dock/minibar architecture is post-1.0.

## Public package boundary

The public candidate package should include:

- `module.json`
- `scripts/`
- `styles/`
- `templates/`
- `lang/`
- original neutral `assets/default-hero.webp`
- original The Ashen Road demo assets
- documentation

The legacy private `assets/Bree.webp` compatibility file is deliberately excluded.

## External gates before public v1.0.0

1. Choose and add the software license.
2. Finalize repository/support/manifest/download metadata.
3. Host **1.0.0-rc.1** and install that exact manifest/package into clean Foundry VTT 13.351.
4. Run final GM/player RC regression.
5. Smoke-test Export/Import and Show to Players.
6. If no blocker is found, stamp the same runtime line as **v1.0.0**.

## Promotion rule

Do not add a new major feature between RC and 1.0. Fix release blockers only. If a fix materially changes data, permissions, import/export, or application lifecycle behavior, issue another release candidate.
