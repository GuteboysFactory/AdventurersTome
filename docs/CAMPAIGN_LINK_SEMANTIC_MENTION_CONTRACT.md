# Campaign Links / Semantic Mention Discovery Contract

**Contract:** `adventurers-tome-campaign-link-semantic-mentions`  
**Version:** 1  
**Introduced:** v1.7.0-qa.1  
**Status:** QA FOUNDATION / READ-ONLY

## Purpose

This contract defines how prose mentions in Sessions and Quests can later become safe Campaign Links to canonical Tome/Foundry campaign entities.

The first implementation deliberately separates **mention identity resolution** from **text scanning**. v1.7.0-qa.1 does not crawl Journal text and does not mutate campaign links. It establishes the candidate and resolver contract first so later discovery cannot fall back to unsafe name-based linking.

## Supported target families

The resolver is prepared for:

- Characters
- NPCs / Contacts
- Locations
- Factions
- Items
- Lore
- Quests
- Sessions

Tome Core stays system-agnostic. Systems/adapters may enrich semantic or external identities, but no reference system becomes a Core dependency.

## MentionCandidate

A normalized mention candidate contains:

```text
id
text
normalizedText
kindHint
source
  uuid
  documentName
  pageUuid
  path
  start
  end
explicit
  canonicalUuid
  semanticKeys[]
  externalIdentities[]
context
  attributes{}
  relatedUuids[]
  relatedEntityKeys[]
provenance[]
visibility
```

A candidate is evidence, not an entity.

## Identity priority — HARD LOCK

Resolution order is conservative:

1. canonical Foundry UUID
2. stable semantic identity
3. stable external/import identity
4. corroborating contextual evidence
5. display name only as supporting evidence

**Display name alone must never auto-link or merge campaign entities.**

Two separate entities named `Gunther` remain two identities unless stronger evidence proves otherwise.

## Resolution outcomes

The resolver may return:

- `resolved-canonical`
- `resolved-semantic`
- `resolved-external`
- `resolved-corroborated`
- `review`
- `ambiguous`
- `unresolved`
- `unavailable`

Only the first four may be `autoLinkEligible=true`.

### Corroborated resolution

Contextual auto-linking requires multiple independent corroborating signals. In v1 the threshold is two context signals, for example:

- matching Location + Profession
- matching Faction + Role
- explicit related semantic identity + matching type

Name match is never counted as sufficient identity by itself.

## GM review

Uncertain conclusions are review decisions, not silent links:

```text
Confirm link
Keep separate
Ignore
```

Manual linking remains an override/enrichment workflow. It is not intended to become the normal method for maintaining Campaign Links.

## Privacy

Resolution operates only against the current viewer's permission-filtered Campaign Discovery snapshot.

Permanent rule:

> A derived link may never be more visible than the evidence available to the current viewer supports.

A hidden entity, relation, or source must not leak through:

- candidate counts
- labels
- badges
- Campaign Links
- Search
- graph edges
- review prompts

The existence of hidden evidence is itself protected information.

## v1.7.0-qa.1 boundary

This build is intentionally:

- read-only
- text scanning OFF
- automatic persistence OFF
- Campaign Link mutation OFF
- Migration Workspace OFF

It exposes:

```js
game.modules.get("adventurers-tome").api.campaignMentions
```

with:

- `createCandidate(raw)`
- `resolve(candidate)`
- `audit()`

The next QA step may add permission-safe Session/Quest text extraction and mention discovery on top of this locked identity contract.
