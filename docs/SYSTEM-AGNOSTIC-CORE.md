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

## Foundry 13 and 14 compatibility test plan

Foundry 13.351 is the existing baseline. The following matrix is planned work. Record the exact Foundry and system builds and the result of each live run before marking a combination verified.

| System | Foundry 13.351 | Foundry 14 | Test focus |
| --- | --- | --- | --- |
| D&D 5e | 5.3.3 | Compatible 6.x release | First independent reference. Sheets, token artwork, drag-and-drop, item containers and shared storage. [Foundry package](https://foundryvtt.com/packages/dnd5e) |
| Pathfinder 2e | 7.12.2 | Compatible 8.x release | Different inventories and sheet layouts. Check item stacks, carried equipment and shared storage. [Foundry package](https://foundryvtt.com/packages/pf2e) |
| Workspace Genesys | Compatible development build | When the system runs on v14 | Check the Tome workflows the development build supports. Record missing or unfinished system features separately from Tome regressions. |
| Realm Guard | Existing reference build | When the system runs on v14 | Preserve integrated portrait controls, Inventory & Gear, map actions and the hosted GM Dock. |

Use a small isolated world per combination with a GM, a player, a PC, an NPC, storage and a scene. Start with Tome's generic paths in D&D 5e and Pathfinder 2e. Use the same checks on both Foundry versions.

1. Open Tome, Group, a character profile and the native sheet. Save portrait and token artwork, then check Home, Group, the Actor directory and a placed token after reloading.
2. Move a quantity-bearing item from a character to storage and back. Check quantity, source removal, destination placement and the player permissions on both inventories. Verify the system's normal inventory controls still work.
3. Place a map marker, link a scene, set a waypoint and test scene navigation and private notes with both accounts. Check that the player sees the published route and permitted scenes while the GM retains editing and private controls.
4. Run Quick NPC and scene import through Tome's own entry points. Test the standalone GM Dock and check that the scene tools remain GM-only.

Test campaign migration separately. Start with a transfer between two D&D worlds using the same system build and Foundry version. Check actors, embedded items, journals, scenes, UUID links, ownership and portable media. Then test a Foundry 13 to 14 transfer with compatible system builds. TAF to Realm Guard remains a dedicated conversion.

## Candidates from the Realm Guard review

These are proposals from the source review. The review has not changed feature ownership.

| Candidate | Proposed ownership |
| --- | --- |
| Session break | Consider a Tome-owned timer in GM Dock and the map menu. GM starts, extends or closes the break. Players can mark themselves as back. Use generic Foundry users and optional character artwork. |
| Quick map operations | Consider moving and resizing selected markers, with an optional scene-wide resize. Build on existing Foundry notes and Tome's marker tools. Provide one Tome menu route with an optional system host. |
| Session wrap-up | Extend Tome's existing Post-Session Assistant with a single route from the current session to recap, open quests, travel history and selected player-visible updates. Realm Guard owns Fate, Persona and other rules-specific awards. |
| Waypoint encounters | Extend the existing event and linked-scene flow with an optional GM action to open a prepared encounter or create a Foundry combat from chosen tokens. Systems retain their initiative, conditions and conflict phases. |

Realm Guard's NPC catalog, dice and resource mechanics, obstacle rules, conflict engine and progression belong to the system. Tome can expose optional adapter actions when a GM needs them in a campaign workflow.

## Dice presentation in development

Tome reads already evaluated Foundry rolls. The author stamps the chat document with a shared start time and one reveal time per die. Each client computes its own movement and collisions with visible tokens. The original chat result is restored after the last reveal. The GM can switch to **Immediate result**, and players can independently turn off map animation, sound or token reactions.

The first renderer uses a numbered D6 cube with dark steel, bone and marble materials. Other numeric rolls can use a simplified silhouette. A system can register a resolver using `game.modules.get("adventurers-tome")?.api?.diceTable?.registerPreset(game.system.id, resolver)`. The resolver receives `{kind, faces, value, discarded}` and can supply `label`, `color`, `ink`, `lockColor` and `lockInk` for symbol dice.

For a public custom chat card, call `prepareChatStage(rollOrDice)` before creating or updating the chat message. Pass the returned value under `flags["adventurers-tome"][api.flag]` in the same write as the card content. Each stage contains only the dice being presented at that step. Use the normal card if the API returns null. Native private rolls use Foundry's visibility checks. Custom private cards use their system's normal display in this build.

Add `data-at-dice-stage="<stage key>"` to the part of the card that contains the new dice. Tome reveals those dice within that section while earlier results remain visible. Await `waitForStage(stage)` before publishing a follow-up choice, replacing the card, or announcing the final outcome. This wait uses the shared reveal time even on clients that have disabled map animation.

An adapter can use `isStageActive(message, stageKey)` during rendering to withhold a custom outcome until its reveal. Realm Guard uses it to show both already evaluated pools on the same card for a deferred Versus tiebreaker.

Numeric systems can roll a mixed pool with the dice button beside the chat input. A system may use `registerDicePool(game.system.id, {dice, roll})` to supply its own choices. Each choice has a unique `id`, a `label` and optional display `symbol`. Tome calls `roll` with a list of `{id, count}` entries. The system evaluates its own rules and controls visibility when publishing the result.

Use the `adventurersTomeDieSettled` and `adventurersTomeDiceComplete` client hooks for custom presentation. Planned Realm Guard touchpoints are the base roll, new dice rolled by Wise or Fate, and the response in Versus. Realm Guard keeps its rules and card content.
