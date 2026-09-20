# Adventurer's Tome — Universal Semantic Layer Architecture

**Status:** IMPLEMENTATION ACTIVE — v1.6 USL QA line  
**Primary dependency:** Formal Adapter API v1.5 STABLE  
**First advanced reference case:** Realm Guard / Torchbearer character data — IMPLEMENTED IN USL QA  
**Purpose:** preserve the complete design direction so development can resume cleanly in a future chat or implementation session.

---

# 1. Why this layer exists

Adventurer's Tome is no longer only a presentation layer for Journals or a campaign hub that knows a few fixed Foundry document types.

The target is broader:

> **Tome should be able to discover, understand, present, enrich, write back and, when appropriate, create campaign information across Foundry without hard-coding every game system's internal schema.**

The important distinction is semantic rather than structural.

Tome should ask:

- "What relationships does this character have?"
- "What talents does this NPC have?"
- "What identity/background information exists?"
- "What equipment is attached to this Actor?"
- "What faction affiliations are known?"
- "What rules/reference information exists for this Item?"
- "Can this information be written back?"
- "Can a matching Foundry document be created if none exists?"

Tome should **not** need to know whether a specific system stores that information in:

- `actor.system.relationships`
- `actor.system.social.bonds`
- embedded Items
- flags
- Active Effects
- Journal pages
- compendium references
- another system-specific structure

The system adapter or semantic discovery layer resolves that difference.

---

# 2. Core architecture

The intended stack is:

```text
Foundry Documents
        ↓
v1.3 Universal Document Registry
        ↓
v1.5 Formal Adapter API
        ↓
Universal Semantic Layer
        ↓
Read / Write / Create Engine
        ↓
Tome Consumers
```

Tome consumers include, among others:

- Character profiles
- NPC profiles
- World
- Items / artifacts
- Quests
- Sessions
- Search
- Campaign Graph
- Quick NPC
- Player Chronicle
- GM prep
- future Campaign Brain
- future world auto-build / import workflows

The design principle is:

> **Every future Tome feature should ask one semantic layer for information instead of inventing its own system-integration logic.**

---

# 3. Scope of possible Foundry sources

The semantic layer is not character-only.

Potential sources include:

- Actor
- embedded Actor Items
- Item
- JournalEntry
- JournalEntryPage
- Scene
- Folder
- RollTable
- ActiveEffect
- flags
- system data
- world collections
- compendium collections
- compendium documents
- Tome extension data

The exact source set can grow over time.

Core must remain system-agnostic.

---

# 4. The four primary operations

The engine should conceptually expose four operations.

## DISCOVER

> What structured information exists here?

Examples:

- Actor system data
- embedded Items
- effects
- linked compendium source ids
- flags
- Journal pages
- known canonical relations

Discovery should identify available source structures without immediately treating them as campaign truth.

## RESOLVE

> What does this information mean?

Examples:

- `relationships`
- `skills`
- `talents`
- `identity.ancestry`
- `inventory`
- `factions`

Resolution maps raw system structure to Tome semantic concepts.

## WRITE / SYNC

> If Tome changes this semantic value, where should the change go?

The write layer must respect authority and provenance.

Examples:

- write biography back to the canonical Actor field
- write relationships back through a system adapter
- leave Tome-only extension data in Tome if Foundry has no natural representation

## CREATE

> If no canonical Foundry object exists, can the active system create one?

Examples:

- PC
- NPC
- Item
- Weapon
- Armor
- Talent
- Relationship
- Faction entry
- other system-native documents supported by an adapter

Creation must be adapter/schema-driven rather than hard-coded into Tome Core.

---

# 5. Canonical semantic catalog

The semantic catalog should define stable concepts that Tome understands.

Adapters map system terminology to those concepts.

The catalog should be hierarchical rather than one huge flat list.

## Identity

Possible canonical concepts:

- `identity.name`
- `identity.type`
- `identity.ancestry`
- `identity.class`
- `identity.level`
- `identity.background`
- `identity.occupation`
- `identity.culture`
- `identity.heritage`
- `identity.age`
- `identity.pronouns`
- `identity.appearance`
- `identity.biography`
- `identity.alignment`
- `identity.deity`
- `identity.size`

Common system aliases include:

- Race
- Ancestry
- Species
- Heritage
- Kin
- Class
- Career
- Profession
- Archetype
- Calling
- Role
- Background
- Origin
- Culture
- Biography
- Backstory
- History

## Social / campaign relationships

- `relationships`
- `contacts`
- `allies`
- `enemies`
- `rivals`
- `bonds`
- `factions`
- `affiliations`
- `reputation`
- `socialStatus`

Common aliases include:

- Relationships
- Relations
- Contacts
- Connections
- Allies
- Enemies
- Rivals
- Nemeses
- Bonds
- Patrons
- Associates
- Allegiances
- Organizations
- Standing
- Renown
- Status

A `relationships` result may contain several semantic sub-groups rather than flattening all social information into one list.

Example:

```js
{
  semantic: "relationships",
  groups: {
    relationships: [],
    contacts: [],
    allies: [],
    enemies: [],
    bonds: []
  }
}
```

## Character drives and narrative identity

- `goals`
- `beliefs`
- `instincts`
- `motivations`
- `ideals`
- `drives`
- `ambitions`
- `secrets`
- `notes`
- `playerNotes`

Common aliases include:

- Goals
- Objectives
- Ambitions
- Beliefs
- Ideals
- Convictions
- Principles
- Motivation
- Desire
- Drive
- Agenda

## Traits / learned abilities

- `traits`
- `wises`
- `skills`
- `talents`
- `specialAbilities`
- `languages`
- `powers`
- `spells`

Common aliases include:

- Traits
- Qualities
- Aspects
- Distinctions
- Wises
- Knowledges
- Lores
- Skills
- Abilities
- Proficiencies
- Talents
- Feats
- Perks
- Edges
- Advantages
- Features
- Powers
- Disciplines
- Gifts
- Spells
- Magic

## Mechanical state

- `attributes`
- `health`
- `stress`
- `conditions`
- `criticalInjuries`
- `resources`
- `defenses`
- `movement`
- `initiative`
- `advancement`

Common aliases include:

- Attributes
- Characteristics
- Abilities
- Stats
- HP
- Wounds
- Health
- Harm
- Stress
- Strain
- Sanity
- Fatigue
- Conditions
- States
- Injuries
- Afflictions
- Critical Injuries
- Critical Wounds
- Trauma
- AC
- Defense
- Parry
- Dodge
- Soak
- Speed
- Pace
- XP
- Advancement
- Progress
- Milestones
- Fate
- Persona
- Story Points
- Bennies
- Inspiration
- Momentum

## Equipment / possessions

- `inventory`
- `weapons`
- `armor`
- `containers`
- `consumables`
- `currency`
- `wealth`
- `encumbrance`
- `vehicles`
- `mounts`

Common aliases include:

- Gear
- Equipment
- Inventory
- Load
- Burden
- Wealth
- Resources

## Item semantics

Items may represent far more than gear.

Potential semantic item kinds include:

- weapon
- armor
- gear
- spell
- talent
- feat
- trait
- condition
- ability
- class
- ancestry
- background
- relationship
- contact
- faction
- vehicle
- mount
- container
- consumable
- currency
- resource
- quest-item

The semantic catalog is expected to expand as reference systems are mapped.

---

# 6. Alias model

System terms and Tome semantics are not always identical.

Example:

```text
canonical: identity.ancestry

possible aliases:
Race
Ancestry
Species
Heritage
Kin
People
```

Adapters should provide explicit mappings where possible.

Aliases are useful for generic discovery but must not themselves create authoritative truth.

---

# 7. Resolution order

A semantic request should be targeted.

Tome should **not** freely crawl all JSON and invent meanings.

Preferred resolution order:

```text
Semantic request
      ↓
1. Explicit system/module adapter
      ↓
2. Registered semantic provider
      ↓
3. Known structural patterns
      ↓
4. Safe targeted generic discovery
      ↓
5. Unavailable / unresolved
```

Possible resolution states:

- `authoritative`
- `discovered`
- `inferred`
- `unknown`

An explicit adapter mapping is stronger than a name-based heuristic.

A generic fallback must never silently become canonical campaign truth.

---

# 8. Proposed resolver output

Every resolved fact should carry provenance, authority and visibility.

Example:

```js
{
  semantic: "relationships",
  status: "resolved",

  authority: "system",
  confidence: 1,

  provider: "realm-guard-adapter",

  sourceUuid: "Actor.xxxxx",
  sourcePath: "system.relationships",

  writable: true,
  visibility: "gm-only",

  data: []
}
```

Required design rule:

> **No semantic fact without provenance, authority and visibility.**

This enables reliable read, write, audit, privacy and debugging behavior.

---

# 9. Provenance

Normalization must never erase where information came from.

Tome should be able to trace a value back to its source.

Examples:

```text
Actor.xyz
→ system.relationships
```

or:

```text
Actor.xyz
→ embedded Item.abc
→ system.foo.bar
```

or:

```text
Actor.xyz
→ sourceId
→ Compendium.system.items.Item.123
```

Provenance is required for:

- write-back
- conflict handling
- debugging
- source links
- duplicate prevention
- security
- Campaign Brain traceability

---

# 10. Authority rules

The existing Tome rule remains valid:

> **If Foundry knows it, Tome uses it. If Tome adds it, Tome extends it.**

Expanded semantic write rule:

```text
If Foundry already owns it
→ read/write Foundry canonical source

If Foundry/system can represent it
→ optionally create/write through adapter

If Foundry cannot represent it naturally
→ Tome owns extension data
```

Tome must not create a second authoritative copy of data already naturally owned by Foundry.

---

# 11. Bidirectional behavior

The semantic layer is intended to support three directions.

## Foundry → Tome

Example:

```text
Foundry Actor
      ↓
Semantic Resolver
      ↓
identity
relationships
background
skills
traits
inventory
factions
      ↓
Tome profile / World
```

This can support automatic World enrichment and reduce duplicate GM data entry.

## Tome → Foundry

Example:

A GM edits a relationship in Tome.

If the active adapter declares that `relationships` are writable and maps them to a canonical system field, Tome may write through the adapter to that field.

If no system representation exists, Tome keeps the value as Tome extension data.

## Tome → create Foundry

Example:

```text
Tome NPC
      ↓
adapter creation schema
      ↓
Foundry Actor
      ↓
canonical UUID
      ↓
Tome profile links to that Actor
```

After creation there must be one canonical entity, not two competing NPC records.

---

# 12. Write planning and validation

Writes and creates should use an explicit plan before mutation.

Conceptual flow:

```text
Tome change
      ↓
Semantic write plan
      ↓
Permission validation
      ↓
Adapter/system validation
      ↓
Foundry update/create
      ↓
Canonical UUID/source refresh
```

A creation adapter may describe:

```text
Required:
✓ name
✓ actor type

Optional:
- ancestry
- occupation
- image

Mappings:
relationships → system.relationships
traits        → embedded Items
gear          → embedded Items
```

The semantic layer describes **what** the object means.

The adapter describes **how the system represents it**.

---

# 13. Capability-driven API direction

Conceptual API only; final names are not yet locked.

Possible shape:

```js
tome.semantic.discover(source)

tome.semantic.resolve(source, "relationships")

tome.semantic.write(source, "relationships", data)

tome.semantic.create("npc", data)

tome.semantic.capabilities(source)
```

Possible capabilities response:

```js
{
  read: [
    "identity",
    "relationships",
    "skills",
    "traits",
    "inventory"
  ],

  write: [
    "relationships",
    "biography",
    "inventory"
  ],

  create: [
    "npc",
    "item",
    "relationship"
  ]
}
```

Core must never assume that every adapter supports every operation.

---

# 14. Existing world first, compendium second, create last

Creation should avoid duplicates.

Preferred object acquisition order:

```text
1. Resolve existing World document
        ↓
2. Resolve/import existing Compendium document
        ↓
3. Create new document through adapter
```

Name matching may be used only as a pre-link discovery aid.

Once a canonical UUID exists, UUID identity wins.

---

# 15. Compendium rules

Compendium content must be separated conceptually from live campaign truth.

```text
WORLD DATA
information that actually exists in the campaign

REFERENCE DATA
information available from compendiums
```

Example:

A character owns a Longsword Item.

The Actor-owned Item is canonical campaign truth.

A linked compendium Item may enrich it with:

- description
- rules text
- traits
- damage metadata
- tags
- source book

but the compendium entry does not replace the owned Item as campaign authority.

Reference enrichment must preserve provenance.

---

# 16. World Auto-Build direction

A future GM workflow may allow Tome to scan the Foundry world and derive a campaign-facing structure automatically.

Conceptual flow:

```text
Scan Foundry World
      ↓
Actors      → Characters / NPCs
Scenes      → Locations / World
Journals    → Lore / Sessions / Quests
Items       → Equipment / Artifacts / Talents
Folders     → Organization
Relations   → Campaign Graph
Compendiums → Optional reference enrichment
```

Possible diagnostic summary:

```text
Found 38 Actors
  5 PCs
  27 NPCs
  6 unknown

Found 14 Scenes
Found 93 Items
Found 41 Journals
Found 76 relationships
```

The goal is not to copy everything into Tome storage.

The goal is to build Tome presentation and relationships around existing canonical Foundry data.

---

# 17. Security and privacy — HARD REQUIREMENT

This is a non-negotiable architecture boundary.

> **Semantic discovery must never increase a user's permissions.**

And:

> **Player-facing consumers may never operate on unfiltered semantic data.**

The permission gate must happen before player-facing semantic results are produced.

Preferred flow:

```text
Foundry / Tome / Adapter source
        ↓
Permission & Visibility Gate
        ↓
Semantic Resolver
        ↓
Normalized user-safe facts
        ↓
Tome UI / Search / Graph / Chronicle / Brain
```

Do **not** use:

```text
resolve everything
      ↓
cache everything
      ↓
hide GM data only in the UI
```

That model is unsafe because hidden information could leak through:

- search suggestions
- backlinks
- relationship graphs
- autocomplete
- related-entity lists
- tags
- cache
- Player Chronicle
- Campaign Brain summaries
- indirect metadata

---

# 18. Visibility levels

Initial conceptual visibility levels:

- `public`
- `player-visible`
- `owner-only`
- `gm-only`

An internal GM-only state such as `discovered-but-hidden` may also be useful.

The exact final enum is not yet locked.

Adapters must be able to split mixed structures into visibility-safe semantic facts when a system stores public and GM-only data together.

---

# 19. GM Notes / Private Vault rule

The semantic layer must never expose:

- Tome GM Notes
- Private Vault data
- GM-only system fields
- unrevealed secrets
- hidden relationships
- private clues
- restricted Journal content

to a player simply because the engine can technically read them.

Foundry ownership remains an access boundary.

Tome may restrict further.

Public source access never grants access to Private Vault data.

---

# 20. Preventing indirect information leaks

A hidden fact must not reveal even its existence when that existence itself is secret.

Example:

GM-only relationship:

```text
NPC A → Secret Cult
```

A player must not learn that relationship through:

- an empty/locked relationship placeholder
- relation counts
- search autocomplete
- "related entities"
- graph topology
- hidden-node spacing
- backlinks
- Campaign Brain wording
- tags or categories

The player resolver should ideally never receive the hidden fact.

---

# 21. User-context resolution

Semantic resolution should always operate in a permission context.

Conceptual example:

```js
resolve(actor, "relationships", {
  user: game.user
})
```

The same campaign source may therefore yield different safe results for:

- GM
- owner
- ordinary player
- future delegated Tome editor roles

This must be deliberate and testable.

---

# 22. Security rule for downstream consumers

Search, Campaign Graph, Player Chronicle and Campaign Brain must consume permission-filtered semantic facts.

They must not receive raw semantic truth and attempt to hide it themselves.

This avoids separate security logic in every future feature.

---

# 23. Reference system examples

Reference systems are examples only.

They must never become Tome runtime dependencies.

## Realm Guard / Torchbearer

Realm Guard is expected to become the first advanced reference mapping after its current character relationship work stabilizes.

Potential mappings include:

```text
Beliefs       → beliefs
Instincts     → instincts
Goals         → goals
Traits        → traits
Wises         → wises
Skills        → skills
Relationships → relationships
Conditions    → conditions
Gear          → inventory
Fate/Persona  → resources
```

Exact source paths are intentionally not locked until the system-side model is stable.

## Genesys

Potential semantic mappings:

```text
Characteristics   → attributes
Skills            → skills
Talents           → talents
Motivations       → motivations
Critical Injuries → criticalInjuries
Wounds            → health
Strain            → stress
Story Points      → resources
```

Again, the reference mapping is not Core behavior.

## D&D / Pathfinder-family example

Potential mappings:

```text
Race/Ancestry → identity.ancestry
Class         → identity.class
Background    → identity.background
Feats         → talents
Skills        → skills
Spells        → powers
HP            → health
Conditions    → conditions
Inventory     → inventory
```

This example exists only to illustrate semantic portability.

---

# 24. Generic discovery fallback

Tome should remain useful even without an adapter.

However, generic discovery must be conservative.

Example request:

```text
Tome asks for "relationships"
```

Possible targeted candidates:

- `system.relationships`
- `system.relations`
- `system.bonds`
- `system.contacts`
- embedded `Item[type=relationship]`

The result may be marked `discovered` or `inferred`, not authoritative.

The engine must not perform uncontrolled schema crawling and silently turn a similar-looking field into campaign truth.

---

# 25. Conflict handling — DESIGN REQUIRED

Potential future conflicts:

- two adapters claim the same semantic
- Actor field and embedded Item disagree
- World Item and compendium source disagree
- Tome extension value differs from newly available system field
- multiple relationship providers overlap
- stale source UUIDs

Final conflict-resolution policy is not yet locked.

Any implementation must preserve provenance so conflicts can be explained rather than hidden.

---

# 26. Cache rules — DESIGN REQUIRED

Because privacy is critical, cache design must be permission-aware.

A shared raw semantic cache must never be reused for a lower-permission user without re-filtering at a trusted boundary.

Safer directions include:

- cache source discovery, not player-visible semantic output
- key resolved caches by user/permission context
- invalidate on ownership/visibility changes
- never serialize GM-only data into player-readable flags or structures

Final caching strategy is not yet locked.

---

# 27. Roadmap impact

This architecture sits across several roadmap milestones.

## v1.5 — Formal Adapter API

Provides the capability boundary and adapter registry.

Current work should finish and harden this first.

The semantic catalog and resolver design may be documented during v1.5, but full implementation should not be rushed before the first strong reference model is ready.

## v1.6 — Quick NPC & System-aware Creation

Quick NPC should consume the semantic create/write layer rather than introducing its own system-specific creation model.

## v1.7 — Campaign Graph & Memory

Relationships, factions, affiliations and backlinks should consume semantic facts rather than raw system fields.

## v1.8 — Player Chronicle

Player Chronicle must consume user-filtered semantic facts so GM-only data can never leak into a player's chronicle.

## v1.9 — Integration API / External Adapters

May expand semantic provider registration and documented external integration contracts.

## v2.0 — Campaign Brain

Campaign Brain should consume normalized, provenance-aware, visibility-safe semantic facts rather than directly scraping Foundry/system data.

That gives it:

- traceable sources
- permission safety
- consistent concepts
- cross-system portability

---

# 28. Implementation sequence — PROPOSED

Do not build the entire engine at once.

Recommended sequence:

## Phase A — finish v1.5 Adapter API

Complete current action/capability QA and keep Adapter API stable.

## Phase B — freeze first Semantic Catalog version

Define a small but extensible catalog.

Do not attempt every RPG concept in v1.

## Phase C — vertical slice

Use a canonical Actor and resolve a limited set such as:

- identity
- relationships
- traits

Realm Guard can serve as the first advanced reference adapter once its relationship model is stable.

## Phase D — provenance + visibility

No broad expansion until provenance, authority and user-safe visibility behavior are verified.

## Phase E — write-back

Add one controlled writable semantic and validate:

- permission checks
- provenance
- loop prevention
- reload
- multi-client behavior

## Phase F — create

Add system-aware creation through adapter schemas.

## Phase G — broaden sources

Then expand toward:

- Items
- compendiums
- Journals
- Scenes
- more semantic groups

---

# 29. Non-goals / guardrails

The Universal Semantic Layer must not become:

- a replacement rules engine
- a copy of every system schema
- an uncontrolled JSON crawler
- a second authoritative database
- a permission bypass
- a reason to duplicate every Foundry document into Tome
- an AI inference engine that silently invents campaign facts

Systems remain rules authorities.

Foundry remains canonical storage where it naturally owns data.

Tome remains the campaign-facing workspace and connective layer.

---

# 30. Product vision

If implemented successfully, the user experience should feel like:

> "Show me everything the campaign already knows, let me safely add what is missing, and write it back to the correct place when the system supports it."

The user should see the campaign, not the underlying storage model.

That is the intended "magic" of the feature.

---

# 31. Handoff for a future development chat

A new chat continuing this work should know the following immediately:

1. **This architecture is design-locked and implementation is active.**
2. Current stable Tome baseline is **v1.5.0 Formal Adapter API**.
3. Current development line is **v1.6 Universal Semantic Layer**.
4. `v1.6.0-qa.1` USL Foundation passed live QA.
5. `v1.6.0-qa.2` Semantic Provider Hardening + first real Realm Guard mapping passed live QA.
6. `v1.6.0-qa.3` Semantic Catalog Expansion & Character Intelligence passed live QA.
7. `v1.6.0-qa.4` combines Privacy Semantics with a dry-run Semantic Write Contract.
8. Do **not** bind Tome testing to a particular Realm Guard release number. Realm Guard remains only a current reference integration.
9. Realm Guard-specific source paths stay isolated to its optional Tome reference adapter; Tome Core remains system-agnostic.
10. Current semantic read coverage includes identity, relationships, traits, drives, beliefs, goals, instincts, skills, wises, talents and conditions.
11. qa.4 adds privacy-safe note semantics: owner-private, GM-private and explicitly player-visible Known Information.
12. GM-private data must use the Contextual Private Vault; it must never be stored in player-readable Actor flags merely for convenience.
13. qa.4 write support is **planning only**: `canWrite()` and `planWrite()`; no semantic mutation API exists yet.
14. Denied write plans must redact current values, provider identity and target/source paths so write planning cannot become a side-channel.
15. Read, future write and future create operations must preserve canonical UUID identity, provenance, authority and visibility.
16. Existing World document → compendium reference/import → create new remains the preferred acquisition order to avoid duplicates.
17. Quick NPC, Campaign Graph, Player Chronicle and Campaign Brain should consume this shared semantic layer rather than implement their own system-specific readers.

---

# 32. Locked summary

```text
Foundry canonical documents
        ↓
Universal Document Registry
        ↓
Formal Adapter API
        ↓
Permission & Visibility Gate
        ↓
Universal Semantic Layer
        ↓
Discover / Resolve / Write / Create
        ↓
Tome World / Profiles / Search / Graph / Chronicle / Brain
```

With three mandatory properties on resolved information:

```text
PROVENANCE
AUTHORITY
VISIBILITY
```

This is the architectural direction to preserve.

---

# 33. Implemented privacy/write contract — v1.6.0-qa.4

The privacy and write-planning design is now concretely implemented for QA.

Locked note semantics:

- `notes.private` — owner-only, system/adapter-owned where a natural system field exists
- `notes.gm` — GM-only, Tome Contextual Private Vault
- `notes.public` — player-visible/revealed, Tome Known Information

The public semantic API now includes:

```js
tome.semantic.canWrite(source, semantic, options)
tome.semantic.planWrite(source, semantic, proposedValue, options)
```

qa.4 is dry-run only. No semantic mutation API is exposed.

Denied write plans are redacted to prevent privacy side-channels. Authorized plans may use `expectedCurrentValue` for optimistic conflict detection.

Detailed contract: `docs/USL_PRIVACY_WRITE_CONTRACT.md`
