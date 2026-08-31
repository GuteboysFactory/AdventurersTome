# Changelog

## 1.0.0-rc.1

Release candidate based on the live-approved v0.20.8 runtime line. No new runtime feature is introduced in this candidate.

- Freeze behavior for final Foundry VTT 13.351 regression.
- Keep system-agnostic Core and per-GM private workspace boundaries.
- Keep Glass UI with Normal / 25 / 50 / 75 / 90% scene transparency.
- Keep movable per-user Tome launcher.
- Keep GM Workspace Builder, Import/Export, permissions, diagnostics, Manual, and live-session tools.
- Exclude the legacy private `assets/Bree.webp` from the public candidate package.
- Keep the experimental minimize/dock idea parked for post-1.0.

## 0.20.8 — Stable Window Rollback

- Removed the experimental minimize/restore UI and runtime logic.
- Supported compact workflow is now close with X and reopen from the movable launcher.
- Transparency, launcher, normal window geometry, and GM Workspace Builder remain unchanged.

## 0.20.3–0.20.7 — Window UX experiments

A series of compact-bar/minimize experiments were tested and ultimately retired before the 1.0 release line. The visual concept remains a post-1.0 backlog item, but future work should use a separate dock/minibar architecture rather than manipulating ApplicationV2 geometry.

## 0.20.2 — Canvas Glass & Workspace Builder Hotfix

- True Foundry Scene glass transparency.
- Hardened GM Notebook layout editing.
- Immediate persistence for visibility, width, and order changes.

## 0.20.0 — Custom GM Workspace

- Per-GM private workspace layout.
- Presets, show/hide, ordering, sizing, Campaign Scratchpad, Quick Capture, and Custom Notepads.
- Reworked first-user in-app Manual.

## Earlier v0.x milestones

The v0.x line delivered Sessions, Quests, cross-links, Search, Import 2.0, Campaign Configuration, permissions/discovery, Health Check, Exporter, GM Notebook, Next Session Dashboard, Quick Capture, Reveal Queue / Show to Players, Post-Session Assistant, World ↔ Journal synchronization, Rules chat/whisper tools, Home Builder, and public demo preparation.
