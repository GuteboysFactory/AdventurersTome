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
- v1.2 Foundry Source Parity I + Contextual Private Vault is complete.
- v1.3 Foundry Source Parity II / Universal Document Takeover is complete and released as stable `v1.3.0` on the verified Foundry V13.351 baseline.
- Development now moves to v1.4.x.
- Older bugs discovered during v1.4 are fixed inside the active v1.4.x line unless they require a dedicated stable hotfix.
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

# DONE — v1.2 Foundry Source Parity I + Contextual Private Vault

## Goal achieved

Establish reliable Foundry↔Tome identity/live parity for the Journal/Actor surfaces central to Tome, while attaching private GM context to those same stable identities.

### Verified scope

- stable explicit Actor-backed source identity
- canonical Actor/Journal parity on supported fields
- Foundry → Tome live refresh for supported Actor/Journal surfaces
- Tome → Foundry writes for supported canonical fields
- UUID-backed Contextual Private Vault
- supported Foundry sheet access to the same private context
- rename/move/delete/reload hardening
- player privacy boundary preserved
- no conflicting independent canonical copies on supported surfaces
- Foundry V13.351 regression baseline preserved

---

# DONE — v1.3 Foundry Source Parity II / Universal Document Takeover

## Goal achieved

Expand the v1.2 parity architecture into a general system-independent Foundry-document campaign layer.

### Verified architecture

- Universal Document Registry
- supported canonical document types:
  - Actor
  - Item
  - JournalEntry
  - JournalEntryPage
  - Scene
  - Folder
- Actor → embedded Item relations
- JournalEntry → JournalEntryPage relations
- Folder → child document relations
- permission-aware active read layer
- Search + Navigation consumer takeover
- Explorer + Catalog consumer takeover
- create/update/rename/move/delete lifecycle hardening
- imported source identity hardening
- UUID-only identity after permanent linking
- canonical `resolveCanonical()` takeover resolver
- Quick Import convergence
- Folder Quick Import convergence
- Open Source convergence
- Imported Source Identity hardening convergence
- Campaign Entity Links v1 built on canonical Actor identity
- v1.3 Universal Convergence Gate

### Completion gate — VERIFIED

On Foundry V13.351:

- Universal Registry healthy
- relation graph healthy
- permission-aware read healthy
- Search / Navigation attached
- Explorer / Catalog attached
- lifecycle pending = 0
- lifecycle failures = 0
- imported source UUID mismatches = 0
- imported source type mismatches = 0
- duplicate source UUIDs = 0
- takeover consumer coverage = 4/4
- takeover misses = 0
- structuralHealthy = true
- qaComplete = true

**Stable release:** `v1.3.0`  
**Verified QA source build:** `v1.3.0-qa.24`

### Important remaining platform note

Foundry V13.351 is the verified runtime baseline for the completed v1.3 milestone.

The architecture policy remains **v14-first, v13-compatible**, but Foundry V14 runtime verification is still a separate compatibility gate and must not be claimed as completed until it has been tested directly.

---

# CURRENT — v1.4 Tome GM Dock

## Goal

Create a compact GM command surface on top of the now-stable Foundry/Tome source model.

The Dock should reduce navigation friction for common GM workflows without becoming a second campaign-management application.

## Design principles

- contextual first
- compact and always useful
- player-facing Tome remains uncluttered
- no duplication of canonical Foundry/Tome data
- commands operate on the currently active canonical Tome/Foundry context where possible
- system-agnostic Core
- optional future adapter actions may extend the Dock
- no revival of unstable ApplicationV2 minimize/restore behavior

## Planned core scope

- contextual Private Vault access
- active/current Tome entry
- Next Session access
- Quick Capture
- Reveal Queue / Show to Players
- recent GM-relevant entries
- session prep shortcuts
- GM utility shortcuts
- future adapter-powered contextual actions

## v1.4 first implementation target

The first GM Dock QA package should establish:

1. a compact dock surface
2. stable placement and persistence
3. contextual active-entry awareness
4. direct Private Vault access
5. Quick Capture access
6. Reveal Queue access
7. Next Session access
8. safe interaction with existing Tome navigation
9. no duplication of existing data models
10. Foundry V13.351 regression safety

The first package should prioritize the shell, context model and core shortcuts before adding richer adapter-driven actions.

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

**Stable completed architecture milestone:** `v1.3 — Foundry Source Parity II / Universal Document Takeover`  
**Stable baseline:** `v1.3.0`  
**Verified QA source build:** `v1.3.0-qa.24`  
**Verified Foundry baseline:** `V13.351`  
**Active milestone:** `v1.4 — Tome GM Dock`

## v1.3 final status

- Universal Document Registry = VERIFIED
- permission-aware read = VERIFIED
- Search / Navigation takeover = VERIFIED
- Explorer / Catalog takeover = VERIFIED
- lifecycle hardening = VERIFIED
- imported source identity = VERIFIED
- canonical takeover resolver = VERIFIED
- takeover consumer coverage = 4/4
- takeover misses = 0
- Universal Convergence Gate = PASS
- Campaign Entity Links v1 = VERIFIED

## v1.4 NEXT

Build the GM Dock foundation on top of the stable universal document/source model.

Primary objectives:

1. compact persistent Dock shell
2. current-context awareness
3. Private Vault shortcut
4. Quick Capture shortcut
5. Reveal Queue / Show to Players access
6. Next Session shortcut
7. recent/contextual GM navigation
8. preserve existing player-facing Tome presentation
9. no competing canonical data model
10. Foundry V13.351 regression gate

## Platform compatibility note

The project remains **v14-first, v13-compatible** in architecture policy.

Foundry V14 runtime verification is still pending and must be completed separately before V14 compatibility is described as verified.

> **Conquer Foundry first. Extend beyond Foundry second.**
