# Session / Quest Semantic Mention Discovery Contract

**Contract:** `adventurers-tome-semantic-mention-discovery`  
**Version:** 1  
**Introduced:** v1.7.0-qa.2  
**Status:** QA / READ-ONLY DISCOVERY

## Purpose

This layer scans readable Session and Quest Journal text and produces viewer-scoped mention evidence without mutating Campaign Links.

It sits on top of the verified v1.7.0-qa.1 identity resolver.

Pipeline:

```text
readable Session / Quest source
        ↓
viewer-safe text extraction
        ↓
explicit Foundry refs + exact prose-name mentions
        ↓
MentionCandidate
        ↓
qa.1 conservative identity resolver
        ↓
read-only mention snapshot
```

## Source scope

qa.2 scans only:

- Sessions
- Quests

and only readable JournalEntry text pages.

Other World/Lore sources remain future expansion.

## Discovery classes

### Explicit Foundry link

Supported source syntax includes:

- `@UUID[...]`
- `@Actor[...]`
- `@Item[...]`
- `@JournalEntry[...]`
- `@Scene[...]`

An explicit ref may resolve canonically only when the target exists in the current viewer's Campaign Discovery snapshot.

### Prose-name mention

Plain prose is matched conservatively against exact visible entity display names.

A prose name is evidence only. It is passed into the qa.1 resolver and therefore cannot auto-link from display name alone.

Same-name candidates remain ambiguous.

## Privacy — HARD LOCK

Scanning is viewer scoped at both ends:

1. source Journal/Page must be readable by the current viewer
2. secret HTML is removed for non-GMs
3. candidate targets come only from the current viewer's permission-filtered Campaign Discovery snapshot
4. explicit refs to unreadable targets are suppressed from the derived mention snapshot

A derived mention may never reveal more than the source and target evidence visible to the current viewer.

## Persistence boundary

qa.2 performs no campaign mutation.

- Campaign Link writes: OFF
- automatic persistence: OFF
- entity creation: OFF
- auto-merge: OFF
- Migration Workspace: OFF

The snapshot is runtime-derived and disposable.

## Public API

```js
game.modules.get("adventurers-tome").api.campaignMentionDiscovery
```

Methods:

- `scan(options)`
- `snapshot()`
- `mentionsForSource(uuid)`
- `audit()`

## Forward path

After qa.2 is verified, the next Campaign Links step may introduce a review/persistence layer that distinguishes:

- deterministic canonical links
- GM-confirmed links
- ignored false positives
- explicit manual enrichment

Manual linking remains override/enrichment, not the default campaign-maintenance workflow.
