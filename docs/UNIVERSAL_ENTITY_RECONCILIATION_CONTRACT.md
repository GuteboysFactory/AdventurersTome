# Universal Entity Reconciliation Contract

**Status:** QA IMPLEMENTATION — v1.6.0-qa.8

## Purpose

Reconciliation sits between Discovery and future Auto-Build/Acquisition.

It answers which existing World or Compendium entities may correspond to an unresolved semantic entity.

It is advisory and read-only.

## Locked boundary

```text
Discovery
   ↓
Unresolved entity
   ↓
Reconciliation
   ↓
exact / high-confidence / possible / ambiguous / no-match
   ↓
NO MUTATION
```

No auto-link occurs in qa.8.

## Exact identity

Only canonical UUID equality is exact.

Names are evidence, never identity.

## High confidence

High-confidence requires a unique candidate with exact normalized name plus corroborating evidence such as profession, culture, location or structural context.

## Ambiguity

When multiple candidates score closely, Tome must expose ambiguity rather than choosing one.

## World / Compendium rule

World remains campaign truth.

Compendium entries are reference candidates.

World receives only a tie-break preference; it does not magically convert weak evidence into certainty.

## Privacy

Reconciliation consumes the already user-filtered Discovery snapshot.

It must never reach behind Discovery to inspect hidden World/system data directly.

## Future step

A later acquisition/Auto-Build contract may consume reconciliation proposals.

That later layer must still preserve the acquisition order:

```text
existing World
→ Compendium reference/import
→ create new
```

qa.8 never performs those actions.


## Semantic-only entities

A semantic entity is not automatically a missing Foundry document.

Some systems intentionally model people, contacts, factions, clues or other campaign concepts without materializing them as Foundry documents.

Such entities use:

- `state: semantic-only`
- a stable semantic key
- adapter-declared representation metadata
- an optional materialization policy

Reconciliation may still propose an existing World/Compendium match, but absence of a canonical document is not itself an error.

Tome may project semantic-only entities into its own campaign presentation without claiming Foundry/system authority.
