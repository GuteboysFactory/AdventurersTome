# Adventurer’s Tome reference and feature index

**Version 2.1.10.** [Manual contents](MANUAL-EN.md#contents) · [Svenska](MANUAL-REFERENS.md)

## Contents

- [Campaign settings and demo](#campaign-settings-and-demo)
- [Authoring and folders](#authoring-folders-and-documents)
- [Quick Search and keyboard](#quick-search-and-keyboard)
- [GM Dock](#gm-dock-and-session-tools)
- [Evidence and the index](#facts-relationships-rumours-and-index)
- [Private notes and recovery](#private-notes-and-recovery)
- [Import formats](#import-formats-and-migration)
- [System integrations](#system-and-module-integrations)
- [Tools by previous module name](#gm-tools-by-previous-module-name)
- [Feature reference](#feature-reference)

## Campaign settings and demo
<!-- tome-manual settings|reference|gm|campaign settings theme artwork home builder navigation defaults permission -->

As GM open **Campaign Settings** from the gear icon. Use **Preview** to check the display, **Save Campaign Settings** to apply, or **Reset Form** to reset the form.

| To change | Open |
| --- | --- |
| Campaign name and home text | **Campaign Info** |
| Theme, logo, hero or tab artwork | **Theme & Artwork**. **Campaign Logo** replaces the book icon in Tome’s top navigation bar. Set individual tab images under **Section Backgrounds**. An empty tab background uses the main artwork. |
| Home layout and shortcuts | **Home Builder** and **Home Widgets**. **Custom** supports widget sizing and arrangement. **Minimal** can offer an **Enter** shortcut. |
| Which tabs appear | **Navigation**. Hiding a tab preserves the entries in it. |
| Group members, order and Home cards | **Group Presentation** and **Active Group Members** |
| Default statuses, categories and visibility | **Content Defaults** and **Permission Defaults** |
| Access to an individual entry | **Content Access → Manage** or the access action on the entry itself |

In Foundry, **Configure Settings → Adventurer’s Tome** contains module integration settings. **Configure Controls** lists configurable keyboard shortcuts. Window transparency applies to the local client.

### Try the demo campaign
<!-- tome-manual demo|tutorial|gm|ashen road demo generate remove demo demokampanj -->

1. Open a separate Foundry world and choose **Campaign Settings → Developer Tools → The Ashen Road Demo Campaign**.
2. **Generate Small Demo** creates examples for the common tabs. **Generate Full Demo** adds more entries and links for testing.
3. Open a session, follow a quest link and find a person in **World**. Try the same from a player account.
4. **Remove Demo Campaign** removes the marked demo content and restores the presentation saved before generation.

## Authoring, folders and documents

### Work in the document view
<!-- tome-manual authoring|guide|all|editor pages authoring text image open foundry source redigera dokument -->

- Open an entry in **Sessions**, **Quests**, **World** or **Rules**, then use the edit action if you have access. Edit the title, summary and player-facing content on the relevant entry.
- Use **Pages** to select the right page before editing. World editors can organize Journal pages and add text or media through the available controls. **Known Information** is the player-facing text.
- Use **Open Journal** or **Open Foundry Source** for the original document. Linked NPCs can have **Open Sheet** and **Actor Access** for GM.
- Use the star to favorite an entry. Use summaries for cards and results, and the full Chronicle or Journal page for longer text.

### Organize World and Campaign Explorer
<!-- tome-manual folders|tutorial|gm|tree view custom structure by content original folders mappar kategorier -->

1. Under **World → Tree view**, use **Original structure**, **By content** or **Custom structure**.
2. In your custom structure, choose **New category** or **New folder**. Use the folder menu for subfolders, renaming, moving and settings. Drag entries where supported.
3. **Copy folder structure** imports a starting hierarchy for Tome. Organizing World does not move linked Actors or Items in Foundry.
4. In Sessions and Quests, eligible editors use Campaign Explorer to choose a folder and open folder tools. A **Delete Entry** action that identifies a canonical Foundry document deletes that source permanently.

### Create, reuse or import an NPC
<!-- tome-manual quick-npc|tutorial|gm|quick npc template compendium preview plan npc mall -->

1. Open **World → Quick NPC** as GM and enter a name and the requested fields.
2. Choose **Preview Plan**, then compare **Use Existing World Actor**, **Import Compendium Actor** and **Create New NPC** where offered.
3. Select **Use Actor** or **Apply** after review. A system integration may provide its own options.
4. Check the resulting identity, Actor link and discovery status in World. Compare existing identities when Tome warns of a similar name.

## Quick Search and keyboard
<!-- tome-manual quick-search|guide|gm|ctrl shift space search quick search insert link håll öppen kortkommando shortcut -->

Use **Campaign Tools → Quick Search** or **Ctrl + Shift + Space**. Filter by **Type**, **Folder** or **Compendium**. In a compatible text editor use **Insert link**. Use Up and Down to navigate, **Tab** for an action, and **Enter** to run it. Follow the panel’s keyboard hints to keep it open.

### Change the shortcut
<!-- tome-manual keybindings|reference|gm|configure controls settings quick search tangenter hotkey shortcut commands kortkommando -->

Open **Foundry → Game Settings → Configure Controls → Tome Quick Search** and save a new binding. **Ctrl + <** is already the Nordic default for **Write Private Vault note**. Change that binding first if you want to reuse it.

| Prefix | Action |
| --- | --- |
| **?** | Show help and supported prefixes |
| **@** | Filter document types |
| **!** | Search items on selected characters or your assigned Actor |
| **#** | Find and control playlists |
| **=** | Calculate an expression |
| **/** | Find a Foundry chat command |
| **>** | Find available keybindings |

Documents support actions such as opening, copying links, showing linked entries, placing Actors, previewing scenes, activating scenes as GM, configuring ownership, running macros and rolling tables. **Use / system action…** depends on the active system. Select **Private Vault** for personal vault notes when unlocked. Enable **Quick Search: journal headings** to index headings. Use **Rebuild index** after updating **Quick Search: excluded compendiums**.

## GM Dock and session tools
<!-- tome-manual gm-dock|guide|gm|dock tools pin context quick capture dockan -->

Open **Adventurer’s Tome** in the GM Dock. It can be standalone or integrated with a compatible host. Drag the standalone handle to move it and right-click it to reset.

1. Open a document or Tome profile. Use **Pin Context** in the Dock to keep working with the same source as you navigate.
2. Choose **Private Vault** for its notes or **Quick Capture** to save a note. Check whether the form targets a document or **GM Quick Capture Inbox**.
3. Open **Reveal Queue**, **Next Session**, recent entries or **Quick Search** from the Dock. Use **Unpin Context** to follow your navigation again.

### Prepare a game night from a note
<!-- tome-manual session-prep|tutorial|gm|next session reveal queue post-session assistant quick capture gm notebook -->

1. Capture an item with **Quick Capture** and set **Type**, **Target Session**, and **Trigger / when it matters**. Pin it or link the relevant source.
2. Use **Notes Feed** to find pinned, due or resolved work. Use **Resolve** or **Reopen** when its state changes.
3. Open **Next Session** to check quests and planned reveals. Review **Player Signals** for observations shared by players.
4. Confirm a reveal before **Show to Players**. After play, use **Post-Session Assistant** to review unfinished notes, quests and exports. **Campaign Tools → Overview** summarizes work waiting for the GM.

### Create a reminder or quest from a workflow
<!-- tome-manual reminder|tutorial|all|new reminder when i view a scene create quest påminnelse -->

1. As GM open **My reminders**. As a player open **My Chronicle → Reminders**. Choose **New reminder** and link a note if needed.
2. Under **Remind me**, select a time or **When I view a Scene**. Time-based reminders can show at next login. The optional GM inactivity setting is **New session reminder**.
3. An eligible briefing excerpt can offer **Create Quest** to the GM. Review the draft and source before adding it to the campaign.

## Facts, relationships, rumours and index

### Read and review source evidence
<!-- tome-manual memory|tutorial|gm|memory review source facts rumour relation previous session links källor -->

1. Search **Campaign Tools → Memory** and open a hit’s source to read its original context.
2. In **Review source facts**, compare proposed facts with existing ones. Save only the facts you accept and keep private facts in the GM view.
3. In **Analysis**, choose **Confirm relationship**, **Keep as possible / rumour**, **Reject**, or **Leave unresolved** as appropriate.
4. For old links, open **Manage previous session links** on the candidate and read each source before changing it. Recurring errors can be reviewed or paused in **Matching preferences**.

### Keep the index up to date
<!-- tome-manual index|reference|gm|index check changes rebuild pause archive reactivate -->

In **Campaign Tools → Index**, **Check changes** checks the sources. **Pause** and **Continue** control background work. **Rebuild analysis index** rebuilds the current world and GM client’s analysis. In history, **Archive** removes an identity from automatic matching while preserving references. **Reactivate** restores it. **Forget index marker** removes leftover markers for deleted sources.

## Private notes and recovery
<!-- tome-manual vault|reference|gm|private vault encrypted lock unlock backup export återställning privat valv -->

- **Campaign Tools → Private Vault** collects notes for the active GM account. Filter by category, pin entries or open images on demand. Use a Foundry sheet’s lock icon, the map shortcut or a linked Tome profile for source-specific notes.
- To share an excerpt or image, choose recipients before sending. Old encrypted whispers can depend on the browser profile used to receive them.
- An unlocked old vault can be copied to account mode under **Vault access**. Keep the original password or remembered key to reopen the old encrypted archive.
- Use **Export GM Notes & Vault** for a private backup of supported notes, categories and portable images. Use a world backup for material outside the export limits. Player notes have their own export from **My Chronicle**. [Vault boundaries and recovery](V2.1.2_STABLE_RELEASE.md)

## Import formats and migration
<!-- tome-manual formats|reference|gm|import export formats json markdown backup migration spelarvänlig -->

- **Session Log Markdown** supports a session heading and sections for summary, events, quest updates, NPCs and places. Inspect proposed links before applying.
- **Quest Log Markdown** groups quests by status. Review the proposed audience and status.
- **Tome Package JSON** supports sessions, quests, World entries and explicit links. Use **Create**, **Update** or **Skip** in preview and **Import history** afterward.
- **Move campaign (ZIP)** moves campaign content across worlds. Review target accounts, proposed users, ownership and media. Continue a partial import from the saved result.
- **GM Notes & Vault (private JSON)** transfers supported GM notes and Vault data. Review source mapping when importing into another world.
- **Private GM archive (JSON)** contains private backup data. Use an ordinary Foundry backup for full world recovery. [Format examples](IMPORT-FORMATS.md)

## System and module integrations
<!-- tome-manual integrations|reference|gm|realm guard adapter system actions module integration -->

A supported game system can add actions to **GM Dock**, **Quick NPC** and **Quick Search**. Available actions depend on the world, documents, permissions and enabled integrations. Review any suggestion to change **Known Information** before accepting it. When granting temporary Vault access, verify the recipient, target, scope and duration in the dialog.

## GM tools by previous module name
<!-- tome-manual module-index|reference|gm|third party mods modules fire moduler -->

| Previous module | Tome guide |
| --- | --- |
| Backgroundless Pins | [Map markers and backgrounds](MANUAL-EN.md#place-a-pin-or-link-a-scene) |
| Chat Portrait | [Chat character names and artwork](MANUAL-EN.md#show-token-portraits-and-choose-a-speaker) |
| Monk’s Scene Navigation | [Browse and change scenes](MANUAL-EN.md#open-scenes-and-move-the-party) |
| Scene Express | [Create scenes from images](MANUAL-EN.md#create-scenes-from-image-files) |
| Scene Defaults | [Scene defaults and bulk updates](MANUAL-EN.md#set-scene-defaults-or-change-several-scenes) |
| Multiple Document Selection | [Select, move and export multiple documents](MANUAL-EN.md#work-with-several-foundry-documents) |
| Ownership Viewer | [Review and change access](MANUAL-EN.md#review-access-as-gm) |
| Quick Send to Chat | [Send an excerpt](MANUAL-EN.md#send-an-excerpt-image-or-entry) |
| Token Defaults | [Keep a token upright](MANUAL-EN.md#keep-token-artwork-upright) |
| Tokenizer 2 | [Build a map token](MANUAL-EN.md#build-a-map-token) |
| GM Notes and Hover Notes | [Write and preview private notes](MANUAL-EN.md#open-private-vault-in-writing-mode) |

## Feature reference
<!-- tome-manual feature-index|reference|all|feature list content function coverage funktionsregister -->

| Surface | Main workflow |
| --- | --- |
| Launcher and window | [Move, minimize and adjust transparency](MANUAL-EN.md#launcher-and-window) |
| Sessions and Quests | [Sessions and quests](MANUAL-EN.md#sessions-and-quests) |
| Group and Actor sheet | [Profiles, portraits, tokens and storage](MANUAL-EN.md#characters-and-token-builder) |
| World and Rules | [World, rules and search](MANUAL-EN.md#world-rules-and-search) |
| Chat and directories | [Sharing, ownership and multi-selection](MANUAL-EN.md#chat-and-document-access) |
| Scenes and travel | [Navigation, maps, routes and flag](MANUAL-EN.md#scenes-map-markers-and-travel) |
| My Chronicle | [Notes, bookmarks, sharing and reminders](MANUAL-EN.md#player-chronicle-and-reminders) |
| Campaign Tools | [GM workflow](MANUAL-EN.md#gm-notes-and-session-workflow) and [evidence review](#read-and-review-source-evidence) |
| Campaign Settings and Developer Tools | [Settings and demo](#campaign-settings-and-demo) |
| Import and export | [Supported formats and migration](#import-formats-and-migration) |
