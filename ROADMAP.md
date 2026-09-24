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
v1.6  Universal Semantic Layer Foundation & System-aware Creation
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

# DONE — v1.5 Formal Adapter API

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

## v1.5.0-qa.3 — Adapter Startup Hotfix

**Status:** QA / FOCUSED HOTFIX

Live qa.2 startup exposed an initialization-order defect in the optional Genesys reference adapter: it could query `game.modules` before Foundry had created the module collection.

qa.3 makes registry discovery lifecycle-safe:

- early ESModule registration prefers the already-created global Adapter API bridge
- formal module API lookup is guarded behind `globalThis.game?.modules?.get`
- missing early registry state returns safely and keeps the existing ready retry
- no Adapter API contract or capability behavior changes
- no reference system becomes a Core dependency

QA protocol: `docs/V1.5_QA3_ADAPTER_STARTUP_HOTFIX.md`

## v1.5.0 — Stable

**Status:** ⭐ STABLE / VERIFIED

The Formal Adapter API milestone is complete.

Stable scope includes:

- versioned public Adapter API v1
- safe registration/unregistration and duplicate protection
- capability matching, priority ordering and failure containment
- normalized display-field / Actor / Item helper surfaces
- safe namespaced adapter action discovery and invocation
- standalone and hosted GM Dock action presentation
- GM-only, disabled and unknown action protection
- startup lifecycle hardening for optional reference adapters
- preserved v1.4 GM Dock release gate
- preserved v1.3 Universal Document convergence and takeover misses = 0

**Stable release:** `v1.5.0`  
**Verified Foundry baseline:** `V13.351`

Release record: `docs/V1.5_STABLE_RELEASE.md`

---

## Universal Semantic Layer — Architecture locked

The long-term information architecture for cross-system data discovery, normalization, write-back and creation is now documented separately:

`docs/UNIVERSAL_SEMANTIC_LAYER_ARCHITECTURE.md`

This design extends the v1.3 Universal Document Registry and v1.5 Formal Adapter API into a future shared semantic layer for Actors, NPCs, Items, Journals, Scenes, compendiums and Tome extension data.

Locked principles include:

- targeted semantic discovery rather than uncontrolled schema crawling
- canonical concepts such as identity, relationships, skills, talents, inventory, conditions, resources and biography
- adapter-first resolution with safe generic fallback
- provenance, authority and visibility on every resolved fact
- Foundry → Tome read, Tome → Foundry write-back and adapter-driven Foundry creation
- existing World document → compendium reference/import → create new as the preferred anti-duplication order
- permission/visibility filtering before player-facing semantic results
- GM Notes, Private Vault data and unrevealed information must never leak through Search, Graph, Chronicle, backlinks or Campaign Brain
- future Quick NPC, Campaign Graph, Player Chronicle and Campaign Brain should consume this shared layer rather than invent separate system readers
- Realm Guard / Torchbearer may serve as the first advanced reference mapping once its relationship/character-data model is stable, but no reference-system version becomes a Tome dependency

Implementation is intentionally deferred until the v1.5 Adapter API is sufficiently hardened and the first reference semantic model is stable.

---

## Ecosystem discovery / optional Tome handoff

Other GuteboysFactory systems/modules may expose an optional Tome-aware action.

- If Adventurer's Tome is active, the action hands the current UUID/context to Tome.
- If Tome is not installed/active, the same user-invoked action may open a tasteful GM-only **Discover Adventurer's Tome** panel with install/learn-more links.
- No startup advertising or repeated unsolicited popup.
- Player clients do not receive install/promotional prompts.
- The fallback presentation should be implemented through a shared integration helper so Realm Guard, Genesys VTT and future GBF projects do not each invent incompatible Tome detection.
- This discovery/fallback contract belongs with the formal integration/adapter work and is deliberately not part of v1.4 GM Dock Core.

---

# CURRENT — v1.6 Universal Semantic Layer Foundation & System-aware Creation

## Goal

Build the shared semantic information layer that future Tome features use before adding write/create automation.

The v1.6 sequence begins read-only and permission-safe:

```text
Foundry Document
      ↓
Universal Document Registry
      ↓
Formal Adapter API
      ↓
Permission / Visibility Gate
      ↓
Universal Semantic Layer
      ↓
Tome consumers
```

Quick NPC and system-aware creation remain part of the v1.6 direction, but they must build on the semantic layer rather than introduce a separate system-specific model.

## v1.6.0-qa.1 — USL Foundation

**Status:** QA / LIVE TEST REQUIRED

Initial scope:

- public `module.api.semantic`
- semantic contract version 1
- Semantic Catalog v1
- first vertical slice: identity, relationships, traits
- additive Adapter API capability `semanticRead`
- permission gate before semantic resolution
- explicit provenance / authority / visibility normalization
- conservative generic identity fallback only
- no uncontrolled `actor.system` crawling
- no write-back
- no creation
- no World Auto-Build yet

Security lock:

> Player-facing semantic results are permission-filtered before they reach downstream consumers.

QA protocol: `docs/V1.6_QA1_USL_FOUNDATION.md`

## v1.6.0-qa.2 — Semantic Provider Hardening & Realm Guard Reference Mapping

**Status:** QA / LIVE TEST REQUIRED

qa.2 moves USL from synthetic QA-only providers to the first real reference mapping while keeping the entire layer read-only.

Added:

- Semantic Catalog v2 resolution policy
- deterministic `single` provider semantics
- permission-filtered `merge` semantics for relationships and traits
- multi-provider provenance aggregation
- optional `realm-guard-semantic-reference` adapter
- real Realm Guard mappings for ancestry, rank/class-like role, background, biography, relationships and embedded trait Items

Security and independence remain locked:

- visibility filtering happens before merge aggregation
- hidden provider metadata must not leak through merged results
- Tome Core and USL do not branch on Realm Guard
- Realm Guard-specific source paths live only in the optional reference adapter
- no write-back or creation yet

QA protocol: `docs/V1.6_QA2_SEMANTIC_PROVIDER_HARDENING.md`

## v1.6.0-qa.3 — Semantic Catalog Expansion & Character Intelligence

**Status:** QA / LIVE TEST REQUIRED

qa.3 broadens the read-only USL character model while preserving the same provenance, authority and visibility boundary.

Added:

- Semantic Catalog v3
- drives / beliefs / goals / instincts
- skills / wises / talents / conditions
- merge-list handling for skills, wises, talents and conditions
- richer Realm Guard reference mapping from embedded Items and canonical Actor fields
- automatic richer `inspect()` coverage without exposing raw payloads

Privacy lock:

- Character Notes remain intentionally unmapped until their private/GM visibility semantics are explicitly designed and tested.
- No write-back or creation is enabled in qa.3.

QA protocol: `docs/V1.6_QA3_CHARACTER_INTELLIGENCE.md`

## v1.6.0-qa.4 — Privacy Semantics & Semantic Write Contract

**Status:** QA / LIVE TEST REQUIRED

qa.4 deliberately combines privacy semantics with the first write-facing contract so write architecture is privacy-aware from day one.

Added:

- Semantic Catalog v4 note privacy classes
- `notes.private` owner-only system notes
- `notes.gm` GM-only Contextual Private Vault semantics
- `notes.public` player-visible Known Information semantics
- explicit reveal-state metadata
- public `semantic.canWrite()`
- public dry-run `semantic.planWrite()`
- additive Adapter API capability `semanticWritePlan`
- Realm Guard dry-run mappings for ancestry, class/rank, biography, beliefs, goals, instincts and private notes
- denied-plan redaction to prevent side-channel leakage
- optimistic conflict detection with `expectedCurrentValue`

Hard lock:

> qa.4 exposes no semantic mutation API. Every write result is a plan only.

Detailed architecture: `docs/USL_PRIVACY_WRITE_CONTRACT.md`  
QA protocol: `docs/V1.6_QA4_PRIVACY_WRITE_CONTRACT.md`

## v1.6.0-qa.5 — Public Notes Canonical Source Hotfix

**Status:** QA / LIVE TEST REQUIRED

Focused qa.4 hotfix.

Fixes the public-note semantic source selection for Tome Character Information:

- Tome group-PC Character Information resolves from `flags.adventurers-tome.profile.biography`
- dry-run `notes.public` write plans target the same canonical field
- existing Item/legacy Known Information sources retain their current `knownInformation` storage
- no duplicate public-note authority is introduced
- Private Vault and owner-private note boundaries are unchanged

QA protocol: `docs/V1.6_QA5_PUBLIC_NOTES_SOURCE_HOTFIX.md`

## v1.6.0-qa.6 — Controlled Semantic Write Execution

**Status:** QA / LIVE TEST REQUIRED

qa.6 enables the first real semantic mutations on top of the verified dry-run write contract.

Added:

- public `semantic.executeWrite(source, plan, options?)`
- fresh-plan revalidation before every mutation
- optimistic stale-plan conflict rejection
- source UUID / provider / target-path / operation tamper protection
- additive Adapter API capability `semanticWriteApply`
- targeted `adapters.executeAdapter()` so writes are never broadcast to all providers
- controlled Realm Guard writes to existing canonical Actor fields
- controlled Tome Character Information writes to its existing canonical profile field
- Foundry update loop markers
- payload-free session-local semantic write audit trail

Scope lock:

- updates existing canonical sources only
- no Actor/NPC/Item creation yet
- GM Private Vault remains plan-only in qa.6

Architecture: `docs/USL_CONTROLLED_WRITE_EXECUTION.md`  
QA protocol: `docs/V1.6_QA6_CONTROLLED_WRITE_EXECUTION.md`

## v1.6.0-qa.7 — Universal Campaign Discovery Foundation

**Status:** QA / LIVE TEST REQUIRED

qa.7 starts the read-only campaign-discovery layer that future World Auto-Build, Campaign Graph and Campaign Brain will consume.

Added:

- public `module.api.discovery`
- generic discovery of readable Actors, Items, Journals, Journal Pages, Scenes and Folders
- visible Compendium index discovery as reference candidates
- preserved Foundry folder paths and structural `contains` relationships
- additive Adapter API capability `entityDiscovery`
- generic entity / relationship normalization
- exact canonical UUID reconciliation
- unresolved entity/reference tracking without creation
- automatic read-only rescan after registry lifecycle rebuilds
- first advanced Realm Guard M8 Social Network reference mapping through its adapter only

System-independence lock:

> Tome Core never calls a reference-system API directly. Reference adapters translate system-specific models into the universal discovery contract.

Scope lock:

- discovery/reconciliation is read-only in qa.7
- no fuzzy name matching yet
- no create/import/acquire action yet
- no World Auto-Build mutation yet

Architecture: `docs/UNIVERSAL_CAMPAIGN_DISCOVERY_CONTRACT.md`  
QA protocol: `docs/V1.6_QA7_UNIVERSAL_CAMPAIGN_DISCOVERY.md`

## v1.6.0-qa.8 — Universal Entity Reconciliation

**Status:** QA / LIVE TEST REQUIRED

qa.8 adds a read-only reconciliation layer above Campaign Discovery.

Added:

- public `module.api.reconciliation`
- unresolved entity classification against World and Compendium candidates
- exact / high-confidence / possible / ambiguous / no-match classes
- conservative name normalization and similarity
- corroborating evidence from profession, culture, location and Folder context
- explicit candidate reasons/scores
- World-first tie-break preference without changing authority
- lifecycle refresh after discovery updates

Hard locks:

- canonical UUID equality is the only exact identity
- name equality alone never auto-links
- no automatic link, import, acquire or create occurs
- reconciliation consumes permission-filtered Discovery results only

Architecture: `docs/UNIVERSAL_ENTITY_RECONCILIATION_CONTRACT.md`  
QA protocol: `docs/V1.6_QA8_UNIVERSAL_ENTITY_RECONCILIATION.md`

## v1.6.0-qa.9 — Semantic Contacts World Projection

**Status:** QA / LIVE TEST REQUIRED

qa.9 introduces the first visible World Auto-Build projection.

Added:

- `semantic-only` entity state for legitimate campaign entities that do not require a Foundry document
- adapter representation/materialization policy
- first-class Tome World `Contacts` category
- public `module.api.contactProjections`
- automatic GM-side Contact projection from generic discovery relationships
- stable semantic-key identity for projected Contacts
- relationship role/status/origin + profession/culture/location projection
- source-permission mirroring with manual-override protection
- in-place upgrade when a canonical Actor UUID later appears
- non-destructive inactive state when semantic source disappears
- GM edit preservation for custom facts and edited summaries

Authority lock:

> A projected Contact is Tome presentation. The system semantic source remains authoritative for source-owned facts.

Safety lock:

- no automatic Foundry Actor/NPC creation
- no name-based auto-link
- no automatic Contact deletion
- no projection may broaden permissions beyond its source unless the GM changes permissions explicitly

Architecture: `docs/SEMANTIC_CONTACTS_WORLD_PROJECTION_CONTRACT.md`  
QA protocol: `docs/V1.6_QA9_SEMANTIC_CONTACTS_WORLD_PROJECTION.md`

## v1.6.0-qa.10 — Discovery Resolved Classification Hotfix

**Status:** QA / FOCUSED HOTFIX

Live qa.9 relationship-NPC creation exposed a missing local `resolved` declaration in Campaign Discovery's new-entity classification path.

qa.10 restores the canonical UUID resolution boolean used by the existing `resolved / semantic-only / unresolved-reference / unresolved` state machine.

Scope is intentionally limited:

- no contract changes
- no authority/model changes
- no permission changes
- no reconciliation scoring changes
- no Contact projection behavior changes beyond allowing Discovery to complete normally

QA protocol: `docs/V1.6_QA10_DISCOVERY_RESOLVED_HOTFIX.md`

## v1.6.0-qa.11 — Contextual Relations Consumer

**Status:** QA / LIVE TEST REQUIRED

qa.11 connects the generic Campaign Discovery graph to the existing Tome character/profile Relations panel.

Added:

- automatic semantic relationship rows on Actor profiles
- generic role/status/origin presentation
- semantic-only Contact navigation through Tome World
- canonical Actor navigation when linked
- conservative coexistence with manual Tome relations
- live Tome refresh after Discovery and Contact Projection updates
- permission-safe target resolution

System-independence lock:

> The profile consumer reads only Tome's generic Discovery/Contact APIs and contains no reference-system logic.

QA protocol: `docs/V1.6_QA11_CONTEXTUAL_RELATIONS_CONSUMER.md`


## v1.6.0-qa.12 — Relationship Identity & Authority Convergence

**Status:** QA / LIVE TEST REQUIRED

qa.12 converges contextual relationship presentation by stable target identity instead of target-plus-role.

Added:

- one person/contact card per stable canonical target identity
- canonical Actor UUID wins when available
- semantic-only identities remain keyed by semantic/entity identity, never by display name
- multiple relationship roles are preserved as facets on the same target
- current system semantic relation presentation takes navigation/authority precedence while Tome-authored relation notes remain preserved as additional facets
- multiple semantic records that resolve to the same canonical Actor converge into one rendered person
- generated Semantic Contact projections no longer enter Character Campaign Links through fuzzy text inference
- generated Contacts appear in Campaign Links only when explicitly linked by Tome
- ordinary non-projection World Journal inference remains unchanged

Authority lock:

> Legacy/imported/manual evidence may be preserved, but it must not become a second live person identity when a stronger canonical or current semantic identity is available.

Identity lock:

> Display name is evidence, never canonical identity.

System-independence lock:

> Core convergence uses generic Actor UUID, semantic/entity keys, projection metadata and Discovery output. It contains no Realm Guard-specific branch.

QA protocol: `docs/V1.6_QA12_RELATION_IDENTITY_AUTHORITY_CONVERGENCE.md`

## v1.6.0-qa.13 — Contact Projection Privacy Hardening

**Status:** QA / FOCUSED PRIVACY HOTFIX

Live player QA exposed a cross-surface permission leak: an unreadable linked Actor was correctly absent from Character → Relations, but the automatically generated semantic Contact remained visible in World → Contacts with relationship metadata.

qa.13 hardens the existing projection model without changing identity or authority semantics:

- semantic-only Contacts continue to mirror their semantic source Actor
- Contacts linked to a canonical Actor use the conservative intersection of source Actor and target Actor ownership
- automatically managed projection ownership tightens in place on refresh
- explicit GM-diverged Contact permissions remain GM-managed
- `contactProjections.list()` is viewer-scoped
- Character Relations require a readable Contact projection for non-canonical semantic targets and no longer synthesize hidden fallback rows

Privacy lock:

> A projected/derived Contact may never be more visible than the permission-appropriate evidence that supports it, and the existence of a hidden relationship must not leak through alternate Tome surfaces.

QA protocol: `docs/V1.6_QA13_CONTACT_PROJECTION_PRIVACY.md`

## v1.6.0-qa.14 — Projection Permission Enforcement

**Status:** QA / FOCUSED PRIVACY HOTFIX

qa.13 removed the hidden linked Actor from Character → Relations, but live player QA proved that the generated Contact Journal itself could remain readable and leak through World, Campaign Explorer and direct Contact profile navigation.

qa.14 adds defense-in-depth enforcement:

- automatic semantic Contacts are live-checked against current viewer permission to their source Actor evidence
- canonical linked Actor permission is part of that evidence gate
- `canViewInTome()` applies the projection evidence gate across normal Tome consumers
- `contactProjections.list()` applies the same viewer-scoped evidence check
- Actor updates schedule projection ownership refresh so persisted Journal permissions converge after ownership changes
- stale Journal ownership can no longer by itself make an automatic Contact visible
- hidden linked Actor UUID metadata is not exposed in player-facing Contact facts
- explicit GM-diverged Contact permissions remain deliberate overrides rather than being silently rewritten

Privacy lock:

> Automatic derived campaign data must pass both document permission and live evidence permission. Stale projection ownership must never reveal a hidden person or relationship.

QA protocol: `docs/V1.6_QA14_PROJECTION_PERMISSION_ENFORCEMENT.md`

## v1.6.0-qa.15 — Privacy Authority Consolidation

**Status:** QA / ARCHITECTURE HARDENING

Repeated live privacy QA showed that the underlying problem was not one missing UI filter. Generated Contact Journal ownership, viewer-scoped semantic evidence and Discovery could disagree about the same derived person.

qa.15 consolidates privacy authority around evidence before derivation:

- generated Contact visibility is always bounded by live source/target Actor evidence
- `ownershipManaged` no longer bypasses viewer-scoped semantic privacy
- stale ownership-signature mismatch no longer silently converts a generated Contact into a permanent manual override
- generated Contact ownership remains managed unless an explicit override flag exists
- Foundry inherited/negative ownership values are resolved through the document default before conservative intersection
- Universal Campaign Discovery filters unreadable canonical adapter entities and relationship endpoints before they enter the viewer graph
- canonical Foundry UUID facts are GM-only implementation metadata
- Contact Projection exposes a GM-only permission audit that detects Journal/evidence visibility mismatches

Architecture lock:

> Privacy authority lives in the viewer-scoped evidence graph. Projection Documents and UI consumers may narrow that result, but may never broaden it.

QA protocol: `docs/V1.6_QA15_PRIVACY_AUTHORITY_CONSOLIDATION.md`

## v1.6.0-qa.16 — Exact Ownership Convergence

**Status:** QA / FOCUSED PERSISTENCE FIX

Live qa.15 diagnostics proved that viewer-scoped privacy was correct while persisted generated Contact Journal ownership could retain stale per-user keys after the desired ownership state changed.

qa.16 fixes the persistence layer:

- managed Contact ownership is written through flattened Foundry ownership paths
- stale ownership keys absent from the desired state are explicitly deleted with Foundry's `-=key` update syntax
- ownership comparison uses normalized ownership signatures
- scope is limited to Tome-managed Semantic Contact projections
- viewer-scoped evidence privacy, Discovery filtering and identity convergence remain unchanged

QA protocol: `docs/V1.6_QA16_EXACT_OWNERSHIP_CONVERGENCE.md`

## v1.6.0-qa.17 — Permission Evidence Authority

**Status:** ✅ VERIFIED / FULL PASS BASELINE

The final regression audit found one stale linked-identity edge being treated as permission evidence despite the projection's active `semantic-source` policy.

qa.17 separates permission authority from identity metadata:

- `permissionSourceUuids` is authoritative when present
- stale `linkedUuid` values do not broaden permission dependencies
- legacy projections use policy-aware fallback evidence
- Contact identity/navigation metadata remains preserved independently

QA protocol: `docs/V1.6_QA17_PERMISSION_EVIDENCE_AUTHORITY.md`

### v1.6 Read Foundation — FULL PASS

Verified on Foundry V13.351 with `v1.6.0-qa.17`.

Final regression gate:

- Contact Projection = healthy
- Contact duplicate keys = 0
- Contact permission violations = 0
- Universal Campaign Discovery = healthy
- Universal Entity Reconciliation = healthy
- Universal Semantic Layer = healthy
- Adapter API = healthy
- Universal Document Registry = healthy
- relation/permission structure = healthy
- takeover convergence = healthy / misses 0
- lifecycle hardening = healthy
- import identity hardening = healthy
- Universal Convergence Gate = structuralHealthy
- player/privacy gate = PASS
- same-name identity isolation = PASS
- ordinary World inference regression = PASS

Architecture lock:

> The viewer-scoped evidence graph is the privacy authority. Identity/navigation metadata may never broaden permission evidence.

This closes the read/discovery/reconciliation/privacy foundation of v1.6. The milestone itself remains active because system-aware creation and Quick NPC are still planned v1.6 work.

## v1.6.0-qa.18 — System-aware NPC Creation Contract

**Status:** QA / IMPLEMENTED

Next package establishes the creation-side contract before Quick NPC UI is allowed to create system documents.

Planned scope:

- formalize the existing Adapter API `npcSchema` capability
- normalized creation schema returned by the active system adapter
- Core-owned schema validation and field normalization
- GM-only creation planning
- no uncontrolled direct writes to unknown `actor.system` paths
- prefer existing World Actor → Compendium candidate → create new
- stable created Actor UUID returned to Tome
- duplicate prevention and explicit provenance
- Realm Guard as first advanced reference implementation without becoming a runtime dependency
- no Quick NPC UI until the contract is QA-verified

Implemented in qa.18:

- public `api.npcCreation.schema/plan/apply/audit`
- normalized `adapters.npcSchema()` helper
- exact-name/type World Actor duplicate reuse
- exact-name/type Compendium candidate import
- ambiguous duplicate blocking
- immutable signature-checked creation plans
- GM-only explicit apply
- creation provenance flagging
- Realm Guard reference NPC schema (concept, rank, homeland, ancestry, biography, notes)

QA protocol: `docs/V1.6_QA18_SYSTEM_AWARE_NPC_CREATION_CONTRACT.md`

## v1.6.0-qa.19 — Quick NPC UI

**Status:** QA / IMPLEMENTED

First usable GM-facing creation UI built strictly on the verified qa.18 creation contract.

Implemented:

- dynamic form rendered from the active adapter `npcSchema`
- preview-before-apply workflow
- create-new / reuse-world / import-compendium review states
- explicit candidate choice for ambiguous exact duplicates
- Back preserves entered values
- Cancel never mutates
- GM-only entry point
- created/reused Actor sheet opens after Apply
- no direct UI knowledge of Realm Guard `actor.system`

QA protocol: `docs/V1.6_QA19_QUICK_NPC_UI.md`

QA target:

- Core works without any system adapter
- unsupported systems fail safely without creating partial Actors
- adapter schema is inspectable before creation
- creation plan is deterministic and read-only until explicitly applied
- created Actor resolves through Universal Document Registry after write

## Later v1.6 direction

After the read foundation is verified:

- broaden Semantic Catalog deliberately
- first advanced Realm Guard reference mapping when its character-data model is stable
- provenance/visibility hardening
- controlled semantic write planning
- system-aware create planning
- Quick NPC through adapter creation schemas
- existing World → compendium → create-new duplicate prevention

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


## LOCKED — Campaign Intelligence Foundation

This is a planned architectural block for the v1.7+ Campaign Graph / Campaign Brain path.

Tome should be able to analyse campaign truth from all permission-appropriate evidence available in the current Foundry world, not only from already-structured relationship fields.

### Campaign Evidence Graph

Potential evidence sources include:

- Actors and Actor biographies / notes
- Journals and Journal Pages
- Sessions and Quests
- World entries, Locations and Factions
- Items and system-owned semantic data
- Tome-owned profile and campaign-memory data
- legacy / imported campaign data
- compatible external modules through explicit Evidence Providers

Evidence is preserved with provenance rather than flattened into anonymous text.

Each evidence record should be able to carry:

- source UUID / provider
- source type and source path
- entities mentioned
- candidate relationship / campaign claim
- temporal hints when available
- authority
- confidence
- visibility / reveal state
- provenance

### Evidence Provider API

Other Foundry systems/modules may optionally contribute normalized campaign evidence without Tome Core reading or guessing their private internal schemas.

Examples may include:

- GM notes modules
- calendar/timeline modules
- quest/campaign modules
- system adapters
- future migration/import providers

Providers must declare visibility and provenance. Tome must remain fully functional without any provider.

### Entity Resolution

Identity resolution remains conservative:

1. canonical Foundry UUID
2. stable semantic identity
3. stable external/import identity
4. corroborating contextual evidence
5. display name only as supporting evidence

**Display name alone must never merge two campaign entities.**

Tome may surface high-confidence candidate matches for GM review, but uncertain prose-derived identity must not silently auto-merge canonical entities.

### Relationship & History Convergence

Tome should converge structured relationships, historical/legacy evidence and prose-derived evidence into a campaign-facing relationship model without destroying the underlying sources.

Possible states include:

- current relationship
- former / historical relationship
- changed status over time
- conflicting evidence
- unknown temporal state
- semantic-only Contact with no Actor materialization

History is optional evidence, not a requirement. When chronology cannot be established, Tome should preserve the supported relationship claim without inventing dates or transitions.

### Derived Campaign Facts

Tome may derive useful campaign claims such as:

- likely same campaign person
- former/current mentor
- connection to a Location or Faction
- relationship change
- recurring NPC / forgotten connection

Derived claims must retain source provenance and confidence and remain reviewable by the GM when ambiguity matters.

### Privacy-by-design — HARD LOCK

> **A derived fact may never be more visible than the evidence available to the current viewer supports.**

Tome must not compute one unrestricted global campaign truth and merely hide source text afterward.

Instead:

```text
available evidence for current viewer
        ↓
permission / reveal filtering
        ↓
viewer-scoped evidence graph
        ↓
entity / relationship resolution
        ↓
viewer-scoped derived campaign facts
```

Consequences:

- GM-only evidence may strengthen the GM's graph without leaking its conclusion to players.
- Player-visible conclusions must be independently supportable by evidence visible to that player.
- The existence of a hidden relationship/secret is itself protected information and must not leak through badges, counts, candidate links, search, graph edges or Campaign Brain summaries.
- External Evidence Providers may never broaden source permissions.

### GM review for uncertain conclusions

Where identity or relation evidence is not strong enough for deterministic convergence, Tome should surface a review decision rather than auto-merge:

```text
Confirm link
Keep separate
Ignore
```

This foundation is intended to feed Campaign Graph, Player Chronicle and Campaign Brain. It may later also be reused by Foundry-bound migration/reconciliation work, but migration UI/transactions remain a separate future track.

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

**Stable completed architecture milestone:** `v1.5 — Formal Adapter API`  
**Stable baseline:** `v1.5.0`  
**Verified QA source:** `v1.5.0-qa.3`  
**Verified Foundry baseline:** `V13.351`  
**Active milestone:** `v1.6 — Universal Semantic Layer Foundation & System-aware Creation`  
**Verified v1.6 read-foundation baseline:** `v1.6.0-qa.17 — FULL PASS`  
**Current QA package:** `v1.6.0-qa.19 — Quick NPC UI`  
**v1.5 feature state:** STABLE

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

Development may now proceed to the Universal Semantic Layer foundation on top of the verified v1.5 Adapter API.

## Platform compatibility note

The project remains **v14-first, v13-compatible** in architecture policy.

Foundry V14 runtime verification is still pending and must be completed separately before V14 compatibility is described as verified.

> **Conquer Foundry first. Extend beyond Foundry second.**
