# CHANGELOG

## 1.1.0 — Tome Authoring & Journal Takeover

- Promoted the fully approved `v1.1.0-rc.1` baseline to stable without runtime feature changes.
- Added persistent Campaign Explorer organization backed by real Foundry Journal folders while preserving Tome's rich World / Quests / Sessions presentation.
- Added Tome-native folder management for create, rename, safe empty-only delete, and drag/drop reorganization with protected section roots.
- Added Tome-native entry management for create, rename, Open in Tome, Open Foundry Source, move, and guarded permanent Journal deletion.
- Added Journal Page management and navigation including create, rename, reorder, duplicate, move, delete, player access, primary-page handling, and direct page navigation inside Tome.
- Expanded Journal-backed authoring and autosave so campaign content can be maintained from Tome instead of relying on Foundry Journal sheets for normal workflow.
- Added delegated authoring roles: Section Editors can manage their assigned Tome section through a validated GM socket broker, while Entry Editors can author assigned entries/pages without structure privileges.
- Preserved strict Player read-only presentation and GM-private Notes/workspace isolation.
- Removed retired Explorer/tree/workspace prototypes and hardened release CI against their return.
- Hardened manifest, language, runtime-file, release-URL, ZIP-integrity, package-content, and retired-prototype validation.
- Added formal beta regression and RC-to-stable release gates for GM, Section Editor, Entry Editor, and Player workflows.
- Stable `v1.0.0` campaign data remains Journal-backed and compatible with the v1.1 authoring model.

## 1.0.0-rc.1 — Release Candidate

- Promoted the live-approved v0.20.8 runtime line into the Adventurer's Tome 1.0 release-candidate phase.
- No new runtime feature was added in this version; the RC deliberately freezes the established behavior for final regression testing.
- Kept the stable Glass UI with Normal/25/50/75/90% scene transparency, movable per-client launcher, Foundry close behavior, and customizable per-GM workspace.
- Kept the experimental minimize/restore feature retired; a future dock/minibar implementation remains a post-1.0 backlog item.
- Refreshed the v1.0 readiness/public-release documentation around the current v0.20.8 baseline rather than the older v0.15 audit state.
- Public RC packaging excludes the legacy private `assets/Bree.webp` compatibility asset and retains the original neutral default hero plus The Ashen Road demo assets.
- Public GitHub publication remains gated on repository metadata, a software-license decision, and the hosted clean-install smoke test.


## 0.20.8 - Stable Window Rollback

- Removed the experimental Tome minimize/restore control and all live compact-bar geometry handling.
- Removed the retired client minimize-state setting from active registration. Existing stored values are simply ignored.
- Returned Tome window persistence and viewport handling to the normal ApplicationV2 path: only the regular expanded window rectangle is saved.
- Kept the successful movable per-user launcher, right-click launcher reset, Normal/25/50/75/90% scene transparency, Glass UI, and GM Workspace Builder unchanged.
- The minimize/dock concept is intentionally parked for a future implementation that can use a separate dock surface instead of resizing the Tome ApplicationV2 window.

## 0.20.7 — Right-Anchored Compact Bar Hotfix

- Keeps the Tome window's **right edge fixed** when minimizing, so the compact bar collapses leftward instead of jumping away from the minimize button/pointer.
- Restore uses the compact bar's current **right edge** as its anchor and expands the saved full-size Tome leftward from that point.
- Moving the compact bar still works; restoring after a move preserves the saved expanded width/height while following the bar's new right-edge position.
- No transparency, launcher, GM Notebook, campaign data, permissions, import/export, or rule behavior changed.

## 0.20.6 — Compact Bar Minimize Hotfix

- Replaced the v0.20.5 geometry-neutral clip with a strict two-state minimize model: Expanded Tome or a genuinely small compact title bar.
- Minimizing now snapshots and persists the full expanded window rectangle, then resizes only the live ApplicationV2 instance to a compact 420px-or-smaller bar containing title, Transparency, Restore, and Close.
- The compact bar can still be moved. Restore returns to the previously saved expanded width/height and uses the compact bar's current top-left as the restore anchor, clamped safely to the current viewport.
- Minimized dimensions are never written into the normal client window-state setting, preventing the small bar from becoming the next full Tome size.
- Viewport resize handling now preserves compact mode instead of running the mini bar through normal-window minimum sizing.
- Removed the old clip-path minimize CSS; compact mode now hides Tome content and resize handles while keeping window chrome usable.
- No transparency, launcher, GM Notebook, campaign data, permissions, import/export, or rule behavior changed in this hotfix.

## 0.20.5 — Geometry-Neutral Minimize Hotfix

- Rebuilt Tome minimize/restore so it no longer resizes the ApplicationV2 root at all. The expanded Foundry window rectangle remains untouched while the app is visually clipped to its native title bar.
- Restore now removes the clip instead of reconstructing width/height/position, eliminating the ApplicationV2/ResizeObserver race that could make repeated minimize/restore cycles drift, collapse, or restore at the wrong size.
- Removed title-bar double-click minimize/restore to avoid collisions with native/window-manager double-click behavior; the explicit `_` button is now the single minimize/restore control.
- The minimized title strip remains draggable and keeps Transparency, `_`, and `X` available. Moving the minimized strip is persisted when the Tome is restored.
- No transparency, launcher, GM Notebook, campaign data, permissions, import/export, or rule behavior changed in this hotfix.

## 0.20.4 — Window UX Polish

- Reworked the movable Tome launcher so drag motion uses compositor `translate3d()` positioning instead of layout-heavy top/left updates; the button now tracks the pointer much more directly and only persists its position when released.
- Hardened Tome minimize/restore by snapshotting the expanded client window geometry before collapse and preventing the 34px minimized shell from overwriting the saved window size.
- Restore re-applies the exact pre-minimize width, height and position after ApplicationV2/CSS settle, then restores the captured scroll position.
- Added title-bar double-click as an additional minimize/restore gesture while preserving the explicit `_` control.
- The minimized Tome remains a draggable title strip with transparency, minimize/restore and close controls available.
- No transparency, GM Notebook, campaign data, permissions, import/export, or rule behavior changed in this hotfix.

## 0.20.3 — Glass UI & Freeform GM Workspace Hotfix

- Added 90% Tome transparency and rebuilt the glass model so Foundry Scene transparency affects Tome surfaces rather than fading text, controls, and the whole Application.
- Added a Windows-style minimize/restore control in the Tome window header. Minimized Tome collapses to the title bar while keeping transparency, minimize, and close controls available. Minimize state is client-scoped.
- Made the Adventurer's Tome launcher movable per client with pointer drag. The default launcher position is raised slightly above the connected-user area; right-click resets it to default.
- Hardened GM Workspace customization with direct ApplicationV2 actions for Move Earlier/Later, 1/4 / 1/2 / 3/4 / Full width, and Hide. These changes save immediately per GM and do not depend on fragile delegated DOM state.
- Replaced native HTML5 drag for live Notebook windows and private Custom Notepads with pointer-based reordering to avoid Foundry/ApplicationV2 drag conflicts.
- Preserved all v0.20.x GM-private Scratchpad, Notes, Custom Notepads, presets, migration, archive, and role-aware Manual behavior.

## 0.20.2 — True Canvas Glass & GM Workspace Builder Hotfix

- Corrected Tome transparency semantics: 25%, 50%, and 75% now reveal the actual Foundry Scene/canvas behind the Adventurer's Tome application instead of merely fading Tome's own background artwork.
- In glass mode the ApplicationV2/window content and large Tome page backgrounds become transparent; Tome text and controls remain fully opaque and common panels become translucent surfaces for readability.
- Large Tome hero/section artwork is suppressed while glass transparency is active so the Foundry Scene is the visual layer revealed behind the Tome.
- Transparency remains client-scoped, so every GM/player can choose their own Normal/25/50/75 setting without changing anyone else's view.
- Hardened GM Notebook layout editing after v0.20.1 live feedback: builder visibility, width, and order changes now persist immediately instead of waiting for a separate save step.
- Reworked drag-and-drop to use explicit drag handles rather than making entire Notebook windows draggable, avoiding conflicts with textareas, inputs, buttons, and ApplicationV2 interaction.
- Added explicit left/right move controls to every visible Notebook window as a reliable alternative to drag-and-drop.
- Added explicit left/right move controls to Custom Notepads and retained per-pad 1/4, 1/2, 3/4, and Full width controls.
- Live workspace size, hide, move, and builder-list changes re-render from the saved private GM layout immediately, making persistence visible during editing.
- No campaign document migration; existing v0.20.x GM notes, Scratchpad content, Quick Captures, Custom Notepads, and per-GM privacy are preserved.

## 0.20.1 — True GM Workspace Builder & Tome Transparency

- Rebuilt the v0.20.0 GM Notebook layout controls around the three failed live-QA gates: show/hide, reorder, and width control.
