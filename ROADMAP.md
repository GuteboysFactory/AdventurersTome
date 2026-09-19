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
- v1.4 Tome GM Dock is complete and released as stable `v1.4.0`.
- Development now moves to v1.5.x.
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

# DONE — v1.4 Tome GM Dock

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

## v1.4.0-qa.1 — GM Dock Foundation

**Status:** QA / LIVE TEST REQUIRED

Implemented foundation:

1. compact GM-only persistent Dock shell
2. draggable per-user placement with reset and reload persistence
3. deterministic current-context resolution with UUID-backed pin/unpin
4. contextual Private Vault shortcut using the existing UUID-backed vault
5. Dock Quick Capture using the existing Tome/private-note and Quick Capture Inbox workflows
6. Reveal Queue shortcut and live queue badge
7. Next Session / GM Dashboard shortcut and session badge
8. recent/contextual GM navigation using the existing per-user Tome recent list
9. safe Tome navigation through the existing canonical Tome reference resolver
10. internal Dock action registry prepared for future adapter-powered actions without defining the public v1.5 Adapter API
11. no ApplicationV2 minimize/restore behavior; the Dock is its own lightweight Foundry UI surface
12. Foundry V13.351 remains the QA runtime target

QA protocol: `docs/V1.4_QA1_GM_DOCK_FOUNDATION.md`

The v1.4 foundation remains non-promoted until live QA confirms placement, context behavior, privacy, reload/multi-client safety and v1.3 regression.

## v1.4.0-qa.2 — Unified GM Dock Host

**Status:** QA / LIVE TEST REQUIRED

The qa.1 live observation showed that two independent GM Docks are technically functional but product-level duplication. qa.2 establishes a host/provider model instead:

- a compatible GuteboysFactory system may expose one neutral GM Dock Host
- Tome registers a campaign-workspace provider/menu into that host
- Realm Guard / Torchbearer is the first reference Host implementation
- when a compatible Host exists, Tome suppresses its own standalone Dock
- when no Host exists, Tome keeps its own Dock as the fallback
- Tome actions continue to operate on Tome-owned/canonical campaign workflows
- the Host receives callbacks and presentation metadata, not copied Tome campaign data
- the contract is capability-based rather than hard-coded to Realm Guard
- future system actions may later flow in the opposite direction, with Tome becoming the primary campaign workspace while systems retain rule authority

**Product direction locked:** Foundry is the game table; Adventurer's Tome is the campaign workspace. Campaign preparation, memory, documentation, discovery and reveal workflows should increasingly converge in Tome, while rules engines continue to own system mechanics.

QA protocol: `docs/V1.4_QA2_UNIFIED_GM_DOCK_HOST.md`

## v1.4.0-qa.5 — Unified Dock UX & Universal Context

**Status:** QA / LIVE TEST REQUIRED

Following successful host/API composition QA, the unified Dock is tightened around the actual GM workflow:

- compatible Host v2 menus can render a provider-owned inline body and dedicated footer action
- Tome uses that body for compact Quick Capture directly from the Dock
- Open Adventurer's Tome becomes a persistent footer action rather than a long-menu item
- Recent navigation is capped at three direct entries with a compact continuation action
- contextual Private Vault no longer requires a Tome ref; any supported canonical Foundry document with a stable UUID can carry GM-private context
- Scene and Item contexts therefore become first-class GM context targets
- standalone Tome Dock retains equivalent canonical-context capture/Vault behavior
- all campaign data remains Tome-owned; the host only renders provider-supplied UI and invokes callbacks

QA protocol: `docs/V1.4_QA5_UNIFIED_DOCK_UX.md`

## v1.4.0-qa.7 — Dock Hardening & Multi-Client

**Status:** QA / LIVE TEST REQUIRED

This package hardens the Dock lifecycle without tying Tome to a specific game system or a specific version of any reference host.

Locked integration policy:

- Adventurer's Tome is tested first as a standalone, system-independent module
- external GM Dock integration is capability-driven through `gbf-gm-dock-host`
- Host v1 remains supported for standard provider menus
- Host v2+ enables richer inline provider body/footer UX
- Realm Guard / Torchbearer and future systems are optional reference integrations only; their release numbers are never Tome runtime dependencies
- stale/deleted pinned UUIDs recover automatically
- hosted Quick Capture preserves explicit capture target/draft across unrelated host refreshes
- system id is exposed only for diagnostics and never used to branch Tome Core behavior

QA protocol: `docs/V1.4_QA7_DOCK_HARDENING_MULTICLIENT.md`

## v1.4.0-qa.8 — Release Hardening / RC Gate

**Status:** PASS

No new campaign feature scope is introduced. qa.8 closes the v1.4 GM Dock line with a deterministic runtime release gate and final regression protocol.

Release-gate coverage:

- standalone/system-independent Dock health
- generic Host v1 and Host v2+ capability compatibility
- stable provider re-registration across host lifecycle replacement
- public API composition
- contextual Private Vault / Quick Capture / Reveal Queue / Next Session availability
- stale context/capture target integrity
- v1.3 Universal Convergence Gate preservation
- Foundry runtime identity/compatibility diagnostics
- multi-client privacy and reload/lifecycle smoke
- console-clean release criterion

Promotion target after PASS: `v1.4.0-rc.1`.

QA protocol: `docs/V1.4_QA8_RELEASE_HARDENING_RC_GATE.md`

## v1.4.0-qa.9 — RC Gate Semantics Hotfix

**Status:** PASS

Clarifies the v1.4 release gate after live QA confirmed that the old v1.3 `qaComplete` field is session-local runtime evidence rather than a structural release requirement.

- v1.4 RC requires convergence `healthy === true`
- v1.4 RC requires `structuralHealthy === true`
- v1.4 RC requires takeover `misses === 0`
- v1.3 `qaComplete` is reported as `runtimeEvidenceComplete`
- `runtimeEvidenceRequiredForRelease` is explicitly `false`
- no campaign feature, data model, host contract or canonical-source behavior changes

QA protocol: `docs/V1.4_QA9_RC_GATE_SEMANTICS.md`

## v1.4.0-rc.1 — Tome GM Dock Release Candidate

**Status:** PASS

The v1.4 GM Dock feature scope is complete and QA-approved.

RC scope is intentionally limited to:

- installation/update verification
- runtime release-gate verification
- standalone/system-independent smoke
- optional generic host integration smoke
- lifecycle/reload regression
- GM privacy and multi-client regression
- console-clean verification
- final core Tome smoke

No new feature scope is accepted during rc.1.

**System-independence remains locked:** reference systems may be used as live integration examples, but no reference-system release number is a Tome dependency.

RC gate: `docs/V1.4_RC1_RELEASE_CANDIDATE.md`

## v1.4.0 — Stable

**Status:** ⭐ STABLE / VERIFIED

The Tome GM Dock milestone is complete.

Stable scope includes:

- standalone system-independent GM Dock
- optional generic `gbf-gm-dock-host` integration
- canonical current-context and UUID pinning
- contextual Private Vault and Quick Capture
- Reveal Queue / Next Session / recent navigation
- universal Scene/Item/Actor/Journal context support
- stale-context recovery
- host lifecycle hardening
- privacy, reload and multi-client hardening
- deterministic runtime release gate
- preserved v1.3 Universal Document convergence

**Stable release:** `v1.4.0`  
**Verified Foundry baseline:** `V13.351`

GM workspace cosmetic redesign and additional GM feature proposals are deferred for later design review and do not alter this stable milestone.

Release record: `docs/V1.4_STABLE_RELEASE.md`

---

# CURRENT — v1.5 Formal Adapter API

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

## v1.5.0-qa.1 — Formal Adapter API Foundation

**Status:** QA / LIVE TEST REQUIRED

This package promotes the old internal enrichment bridge into a formal, public, system-agnostic Adapter API.

Locked v1 contract:

- public access through `game.modules.get("adventurers-tome").api.adapters`
- contract id `adventurers-tome-adapter-api`
- Adapter API version `1`
- explicit registration/unregistration lifecycle
- deterministic priority ordering
- optional system/document/source-type affinity
- capability discovery via `supports()` / `matching()`
- safe capability execution through `execute()`
- existing enrichment preserved through `enrich()`
- adapter failures are contained and audited rather than breaking Tome Core
- legacy global adapter bridge remains temporarily for backward compatibility
- new integrations should use the module API
- no specific system package or version is a Core dependency

Initial declared capabilities:

- `enrich`
- `actorMapping`
- `itemMapping`
- `displayFields`
- `npcSchema`
- `actions`
- `rules`
- `presentation`

Genesys Talent enrichment is retained as an optional reference adapter registered through the formal contract rather than embedded as Core logic.

QA protocol: `docs/V1.5_QA1_FORMAL_ADAPTER_API.md`

## v1.5.0-qa.2 — Adapter Capabilities & Action Bridge

**Status:** QA / LIVE TEST REQUIRED

qa.2 turns the formal registry into a usable capability bridge while preserving system independence.

New public convenience surfaces:

- `displayFields(source)`
- `mapActor(source)`
- `mapItem(source)`
- `actions(source)`
- `invokeAction(actionKey)`

Locked principles:

- adapter result shapes are normalized before Tome consumes them
- public action discovery exposes safe descriptors, never executable closures
- execution routes through a namespaced `adapterId:actionId` key
- adapter action exceptions are contained and audited
- GM-only actions stay GM-only
- action availability is re-evaluated against the current canonical source
- standalone Tome Dock can present adapter actions
- compatible hosted-provider menus can present the same adapter actions under **System actions**
- adapter unregister/context changes remove stale Dock actions
- Tome Core still never branches on a specific reference-system id for action presentation

QA protocol: `docs/V1.5_QA2_ADAPTER_CAPABILITIES_ACTION_BRIDGE.md`

## Ecosystem discovery / optional Tome handoff

Other GuteboysFactory systems/modules may expose an optional Tome-aware action.

- If Adventurer's Tome is active, the action hands the current UUID/context to Tome.
- If Tome is not installed/active, the same user-invoked action may open a tasteful GM-only **Discover Adventurer's Tome** panel with install/learn-more links.
- No startup advertising or repeated unsolicited popup.
- Player clients do not receive install/promotional prompts.
- The fallback presentation should be implemented through a shared integration helper so Realm Guard, Genesys VTT and future GBF projects do not each invent incompatible Tome detection.
- This discovery/fallback contract belongs with the formal integration/adapter work and is deliberately not part of v1.4 GM Dock Core.

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

System-independence rule: **Reference-system versions must never become Tome runtime dependencies.** Reference integrations are used only to exercise generic capabilities; Tome Core must retain full standalone behavior.

---

# Current handoff snapshot

**Stable completed architecture milestone:** `v1.4 — Tome GM Dock`  
**Stable baseline:** `v1.4.0`  
**Verified QA/RC source:** `v1.4.0-rc.1`  
**Verified Foundry baseline:** `V13.351`  
**Active milestone:** `v1.5 — Formal Adapter API`  
**Current QA build:** `v1.5.0-qa.2`  
**v1.4 feature state:** STABLE

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

## v1.4 FINAL STATUS

The GM Dock milestone is released as stable `v1.4.0`.

- RC gate = PASS
- runtime release gate = PASS
- standalone operation = PASS
- optional hosted-provider operation = PASS
- privacy / multi-client = PASS
- reload / lifecycle = PASS
- v1.3 convergence preserved
- console-clean smoke = PASS

Development may now proceed to v1.5 Formal Adapter API.

## Platform compatibility note

The project remains **v14-first, v13-compatible** in architecture policy.

Foundry V14 runtime verification is still pending and must be completed separately before V14 compatibility is described as verified.

> **Conquer Foundry first. Extend beyond Foundry second.**
