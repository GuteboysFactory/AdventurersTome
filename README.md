# Adventurer's Tome v1.0.0

**Adventurer's Tome** is a system-agnostic campaign workspace and living campaign archive for Foundry VTT.

> Foundry is the game table. Adventurer's Tome is the campaign's memory and heart.

The 1.0 line is verified on **Foundry VTT 13.351**. Foundry V14 compatibility is planned for the 1.0.x hardening track.

## What Adventurer's Tome does

Adventurer's Tome presents campaign information through a responsive, themed interface while keeping Foundry Documents as the underlying source of truth.

Core features include:

- Home Builder with Dashboard, Minimal, and Custom layouts.
- Session chronicle and Tome-native Quest detail pages.
- System-independent Group and character profiles.
- World profiles for NPCs, Locations, Factions, Items, and Lore.
- Journal-backed, Tome-rendered World and Rules content.
- Multi-page World Journals with Text, Image, Video, and PDF page support.
- Direct click-to-edit World content for GMs and selected Tome World Editors.
- Search, Favorites, Recently Viewed, cross-links, and backlinks.
- Universal selected-text sharing to Foundry chat with Public and Whisper delivery.
- Player-safe current-entry snapshots without granting access to the original source Journal.
- Private per-GM Notebook, Scratchpad, Quick Capture, Reveal Queue, Next Session Dashboard, and Post-Session Assistant.
- Import 2.0, Export, Undo Last Import, and Tome Health Check.
- Permission and discovery controls layered on top of Foundry ownership.
- Original system-independent Ashen Road demo campaign for testing.

## System-agnostic Core

Adventurer's Tome Core deliberately does **not** depend on `actor.system.*`.

It works through generic Foundry Documents and Tome-owned metadata:

- `Actor`
- `JournalEntry`
- `JournalEntryPage`
- Foundry ownership and user permissions
- `flags.adventurers-tome.*`

This allows the same Tome Core to work across very different game systems. Optional system-specific adapters may extend the experience later without changing the Core contract.

## World: Journal-backed, Tome-rendered

World entries are backed by Foundry Journals while Adventurer's Tome owns the campaign-facing presentation.

A World Journal can contain ordered Text, Image, Video, and PDF pages. Tome preserves page order, renders supported media inside the World view, and leaves unsupported custom Journal page types intact rather than attempting to reinterpret or overwrite them.

GMs can manage Journal pages from Tome. Player-facing World text can also be edited directly by clicking the content instead of entering a separate edit mode.

### Tome World Editors

A GM can grant a specific player **World Editor** access for an individual World entry from Tome Permissions.

A World Editor can edit player-facing World content but does not gain access to Tome GM Notes, the private GM Notebook, or other GM-only Tome workspace data.

Foundry requires document write permission for client-side edits, so Tome uses Foundry ownership on the linked Journal as the technical write boundary while keeping GM-private Tome data separate.

## Rules

Rules can be created in Tome or linked to existing Foundry Journals.

Journal Pages are presented as an ordered Rule reference with Tome navigation, headings, rich text, tables, links, and images. Existing Journals are linked rather than duplicated.

## Sharing to Foundry chat

Readable Tome content supports native text selection.

Select text and use:

- **Public** to post the excerpt to normal Foundry chat.
- **Whisper…** to choose one or more users.

Tome can also publish a player-safe snapshot of the currently open Session, Quest, Character, World entry, or Rule. GM-only notes, GM-only facts, secrets, and Tome controls are removed from the snapshot.

## Privacy and permissions

Foundry ownership remains the document-access boundary. Tome can restrict or organize content further through discovery and visibility controls.

GM Notes and other GM-private workspace data are stored in a per-GM private Tome vault rather than exposed through player-facing document flags.

The Full GM Archive can contain unrevealed secrets and private notes. Keep it private.

## Installation

Use the stable manifest:

`https://github.com/GuteboysFactory/AdventurersTome/releases/download/1.0.0/module.json`

Or install manually:

1. Download `adventurers-tome.zip` from the v1.0.0 GitHub release.
2. Extract/install the module into Foundry's module data directory.
3. Start Foundry VTT 13.351.
4. Enable **Adventurer's Tome** under Manage Modules.
5. Open Tome from its movable Foundry launcher.
6. As GM, open Campaign Settings and use **Create / Verify Folders** if you want Tome to prepare the recommended Journal structure.

Recommended Journal structure:

- Adventurer's Tome / Sessions
- Adventurer's Tome / Quests
- Adventurer's Tome / World
- Adventurer's Tome / Rules

Existing Journals can also be imported/linked from inside Tome.

## v1.0 validation

The v1.0 release line passed the project's final release gates on Foundry VTT 13.351, including:

- clean/new-world testing in a separate Genesys development world;
- cross-system system-agnostic behavior checks;
- GM/player permission testing;
- World Journal rendering and editing;
- Rules and chat sharing;
- private GM workspace checks;
- upgrade testing from the established v0.20.8 line with campaign data preserved and no Tome errors observed.

## Roadmap

The post-1.0 roadmap continues toward a deeper campaign-memory layer:

- v1.0.x — Foundry V14 compatibility and core hardening
- v1.1 — Player Chronicle
- v1.2 — NPC & Faction Intelligence
- v1.3 — Session Command Center 2.0
- v1.4 — Living Campaign Timeline
- v1.5 — World Atlas & Location Intelligence
- v1.6 — Secrets, Clues & Rumours
- v1.7 — Relationship Web & Campaign Connections
- v1.8 — Campaign Templates & Feature Profiles
- v1.9 — Integration API, Hooks & Adapters
- v2.0 — Campaign Brain

See `ROADMAP.md` for the full plan.

## License

Adventurer's Tome is **proprietary software — All Rights Reserved**.

The public repository is available for transparency, testing, compatibility work, issue reporting, and community review. Public source visibility does not make the project open source and does not grant redistribution or derivative-work rights beyond the permissions stated in `LICENSE`.

Copyright (c) 2026 Per / GuteboysFactory.
