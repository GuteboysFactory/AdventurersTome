# Adventurer's Tome Manual

The authoritative manual is built directly into Adventurer's Tome and is available from the **?** icon in the top-right toolbar. It is version-aware and role-aware: players see player guidance while GM-only administration sections are hidden from player view.

## v1.0.0-rc.1 release-candidate note

The release candidate freezes the v0.20.8 runtime behavior for final Foundry VTT 13.351 QA. No new gameplay/workflow feature is introduced by the RC itself. The experimental minimize/restore control remains retired; close Tome with Foundry's X and reopen it from the movable per-user launcher.

## What changed in v0.20.0

The manual is now written for people who have never used Adventurer's Tome before. It includes:

- a plain-language introduction to what Tome does beside Foundry
- a five-minute GM setup checklist
- step-by-step workflows for Sessions, Quests, World, Rules, and chat sharing
- explanations of Foundry permissions vs Tome discovery / GM-only visibility
- GM Notebook & Workspace Builder onboarding
- Import / Export / Undo guidance
- Health Check expectations
- common questions and troubleshooting
- tips, examples, and important safety notes

## GM Workspace Builder

The GM Notebook is private per GM user. A GM can choose presets or build their own workspace from these sections:

- Campaign Scratchpad
- Quick Capture
- Custom Notepads
- Session Tools
- Notebook Overview
- Notes Feed

Each section can be shown/hidden, moved up/down, and set to half or full width. Custom Notepads are independent private freeform pages. Layout changes never delete notes or pads.

Use the in-app Manual for the installed-version instructions.


## v0.20.1 Workspace Builder additions

GM Notebook layout editing now works directly on the visible workspace. Use **Customize Workspace**, drag Notebook windows to reorder them, choose **1/4, 1/2, 3/4, or Full** width, and hide windows you do not want. The configuration list remains available for restoring hidden windows and precise ordering. Custom Notepads can also be dragged and resized independently. Layout changes never delete note content.

A personal transparency control is available in the Tome window header next to the close control. Choices are **Normal, 25%, 50%, and 75%**. The setting is client-local and does not change another player's or GM's Tome.


## v0.20.2 Canvas Glass & GM Workspace editing

**Tome Transparency** in the native window header is a personal client setting. Normal keeps the themed Tome presentation. 25%, 50%, 75%, and 90% switch the application into canvas-glass mode: the Foundry Scene behind Tome becomes visible through the window while Tome text and controls remain readable. Large Tome background/hero artwork is intentionally suppressed while glass mode is active.

In **Campaign Settings → GM Notebook → Customize Workspace**, layout edits save immediately. Drag using the grip handle, or use the left/right arrows on each Notebook window. Choose ¼, ½, ¾, or Full width and hide/restore sections from the builder. Custom Notepads have their own grip, left/right arrows, and width selector. Layout changes never delete note content.


## Window controls (v0.20.8)

Each user can move the Adventurer's Tome launcher independently. Drag the launcher to move it; right-click it to reset to the default position. The Tome window header offers Normal/25/50/75/90% scene transparency plus Foundry's normal Close control. Transparency reveals the Foundry Scene behind Tome surfaces without deliberately fading Tome text and controls.

The experimental minimize/restore control was retired in v0.20.8 after live QA showed unstable ApplicationV2 window geometry. Close Tome with X and reopen it from the movable launcher. The minimize/dock idea is parked for a future redesign.

GM Notebook Customize Workspace supports direct Move Earlier/Later, quarter/half/three-quarter/full widths, Hide, and pointer-drag reordering. Layout changes are private to the current GM and do not delete Notebook content.
