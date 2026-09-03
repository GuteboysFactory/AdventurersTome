# Adventurer's Tome — Roadmap to v2.0

## Product vision

**Adventurer's Tome is the group's living campaign book.**

For players it should answer, quickly and beautifully:

- What has happened?
- Who do we know?
- Where have we been?
- What are we currently doing?
- What does my character know and remember?

For the GM it should provide deeper campaign memory, preparation and continuity tools without turning the player-facing Tome into a heavy campaign-management application.

Foundry remains the game table. Adventurer's Tome becomes the campaign's memory, chronicle, authoring surface and connective layer.

## Architecture principle

> **Foundry stores. Tome presents. Explorer organizes. Adapters translate. Private Vault protects GM truth. Campaign Brain connects memory.**

Adventurer's Tome follows a **Journal-backed, Tome-rendered** architecture.

- Foundry Documents remain the canonical storage layer wherever they are the natural source of truth.
- Tome owns the campaign-facing presentation and authoring experience.
- Campaign Explorer organizes real Foundry Journal folders rather than maintaining a parallel tree database.
- System-specific behavior belongs behind adapters and compatibility helpers.
- GM-private truth must not be mixed into player-visible campaign content when a private linked store is more appropriate.
- No major feature should create a parallel data model for information already naturally represented by an existing Foundry Document.

## Design guardrails for all 1.x development

1. **Player-first presentation.** The player-facing Tome remains simple, readable and useful during actual play.
2. **Progressive disclosure.** Advanced tools appear only when they are relevant, enabled or GM-only.
3. **One complete module, not many fragmented add-ons.** New capabilities share the same data, search, permissions, navigation and visual language.
4. **Low administration.** The Tome should become more valuable as a campaign grows, not more labor-intensive to maintain.
5. **Lightweight Quests.** Quest support stays clear and useful rather than becoming a complex project-management engine.
6. **System-agnostic Core.** System-specific behavior belongs in adapters/hooks rather than being baked into the core campaign model.
7. **Non-destructive evolution.** Existing campaign data, GM notes, player visibility and imported content must be preserved across upgrades wherever practical.
8. **Foundry V13 + V14 transition support.** V13.351 remains the verified baseline while V14 compatibility is added and hardened. Version-specific behavior should live behind compatibility helpers/adapters instead of being scattered through feature code.
9. **Feature configuration.** Optional campaign layers such as Factions, Secrets/Clues, Timeline and Atlas should be hideable when a table does not use them.
10. **Campaign memory, not GM autopilot.** Future intelligence features surface connections, continuity and forgotten threads; they do not write or run the campaign for the GM.
11. **Existing campaign data is production data.** Migrations, permissions and destructive actions must be treated accordingly.
12. **Stable means stable.** Feature work starts from the latest verified stable baseline and must not casually rewrite proven subsystems.

---

# Completed foundations

## DONE — v0.x foundation

- System-agnostic Foundry VTT 13.351 Core.
- Home dashboard + Home Builder.
- Sessions and Quests with detail views, imports, links and history.
- Group / Actor profiles.
- World profiles with Foundry Journal synchronization.
- Rules library, search, public chat sharing and whispers.
- Foundry-aware visibility/discovery and player permissions.
- Search, Favorites, Recents, backlinks and internal navigation.
- Import 2.0, dry-run preview, history and Undo Last Import.
- Portable, Player-safe and Full GM Archive export modes.
- GM Notes, Next Session Dashboard, Quick Capture, Reveal Queue, Show to Players and Post-Session Assistant.
- Health Check / Safe Repair.
- Private per-GM Workspace Builder, Scratchpad and Custom Notepads.
- Role-aware in-app Manual.
- Glass UI with Normal/25/50/75/90% Scene transparency.
- Movable per-client launcher.
- Stable window rollback: experimental ApplicationV2 minimize/restore retired.

## DONE — v1.0.0 Stable Foundation

- Public stable baseline established.
- Release packaging, manifest and licensing discipline established.
- Existing campaign data treated as production data.
- Experimental minimize/restore remained retired instead of being carried into stable.

## DONE — v1.1.0 Tome Authoring & Journal Takeover

### Goal achieved

Make Tome the place users actually organize and author campaign Journals while Foundry remains the storage backend.

### Shipped scope

- Journal-backed authoring for World, Quests and Sessions.
- Autosave and direct Tome editing for supported Journal text surfaces.
- Journal-backed World summary synchronization.
- Hero image management using Foundry-backed assets.
- Full Journal Page Manager:
  - Text / Image / Video / PDF pages
  - rename
  - reorder
  - duplicate
  - move
  - delete
  - page-level player access
- Tome Page Navigator and primary-page awareness.
- Persistent Campaign Explorer built from real Foundry folder structure.
- Rich Tome catalog retained as presentation layer while Explorer acts as navigation/filter structure.
- Folder drag/drop and Journal drag/drop with controlled structural refresh.
- Folder management directly in Tome:
  - create
  - rename
  - protected roots
  - empty-only delete
- Entry management directly in Tome:
  - create
  - rename
  - move
  - open in Tome
  - open Foundry source
  - guarded permanent delete
- Delegated authoring roles:
  - Section Editor
  - Entry Editor
- Validated GM socket broker for delegated structural writes.
- Tome-managed ownership reconciliation without blindly removing pre-existing manual ownership.
- Player read-only boundary preserved.
- GM Notes/private GM workspace remain outside delegated authoring access.
- Obsolete Explorer/tree prototypes removed and prevented from shipping again.
- Hardened release CI validates manifest runtime files, language JSON, ZIP contents and retired-prototype exclusion.

### Locked architecture outcome

**Explorer organizes. Catalog presents. Foundry stores. Tome is what the user works in.**

---

# CURRENT — v1.1.x Maintenance / Foundry V14 Hardening

This lane may ship patch releases while v1.2 feature work is planned and developed.

### Scope

- Audit Adventurer's Tome against Foundry V14 APIs and ApplicationV2 behavior.
- Add/expand a small compatibility layer for V13/V14 differences.
- Keep V13.351 support during the transition where practical.
- Harden permissions edge cases discovered in real multiplayer use.
- Improve performance for large Journal trees and long-running campaigns.
- Continue safe modularization of large JS/CSS surfaces without changing visible behavior.
- Maintain migration safety and release packaging discipline.
- Build/maintain a V13/V14 regression matrix covering startup, Tome rendering, Journals, Actors, permissions, sockets, imports/exports and GM Workspace persistence.
- Do not gate V14 compatibility behind unrelated feature work.

**Compatibility target:** no v1.x feature is fully promoted until its supported Foundry versions pass the relevant regression gate.

---

# v1.x Feature Roadmap

## NEXT — v1.2 Contextual GM Notes & Private Vault

### Goal

Give the GM private campaign truth attached directly to the things they are working with, without contaminating player-visible Journal data.

### Planned scope

- Private GM notes linked to Tome/Foundry documents by UUID.
- Notes available contextually from NPCs, Locations, Quests, Sessions and other supported campaign entries.
- Separate private storage/vault semantics from player-visible Journal content.
- Fast create/edit/open workflow from the current Tome detail page.
- GM-only backlinks from a vault note to its linked campaign documents.
- Clear handling of missing/deleted source UUIDs.
- Preserve existing per-GM workspace privacy model.
- Define migration path for any future shared-GM vault mode without weakening current privacy.

### Guardrail

GM truth must never become visible merely because a player gains Observer/Owner access to the linked public Journal.

---

## v1.3 Tome GM Dock

### Goal

Provide a compact always-available GM command surface without resizing or destabilizing the main ApplicationV2 Tome window.

### Planned scope

- Separate dock/minibar surface rather than reviving the retired window-minimize implementation.
- Quick Capture.
- Reveal Queue / Show to Players shortcuts.
- Recently opened / active Tome entry access.
- Fast navigation back into the full Tome.
- Optional session-focused shortcuts when a session is active.
- Per-GM/client placement and persistence where appropriate.

### Guardrail

The dock is a separate surface. It must not manipulate the geometry of the main Tome window to simulate minimization.

---

## v1.4 System Adapter Foundation + Quick NPC

### Goal

Create a clean bridge between system-agnostic Tome Core and system-specific actor/NPC context.

### Planned scope

- Formal adapter interface for system-specific actor/NPC data.
- Compatibility helpers isolated from campaign presentation code.
- Quick NPC creation workflow driven through the active system adapter.
- Adapter-provided display fields for NPC summaries where useful.
- Defensive capability detection when a system has no adapter.
- Core fallback remains system-agnostic and functional.
- Realm Guard / Torchbearer may serve as an early reference adapter without becoming a Core dependency.

### Guardrail

Core must never require a specific game system in order to render or function.

---

## v1.5 Session Command Center 2.0

### Goal

Turn the existing GM session tools into a compact live-session command surface built on the now-stable authoring, private-context and adapter foundations.

### Planned scope

- Pre-session summary of the previous session and unresolved threads.
- Prepared NPCs, locations, reveals, private notes and likely active story threads in one place.
- Quick Capture integrated directly into live session flow.
- One-click event markers such as NPC encountered, clue revealed, location visited or important event occurred.
- Existing Reveal Queue and Show to Players integrated rather than duplicated.
- Contextual GM Vault notes available without leaving the session workflow.
- Adapter-aware NPC shortcuts where available.
- Post-session handoff that can create a structured draft for the Session Chronicle.
- Optional and compact: a digital GM screen, not another workspace to administer.

---

## v1.6 Player Chronicle

### Goal

Give each player a personal campaign chronicle without replacing the shared campaign history.

### Planned scope

- Personal Chronicle tied to the current user/character context.
- Personal notes and remembered moments.
- Relevant discovered NPCs, Locations, Sessions and campaign events.
- Bookmarks/favorites that feel like part of the character's own history.
- Clear separation between:
  - shared party knowledge
  - player-private notes
  - GM-only truth
- Fast links back to canonical Session, NPC, Location or World entries.
- Chronicle grows naturally from normal Tome use rather than demanding duplicate data entry.

### Guardrail

This is a character-facing memory layer, not a second quest/task manager.

---

## v1.7 NPC & Faction Intelligence

### Goal

Make people, groups and allegiances understandable across a long-running campaign while keeping player pages clean.

### Planned scope

- Rich NPC pages with first/last appearance and related Sessions/Locations/Quests where known.
- Faction pages with identity, goals, known members and relationships.
- GM-only motives, secrets and internal notes through the private-context layer.
- Player-facing "Known to us" presentation separated from GM truth.
- Relationship/status changes over time without rewriting old session history.
- Search/backlinks across NPCs, Factions, Sessions and Locations.
- Lightweight faction enable/disable configuration for campaigns that do not need it.
- Adapter-aware actor/NPC context where available.

---

## v1.8 Campaign Memory Expansion

### Goal

Expand the stable Tome data graph into richer long-term campaign memory without creating isolated mini-applications.

This may ship as multiple `v1.8.x` feature releases if scope or QA risk warrants it.

### Planned capability groups

#### Living Campaign Timeline

- Chronological campaign event stream.
- Events linked to Sessions, NPCs, Factions, Locations and Quests.
- Important changes such as arrivals, departures, deaths, discoveries, betrayals, alliances and quest outcomes.
- Player-visible timeline filtered by discovered/revealed knowledge.
- GM timeline may include hidden events and future/planned notes.
- Event creation integrated into normal session workflow with minimal extra typing.

#### World Atlas & Location Intelligence

- Hierarchical Locations: world/region -> settlement -> district/site -> point of interest where useful.
- Location pages with related NPCs/Factions/Sessions/Quests and relevant history.
- Optional links between Tome Locations and Foundry Scenes.
- First discovery, last visited and recent events.
- Player Atlas exposes only discovered locations/details.
- Atlas organizes campaign knowledge; it does not replace a dedicated map editor.

#### Secrets, Clues & Rumours

- GM-only Secrets with linked Clues.
- Reveal Clues individually to players/groups.
- Rumours may be true, false, partial or unresolved.
- Separate GM truth from player knowledge.
- Link mystery information to NPCs, Factions, Locations, Sessions and Quests.
- Optional player theory notes through Player Chronicle.

#### Relationship Web & Campaign Connections

- Relationship graph across NPCs, Factions, Locations and major campaign threads.
- Lightweight relationship types/statuses.
- Existing Tome detail pages remain canonical; graph nodes navigate to them.
- Backlinks and relationships can be discovered from existing cross-links.
- GM-only edges may coexist with player-visible relationships.
- Compact "Why is this relevant?" context where useful.

#### Campaign Templates & Feature Profiles

- Enable/disable optional surfaces such as Factions, Timeline, Secrets/Clues, Atlas and advanced GM tools.
- Starter profiles such as Minimal, Classic Campaign, Sandbox and Mystery/Investigation.
- Profiles configure defaults without forcing rigid workflow.
- Export/import reusable Tome configuration independently from campaign secrets/content where practical.
- Existing campaigns remain unchanged unless the GM explicitly adopts a profile/change.

---

## v1.9 Integration API, Hooks & External Adapters

### Goal

Formalize Adventurer's Tome as a campaign platform that other Foundry systems/modules can integrate with without making Core system-specific.

### Planned scope

- Documented hooks/API for campaign events such as:
  - session start/end
  - actor discovered
  - NPC encountered
  - location visited
  - item discovered
  - quest changed
  - major campaign event recorded
- Stable adapter interface based on the practical lessons from v1.4+.
- Additional external/system adapters without Core rewrites.
- Defensive validation and permission checks for third-party event submissions.
- Explicit authorization/scoping before integrations may access private GM data.
- Stable event schema intended to support future Campaign Brain capabilities.

---

# v2.0 — Campaign Brain

## Goal

Turn the accumulated campaign graph into useful memory and continuity assistance while keeping the GM fully in control.

**Campaign Brain is not an autopilot GM.** Its job is to notice, retrieve and connect information the campaign has already created.

### Planned capabilities

- Surface unresolved story threads from prior Sessions.
- Identify NPCs or Factions returning after long absences.
- Show relevant history when opening a Location, NPC, Faction or Session Command Center.
- Detect connections such as multiple active threads sharing the same NPC, place or faction.
- Summarize what the players currently know versus what remains GM-only.
- Highlight forgotten promises, clues, unresolved consequences and relationship changes.
- Provide "Relevant history for tonight" before a session.
- Provide player-safe personal context inside Player Chronicle.
- Keep every surfaced insight traceable back to the underlying Tome/Foundry entries.
- Prefer deterministic/searchable campaign data first.
- Any future generative/AI assistance must remain optional, transparent and user-controlled.

## v2.0 success definition

A short campaign should find Adventurer's Tome pleasant and useful.

A campaign that has run for several years should be able to open the Tome and feel that it genuinely remembers the group's shared history.

---

# Ongoing backlog / cross-cutting work

These items may ship when they fit naturally without disrupting the feature order:

- Animated Home/Hero backgrounds and atmospheric media.
- Continued localization coverage.
- Accessibility and responsive-layout hardening.
- Performance work for very large multi-year campaign archives.
- Import/export schema evolution and migrations for new Chronicle/Atlas/Faction data.
- Optional shared-GM private workspace/vault mode.
- Additional player-facing presentation/recap modes.
- Feedback-driven quality-of-life improvements that do not conflict with roadmap guardrails.
- Continued cleanup/modularization of legacy implementation names after stable replacement paths are proven.

# Release discipline

- Every feature release receives its own QA protocol.
- Build from the latest verified stable baseline.
- Blocking regressions stop promotion until fixed.
- Patch/hotfix releases may be inserted without changing the planned feature order.
- Existing campaign data is production data.
- V13/V14 compatibility is regression-tested throughout the 1.x line rather than postponed until the end.
- Proven stable architecture is not rewritten merely for cleanup aesthetics.
- Material runtime changes after RC require another RC before stable promotion.
