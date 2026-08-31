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

The long-term goal is not to replace Foundry VTT. Foundry remains the game table; Adventurer's Tome becomes the campaign's memory, chronicle and connective layer.

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

---

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

## v1.0.0 — Stable Foundation

Promote the approved RC line without adding new runtime features. Only release-blocking fixes may enter between RC and 1.0; material changes require another RC.

### v1.0.x maintenance lane — Foundry V14 compatibility & core hardening

This lane may ship patch releases alongside feature planning.

- Audit Adventurer's Tome against Foundry V14 APIs and ApplicationV2 behavior.
- Add a small compatibility layer for V13/V14 differences.
- Keep V13.351 support during the transition where practical.
- Start modularizing the large JS/CSS codebase without changing visible behavior.
- Build a V13/V14 regression matrix covering startup, Tome rendering, Journals, Actors, permissions, sockets, imports/exports and GM Workspace persistence.
- Do not gate V14 support behind unrelated feature work.

**Compatibility target:** no v1.x feature should be considered fully promoted until its supported Foundry versions pass the relevant regression gate.

---

# v1.x Feature Roadmap

## v1.1 — Player Chronicle

### Goal
Give each player a personal campaign chronicle without replacing the shared campaign history.

### Planned scope
- Personal Chronicle view tied to the current user/character context.
- Personal notes and remembered moments.
- Relevant discovered NPCs, locations, sessions and campaign events.
- Bookmarks/favorites that feel like part of the character's own history.
- Clear separation between shared party knowledge, player-private notes and GM-only truth.
- Fast links back to the canonical Session, NPC, Location or World entry.
- Chronicle should grow naturally from normal Tome use rather than demanding duplicate data entry.

### Guardrail
This is a character-facing memory layer, not a second quest/task manager.

---

## v1.2 — NPC & Faction Intelligence

### Goal
Make people, groups and allegiances understandable across a long-running campaign while keeping player pages clean.

### Planned scope
- Rich NPC pages with first/last appearance and related Sessions/Locations/Quests where known.
- Faction pages with identity, goals, known members and relationships.
- GM-only motives, secrets and internal notes alongside player-visible information.
- Player-facing "Known to us" presentation separated from GM truth.
- Relationship/status changes over time without rewriting old session history.
- Search/backlinks across NPCs, Factions, Sessions and Locations.
- Lightweight faction enable/disable configuration for campaigns that do not need it.

---

## v1.3 — Session Command Center 2.0

### Goal
Turn the existing GM session tools into a compact live-session command surface.

### Planned scope
- Pre-session summary of the previous session and unresolved threads.
- Prepared NPCs, locations, reveals, notes and likely active story threads in one place.
- Quick Capture integrated directly into the live session flow.
- One-click event markers such as NPC encountered, clue revealed, location visited or important event occurred.
- Existing Reveal Queue and Show to Players integrated rather than duplicated.
- Post-session handoff that can generate a structured draft for the Session Chronicle.
- Keep the Command Center optional and compact; it should behave like a digital GM screen, not another workspace to administer.

---

## v1.4 — Living Campaign Timeline

### Goal
Allow a multi-year campaign to be understood as a sequence of meaningful events rather than only a stack of session logs.

### Planned scope
- Chronological campaign event stream.
- Events linked to Sessions, NPCs, Factions, Locations and Quests.
- Important changes such as arrivals, departures, deaths, discoveries, betrayals, alliances and quest outcomes.
- Player-visible timeline filtered by discovered/revealed knowledge.
- GM timeline can include hidden events and future/planned notes where appropriate.
- Timeline entries should be creatable from normal session work with minimal extra typing.

---

## v1.5 — World Atlas & Location Intelligence

### Goal
Make the campaign world navigable as a living atlas connected to Foundry Scenes and campaign history.

### Planned scope
- Hierarchical Locations: world/region -> settlement -> district/site -> point of interest where useful.
- Location pages with description, discovered information, related NPCs/Factions/Sessions/Quests and notes.
- Optional links between Tome Locations and Foundry Scenes.
- "Last visited", first discovery and relevant recent events.
- Location-aware suggestions in GM tools: relevant NPCs, unresolved threads, clues and prior events.
- Player Atlas only exposes locations and details the party has discovered.
- Search, Favorites, Recents and cross-links remain consistent with the rest of Tome.

### Guardrail
The Atlas organizes campaign knowledge; it is not intended to replace a dedicated map editor.

---

## v1.6 — Secrets, Clues & Rumours

### Goal
Track what is true, what has been discovered and what the players merely suspect without forcing the GM to maintain a separate mystery module.

### Planned scope
- GM-only Secrets with linked Clues.
- Reveal individual Clues to players/groups when discovered.
- Rumours may be true, false, partial or unresolved.
- Separate GM truth from player knowledge.
- Link Secrets/Clues/Rumours to NPCs, Factions, Locations, Sessions and Quests.
- Compact progress view for mysteries without treating them as linear quest trees.
- Optional player theory notes in the Player Chronicle.

---

## v1.7 — Relationship Web & Campaign Connections

### Goal
Expose the connections already present in campaign data so long-running stories remain understandable.

### Planned scope
- Relationship graph across NPCs, Factions, Locations and major campaign threads.
- Relationship types/statuses remain lightweight and table-editable.
- Clicking a node opens the normal Tome detail page rather than creating a parallel interface.
- Backlinks and automatically discovered relationships from existing cross-links.
- GM-only edges can coexist with player-visible relationships.
- Compact "Why is this relevant?" context on detail pages.

### Guardrail
The graph is a navigation and memory tool, not a mandatory data-entry system.

---

## v1.8 — Campaign Templates & Feature Profiles

### Goal
Let different tables use the same Adventurer's Tome without exposing every feature in every campaign.

### Planned scope
- Campaign feature configuration page.
- Enable/disable optional surfaces such as Factions, Timeline, Secrets/Clues, Atlas and advanced GM tools.
- Starter profiles such as Minimal, Classic Campaign, Sandbox and Mystery/Investigation.
- Templates configure Tome structure and defaults without locking the campaign into a rigid workflow.
- Export/import reusable Tome configuration independently from campaign secrets/content where practical.
- Existing campaigns remain unchanged unless the GM explicitly adopts a profile/change.

---

## v1.9 — Integration API, Hooks & Adapters

### Goal
Make Adventurer's Tome a campaign platform that other Foundry systems/modules can integrate with without making Core system-specific.

### Planned scope
- Documented hooks/API for campaign events such as session start/end, actor discovered, NPC encountered, location visited, item discovered, quest changed and major campaign event recorded.
- Adapter interface for system-specific context.
- Realm Guard / Torchbearer can become an early reference adapter without becoming a Core dependency.
- Defensive validation and permission checks for third-party event submissions.
- No private GM data is exposed to integrations without explicit authorization/scope.
- Stable event schema designed so future adapters do not require Core rewrites.

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
- Keep every surfaced insight traceable back to the underlying Tome entries.
- Prefer deterministic/searchable campaign data first; any future generative/AI assistance must remain optional, transparent and user-controlled.

## v2.0 success definition

A short campaign should find Adventurer's Tome pleasant and useful.

A campaign that has run for several years should be able to open the Tome and feel that it genuinely remembers the group's shared history.

---

# Ongoing backlog / cross-cutting work

These items may ship when they fit naturally without disrupting the feature order:

- Revisit minimize as a separate Tome dock/minibar rather than ApplicationV2 geometry manipulation.
- Animated Home/Hero backgrounds and atmospheric media.
- Continued localization coverage.
- Accessibility and responsive-layout hardening.
- Performance work for very large multi-year campaign archives.
- Import/export schema evolution and migrations for new Chronicle/Atlas/Faction data.
- Optional shared-GM private workspace/vault mode.
- Additional player-facing presentation/recap modes.
- Feedback-driven quality-of-life improvements that do not conflict with the roadmap guardrails.

# Release discipline

- Every feature release receives its own QA protocol.
- Build from the latest verified stable baseline.
- Blocking regressions stop promotion until fixed.
- Patch/hotfix releases may be inserted without changing the planned feature order.
- Existing campaign data must be treated as production data after v1.0.
- V13/V14 compatibility is regression-tested throughout the 1.x line rather than postponed until the end.
