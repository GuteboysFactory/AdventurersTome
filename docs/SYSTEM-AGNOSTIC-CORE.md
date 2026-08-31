# Adventurer's Tome — System-Agnostic Core Contract

## Allowed in Core

- Foundry `Actor`, `JournalEntry`, `JournalEntryPage`, `Folder`, `User`, and settings/flags APIs.
- Generic document properties such as id, name, img, ownership, visibility, and sheet rendering.
- Tome-owned data under `flags.adventurers-tome.*`.
- World-level presentation settings owned by the module.

## Forbidden in Core

- Direct reads or writes to `actor.system.*`.
- Assumptions about classes, levels, cultures, ancestries, skills, HP, inventory schema, or other system-specific fields.
- Requiring a specific Foundry game system in `module.json`.

## Optional integrations

If system integrations are added later, keep them behind adapters outside Core. Core must continue working when no integration is installed or enabled.

## Permission boundary

Tome permissions remain system-agnostic. Core respects Foundry ownership/visibility first, then applies Tome-owned access metadata. Tome never uses its own flags to grant access that Foundry denies.

## Health / repair boundary

Health Check may inspect and repair only generic Foundry references and Adventurer's Tome-owned settings/flags. It does not delete campaign Actors/Journals and does not inspect or mutate game-system fields.
