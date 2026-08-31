# CHANGELOG

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
- No transparency, launcher, GM Notebook, campaign data, permissions, import/export, or rule behavior changed.

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
- Added direct edit-layout mode on the actual GM Notebook workspace: visible windows can be dragged into a new order without guessing from a separate configuration list.
- Added 1/4, 1/2, 3/4, and Full width choices for Notebook windows, with responsive collapse on smaller Tome windows.
- Added direct Hide controls while editing; hidden windows remain in the private layout and can be restored from the builder list.
- Hardened the classic builder list with drag-to-reorder plus the existing up/down controls as a precise fallback.
- Made individual Custom Notepads draggable and resizable while preserving their text, title, ordering, and per-GM privacy.
- Layout changes remain presentation-only: Scratchpad, Quick Capture, structured notes, and Custom Notepad content are never deleted by resizing, hiding, or reordering.
- Added a per-client Tome transparency control beside the native window close control with Normal, 25%, 50%, and 75% choices.
- Transparency affects Tome surfaces/backgrounds while keeping text and controls fully readable; the setting is personal to each user and persists on that client.
- No campaign document migration and no game-system dependency added.

# Changelog

## 0.20.0 — GM Workspace Builder & Guided Manual

- Rebuilt GM Notebook into a private per-GM workspace builder. Each GM user can show/hide, resize, and reorder Notebook sections without changing another GM's layout.
- Added Standard, Session Prep, Writer's Desk, and Minimal GM Workspace presets plus a fully custom layout mode.
- Added private Custom Notepads: create up to 24 named freeform pads for topics such as NPC ideas, rumours, session notes, voices, loot, or any personal workflow.
- Preserved Campaign Scratchpad, Quick Capture, Session Tools, Notebook Overview, and Notes Feed as independent configurable widgets. Layout changes never delete notes or notepads.
- Extended the private GM workspace schema with backward-compatible normalization, so existing v0.19 scratchpad/notes automatically gain default layout and pad support.
- Rewrote the in-app Manual for first-time users with a five-minute setup, use-when guidance, step-by-step workflows, examples, safety notes, GM Notebook Builder instructions, and troubleshooting.
- Manual remains role-aware: players receive player-facing instructions while GM-only administration guidance stays hidden from player view.
- Full GM Archive automatically includes the expanded private workspace (layout and custom notepads) because it is stored in the existing private GM workspace payload.

## 0.19.0 — GM Workspace & In-App Manual

- Expanded **GM Notebook** into a true private GM workspace instead of only an aggregate note list.
- Added a per-GM **Campaign Scratchpad** for freeform prep, rough ideas, names, scene fragments, and temporary notes that do not belong to a Foundry document.
- Added embedded **Quick Capture** directly inside the GM Notebook with type, status, trigger, target Session, pinning, edit, resolve/reopen, and delete controls.
- Standalone Notebook notes participate in Notebook search/filtering, Due/Pinned counts, Next Session Dashboard, and Post-Session Assistant alongside notes attached to Sessions, Quests, Characters, and World entries.
- Added a persistent **Manual / Help** button in the top-right toolbar for both GM and players.
- Added a searchable in-app Manual whose content is role-aware: players receive user-facing workflows while GM-only administration sections are included only for GMs.
- Manual version follows the installed module version so documentation can evolve with each Adventurer's Tome release.
- Added documentation for Home Builder, Sessions, Quests, Group, World/Journal sync, Rules, local/global search, chat sharing/whispers, Permissions, GM Notebook, live GM tools, Import/Export, and Health Check.
- All GM workspace data remains in the Foundry V13 per-user private setting scope; no new game-system dependency was introduced.

## 0.18.2 — Minimal Home Cleanup

- Removed the extra GM-only **Customize Home** button from Minimal Home.
- Campaign Settings remains permanently reachable from the top-right GM gear, which is now the single configuration entry point from Minimal Home.
- No other Home Builder, campaign data, permission, or navigation behavior changed.

## 0.18.1 — Minimal Home Settings Escape Hatch

- Fixed GM toolbar clipping that could hide **GM Notebook** and **Campaign Settings** when the Home Builder was switched to Minimal mode or the Tome window had limited horizontal space.
- Reworked the topbar's GM action column to size to its actual controls instead of a fixed single-icon width.
- Campaign Settings is now treated as a persistent GM control and remains reachable regardless of Home presentation mode.
- Minimal Home now includes a GM-only **Customize Home** button beside the Enter action as a deliberate recovery path directly into the Home Builder settings section.
- Players still see the same clean Minimal landing page; the recovery control is GM-only.

## 0.18.0 — Home Builder

- Added three Home modes: Dashboard, Minimal, and Custom.
- Added Home Builder presets that change presentation without deleting campaign content.
- Preserved Sessions and Quests as first-class Home widgets; Dashboard remains the default experience.
- Added hero composition controls: Classic, Centered, Immersive; Standard, Tall, or Full height; soft/balanced/strong shading; left/center/right image focus.
- Added an optional configurable Enter button for cinematic landing pages.
- Expanded Home widgets with Campaign Snapshot, per-user Favorites, and GM Tools.
- Home widgets can now be shown/hidden, reordered, and assigned Compact/Normal/Wide sizes in Custom mode.
- Added a live schematic Home Builder preview inside Campaign Settings.
- Minimal mode presents a clean artwork-first landing page while keeping the full Tome navigation available.
- Added responsive rules so Custom widget sizing gracefully collapses on narrower Tome windows.
- Animated/video hero media remains intentionally deferred to a later media-layer release.


## 0.17.7 — Foundry Chat Context Hotfix

- Fixed the actual Foundry 13 chat-share failure revealed by the browser console: ApplicationV2 action handlers run with the Tome app instance as `this`, while the selection helper functions are static class helpers.
- Public and Whisper sharing now invoke the static selection/format/cleanup helpers with the current Tome instance explicitly.
- Chat messages now include the current Foundry user id and use `ChatMessage.getSpeaker()` with a safe alias fallback.
- No changes to selection UI, permissions, World access, or campaign data.

## 0.17.6 — Direct Selection Share Dispatch Hotfix

- Fixed contextual **Public** / **Whisper…** controls still appearing but doing nothing in some Foundry 13 layouts.
- Bypassed ApplicationV2 delegated `data-action` dispatch for selected-text share controls and bound their click actions directly during Tome render.
- Captures selected text on pointerdown/mousedown, preserves it through focus collapse, and invokes Public/Whisper from the actual Tome application instance.
- Prevents duplicate dispatch if Foundry's delegated action listener also sees the click.
- Added explicit console logging plus a visible error notification if Foundry chat creation or the whisper dialog fails.
- Preserved v0.17.5 selection grace handling, v0.17.4 whisper recipients, v0.17.3 GM-only World sheet access, and v0.17.2 text-selection CSS fixes.

## 0.17.5 — Selection Share Click Hotfix

- Fixed contextual **Public** and **Whisper…** buttons appearing beside selected text but not executing in Foundry 13.
- Removed the pointerdown cancellation that suppressed ApplicationV2's subsequent `data-action` click dispatch.
- Added a short selection-share grace lock so the captured text survives browser focus/selection collapse while the share action is clicked.
- Public and Whisper now use the same preserved selection state and clear it only after the message action completes.
- Preserved v0.17.4 whisper recipient selection, v0.17.3 GM-only World sheet access, and all v0.17.2 native text-selection fixes.

## 0.17.4 — Whisper Selected Text

- Added **Whisper Selected** alongside the existing public Send Selected Text workflow.
- The contextual selection popup now offers both **Public** and **Whisper…** actions without slowing down the one-click public share path.
- Whisper opens a recipient picker for connected users plus a one-click **Whisper to GM(s)** option.
- Whisper messages preserve the same Adventurer's Tome quote styling in Foundry chat.
- Preserved v0.17.3 GM-only World Open Sheet behavior and all v0.17.2 native text-selection fixes.

## 0.17.3 — GM-only World Sheet Access Hotfix

- **Open Sheet** on World profiles is now rendered for GMs only, even when the linked Actor itself is visible to players.
- **Actor Access** remains GM-only and unchanged.
- Player-facing World profiles keep all normal Tome content and Foundry/Tome visibility filtering, but no longer expose a direct Actor-sheet shortcut from World.
- Preserved all v0.17.2 native text-selection and Send Selected Text fixes.

## 0.17.2 — Native Text Selection Hotfix

- Explicitly re-enabled native browser text selection on Tome reading surfaces, overriding Foundry/system/theme `user-select: none` rules that prevented Rule, Session, Quest, Character, and World text from being highlighted.
- Added text cursors on readable content so selectable areas are obvious.
- Hardened **Send Selected Text** so pressing either the contextual share button or the Rule toolbar fallback preserves the current selection before Foundry can focus the button and collapse it.
- Preserved all v0.17.1 World Actor-sheet resolution and v0.17.0 Foundry sync/content tools.

## 0.17.1 — World Sheet & Chat Selection Hotfix

- World profiles now resolve a linked Foundry Actor by explicit link or a single exact-name match, so NPCs such as imported/demo characters expose an **Open Sheet** button without requiring a second manual link step.
- World profile editing preselects that safely inferred Actor so saving the entry can persist the relationship explicitly.
- Reworked text-selection sharing to listen to document selection changes and pointer selection, making **Send to Chat** reliable inside Rule, Session, Quest, Character, and World shareable text.
- The contextual **Send selection to Chat** action now appears beside the selected text and is clamped to the visible viewport.
- Rule detail pages also include an explicit **Send Selected Text** toolbar button as a dependable fallback/affordance.
- Preserved the v0.17.0 Journal sync, Rules, local search, permissions, system-independent custom links, and all v0.16.0 public-clean assets/demo.

## 0.17.0 — Foundry Sync & Content Tools

- World Known Information now syncs to a dedicated Foundry Journal page; editing it in Tome updates Foundry and Journal edits refresh Tome.
- World entries can link to a real Foundry Actor and expose Character Sheet only when Foundry permissions allow it.
- Permission editor can now change Foundry default ownership alongside Tome discovery/visibility controls.
- Added local search boxes to Sessions, Quests, and Rules.
- Rules can be created directly from Tome or linked from any existing Foundry Journal.
- Character profiles support system-independent custom shortcut buttons backed by Foundry UUIDs or web URLs.
- Added select-text → Send to Chat for shareable Tome content.
- Preserved v0.16.0 public-clean default artwork/demo and all existing GM workflow, import/export, permissions, and health-check features.

## 0.16.0

- Replaced the setting-specific Fellowship demo with **The Ashen Road**, a fully original system-independent demo campaign.
- Added an original neutral fantasy default hero image for new installs and demo worlds.
- Kept the old `assets/Bree.webp` path only as legacy upgrade compatibility for private worlds; it is no longer the default or demo background.
- Rewrote public import examples, demo labels, placeholders, and test documentation around original campaign data.
- Generalized the demo/location placeholder artwork and Group labels for public distribution.
- Prepared the code/content boundary for the GitHub v1.0 release candidate while preserving all v0.15.2 privacy hardening and GM live-session tools.

# CHANGELOG

## 0.15.2

- Completed the v1.0 readiness security/privacy audit and hardened the module without changing the system-agnostic Core contract.
- Enabled the Foundry module socket in `module.json`, fixing the manifest prerequisite for **Show to Players** broadcasts.
- Tightened player visibility: Tome detail content now requires Foundry **Observer** permission or better; LIMITED visibility is no longer treated as sufficient for full Tome content.
- Moved structured GM Notes, GM-only Character Facts/Relations, and GM-only World Facts out of shared Actor/Journal flags into a V13 **per-GM user vault**.
- Added automatic legacy-private migration from v0.15.1 and earlier. The migration writes private data first, then strips legacy shared fields, and Health Check detects any remaining legacy-private records.
- Moved GM Reveal Queue, Import History, and Undo snapshot state from world settings into per-GM user settings; legacy world state migrates automatically.
- Hardened the public module API so player calls cannot retrieve GM Notebook data, private exports, import history, reveal queue state, or hidden profile/link data.
- Hardened Player-safe Export: raw Journal page text is omitted and hidden/undiscovered/non-Observer link targets are removed from exported cross-links.
- Prevented Portable Export / Import round-trips from publishing private-vault World facts: Portable packages now exclude GM-only facts, and World import updates merge only against the shared World profile rather than the GM-overlaid profile.
- Prevented Foundry Journal **secret blocks** from being flattened into Tome summaries, search text, backlinks, or inferred links for non-GM users.
- Added JournalEntryPage create/update/delete refresh hooks so direct Journal page edits refresh an open Tome.
- Extended Health Check/Repair to cover stale private-vault sources and broken private relations without deleting campaign Actors or Journals.
- Fixed an audit-discovered Health Check repair bookkeeping issue so Actor profile writes occur only when that Actor actually changed.
- Relaxed the manifest hard maximum from build `13.351` to Foundry generation `13` while keeping `13.351` as the verified build; v14 remains blocked until explicitly tested.
- Documented that the private GM vault is per GM user account, and that live multiplayer Show to Players remains a recommended smoke test rather than a blocker for the rest of the module.

## 0.15.1

- Added a private **Next Session Dashboard** that automatically briefs the GM on due/pinned notes, active quests, open clues/reveals/consequences, current-location context, Quick Capture inbox count, and queued player reveals for the next planned Session.
- Added **Quick Capture** as an always-available live-session tool. Captures become structured GM Notes and can be attached to the current Tome entry or dropped into an automatically created private **GM Quick Capture Inbox**.
- Added a persistent **Reveal Queue** with Ready and Recently Shown sections. Sessions, Quests, Characters, and World profiles can be queued or explicitly shown to players.
- Added **Show to Players** using Foundry's module socket: non-GM clients open the revealed Tome entry automatically without mirroring normal GM navigation. The feature never bypasses Foundry ownership, and GM-only Tome entries must be changed manually before reveal.
- Explicitly revealing an otherwise player-accessible Undiscovered Tome entry marks it Discovered before broadcast.
- Added a private **Post-Session Assistant** with a dynamic wrap-up checklist, overdue-note review, active-quest reminder, Quick Capture inbox reminder, and campaign-export checkpoint shortcut.
- Added one-click **Resolve** controls for structured GM Notes from the Next Session Dashboard and Post-Session Assistant.
- Added `Idea` and `Scene` GM Note types for live improvisation and prep.
- Added `revealQueue` to private GM archive settings and API helpers for Reveal Queue access.
- Preserved the system-agnostic Core boundary, Foundry VTT 13.351 targeting, and the rule that normal Tome clicks remain local to the current user.

## 0.15.0

- Added the Tome Exporter with three export modes: re-importable Portable Tome Package v2, Player-safe Package, and private Full GM Archive.
- Portable exports preserve Sessions, Quests, World entries, summaries, facts, artwork paths, and name-based cross-links for Import 2.0.
- Player-safe exports strip Tome GM-only / undiscovered content and GM-only facts and only include entries with Observer-or-higher default Foundry ownership.
- Full GM Archive captures campaign presentation settings, Tome-managed Actor/Journal flags, access metadata, cross-links, Journal text, and structured private GM Notes for backup/audit.
- Expanded GM Notes from one free-text field into multiple structured notes per Tome entry.
- GM Notes now support type (Prep, Secret, Reminder, Clue, Reveal, Consequence, Question), Open/Resolved state, Pinning, free-text triggers, and optional target Session numbers.
- Added a private global GM Notebook that aggregates notes across Sessions, Quests, Characters, World entries, and Rules with search/filtering, due-note detection, pinned notes, secret/reveal counters, and source navigation.
- Added fast GM Note buttons to detail views and retained Foundry permissions as the authoritative security boundary.
- Legacy single GM Notes migrate transparently into the structured note model when edited/saved.
- Core remains system-agnostic and does not read actor.system.*.

## 0.14.0

- Added a GM **Tome Health Check** under Campaign Settings → Developer Tools. It scans stale Favorites/Recents, broken or mismatched explicit cross-links, deleted Actor relation targets, missing First Appeared Session references, malformed Tome-owned flags, unsupported Quest statuses/World categories, duplicate Session numbers, and duplicate names that can make automatic linking ambiguous.
- Added **Repair Safe Issues** with explicit confirmation. Safe repair removes only stale references/broken Tome links, clears deleted relation/Session targets, and normalizes malformed Tome-owned metadata; it does not delete campaign Actors or Journals.
- Added public API support: `game.modules.get("adventurers-tome").api.healthCheck({ repair: false | true })`.
- Hardened explicit-link validation so IDs that still exist but point to the wrong Tome content type are treated as invalid instead of silently surviving.
- Added resilient image handling for broken/moved campaign artwork, Actor portraits, World images, search thumbnails, and custom campaign logos, with generic Foundry-safe fallbacks instead of broken-image icons.
- Added import size guards (4 MB local file / 2,000,000 parsed characters) so accidental huge files fail cleanly before parsing.
- Fixed Session-number text-reference matching so word boundaries work correctly in the dynamic regular expression used by cross-link discovery.
- Debounced Foundry Actor/Journal change hooks to prevent render storms when many documents are edited by another module or bulk operation.
- Added keyboard `:focus-visible` treatment and `prefers-reduced-motion` support for more robust accessibility without changing the default visual style.
- Preserved Foundry VTT 13.351 targeting, the v0.13 permission boundary, Import 2.0 rollback, and the Core rule that no `actor.system.*` data is read or written.

## 0.13.0

- Added Foundry-aware Tome permission filtering: Adventurer's Tome never grants access that Foundry denies and can further restrict visible content.
- Added per-document Tome visibility (`Foundry access` / `GM only`) and discovered / undiscovered state for Sessions, Quests, Group Actors, World entries, and Rules.
- Added a GM Permission Defaults + Content Access dashboard under Campaign Settings.
- Added dedicated permission editor pages with Foundry ownership summary and optional GM notes.
- Added permission shortcuts on Session, Quest, Character, and World detail views.
- Added player filtering across Home, section lists, Search, Favorites/Recents, and cross-links so hidden/undiscovered entries do not leak through Tome navigation.
- Added per-fact visibility for Character and World facts, plus per-relation visibility on Character profiles. Existing facts/relations remain player-visible by default.
- Added GM-only visual markers for restricted facts/relations and GM notes in detail views.
- Added API helpers: `getAccess`, `setAccess`, and `canView`.
- Added campaign defaults for Tome visibility and discovery state.
- Security note: fact-level GM visibility is a Tome presentation filter; use Foundry ownership `None` for hard secrets.

## 0.12.0

- Rebuilt **Campaign Settings** as a GM administration dashboard with dedicated sections for Campaign Info, Appearance, Home Layout, Navigation, Group, Content Defaults, and Developer Tools.
- Added four visual theme presets: **Tome**, **Dark**, **Parchment**, and **Minimal**. Themes remain presentation-only and system-agnostic.
- Added optional **campaign logo** support in the Tome header while preserving the book icon as the default.
- Added per-section background artwork overrides for Sessions, Quests, Group, World, Rules, Search, Settings, and Import; blank entries inherit the Home hero image.
- Added configurable Home dashboard blocks with show/hide controls and saved up/down ordering for Latest Session, Active Quests, Group, and Recent Discoveries.
- Added Home extras for At-a-Glance, Campaign Sidebar, and Quick Links, including a sidebar-free responsive Home layout.
- Added configurable top navigation visibility and a GM-selected **default landing page**. Home always remains available.
- Added Group presentation options for Home preview member count and manual/alphabetical sorting.
- Added fallback Content Defaults for Quest status and World category without overwriting explicit Tome metadata.
- Added local **Preview** for theme, hero artwork, section artwork, and campaign logo plus a **Reset Form** workflow before saving.
- Retained Developer/Demo Tools, Journal structure initialization, and Import 2.0 inside the new settings dashboard.
- Preserved Foundry VTT 13.351 targeting, responsive per-user Tome window state, and the Core rule that no `actor.system.*` data is read or written.

## 0.11.0

- Upgraded the Tome Importer to **Import 2.0** with structured World-entry support for NPCs, Locations, Factions, Items, and Lore.
- Added structured discovery from Session/Quest Markdown sections so named NPCs and locations can be proposed as new World entries when they do not already exist.
- Added **Tome Package v2** support for Sessions, Quests, World profiles, facts, hero images, and campaign links in one reviewed transaction.
- Added a dedicated **Cross-link Preview** with Apply/Skip decisions for resolved Session, Quest, World, and Actor links; unresolved references are shown and skipped by default.
- Applied links are stored explicitly in `flags.adventurers-tome.links`, reducing reliance on name-based inference after import.
- Added reciprocal explicit links where appropriate while respecting Skip decisions on imported target documents.
- Extended the importer folder initializer to create and use World subfolders for NPCs, Locations, Factions, Items, and Lore.
- Added richer Import History counts for World entries and cross-links.
- Added **Undo Last Import** as a one-transaction safety net: created Journals are removed and Tome-managed flags, imported text, World images, and explicit links on updated Journals/Actors are restored.
- Preserved v1 Markdown/Tome Package compatibility and the system-agnostic Core boundary; Import 2.0 still never reads or writes `actor.system.*`.
- Added API support for `applyImport(preview, selections, linkSelections)` and `undoLastImport()`.

## 0.10.0

- Rebuilt **Search** as a full Tome index with category filters for Sessions, Quests, Characters, NPCs, Locations, Factions, Items, Lore, and Rules.
- Added richer search rows with category/meta labels, summaries, optional imagery, live result counts, and responsive filter chips.
- Added per-user **Favorites** stored in client-scoped Foundry settings; Sessions, Quest details, Character profiles, World profiles, and Search results can be starred without affecting other players.
- Added per-user **Recently Viewed** history and a dedicated Search shelf with clear-history control.
- Added internal **Back navigation** with a bounded view-history stack so cross-link browsing can return to the prior Tome view instead of always jumping back to a section root.
- Added breadcrumbs to Quest, Character, and World detail pages for faster orientation and direct parent navigation.
- Added the `/` keyboard shortcut to jump to Search and focus the search field when the user is not typing in another control.
- Added subtle navigation/hover polish, sticky search tools, responsive Favorites/Recent shelves, and compact small-screen behavior.
- Kept v0.9 campaign cross-links and the responsive 42/58 Session master/detail layout intact.
- Favorites and Recents are client-only presentation data; no campaign Journals, Actors, permissions, or game-system fields are changed.

## 0.9.0

- Adjusted the wide Sessions master/detail layout to roughly **42/58**, giving the selected Session more room while keeping the timeline comfortably readable.
- Added Tome-native **Quest Detail Pages**; Quest cards, Home quest shortcuts, Session quest links, and Search results now open the in-Tome quest view instead of jumping directly to the Journal.
- Quest details show status, featured state, concise summary, optional Objectives/Updates sections, chronicle excerpt, linked Sessions, linked World entries, linked visible Actors, and first/last linked Session when available.
- Extended Session detail previews with visible Character links alongside Quest and World links.
- Added campaign backlinks to Character profiles: Sessions, Quests, World entries, and incoming Actor relations can now be surfaced as navigable links.
- Added campaign backlinks to World profiles: Sessions, Quests, and visible Actors that reference the entry are shown directly in Tome.
- Added a generic `flags.adventurers-tome.links` schema with `sessions`, `quests`, `world`, and `actors` ID arrays for explicit future-proof links; conservative text/structured-section discovery remains the fallback.
- Added public API helpers `getLinks(document)` and `setLinks(document, links)`.
- Home Latest Session now opens the selected Session preview; Recent Discoveries opens Tome-native World profiles.
- Core remains fully system-agnostic and still does not read `actor.system.*`.

## 0.8.0

- Rebuilt **Sessions** as a responsive master/detail chronicle: the campaign timeline stays on the left while the selected Session opens as an in-Tome preview on the right.
- The latest Session is selected automatically the first time the Sessions tab opens; selecting another Session updates the preview without opening a separate Foundry window.
- Added a dedicated Session detail panel with cleaned summary, chronicle excerpt, optional Highlights, linked Quest count, linked World count, and an explicit **Open Full Session** action.
- Added conservative Session cross-link discovery for Quests and World entries. Structured Markdown headings are preferred; older prose sessions can link entries only when their full names are actually mentioned.
- Linked Quest threads open their existing Journal, while linked NPC/Location/Faction/Item/Lore entries open directly in their Adventurer's Tome World profile.
- Wide windows use the previously empty right-hand space; narrow windows automatically stack the detail view above the timeline and remain fully responsive.
- No stored-data migration is required. Existing demo and imported Sessions are enhanced dynamically from their current Journal content.

## 0.7.0

- Polished the **Home dashboard** so imported Session and Quest text stays concise instead of spilling raw journal content across the cards.
- Latest Session now separates the Session number from its title, uses a shorter three-line dashboard summary, and keeps the View Session action anchored consistently.
- Active Quest previews now use compact two-line summaries and visually distinguish featured quests.
- Rebuilt the **Sessions** page as a chronological campaign timeline with numbered markers, cleaner titles, two-line summaries, and responsive single-column behaviour.
- Session ordering now uses parsed Session numbers when available, preventing lexical title sorting from choosing the wrong latest Session.
- Rebuilt the **Quests** page into status groups for Active, Completed, Dormant, and Failed quests with counts and dedicated status badges.
- Featured quests sort ahead of other quests inside their status group.
- Added compact responsive Quest cards that collapse from three columns to two and then one as the user's Tome window becomes narrower.
- Added shared line-clamp utilities and hover/detail polish so long imported text remains readable without turning dashboard views into Journal pages.
- Importer now stores its cleaned Session/Quest summary as Tome metadata, and older imported Markdown sessions can still derive the Summary section automatically for cleaner dashboard text.
- No importer format or stored data migration is required; v0.7.0 is a presentation and organization update over v0.6.0.

## 0.6.0

- Added the **Tome Importer** for GM-controlled Session Logs, Quest Logs, and structured Tome JSON packages.
- Added local file import for Markdown (`.md` / `.markdown`), text (`.txt`), and JSON (`.json`) plus direct paste into the importer.
- Added a mandatory **dry-run preview** before any Foundry documents are changed.
- Every preview row supports **Create new**, **Update existing**, or **Skip**.
- Existing Session Journals are matched by exact normalized name and, as a fallback, by Session number; Quests are matched by exact normalized name.
- Session imports create/update Markdown `JournalEntryPage` content inside `Adventurer's Tome → Sessions`.
- Newly created imported Session/Quest Journals default to Foundry **Observer** visibility for players; updates preserve the existing Journal's permissions.
- Quest Log imports understand Active / Completed / Failed / Dormant status headings in English and Swedish and create/update Journals inside `Adventurer's Tome → Quests`.
- Quest updates preserve an existing `featured` flag unless the incoming source explicitly supplies a Featured value.
- Added **Tome Package v1** JSON support so one file can import a Session plus multiple Quest updates in one reviewed transaction.
- Added contextual **Import Session** and **Import Quest Log** buttons plus an Import shortcut from Home and Campaign Settings.
- Added a lightweight **Import History** audit trail with source name, time, detected import type, and create/update/skip/failure counts.
- Added importer safeguards so an open Tome does not repeatedly re-render during a bulk import.
- Added public API helpers: `previewImport()`, `applyImport()`, and `getImportHistory()`.
- Importer remains fully system-agnostic and writes only generic Journal content plus `flags.adventurers-tome.*`; it never reads or writes `actor.system.*`.

## 0.5.0

- Added **Developer / Demo Tools** to Campaign Settings for worlds that do not yet contain enough data to test Adventurer's Tome properly.
- Added the original prototype demo generator used during early development.
- Added a full stress-test demo dataset used during early development.
- Demo text is newly written summary/test content; no book passages are copied into the module.
- Added original module-owned SVG test artwork for hobbits, rangers, wizards, elves, dwarves, warriors, nobles, shadow figures, locations, artifacts, factions, and lore.
- Demo Actor creation remains system-agnostic: Adventurer's Tome discovers a valid Actor type exposed by the active Foundry game system and never reads or writes `actor.system.*`.
- Every generated Actor, Journal, and Folder is marked with a private Adventurer's Tome demo flag.
- Added **Remove Demo Campaign**, which deletes only flagged demo documents/folders and restores the Tome presentation settings that existed before demo generation.
- Existing Actors, Journals, Tome profiles, and non-demo folders are never deleted or overwritten by the demo generator.
- Added demo status/counts in Campaign Settings and safeguards that prevent a second demo from being generated on top of an active one.
- Added public API helpers: `generateDemo()`, `removeDemo()`, and `getDemoSummary()`.

## 0.4.1

- Fixed the Adventurer's Tome brand/logo block being vertically clipped or pushed into the Foundry window title bar.
- Explicitly overrides Foundry's global button height rules for the Tome brand and top navigation.
- Keeps the header geometry stable across responsive layout modes without changing the existing navigation design.

## 0.4.0
- Polished character profiles with optional **Motto / Quote** and **First appeared** session linking.
- Made the character profile editor more compact so Facts and Relations sit higher in the view.
- Added explicit up/down reordering controls for character Facts and Relations; saved order is preserved.
- Added Tome-native **World profiles** for Journals inside the World section while keeping Journal content intact.
- World entries can now be categorized as NPC, Location, Faction, Item, or Lore, with dedicated icons and grouped index cards.
- Added World profile image, subtitle, short summary, details, and structured facts, all stored in Adventurer's Tome Journal flags.
- Search results for World entries now open the Tome-native World profile instead of jumping directly to the Journal sheet.
- The Journal sheet remains one click away from every World profile.
- Folder initialization now also creates World subfolders: NPCs, Locations, Factions, Items, and Lore.
- Added public `getWorldProfile` and `setWorldProfile` API helpers.
- Core remains system-agnostic and does not read `actor.system.*`.

## 0.3.1
- Fixed **View Profile** appearing to do nothing on the Group page.
- Group and Profile were both being rendered at the same time because the Group navigation-active state was also used as the Group page visibility state.
- Split Group page visibility from Group navigation highlighting, so a character profile now replaces the Group grid immediately while the Group tab remains highlighted.
- No profile data or Actor data migration is required.

## 0.3.0

- Added full Tome-native character profile pages while keeping the Core completely system-agnostic.
- Group cards and Home group portraits now open the Tome profile instead of jumping straight to the system Actor sheet.
- Added GM profile editing for title, subtitle, short summary, biography, and separate Tome hero artwork.
- Added structured character facts with add/remove rows.
- Added Actor-to-Actor relationships with relation label and short note; relation cards open the linked Tome profile.
- Character Sheet remains one click away from every Tome profile.
- Added a public `setActorProfile` API helper.
- Added responsive profile layouts for wide, compact, narrow, and tiny Tome windows.
- Preserved all v0.2.2 portrait and background fixes.

## 0.2.2

- Fixed Group character portraits being collapsed to Foundry's default button height.
- Character image buttons now establish their own responsive 4:5 portrait area and ignore global button height constraints.
- Portrait images fill the card image area with `object-fit: cover` while keeping the face/top of the artwork visible.
- Hardened Home Group preview buttons against the same global Foundry button sizing rules.

## 0.2.1

- Fixed landing/background images not rendering reliably in ApplicationV2.
- Resolve Foundry Data paths through the active Foundry route before applying CSS backgrounds.
- Apply the hero background programmatically after render instead of relying on inline Handlebars CSS URLs.
- Added automatic fallback to the bundled default artwork if a configured background cannot be loaded.
- Corrected hero overlay stacking so the artwork remains visible beneath the Tome shading.

## 0.2.0

- Added adaptive initial window sizing based on each user's current viewport.
- Added client-scoped persistence of Tome window size and position; one player's layout no longer affects another.
- Saved layouts are clamped back on-screen when moving between larger and smaller monitors.
- Added live responsive layout states driven by the actual Tome window dimensions, not by the GM's monitor size.
- Reworked Home into wide, compact, narrow, tiny, and short-window layouts.
- Fixed the landing artwork pipeline by applying the selected background directly to the hero area.
- Improved hero overlays, typography, card spacing, and responsive navigation.
- Improved Group cards and added a GM-only **Manage Group** shortcut on the Group page.
- Added automatic refresh of an open Tome when generic Actor or Journal documents change.
- Added a public `setGroupMember` API helper while keeping Core fully system-agnostic.

## 0.1.1
- Formalized Adventurer's Tome Core as system-agnostic.
- Added a hard architectural boundary: Core does not read `actor.system.*`.
- Moved Group membership toward Tome-owned Actor flags while preserving v0.1.0 world-setting compatibility.
- Added generic Tome character profile infrastructure: title, subtitle, summary, biography, hero image, facts, and relations.
- Updated Group cards and search to use Tome profile presentation data instead of game-system Actor types.
- Added public API helpers for Group and Tome profiles.
- Updated documentation for system-independent development.

## 0.1.0
- First playable Foundry VTT 13.351 prototype.
- Added themed Home dashboard with bundled default artwork.
- Added dynamic Group selection from existing Actors.
- Added Sessions, Quests, World, Rules, Search, and GM Settings.
- Added Journal folder initializer and Foundry document linking.
