# Universal Campaign Discovery Contract

**Status:** QA IMPLEMENTATION — v1.6.0-qa.7

## Purpose

Universal Campaign Discovery is the read-only bridge between Foundry's existing campaign data and future Tome World Auto-Build.

Its job is to answer:

- what already exists?
- where is it organized?
- which semantic entities are already canonical Foundry documents?
- which relationships are known?
- which references remain unresolved?
- which Compendium references are available?

It does not create campaign data.

## Core invariant

> Tome Core discovers generic entities and relationships. System adapters translate system-specific concepts into that generic contract.

Reference systems never define the Core model.

## Discovery stack

```text
Foundry World Documents
Folders
Compendium indexes
        ↓
Universal Document Registry
        ↓
Permission gate
        ↓
Universal Campaign Discovery
        ↑
Adapter entityDiscovery capability
        ↑
System-specific semantic models
```

## Identity

Canonical UUID identity wins whenever available.

Adapter-local IDs are useful provenance and temporary entity keys, but they never replace a canonical Foundry UUID.

## Folder semantics

Folder structure is evidence about campaign organization, not absolute semantic truth.

Discovery preserves:

- folder UUID
- ordered folder path
- structural contains edges

Later reconciliation may map that structure into Tome World categories without cloning the Foundry tree 1:1.

## Compendiums

Compendium entries are reference candidates, not live campaign truth.

They are marked `state: compendium`.

Future acquisition follows the locked order:

```text
existing World document
        ↓
existing Compendium reference/import
        ↓
create new document
```

## Unresolved entities

An adapter may know that a Person/Faction/Location exists without a canonical Foundry document.

Such entities remain:

- `unresolved`, when there is no canonical UUID
- `unresolved-reference`, when a supplied UUID cannot currently be resolved

Discovery never creates a missing Actor/NPC/Item.

## Reconciliation boundary

qa.7 performs only exact canonical UUID reconciliation.

Name matching, confidence scoring, candidate ranking and acquisition belong to the next reconciliation milestone.

This prevents early fuzzy matching from silently joining unrelated campaign entities.

## Privacy

Discovery is generated in user context.

It must never expose data the current user could not already observe through its canonical source or adapter visibility contract.

Downstream World/Graph/Chronicle/Brain consumers must consume these filtered discovery results, not raw adapter/system data.

## Realm Guard reference implementation

Realm Guard M8 is the first advanced reference adapter because it provides a real normalized Social Network.

The adapter translates its model into generic Tome entities/edges.

No Realm Guard API reference exists inside Universal Campaign Discovery Core.

This same contract is intended for Genesys and future system adapters.
