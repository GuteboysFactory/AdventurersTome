# Adventurer's Tome — Roadmap to v2.0

## Product vision

**Adventurer's Tome is the group's living campaign book and the system-agnostic campaign interface above Foundry's real documents.**

For players it should answer, quickly and beautifully:

- What has happened?
- Who do we know?
- Where have we been?
- What are we currently doing?
- What does my character know and remember?

For the GM it should provide deeper campaign memory, preparation and continuity tools without turning the player-facing Tome into a heavy campaign-management application.

Foundry remains the game table and canonical storage layer where it naturally owns the data. Adventurer's Tome becomes the campaign-facing presentation, authoring and connective layer.

Strategic ordering rule:

> **Conquer Foundry first. Extend beyond Foundry second.**

---

# Architecture principle — LOCKED

Previous wording, **Journal-backed, Tome-rendered**, was correct for v1.1 but is now too narrow.

The canonical architecture is:

> **Foundry Document-backed, Tome-rendered.**

And the canonical data rule is:

> **If Foundry knows it, Tome uses it. If Tome adds it, Tome extends it.**

## Foundry-owned data

When information already has a natural canonical representation in Foundry, Tome works against the real Foundry Document rather than maintaining an independent authoritative copy.

Examples include:

- document UUID/identity
- Actor name and image
- Journal title, pages and content
- Item name/image/content
- Scene identity/reference
- Folder placement
- ownership/permissions
- generic document lifecycle and metadata

Tome may cache or derive presentation state, but canonical values remain Foundry-owned.

## Tome extension data

Tome may own information Foundry does not naturally model or cannot represent cleanly, including:

- Tome-specific presentation metadata
- campaign-memory metadata
- richer contextual relationships
- GM workflow state
- Private Vault data
- future Player Chronicle data
- future Campaign Brain metadata

When a real Foundry source exists, Tome extension data should attach to its stable UUID/document identity.

## System-specific data

Tome Core remains system-agnostic. System-specific Actor/Item schemas belong behind optional adapters.

```text
Foundry Document
      ↓
Generic Tome Core
      ↓
Optional System Adapter
      ↓
System-specific enrichment/actions
```

Tome must remain fully usable without any adapter.

---

# Foundry Source Parity rules — LOCKED

1. **One canonical identity.** Linked content uses stable Foundry UUID/document identity.
2. **No name-based identity after linking.** Name matching is only a migration/import fallback before a permanent link exists.
3. **Two-way canonical editing.** If Tome exposes a Foundry-owned field for editing, Tome writes to the real Foundry Document.
4. **Live refresh.** Foundry-side document updates refresh relevant open Tome views.
5. **No sync ping-pong.** Hooks and writes require loop/reentrancy protection.
6. **Rename-safe.** Rename must not break Tome links, private context or relationships.
7. **Move-safe.** Folder moves must not break identity or Tome extension data.
8. **Delete-aware.** Deleted source documents must be handled explicitly.
9. **Reload-safe.** Persisted UUID relationships must reconstruct correctly after reload.
10. **Multi-client-safe.** Tome should converge on Foundry's canonical state across connected clients.
11. **Foundry-aware permissions.** Tome must not expose canonical content Foundry permissions deny.
12. **Private data stays separate.** Public source permissions never imply access to GM Private Vault data.

Target model:

```text
Foundry Document
      ⇅
Tome presentation/editor
      +
Tome extension layer by UUID
```

Actor-backed NPC target:

```text
Actor Sheet ⇄ Actor Document ⇄ Tome NPC/Profile
                              ⇅
                      Tome extension data
                              ⇅
                         Private Vault
```

---

# Design guardrails for all 1.x development

1. Player-first presentation.
2. Progressive disclosure.
3. One complete module rather than fragmented add-ons.
4. Low administration.
5. Lightweight Quests.
6. System-agnostic Core.
7. Non-destructive evolution of existing campaign data.
8. Foundry V13.351 remains the verified baseline while V14 support is hardened.
9. Optional campaign layers remain configurable.
10. Campaign memory, not GM autopilot.
11. Existing campaign data is production data.
12. Stable means stable: do not rewrite proven subsystems merely for cleanup aesthetics.
13. No major feature may create a competing canonical model for information already naturally represented by Foundry.

Explorer principle remains:

> **Explorer organizes. Catalog presents. Foundry stores. Tome is what the user actually works in.**

---

# Completed foundations

## DONE — v0.x foundation

- System-agnostic Foundry VTT Core.
- Home dashboard + Home Builder.
- Sessions and Quests.
- Group / Actor profiles.
- World profiles.
- Rules library.
- Foundry-aware visibility/discovery and permissions.
- Search, Favorites, Recents, backlinks and navigation.
- Import 2.0 and exports.
- GM Notes and session tools.
- Private per-GM Workspace Builder.
- Role-aware in-app Manual.
- Glass UI and movable launcher.

## DONE — v1.0.0 Stable Foundation

- Public stable baseline established.
- Release packaging, manifest and licensing discipline established.
- Existing campaign data treated as production data.

## DONE — v1.1 Tome Authoring & Journal Takeover

### Goal achieved

Make Tome the place users actually organize and author campaign Journals while Foundry remains the storage backend.

### Shipped scope

- Journal-backed authoring for World, Quests and Sessions.
- Autosave and direct Tome editing for supported Journal surfaces.
- Journal Page management and Tome Page Navigator.
- Campaign Explorer backed by real Foundry folder structure.
- Folder and Journal create/rename/move/delete workflows.
- Section Editor and Entry Editor roles.
- Validated GM socket broker for delegated writes.
- Player read-only boundary preserved.
- GM-private workspace separation preserved.
- Foundry → Tome Quick Import for Actors, Items, Scenes and folders.
- Generic import enrichment and source UUID retention.
- early optional adapter groundwork.
- Adaptive Window and Group presentation hardening.
- Foundry V13 drag/drop hardening.

**v1.1.15 is the locked stable baseline for the completed v1.1 phase.**

---

# Version discipline — LOCKED

- v1.1.15 is the final v1.1 release line.
- Development is on v1.2.x.
- Older bugs discovered during v1.2 are fixed inside v1.2.x, not by reopening v1.1.
- Remain on each roadmap version until that complete milestone is QA-approved.
- Architecture defects blocking the active milestone belong inside the active milestone.
- Patch/QA increments may contain current-milestone work, regressions, compatibility fixes and hardening.

---

# Revised roadmap sequence

```text
v1.0  Stable Foundation
  ↓
v1.1  Tome Authoring & Journal Takeover
  ↓
v1.2  Foundry Source Parity I + Contextual Private Vault
  ↓
v1.3  Foundry Source Parity II / Universal Document Takeover
  ↓
v1.4  Tome GM Dock
  ↓
v1.5  Formal Adapter API
  ↓
v1.6  Quick NPC & System-aware Creation
  ↓
v1.7  SCC 2.0 / Campaign Graph & Memory Expansion
  ↓
v1.8  Player Chronicle
  ↓
v1.9  Integration API / External Adapters
  ↓
v2.0  Campaign Brain
```

---

# CURRENT — v1.2 Foundry Source Parity I + Contextual Private Vault

**Stable baseline:** v1.1.15  
**Current QA build:** v1.2.0-qa.1

## Goal

Establish reliable Foundry↔Tome identity/live parity for the Journal/Actor surfaces already central to Tome, while attaching private GM context to those same stable identities.

## v1.2.0-qa.1 — Contextual Private Vault Foundation

Implemented:

- UUID-backed v2 Private Vault storage.
- GM-only contextual notes.
- legacy private-vault migration path.
- contextual access from supported Tome pages.
- regression-safe mirroring to the legacy private note store during QA.

Initial live QA indicates the Private Vault direction is sound, but exposed a pre-existing architectural gap:

- Actor-backed Tome NPCs are not fully live-synced with their Foundry Actor.
- Foundry Actor rename does not reliably update the Tome representation.
- Tome-side rename does not reliably update the linked Actor.

Therefore v1.2.0-qa.1 is **not a milestone completion build**.

## NEXT — v1.2.0-qa.2 Foundry Identity & Live Sync Foundation

Required scope:

### Actor-backed identity/parity

- Persist explicit Actor UUID/reference.
- Stop ongoing name matching once a permanent Actor link exists.
- Actor rename → Tome refresh/update.
- Tome canonical-name edit → real Actor update.
- linked helper Journal representation remains consistent where required for Explorer/search.
- Actor image → Tome image when no deliberate Tome presentation override exists.
- Tome canonical-image edit writes to Actor when editing the Foundry-owned image field.

### Live Foundry hooks

- Actor updates refresh relevant open Tome views.
- JournalEntry/JournalEntryPage updates refresh relevant Tome views.
- relevant create/delete lifecycle hooks handled safely.
- loop/reentrancy protection.
- no repeated render loops.

### Private Vault UX

- compact GM-only lock icon in Tome context/top actions.
- hover provides tooltip/summary only.
- click opens the editable private panel/popover.
- same UUID-backed Private Vault record accessible from supported Foundry sheets.
- existing permanent GM NOTES sheet area may be retired when its data is migrated into the shared Vault.
- existing GM NOTES content must be migrated, never discarded.
- Sheet ⇄ Private Vault ⇄ Tome reads/writes one record.

### Privacy

- ordinary players see no lock control.
- player DOM/UI does not receive private note content.
- Observer/Owner access to the public source does not expose GM-private context.

## v1.2.x QA/hardening after qa.2

As required:

- rename/move/delete lifecycle hardening.
- stale/missing UUID handling.
- legacy↔v2 vault consistency until legacy paths are retired.
- Journal/Actor title/image parity edge cases.
- permissions and delegated-editor regression.
- reload and multi-client behavior.
- open-view refresh without disruptive navigation reset.
- Foundry V13.351 regression gate.

## v1.2 completion gate

v1.2 is complete only when:

- supported Actor-backed Tome content uses stable explicit identity.
- canonical Actor/Journal fields exposed by Tome no longer behave as conflicting independent copies.
- Foundry edits propagate to Tome.
- Tome canonical edits propagate to the correct Foundry source.
- UUID-linked private context survives rename and folder moves.
- Private Vault is available contextually in Tome and on supported Foundry sheets.
- player privacy is explicitly verified.
- no render/update loops occur.
- major v1.1 workflows remain intact.

---

# v1.3 — Foundry Source Parity II / Universal Document Takeover

## Goal

Expand the v1.2 parity architecture into a general system-independent Foundry-document campaign layer.

Planned audit/scope:

- Actors
- JournalEntries
- JournalEntryPages
- Items
- Scenes/references
- Folders
- ownership/permissions
- UUID/document links
- imported source identity
- create/update/rename/move/delete lifecycle

Goals:

- information Foundry already owns should be available to Tome where useful.
- Tome should not create independent canonical duplicates.
- imported documents retain permanent source identity.
- Explorer, Search and Catalog resolve the same underlying document truth.
- generic parity does not require a system adapter.

### Completion gate

A representative campaign can use Tome as its primary campaign-facing interface without routinely opening generic Foundry document UIs merely to keep Tome synchronized.

---

# v1.4 — Tome GM Dock

## Goal

Create a compact GM command surface on top of the now-stable Foundry/Tome source model.

Candidate scope:

- contextual Private Vault access
- Next Session
- Quick Capture
- Reveal Queue / Show to Players
- recently opened / active Tome entry
- GM shortcuts
- session prep access
- future adapter-powered actions

The dock remains a separate surface and does not revive unstable ApplicationV2 minimize/restore behavior.

---

# v1.5 — Formal Adapter API

## Goal

Formalize optional system-specific enrichment after generic Foundry parity is stable.

Adapters may provide:

- system-specific Actor extraction/mapping
- Item mapping
- display-field mapping
- NPC creation schemas
- system-specific actions
- rules/source enrichment
- presentation hints

Core remains functional with no adapter or when an adapter cannot enrich a document.

Genesys and Realm Guard / Torchbearer may serve as reference adapters without becoming Core dependencies.

---

# v1.6 — Quick NPC & System-aware Creation

## Goal

Create system-native NPCs from Tome through adapters rather than hard-coded Core behavior.

```text
Tome Quick NPC
      ↓
Adapter
      ↓
System-specific Actor data
      ↓
Foundry Actor
      ↓
Tome live presentation
```

---

# v1.7 — SCC 2.0 / Campaign Graph & Memory Expansion

## Goal

Build richer campaign-memory structure after Foundry parity and adapter boundaries are stable.

Potential capability groups:

- stronger entity relationships
- NPC and Faction intelligence
- contextual backlinks
- campaign timeline/events
- location/atlas intelligence
- secrets, clues and rumours
- relationship web
- smarter navigation across NPCs, Locations, Quests, Sessions, Items and Factions

Guardrail: derive and connect existing campaign truth before asking the GM to maintain duplicate structures.

---

# v1.8 — Player Chronicle

## Goal

Give each player a personal campaign chronicle without replacing shared campaign history.

Planned direction:

- personal notes and remembered moments
- discovered NPC/Location/Session/Event context
- personal bookmarks/favorites
- clean separation of shared party knowledge, player-private notes and GM-only truth
- links back to canonical Tome/Foundry sources

---

# v1.9 — Integration API / External Adapters

## Goal

Formalize Adventurer's Tome as a campaign platform other Foundry systems/modules can integrate with safely.

Planned direction:

- documented hooks and event schemas
- stable external adapter interface
- permission-safe third-party submissions
- explicit authorization around private GM data
- foundations for future Campaign Brain capabilities

---

# v2.0 — Campaign Brain

## Goal

Turn accumulated campaign truth and graph relationships into useful memory and continuity assistance while keeping the GM fully in control.

Campaign Brain is not an autopilot GM. It retrieves, connects and surfaces information the campaign has already created.

Potential capabilities:

- unresolved story threads
- returning NPC/Faction history
- relevant history for current Locations/Quests/Sessions
- player-known vs GM-only knowledge summaries
- forgotten promises, clues and consequences
- relationship changes
- pre-session relevant-history briefing
- traceability back to canonical Foundry/Tome sources

---

# QA / stability principles

Every active development series preserves regression coverage for the latest stable baseline.

Critical areas include:

- Tome startup/rendering
- World / Quests / Sessions
- Group / Actor profiles
- Campaign Explorer and folder persistence
- drag/drop and Quick Import
- Tome authoring/autosave
- Journal Pages
- Section Editor / Entry Editor
- player read-only boundary
- GM-private isolation
- Adaptive Window
- canonical source parity for supported fields
- rename/move/delete lifecycle
- reload and multi-client consistency
- no render/update loops
- no recurring console errors
- Foundry V13.351 compatibility

A milestone is not complete merely because its headline feature works.

---

# Current handoff snapshot

**Stable baseline:** `v1.1.15`  
**Current development build:** `v1.2.0-qa.1`  
**Active milestone:** `v1.2.x — Foundry Source Parity I + Contextual Private Vault`

Current finding:

- Private Vault foundation is functioning in initial live QA.
- UUID-backed private-context direction is approved.
- Actor-backed World/Tome live identity parity is missing and is now a blocking architecture item.

**NEXT:** `v1.2.0-qa.2 — Foundry Identity & Live Sync Foundation`

Primary objectives:

1. persistent Actor UUID linkage
2. Actor ⇄ Tome canonical name sync
3. Actor ⇄ Tome canonical image sync where no Tome presentation override applies
4. Foundry update hooks → live Tome refresh
5. Tome canonical edits → real Foundry source updates
6. loop/reentrancy protection
7. compact GM-only lock UX in Tome
8. Private Vault access from supported Foundry sheets
9. existing GM NOTES migration into the same UUID-backed vault
10. explicit player-privacy regression test

> **Conquer Foundry first. Extend beyond Foundry second.**
