# Adventurer's Tome — Import Formats v2

Adventurer's Tome Import 2.0 uses a preview-first workflow for Sessions, Quests, World entries, and explicit campaign cross-links.

Nothing is written to Foundry until the GM approves the dry-run preview.

## Session Log Markdown

```markdown
# Session 2 — The Missing Cartographer

## Summary
The party followed the lost survey trail into Blackroot Forest and met Tovin Ash.

## Important Events
- The party reached Blackroot Forest.
- Tovin Ash revealed an unmarked road.
- A damaged survey marker was recovered.

## Quest Updates
- Find the Missing Cartographer | Active
- Whispers Beneath Greyhaven | Active

## NPCs
- Tovin Ash

## Locations
- Blackroot Forest

## Characters
- Kael Rowan
```

The importer creates or updates the Session Journal and previews explicit links to matching Quests, World entries, and Actors.

Names listed below structured World headings such as `NPCs`, `Locations`, `Factions`, `Items`, or `Lore` are checked against the existing World archive. If a named World entry does not exist, Import 2.0 proposes a small new World entry in the correct category. The GM can Create, Update, or Skip every proposed document.

## Quest Log Markdown

```markdown
# Quest Log

## Active
### Find the Missing Cartographer
The expedition trail continues into Blackroot Forest.

#### NPCs
- Tovin Ash

#### Locations
- Blackroot Forest

## Completed
### Secure the Broken Observatory
The ruined observatory is safe enough for study.
```

Recognized status groups include Active, Completed, Failed, and Dormant plus common Swedish equivalents such as Aktiva, Avslutade, Misslyckade, and Vilande.

## Tome Package JSON v2

Tome Package v2 can move a complete post-session update in one reviewed transaction: Sessions, Quests, World profiles, and explicit cross-links.

```json
{
  "schema": "adventurers-tome.import",
  "version": 2,
  "session": {
    "number": 2,
    "title": "The Missing Cartographer",
    "summary": "The party follows the lost expedition into Blackroot Forest.",
    "highlights": [
      "A damaged survey marker is recovered",
      "Tovin Ash reveals an unmarked road"
    ],
    "links": {
      "quests": ["Find the Missing Cartographer", "Whispers Beneath Greyhaven"],
      "world": ["Tovin Ash", "Blackroot Forest"],
      "actors": ["Kael Rowan"]
    }
  },
  "quests": [
    {
      "name": "Find the Missing Cartographer",
      "status": "active",
      "summary": "The expedition trail continues east.",
      "links": {
        "sessions": [2],
        "npcs": ["Tovin Ash"],
        "locations": ["Blackroot Forest"]
      }
    }
  ],
  "world": {
    "npcs": [
      {
        "name": "Tovin Ash",
        "subtitle": "Blackroot guide",
        "summary": "A hunter who knows paths omitted from official maps.",
        "facts": [
          { "label": "Region", "value": "Blackroot Forest" }
        ],
        "links": {
          "sessions": [2],
          "quests": ["Find the Missing Cartographer"]
        }
      }
    ],
    "locations": [
      {
        "name": "Blackroot Forest",
        "summary": "Ancient woodland east of Greyhaven.",
        "links": {
          "sessions": [2]
        }
      }
    ]
  }
}
```

`world` can contain `npcs`, `locations`, `factions`, `items`, and `lore`. A flat `world` array is also accepted when each entry supplies a `category`.

Each imported Session, Quest, or World item may use a `links` object. Supported link collections are:

- `sessions`
- `quests`
- `world`
- `actors` / `characters`
- category aliases inside links: `npcs`, `locations`, `factions`, `items`, `lore`

`relations` may be used as an alias for the same link object. These are campaign cross-links, not game-system relationship mechanics.

## Link preview

Import 2.0 resolves links before applying the import and shows them in a dedicated **Cross-link Preview**.

A target may be:

- another item included in the same import package;
- an existing Tome Session, Quest, or World Journal;
- an existing Foundry Actor, matched by exact name.

Resolved links default to **Apply link**. Unresolved links are shown clearly and default to **Skip**. No Actor is created automatically by the importer.

Applied links are stored in the system-agnostic Tome flag:

```js
flags.adventurers-tome.links = {
  sessions: [],
  quests: [],
  world: [],
  actors: []
};
```

## Create / Update / Skip

Existing Sessions are matched by exact name and then Session number. Quests and World entries are matched by exact name. The GM decides individually whether each detected document is created, updated, or skipped.

New Tome Journals use Foundry **Observer** ownership by default so players can read them. Updates preserve the existing Journal's permissions.

## One-level undo

Every applied import is one transaction. Until another import is applied, **Undo Last Import** can:

- delete Journals created by that import;
- restore Tome-managed flags on updated Journals and linked Actors;
- restore imported text on updated Journals;
- restore World profile images changed by the import;
- remove explicit cross-links added by the transaction.

Undo intentionally applies only to the latest import transaction. It is a safety net for import mistakes, not a general version-control system.

## System-agnostic boundary

Import formats describe campaign information only. They do not depend on `actor.system.*` and do not assume any game-system schema.
