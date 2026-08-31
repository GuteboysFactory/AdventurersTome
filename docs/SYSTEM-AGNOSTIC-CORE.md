# Adventurer's Tome — System-Agnostic Core Contract

## Allowed in Core

- Foundry `Actor`, `JournalEntry`, `JournalEntryPage`, `Folder`, `User`, and settings/flags APIs.
- Generic document properties such as id, name, img, ownership, visibility, and sheet rendering.
- Tome-owned data under `flags.adventurers-tome.*`.
- World-level presentation settings owned by the module.

## Forbidden in Core

- Direct reads or writes to `actor.system.*`.
- Assumptions about classes, levels, cultures, ancestries, skills, HP, Hope, Endurance, inventory schema, or any other system-specific fields.
- Requiring a specific Foundry game system in `module.json`.

## Optional integrations

If system integrations are added later, keep them behind adapters, for example:

```text
scripts/
  core/
  integrations/
    tor2e.js
    dnd5e.js
    dragonbane.js
```

Core must continue working when no integration is installed or enabled.
## Tome character profiles

Character presentation belongs to Tome-owned Actor flags, not the game system schema. Current profile fields are:

- title and subtitle
- short summary and biography
- optional Tome-specific hero image
- label/value facts
- Actor relationships containing only a generic Actor ID, Tome relation label, and note

Opening the real Actor sheet is supported, but Core never reads its system-specific fields.


## World profile boundary (v0.4.0)

World presentation data is stored on generic `JournalEntry` flags under `flags.adventurers-tome.worldProfile`. The Tome may categorize and present a Journal as NPC, Location, Faction, Item, or Lore, but it does not depend on any game-system schema and does not overwrite the Journal's own pages.


## Demo data generator

The optional demo generator follows the same Core boundary. It discovers a valid Actor subtype exposed by the active game system and creates otherwise minimal Actor documents. All campaign presentation data remains in `flags.adventurers-tome.*`; the generator does not inspect or populate `actor.system.*`. Demo documents are isolated with `flags.adventurers-tome.demo = true` so they can be removed safely.

## Session / Quest importer boundary (v0.6.0)

The Tome Importer operates only on generic `JournalEntry`, `JournalEntryPage`, folders, world settings, and Tome-owned flags. Markdown/text/JSON parsing never depends on a game system. Imported Sessions and Quests are therefore portable between systems, and no import operation may inspect or modify `actor.system.*`.

## v0.12 Campaign configuration boundary

Theme presets, campaign logos, Home layout, navigation visibility, section backgrounds, Group presentation options, and content fallbacks are all stored as Adventurer's Tome world settings. They do not read from or write to a game system schema. Group membership/order remains Tome-owned Actor flag metadata, and the Core still never reads or writes `actor.system.*`.

## Permission layer (v0.13)

Adventurer's Tome permissions remain system-agnostic. Core first respects Foundry's generic `Document.visible` / ownership boundary and only then applies Tome-owned access metadata from `flags.adventurers-tome.access`:

- `visibility: "inherit" | "gm"`
- `discovered: boolean`
- `gmNotes: string`

Tome never uses these flags to grant access that Foundry denies. Player/GM visibility on Tome profile facts and relations is presentation metadata and is not a substitute for Foundry ownership when material must be kept as a hard secret.

## v0.14 Health and repair boundary

The v0.14 Tome Health Check may inspect and repair only generic Foundry references and Adventurer's Tome-owned settings/flags. Safe repair can remove stale client Favorites/Recents, broken Tome cross-link IDs, deleted Actor relation targets, missing First Appeared Session references, and malformed Tome-owned metadata. It does not delete campaign Actors/Journals and does not inspect or mutate game-system fields.
