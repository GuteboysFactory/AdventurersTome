# Adventurer's Tome v1.0.0-rc.1

## v1.0.0-rc.1 — Release Candidate

Adventurer's Tome has entered the 1.0 release-candidate phase. This candidate is intentionally based on the live-approved v0.20.8 Stable Window Rollback and does **not** add new runtime features. The goal is to freeze behavior, run a full Foundry VTT 13.351 regression, and promote the same code line to v1.0.0 if no release-blocking defects are found.

Release-candidate focus:

- verify clean install and upgrade from the established v0.20.x test world
- verify GM/player permissions, discovery, World → Journal synchronization, Rules/chat sharing, and Show to Players
- verify Sessions, Quests, Group, World, Rules, Search, Import/Export, Health Check, and the private GM workspace
- verify client-scoped Glass UI/launcher state and user-scoped GM-private data remain isolated correctly
- ship only the original neutral public assets; the legacy private `assets/Bree.webp` compatibility asset is excluded from the public candidate package
- keep the experimental minimize/dock idea parked for a post-1.0 redesign

Public GitHub publication still requires the final repository metadata, software-license decision, and a clean install from the hosted RC manifest.


## v0.20.8 Stable Window Rollback

The experimental minimize/restore feature has been retired from the live Tome window. The header now keeps the proven Transparency control and Foundry Close control only. Closing Tome and reopening it from the movable per-user launcher is the supported compact workflow. The launcher, 90% scene glass, saved normal window geometry, and GM Workspace Builder are unchanged. The minimize/dock idea is parked for a future redesign rather than continuing to manipulate ApplicationV2 geometry.


## v0.20.7 Right-Anchored Compact Bar Hotfix

The compact minimize bar now keeps Tome's right edge fixed. Clicking `_` collapses the window leftward, so the control does not jump away from the pointer. Restore expands the saved full-size Tome back leftward from the compact bar's current right edge.

## v0.20.6 Compact Bar Minimize Hotfix

Minimize now has only two states: the normal Tome window and a genuinely small compact bar. Clicking `_` stores the expanded Tome rectangle and shrinks the live window to a short bar with Transparency, Restore, and Close. Clicking Restore returns to the saved full size. The minimized bar can be moved without contaminating the saved full-size window geometry.

## v0.20.5 Geometry-Neutral Minimize Hotfix

The Tome minimize control now collapses the application visually without changing Foundry's underlying ApplicationV2 geometry. Repeated minimize/restore cycles therefore preserve the exact window size and position. The `_` button is the sole minimize/restore gesture; title-bar double-click is intentionally not used.


## v0.20.4 Window UX Polish

The movable launcher now follows the pointer using GPU/compositor transforms and saves only on release. Minimize/restore now preserves the expanded Tome geometry instead of allowing the collapsed title-strip size to contaminate the client's saved window state. Double-clicking the native title bar also toggles minimize/restore.




## v0.20.2 — Canvas Glass & Workspace Builder Hotfix

The header transparency control is now true **Foundry Scene glass**: at 25%, 50%, or 75%, the Foundry canvas behind the Tome is revealed through the application instead of only fading Tome artwork. Text and controls remain readable while large Tome page artwork is suppressed in glass mode.

GM Notebook layout editing is also hardened: visibility, width, and order changes save immediately; drag-and-drop is handle-based; and every visible Notebook window plus every Custom Notepad has explicit left/right movement controls as a reliable alternative to dragging.


## v0.20.0 — Custom GM Workspace

The GM Notebook is no longer a fixed page. Each GM user gets a private workspace layout that can be rebuilt without affecting other GMs:

- choose Standard, Session Prep, Writer's Desk, or Minimal presets
- show/hide Notebook sections
- move sections up/down
- choose half/full width
- keep Campaign Scratchpad, Quick Capture, Session Tools, Overview, and Notes Feed wherever you want them
- create named private Custom Notepads for any personal workflow

The in-app **? Manual** has also been rewritten as onboarding documentation for brand-new users, with five-minute setup, workflows, examples, permission guidance, and troubleshooting.


## GM Workspace & In-App Manual (v0.19)

The GM Notebook is now a private campaign workspace. A per-GM **Campaign Scratchpad** provides freeform preparation space, while embedded **Quick Capture** can create standalone structured notes with type, pin, trigger, target Session, and open/resolved state. Standalone notes are merged with document-attached GM Notes throughout Notebook filters, Next Session Dashboard, and Post-Session Assistant.

A persistent **Manual / Help** button is available in the top-right Tome toolbar for both players and GMs. The in-app manual is searchable, version-aware, and role-aware so player workflows remain concise while GM-only administration guidance appears only to GMs.

> **v0.17.3 privacy/UX note:** World-profile **Open Sheet** is GM-only. Player characters can still use the normal Group/Character flows permitted by the campaign, but World entries never expose a direct linked Actor-sheet shortcut to players.

A system-agnostic campaign landing page and living campaign archive for Foundry VTT 13.351.


## Home Builder (v0.18)

Adventurer's Tome now supports three landing-page styles without changing or deleting campaign content:

- **Dashboard** keeps the established Session, Quest, Group, and discovery dashboard.
- **Minimal** turns Home into an artwork-first campaign landing page with an optional Enter action.
- **Custom** enables widget sizing and composition for GMs who want to build their own Home layout.

Home widgets can be reordered, hidden, and sized, while hero composition, height, shading, and image focus are configurable in Campaign Settings. The existing Session/Quest dashboard concept remains the default. Animated hero media is intentionally reserved for a later release.

## v0.16.0 — Public Release Preparation

Adventurer's Tome now ships with a fully original, system-independent demo campaign called **The Ashen Road** and a new neutral fantasy default hero image. New installs no longer depend on any setting-specific demo names or artwork.

The legacy `assets/Bree.webp` file is retained only for upgrade compatibility with existing private worlds that already point their campaign background at that path. It is no longer the default and is not referenced by the demo generator. The public GitHub release build can exclude that legacy asset without changing Core functionality.

The Ashen Road demo includes original Sessions, Quests, player characters, NPCs, Locations, Factions, Items, Lore, rules, relations, and enough data to exercise Search, Permissions, Import/Export, GM Notebook, Health Check, and responsive layouts on an otherwise empty Foundry test world.

## v0.15.2 — v1.0 Readiness Hardening

This audit build fixes four release-critical boundaries found during the v1.0 readiness review: Foundry module sockets are now explicitly enabled in the manifest, player-facing Tome content requires **Observer** permission or better (LIMITED is no longer sufficient), GM Notes plus GM-only Facts/Relations are migrated out of shared Document flags into a V13 **per-GM user vault**, and Player-safe Export deliberately omits raw Journal page text and hidden cross-link targets.

Existing v0.15.1 private data is migrated automatically for the GM who loads the world. The migration writes the private vault first and only then removes legacy shared private fields. Health Check also detects and can repair remaining legacy-private records and stale private relation targets.

The live **Show to Players** path now has the manifest socket relay it requires and still checks Observer-or-better Foundry permission plus Tome visibility/discovery before a player client opens anything. Live multiplayer broadcast remains a recommended smoke test, but it is not required to use the rest of the module.

**Privacy scope:** the private vault is per Foundry GM user account. In a world with multiple GM accounts, each GM has a separate Notebook/Reveal Queue/import undo history. v1.0 will document this rather than silently sharing private notes through world settings.

## v0.15.1 — GM Live Session Tools

Adventurer's Tome now has a live GM command layer designed for use **during** and **immediately after** play, not only for campaign archiving. The private **Next Session Dashboard** gathers due/pinned GM Notes, active quests, clues, reveals, consequences, current-location context, Quick Capture inbox items, and the Reveal Queue into one briefing for the next planned Session.

**Quick Capture** is an always-available inbox for improvised names, clues, scene ideas, consequences, questions, or reminders. Captures become structured GM Notes and can attach to the Tome entry you are currently viewing or fall back to a private GM Inbox.

The new **Reveal Queue / Show to Players** flow is explicit and deliberate: normal GM clicks remain local, while queued Session/Quest/Character/World entries can be broadcast to non-GM clients with one click. Tome never bypasses Foundry ownership; GM-only entries must be made player-visible first.

The **Post-Session Assistant** turns the end of a game night into a short wrap-up workflow: review overdue notes, sort Quick Captures, inspect active quests, confirm the Session record, and optionally export a campaign checkpoint.

The v0.15 Exporter, structured GM Notebook, v0.14 Health Check, v0.13 permission layer, Import 2.0, and all system-agnostic design rules remain intact.

## Core design rule

**Adventurer's Tome Core never depends on a game system's schema.**

The module uses Foundry's generic Documents and permissions:

- `Actor.id`, `Actor.name`, `Actor.img`, ownership and Actor sheet launching.
- `JournalEntry` / `JournalEntryPage` for campaign content.
- Foundry world settings for campaign presentation.
- `flags.adventurers-tome.*` for Tome-owned metadata.

Core code deliberately does **not** read `actor.system.*`. Optional system integrations may be added later as separate adapters without changing Core.

## Current v0.16.0 features

- Full-screen themed Tome window with a bundled original neutral fantasy hero as the default background.
- Private **Next Session Dashboard** with due notes, active quests, clues/reveals/consequences, current-location context, and live-session shortcuts.
- **Quick Capture** with contextual attachment to the current Tome entry or a private GM Quick Capture Inbox.
- Persistent **Reveal Queue / Show to Players** with explicit module socket broadcast, Recently Shown memory, Observer-or-better Foundry permission checks, and Tome visibility safeguards.
- **Post-Session Assistant** with dynamic wrap-up checklist, overdue-note review, quest review reminder, inbox cleanup reminder, and export checkpoint shortcut.
- Structured GM Notebook with Prep, Secret, Reminder, Clue, Reveal, Consequence, Question, Idea, and Scene note types.
- Tome Exporter with Portable, conservative Player-safe, and private Full GM Archive modes. Portable packages exclude the per-GM private vault; Player-safe packages additionally omit raw Journal page text and hidden cross-link targets.
- Rebuilt GM **Campaign Settings dashboard** with separate Campaign Info, Appearance, Home Layout, Navigation, Group, Content Defaults, and Developer Tools panels.
- Four theme presets (**Tome / Dark / Parchment / Minimal**), optional campaign logo, Home hero picker, and optional per-section backgrounds.
- Home dashboard blocks can be shown/hidden and reordered; At-a-Glance, Campaign Sidebar, and Quick Links can be toggled independently.
- Top navigation visibility, default landing page, Group Home preview count/sorting, and fallback Quest/World metadata defaults are configurable without code edits.
- Home dashboard with campaign title, welcome text, current location, stats, latest session, active quests, group preview, and world discoveries.
- Polished Home summaries, a responsive 42/58 Session master/detail chronicle, status-grouped Quest cards, and Tome-native Quest detail pages.
- Conservative campaign cross-links and backlinks across Sessions, Quests, Group Actors, and World profiles (NPCs, Locations, Factions, Items, and Lore).
- Sessions, Quests, Group, World, Rules, Search, and GM Settings sections.
- Foundry-aware Tome permissions: player-facing detail content requires **Observer** permission or better, plus per-entry **Foundry access / GM only** and discovered/undiscovered state. Tome never elevates Foundry access.
- Privacy-hardened GM data: structured GM Notes and GM-only Character/World Facts/Relations live in a V13 **per-GM user vault**, not on player-visible Actor/Journal flags; v0.15.1 legacy records migrate automatically.
- GM **Tome Health Check** with safe repair for stale client references, broken/mismatched cross-links, deleted relation targets, malformed Tome-owned flags, and supported metadata normalization; duplicate Session numbers/names are surfaced as review-only warnings.
- Resilient image fallbacks, guarded import sizes, debounced document refresh hooks, keyboard focus-visible styling, and reduced-motion support for production hardening.
- **Import 2.0** for Session Logs, Quest Logs, World entries, and Tome Package v2 JSON with local file selection, drag-and-drop, direct paste, dry-run document preview, Create / Update / Skip decisions, and explicit cross-link preview.
- Structured NPC/Location/Faction/Item/Lore sections can propose new World entries when referenced campaign entities do not yet exist.
- Import History records document/link counts and the latest applied transaction can be rolled back with **Undo Last Import**.
- GM-selectable Group members from existing Foundry Actors.
- Group membership is now stored as Tome-owned Actor flags (`flags.adventurers-tome.groupMember`) with backwards compatibility for v0.1.0 worlds.
- Clicking a Group member opens a Tome-native character profile; the real Actor sheet remains available from the profile and Group card.
- Built-in GM editor for Tome character profiles: title, subtitle, summary, biography, separate hero image, facts, and relations.
- Character cards use Tome profile data when present and fall back to generic Foundry Actor data. Relations can link to any visible Actor without reading game-system fields.
- GM can swap the landing background with Foundry's file picker or restore the bundled Tome default.
- Recommended Journal folder structure can be created from Campaign Settings.
- Journals placed under Sessions, Quests, World, or Rules are automatically surfaced in the corresponding Tome pages.
- Full Tome Search index with category filters, richer result cards, per-user Favorites, Recently Viewed items, breadcrumbs, internal Back navigation, and a `/` search shortcut.
- Floating Tome launcher button in the Foundry UI.
- Public API:
  - `game.modules.get("adventurers-tome").api.open()`
  - `game.modules.get("adventurers-tome").api.getGroup()`
  - `game.modules.get("adventurers-tome").api.getActorProfile(actorId)`
  - `game.modules.get("adventurers-tome").api.setActorProfile(actorId, profile)`
  - `game.modules.get("adventurers-tome").api.getAccess(document)`
  - `game.modules.get("adventurers-tome").api.setAccess(document, access)`
  - `game.modules.get("adventurers-tome").api.canView(document)`
  - `game.modules.get("adventurers-tome").api.generateDemo("small" | "full")`
  - `game.modules.get("adventurers-tome").api.removeDemo()`
  - `game.modules.get("adventurers-tome").api.getDemoSummary()`
  - `game.modules.get("adventurers-tome").api.previewImport({ text, mode, sourceName })`
  - `game.modules.get("adventurers-tome").api.applyImport(preview, selections, linkSelections)`
  - `game.modules.get("adventurers-tome").api.undoLastImport()`
  - `game.modules.get("adventurers-tome").api.getImportHistory()`
  - `game.modules.get("adventurers-tome").api.healthCheck({ repair: false | true })`
  - `game.modules.get("adventurers-tome").api.getFavorites()`
  - `game.modules.get("adventurers-tome").api.getRecentItems()`
  - `game.modules.get("adventurers-tome").api.getRevealQueue()`
  - `game.modules.get("adventurers-tome").api.queueReveal(refKey)`
  - `game.modules.get("adventurers-tome").api.quickCaptureInbox()`

## v1.0 release status

The codebase is **release-candidate ready after the v0.15.x hardening cycle and the v0.16.0 public-clean pass in Foundry 13.351**. Runtime features already tested by the project include responsive UI, demo generation/removal, Session/Quest import and undo, cross-links, Search, Permissions from a player account, and Health Check safe repair.

Before a **public** v1.0 distribution, hosting/update URLs and a software license still need to be chosen. The default artwork and The Ashen Road demo in v0.16.0 are original release assets intended for public distribution.

The one intentionally unverified runtime path is live multiplayer **Show to Players**. v0.15.2 fixes the missing socket-manifest prerequisite discovered by the audit, but the project has chosen to defer a two-client broadcast test unless it causes trouble in actual use.

## Installation for local testing

1. Shut down or return to Setup before changing module files.
2. Extract the `adventurers-tome` folder into your Foundry User Data `Data/modules/` directory.
3. Start Foundry VTT 13.351.
4. Open your World, enable **Adventurer's Tome** under Manage Modules, and reload if requested.
5. Click the **Adventurer's Tome** button near the lower-left edge of the Foundry interface.
6. As GM, open the cog to configure Campaign Info, Appearance, Home Layout, Navigation, Group members, Content Defaults, and Developer Tools, then save.
7. Click **Create / Verify Folders** to create:
   - Adventurer's Tome / Sessions
   - Adventurer's Tome / Quests
   - Adventurer's Tome / World
   - Adventurer's Tome / Rules
8. Move or create Journal Entries in those folders. The Tome will surface them automatically.

## Tome-owned Actor profile data

The profile structure is intentionally independent of the active game system:

```js
await actor.setFlag("adventurers-tome", "profile", {
  title: "Ranger of the North",
  subtitle: "Dúnedain",
  summary: "A guarded wanderer with old loyalties and unfinished business.",
  biography: "...",
  heroImage: "worlds/my-world/images/arantor.webp",
  facts: [],
  relations: []
});
```

v0.3.0 includes a GM-facing editor for these fields directly inside the Tome. Relation records store only generic Actor IDs plus Tome-owned labels/notes.

## Quest metadata

A Quest Journal may use Tome flags for richer state:

- `flags.adventurers-tome.type = "quests"`
- `flags.adventurers-tome.status = "active"`
- `flags.adventurers-tome.featured = true`

Folder placement is enough for normal use.

## Import 2.0

The GM can open **Tome Importer** from Sessions, Quests, Home quick links, or Campaign Settings.

Supported input now includes:

- Markdown/text Session Logs.
- Markdown/text Quest Logs with Active / Completed / Failed / Dormant status sections in English or Swedish.
- Structured Session/Quest sections for NPCs, Locations, Factions, Items, Lore, Characters, and Quest Updates.
- **Tome Package v2 JSON** containing Sessions, Quests, World profiles, facts, images, and cross-links in one transaction.

The importer always builds a dry-run preview before writing Foundry data. Documents receive individual **Create new / Update existing / Skip** decisions. Resolved cross-links receive independent **Apply link / Skip** decisions.

Existing Sessions are matched by exact name and then Session number. Quests and World entries are matched by exact name. Existing Actor targets are matched by exact Actor name; the importer never creates Actors automatically.

Newly created Tome Journals use Foundry **Observer** ownership by default. Updating an existing Journal preserves its permissions. Explicit campaign links are stored in `flags.adventurers-tome.links`.

The most recent applied import can be reverted with **Undo Last Import** until another import is applied. The rollback deletes Journals created by that transaction and restores Tome-managed flags, imported text, World images, and explicit links modified on existing Journals/Actors.

See `docs/IMPORT-FORMATS.md` for the v2 schema and examples.


## Roadmap

- v0.10 Search & Navigation polish. **Complete.**
- v0.11 Import 2.0. **Complete.**
- v0.12 GM / Campaign configuration. **Complete.**
- v0.13 Permissions. **Complete.**
- v0.14 Polish & hardening. **Complete.**
- v0.16 Public release preparation. **Complete.**
- v1.0 Adventurer's Tome. **Next: release candidate / GitHub distribution smoke test.**

Core remains system-agnostic; optional system adapters stay separate from Core.


## Search, Favorites, and navigation

Search is a Tome-wide index rather than a simple text filter. Users can filter by content type, star frequently used entries, and return to recently opened content. Favorites and recent history are stored with Foundry `scope: "client"`, so every player has their own navigation state.

Quest, Character, and World detail views include breadcrumbs and a Tome-native Back button. Cross-link browsing records a short in-memory navigation history for the current Tome window. Press `/` while not typing in another field to jump directly to Search.

## Responsive UI

Adventurer's Tome v0.6.0 sizes itself from the current user's available Foundry/browser viewport and stores the resulting width, height, and position in a **client-scoped** Foundry setting. This means each player can resize and position the Tome independently.

The interface also adapts to the actual Tome window size. Wide windows use the full sidebar + four-card dashboard, while smaller windows progressively collapse navigation labels, hide the Home sidebar, move cards into two or one column, and simplify the At-a-Glance panel.

Saved positions are constrained to the current viewport when reopened, so a layout saved on a large display will not become inaccessible on a smaller monitor.


## Portrait hotfix retained from 0.2.2

Foundry's global button styling can impose a fixed control height on button elements. Group portrait buttons now explicitly opt out of that height and use a responsive 4:5 image frame, so full character portraits remain visible on the Group page.


## v0.4.0 World profiles

World Journals can now be presented inside Adventurer's Tome as categorized NPC, Location, Faction, Item, or Lore profiles. Tome presentation data is stored in module flags and does not replace or rewrite the Journal itself.


## Demo / Developer Tools

Campaign Settings now contains a removable test-data generator for development worlds.

- **Small Ashen Road Demo** creates a compact original dataset for quick visual/function testing.
- **Full Ashen Road Demo** creates a larger original stress-test archive with 14 sessions, party Actors, relation NPC Actors, quests, locations, factions, items, lore, and rules.
- All generated documents carry `flags.adventurers-tome.demo = true`.
- **Remove Demo Campaign** deletes only those flagged documents/folders and restores the presentation settings that existed before the demo was generated.
- Demo Actors use a valid Actor type exposed by the active game system, but the Tome Core never reads or writes `actor.system.*`.
- The bundled demo portrait/card SVGs and The Ashen Road dataset are original test material designed for system-independent public distribution.

This tool is intended to make it possible to test Adventurer's Tome on a nearly empty Foundry test server without copying a live campaign.

## Session Chronicle

The Sessions page uses a responsive master/detail layout on wider Tome windows. Selecting a Session keeps the campaign timeline visible while showing a Tome-native preview with its summary, highlights, conservative Quest/World cross-links, and a button to open the complete Foundry Journal. On narrow windows the same preview stacks above the timeline automatically.

Cross-links are intentionally conservative: structured Session headings such as `Quest Updates`, `NPCs`, `Locations`, and similar sections are preferred, while older free-form Session prose only links documents whose full names are actually mentioned. No game-system data is read.


## v0.9.0 Cross-links & Detail Pages

Quest cards now open a Tome-native detail page instead of jumping directly to the Journal. The detail page shows status, summary, optional structured Objectives/Updates, reverse Session references, linked World entries, linked visible Actors, and one-click navigation to every linked record. Character and World profiles now show campaign backlinks to Sessions, Quests, and related records. Sessions can also surface linked Characters in addition to Quests and World entries.

Link discovery is intentionally conservative. `flags.adventurers-tome.links` can provide explicit IDs (`sessions`, `quests`, `world`, `actors`); otherwise Tome uses structured headings and full-name mentions. This flag schema is designed to be populated automatically by the planned Import 2.0 workflow.


## v0.12 Campaign Configuration

Campaign Settings is now a dedicated GM administration dashboard rather than one long form. The GM can configure campaign identity, theme preset, campaign logo, Home hero image, section-specific backgrounds, Home block visibility/order, top-navigation visibility, default landing page, Group preview density/sorting, and fallback Quest/World metadata defaults.

Home dashboard configuration is stored in world-scoped Tome settings and affects all users, while each user's Tome window size/position, Favorites, and Recents remain client-scoped. Hiding a navigation section changes presentation only; it does not delete or rewrite Journals or Actors.

The four built-in themes are **Tome**, **Dark**, **Parchment**, and **Minimal**. A GM can preview visual changes locally before saving. Blank section backgrounds inherit the configured Home hero image, which defaults to the bundled neutral fantasy artwork.

## v0.15.0 — Export & GM Notebook

Adventurer's Tome now includes a GM-only **Tome Exporter** and a structured **GM Notebook**. The exporter can create a portable Tome Package v2 that Import 2.0 can ingest again, a player-safe package with private Tome content stripped, or a private full GM archive for backup/audit.

GM Notes are no longer limited to a single text box. Each Tome entry can hold multiple private notes with a type, status, pin, trigger, and optional target Session. The global GM Notebook collects those notes across the campaign, highlights notes due for the next Session, and makes it easy to jump back to the source entry.

The Full GM Archive can contain unrevealed secrets and private notes. Keep it private. It is currently a backup/reference format; Import 2.0 directly supports the Portable Tome Package v2 format.


## v0.17.3 World Sheet & Chat Selection Hotfix

World profiles can now safely infer a unique same-name Foundry Actor when no explicit Actor link has been stored, exposing **Open Sheet** immediately for matching NPCs while still respecting Foundry permissions. Text-selection sharing was hardened across Tome detail content: selecting shareable text now presents a contextual **Send to Chat** action beside the selection, and Rule detail pages include an explicit **Send Selected Text** control.

## v0.17.0 Foundry Sync & Content Tools

World entries now use a Foundry Journal page as the player-facing Known Information source, can link to Actors, and can manage default Foundry ownership from Tome permissions. Sessions, Quests, and Rules have local search; Rules can be created or linked; character profiles support custom system-independent buttons; selected Tome text can be sent to Foundry chat.


### v0.17.3 selection hotfix
Native text selection is explicitly enabled inside Tome reading panels so Foundry/system/theme CSS cannot block highlighting. Select text in Rule, Session, Quest, Character, or World detail content and use the contextual **Send selection to Chat** action; Rule pages also retain the explicit toolbar fallback.


### Selected text sharing

Readable Tome content supports native text selection. Use **Public** to post the selection to general chat or **Whisper…** to choose connected recipients / all GMs.

### Minimal Home safety

Minimal mode never locks a GM out of configuration: Campaign Settings remains pinned in the top-right GM toolbar, and Minimal Home also exposes a GM-only **Customize Home** shortcut directly back to the Home Builder.