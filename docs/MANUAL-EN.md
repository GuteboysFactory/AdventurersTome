# Adventurer’s Tome user manual

[Svenska](MANUAL.md) · [English reference](MANUAL-REFERENCE-EN.md) · [Release notes](V2.1.10_STABLE_RELEASE.md)

This manual covers stable Tome 2.1.10 on Foundry 13.351. Click the question mark in Tome for language selection, full-text search, quick guides and tutorials.

## Contents

| Area | Start here |
| --- | --- |
| Getting started | [Install or update](#install-or-update-as-an-administrator) · [Set up a campaign](#set-up-a-campaign-as-gm) · [First visit as a player](#first-visit-as-a-player) · [Launcher and window](#launcher-and-window) |
| Running a session | [Read a session](#find-and-read-a-session) · [Write or import](#write-or-import-a-session-as-gm) · [Manage a quest](#create-and-update-a-quest-as-gm) · [GM workflow](#gm-notes-and-session-workflow) |
| Characters | [Profiles and sheets](#characters-and-token-builder) · [Portraits](#change-character-artwork) · [Token Builder](#build-a-map-token) · [Upright tokens](#keep-token-artwork-upright) · [Storage](#pack-animals-base-storage-and-containers) |
| Sharing and access | [Send an excerpt](#send-an-excerpt-image-or-entry) · [Speak as a character](#show-token-portraits-and-choose-a-speaker) · [Review access](#review-access-as-gm) · [Select documents](#work-with-several-foundry-documents) |
| Scenes and travel | [Open and activate scenes](#open-scenes-and-move-the-party) · [Compact scenes](#switch-your-own-view-with-compact-scenes) · [Import scene images](#create-scenes-from-image-files) · [Scene defaults](#set-scene-defaults-or-change-several-scenes) · [Map markers](#place-a-pin-or-link-a-scene) |
| Party flag and routes | [Assign the flag](#start-a-journey-and-assign-the-flag) · [Draw a route and share a goal](#set-waypoints-draw-the-route-and-share-the-goal) · [Events, split parties and history](#marker-events-split-parties-and-travel-history) |
| Campaign knowledge | [World](#create-and-use-a-world-entry) · [Rules](#build-a-rule-reference) · [Search](#choose-the-right-search) · [Identity review](#help-tome-choose-the-right-identity) · [Language Lab](#inspect-language-support-as-gm) |
| Running the campaign | [Player chronicle](#player-chronicle-and-reminders) · [Private token notes](#open-private-vault-in-writing-mode) · [Import](#import-a-report-or-tome-package) · [Migration](#move-to-another-world) · [Troubleshooting](#troubleshooting) · [Feature reference](MANUAL-REFERENCE-EN.md#feature-reference) · [Manual version history](#manual-version-history) |

## Getting started

[Back to contents](#contents)

### Install or update as an administrator
<!-- tome-manual install|guide|gm|installera add-on modules manifest update uppdatering -->

1. In **Foundry Setup → Add-on Modules → Install Module**, paste the [stable manifest](https://raw.githubusercontent.com/GuteboysFactory/AdventurersTome/main/channels/gold/module.json) into **Manifest URL**.
2. Start the world and enable **Adventurer’s Tome** in **Manage Modules**. Open Tome from its launcher on the Foundry workspace. The question mark opens the manual.
3. Back up an existing world before upgrading the module with ID `adventurers-tome`. Restart Foundry, reload client tabs, sign in as GM and let **Campaign Tools → Index** finish checking the world.

Foundry stores Actors, Items, Scenes and Journals. Tome adds campaign profiles, links and tools. The character sheet follows the world’s game system.

### Set up a campaign as GM
<!-- tome-manual campaign-setup|tutorial|gm|campaign settings home builder create verify folders skapa mappar permissions -->

1. Open **Campaign Settings → Developer Tools → Create / Verify Folders** to prepare Sessions, Quests, World and Rules.
2. Open **Group → Manage Group**, mark the party’s Actors and assign characters to their players in Foundry.
3. Use **Campaign Settings → Home Layout**. **Dashboard** shows campaign activity, **Minimal** emphasizes artwork, and **Custom** allows rearranging and resizing Home Builder widgets.
4. Create a test Session or Quest. Sign in as a player and check what they can read before adding private preparation.

### First visit as a player
<!-- tome-manual player-start|guide|all|home party latest active quests nybörjare -->

Open **Home** for the latest session, current quests, group and discoveries. **Sessions** holds the chronicle. **Quests** shows quest status and **My Chronicle** holds your private notes. Use the star on an entry to save a personal favorite. **Q** and **S** on the launcher indicate unread quests or sessions you can access.

### Launcher and window
<!-- tome-manual window|guide|all|launcher transparency opacity transparency genomskinlighet position resize -->

Drag the Tome launcher to move it. Right-click the launcher to reset its position. Use the window header to change how much of the Foundry scene is visible through Tome. Minimize to the launcher to return to your current view. These controls affect your client.

## Sessions and quests

[Back to contents](#contents)

### Find and read a session
<!-- tome-manual session-read|guide|all|chronicle log session latest skroll scroll -->

1. Open **Home → Latest Session** for the latest game night. For older entries, open **Sessions**, pick a folder or **Show all** in **Campaign Explorer**, and use **Search Sessions**.
2. Select a session. In a wide window the folder tree, list and reading pane scroll separately. Collapse the Explorer when you need more reading space.
3. Follow links to quests, characters and places. **Pages** lists additional pages. **Open Full Session** opens the source Journal when you have access.

### Write or import a session as GM
<!-- tome-manual session-write|tutorial|gm|new session import campaign explorer editors editor journal -->

1. Choose **Sessions → New Session** to start a numbered session. Add the chronicle to its main page and use **Pages** for extra material.
2. Choose **Import Session** for a prepared log. Review its proposed session, names and links before applying. Use unique session numbers so Tome can identify sources.
3. Put preparation and private notes in the appropriate GM fields. Review player-facing text, source access and discovery status from a player account.

### Create and update a quest as GM
<!-- tome-manual quest|tutorial|gm|quest uppdrag dropdown dormant active status aktiv complete failed -->

1. Open **Quests → New Quest** and write a short title and objective. Use the status selector on the quest detail to choose a supported status, such as **Dormant**, **Active**, **Completed** or **Failed**.
2. Use **Campaign Links** to connect sessions and World entries. Under **Quest Characters**, choose a character and click **Link character**.
3. When the party finishes, update the outcome in the quest and keep the narrative in the linked session. For a personal quest, review the target players before showing it.

## Characters and Token Builder
<!-- tome-manual group|guide|all|view profile actor sheet karaktär grupp karaktärsblad -->

[Back to contents](#contents)

Use **Group → View Profile** for public campaign information, biography, facts, relationships and links. **Sheet** opens the Foundry Actor when permissions allow it. GMs can add custom profile links to a Foundry document or website. Marking an Actor as a Group member can also share a limited public profile and create Party Member links. Full sheet access still follows Foundry ownership.

### Change character artwork
<!-- tome-manual portrait|guide|all|portrait full artwork helbild home actors porträtt -->

1. Open the character’s Tome profile and choose portrait editing. On compatible Foundry sheets, click or drop a local image on the portrait to open **Portrait Editor**.
2. Choose the source, adjust the crop and save. Hover over the image in **Group** or on the sheet to choose **Full artwork**, **Portrait** or **Token image** where available.
3. Check **Group**, **Home** and the sheet. Home uses the saved portrait or falls back to full artwork. The Foundry Actors list shows token artwork for the supported characters.

### Build a map token
<!-- tome-manual token-builder|tutorial|all|tokenizer 2 token builder frame width ram tjocklek ornament utsmyckning ramar drake dragon -->

1. Open an editable Actor. On a Realm Guard character sheet, hover the artwork and click **Token Builder** at the lower edge. Some other supported Actor views offer it in the header. Saving requires Foundry file upload permission.
2. Use **Browse images**, **Choose file**, or drop an image on the preview. **Fill / Crop** fills the frame. Drag the image or use **Zoom**, **Horizontal** and **Vertical** to position it.
3. Choose **Shape** and **Frame appearance** separately. Set colors and thickness in **Customize frame**. **Frame width** expands the outer edge while preserving the opening. Choose **Whole image** and **No frame** for the entire unframed image. **Frame animation** previews animated effects.
4. Scroll for more controls. **Save token** and **Cancel** stay visible. Click **Save token** and compare a new copy dragged from **Actors** and one already on the map. Clear **Also replace custom images on this character’s placed tokens** to preserve custom artwork on existing copies.

#### Frames and animations

**Craft traditions** includes **Elven laurel** and **Dwarven ironwork**. **Fantasy** adds wyrm scale, runestone, frostglass, carved bone and rootwood. **Frame width** moves the outer edge while preserving the opening and texture scale. **Ornaments** assigns optional decorations to the **Top**, **Right**, **Bottom** and **Left**.

Choose **Shape → Illustrated frames** for **Laurel wreath**, **Flower wreath**, **Thorn wreath**, **Dragon wings**, **Rune star**, **Raven wreath**, **Dwarven arch**, **Moon filigree**, **Frost crown** or **Coral wreath**. Use **Frame color** to tint the illustrated artwork and **Frame width** to expand its outer edge while keeping the portrait opening fixed. **Reset frame color** restores the original illustration. Choose **Frame animation** to add an effect behind the frame.

The **Shape** menu groups 90 additional frames by theme, including **Woodland**, **Forge** and **Northern legends**. **Frame diameter** resizes the entire frame and its opening. Click **100%** to reset it.

For **Circle**, enable **Fit to token edges** to bring the ring to the sides of the square. Turn it off to restore your chosen diameter.

Under **Frame animation**, choose **Ember ring** for low flames or **Burning ring** for fuller flames. Both rise from the outer edge of the frame. The 22 effects are grouped under **Elements**, **Light and nature**, and **Shadow and magic**. Examples include **Ghostly Light**, **Holy Aura**, **Death Shadow**, **Sickness**, and **Angry**. Adjust **Animation strength** to make the effect more subtle or pronounced. **100%** is the default. **Save token** saves an animated WebM and a still image for views that display a picture.

Use **Token size on the map** to set width and height in grid squares for new placements. Check **Resize placed tokens when saving** to resize existing tokens that receive the new artwork.

The GM can use **Save as default** to save the current frame design for the world. **Use world default frame** loads that design in the editor for an existing character. Save the token to apply it.

The GM can choose **Enable player uploads…** in Token Builder to grant Foundry’s **Upload Files** permission to the Player and Trusted Player roles. Character owners can then open Token Builder from their sheet, select a local picture with **Choose file**, and save. Files are stored in an open folder per player account under the world’s `adventurers-tome/token-art` folder. **Browse images** requires Foundry’s file browser permission.

### Keep token artwork upright
<!-- tome-manual rotation|guide|all|token defaults lock rotation upright upprätt rotera -->

1. Drag a character onto a test scene. New tokens keep their artwork upright by default with Tome enabled.
2. Use **Token Builder → Keep portrait upright** to change the character’s default, then **Save token**. Saving can also update existing copies according to your permissions and replacement choices.
3. To change one placed copy, use that token’s Foundry configuration and adjust rotation locking there.

### Pack animals, base storage and containers
<!-- tome-manual storage|tutorial|all|pack animal inventory gear chest crate packdjur kista förråd item föremål -->

1. Open **Group → Storage → New storage** to create a pack animal, base, chest, crate or other store. **Use existing Actor** attaches an existing pack animal. Use **Configure access** to choose who can use it.
2. Open **Inventory & Gear → Storage…** on the character sheet. Choose storage and drag a stack into it. Drag it back to **Drop item from storage here** to retrieve it.
3. Movement requires ownership of both inventories. An **Observer** can read the list. A placed storage token may expose **Open storage** in its controls.
4. Empty a packed portable Realm Guard container before moving the container itself between inventories.

## World, rules and search

[Back to contents](#contents)

### Create and use a World entry
<!-- tome-manual world|guide|all|world lore journal known information npc contact faction -->

1. Open **World** and search for a name, place, faction, item or piece of lore. Choose a category or folder and open a card.
2. Use **New entry** as an editor to add content to the relevant category. Use **Known Information** for text players can learn, and check the source Journal and discovery status.
3. Link NPCs to their Actors as needed. GMs can open **Open Journal**, **Open Sheet** or **Actor Access** where offered.
4. Use **Show to Players** when the party should learn something, or put it in **Reveal Queue** for a later scene.

### Build a rule reference
<!-- tome-manual rules|guide|gm|rules regler skapa regel link existing -->

Open **Rules**, then **Create Rule** to write a house rule or **Link Existing** to reuse a Foundry Journal. Find the rule with the local search. Open the source when you need to edit its original Journal. Select the relevant paragraph to send only that excerpt to chat.

### Choose the right search
<!-- tome-manual search|guide|all|search sök quick search quicksearch foundry compendium favorites recent -->

- **Search** looks through campaign content you can read. Use the type filters or press **/** outside a text field to open it.
- A tab’s own search stays within that section. **Favorites** and **Recently Viewed** are personal. **Clear** under **Recently Viewed** removes your viewing history. Entries and favorites stay available.
- **Campaign Tools → Quick Search** finds Foundry documents in the world and Compendiums. Open a result or insert a Foundry link in a compatible editor. [Keyboard shortcuts and examples](MANUAL-REFERENCE-EN.md#quick-search-and-keyboard)
- As a GM, press **Ctrl + Shift + Space** to find words inside a journal listed under **Rules**. Open the result to jump to its rule page.
- **Campaign Tools → Memory** helps GMs find evidence and sources from campaign analysis.

## Chat and document access

[Back to contents](#contents)

### Send an excerpt, image or entry
<!-- tome-manual chat-share|guide|all|quick send to chat chat sharing whisper viska viskning dela utdrag selection -->

1. Select only the desired text in a supported Tome view or Foundry document. Tome can be closed.
2. Choose **Send to Chat**. For a source-linked excerpt, choose **Public Chat** in the menu. Use **Whisper…** to select recipients and confirm with **Whisper**.
3. To share an entry, use **Send to Chat**, the share icon on the Tome header, or the speech bubble on a supported Foundry sheet. A Tome snapshot contains player-facing fields. A source link requires access to its document and page.
4. In supported views you can also share a selected image or table. If public sharing is unavailable, verify recipient access to the source.

### Show token portraits and choose a speaker
<!-- tome-manual chat-voice|tutorial|all|chat portrait speak as chatt rollspel välj talare unknown npc -->

1. Turn on **Show speaker portraits in chat** in **Configure Settings → Adventurer’s Tome**. **Chat portrait shape** and **Chat portrait size (pixels)** apply to your own client.
2. In chat select **Speak as**, search a character and choose **Speak as character**. Use **Back to Gamemaster** or **Use my character** to reset.
3. Test with a GM and player accounts. Player messages should show their character name and available token artwork. The GM can appear as the **Chronicler**.
4. Players can select characters known to them. Access to an NPC’s linked World entry controls whether its name is known. The player sees **Unknown NPC** for an unknown speaker. A hidden NPC token’s artwork is also withheld from the player.

### Review access as GM
<!-- tome-manual access|tutorial|gm|ownership viewer who can see review selected observer permission ägarskap behörighet -->

1. In **World**, hover a card to check both Foundry ownership and visibility in Tome. Right-click to keep the preview open. The eye icon in a Foundry sidebar gives a similar access overview.
2. Select two cards and click **Who can see?**. Use **Review Selected** or **Review access changes…** to open the editor.
3. Set a player to **Observer** when that is the desired reading level and use **Keep existing** for other accounts. **Default** inherits **All Players**. Click **Review changes**, inspect **Affected documents** and confirm.
4. Try the player account. If the source opens in Foundry but the entry is hidden in Tome, check **Tome permissions**, **Discovered** and **GM-only**.

**Campaign Tools → NPCs, Contacts & Items** supports filtering and bulk review. **Undo** there can restore the last supported access operation.

### Work with several Foundry documents
<!-- tome-manual multi-document|guide|gm|multiple document selection select entries batch flytta export delete flerval massändra -->

1. As GM, open a supported Foundry sidebar such as Journal, Actors, Items, Scenes, Roll Tables or Cards. Click **Select entries** and select the rows.
2. Use **Who can see?**, **Review access**, or **Move** and choose the destination folder. **Directory root** moves entries out of their folder.
3. **Export** writes the selection as JSON. **Delete** asks for confirmation and lists documents before permanent removal. **Close selection** clears the list.

## Scenes, map markers and travel

[Back to contents](#contents)

### Open scenes and move the party
<!-- tome-manual scene-navigation|tutorial|gm|monks scene navigation scene actions gm dock camera start flytta spelarna scen -->

1. Right-click an empty part of the map and choose **Scenes…**, or open **GM Dock → Tools → Scenes**. Search, browse folders or star a scene for Favorites.
2. **Open for me** previews a scene for your client. **Previous scene** returns to the last map. Compare **My view** with **Active for everyone**.
3. **Activate for everyone** switches the table. The row’s **… → Scene actions** contains **Configure scene**, **Player access…**, **Show in navigation**, **Save current view as start**, and **Bring connected players here…** when applicable.
4. Under **Player access…**, choose **Allow viewing**, **Hide**, or **Use default** and select **Save access**. Turn on navigation for players who should be able to open it themselves. Opening a secret scene for yourself leaves the table on its current map.
5. In **Settings…**, choose options for the Scenes panel or Foundry’s Scenes sidebar and click **Save navigation settings**.

### Switch your own view with Compact scenes
<!-- tome-manual compact-scenes|guide|all|compact scene navigation previous scene kompakt -->

Click **Compact scenes** at the top of the Foundry canvas, beside the Tome launcher when it is there. Drag the grip to move the scene controls or right-click it to restore their position. You can also enable **Compact scene navigation** in Tome’s module settings. Use **Open scene for me…** to browse by folder, including **Unfiled**. **Active** marks the table’s scene. Use **Standard scenes** to return to the normal scene bar.

### Create scenes from image files
<!-- tome-manual scene-image|guide|gm|scene express create scene here drag drop import bild scen fil -->

1. Open **Scenes… → Create scenes from images…** and select one or more local image files. Foundry file upload permission is required.
2. Drop one or more map pictures onto the area at the bottom of Foundry’s **Scenes** tab, or click the area to browse for files. On the canvas, drop onto **Create scene here**. Realm Guard’s NPC image drop uses the rest of the canvas.
3. Find the new scene using the file name. Open it for yourself and check the artwork, dimensions and grid. Image dimensions apply where you did not set an override. Activate the scene when ready.
4. Use **Scenes → Settings… → Image import settings…** to choose an existing upload folder in Foundry User Data, put new scenes in the navigation bar or grant player access. **Activate the last imported scene for everyone** switches the table to the final successful import.
5. Under **Existing image or scene**, choose a new scene with a unique upload name, skip duplicates, reuse an existing image or replace it. Reuse and replacement update a single matching scene. Tome asks before overwriting an image that other scenes may also use.
6. Clear **Show the drop area in Foundry’s Scenes tab** in the import settings to hide the fixed drop area. The file picker and **Create scene here** on the canvas remain available. Changing an existing scene’s image also refreshes its thumbnail when the canvas is available.

### Set scene defaults or change several scenes
<!-- tome-manual scene-defaults|tutorial|gm|scene defaults bulk grid gridless rutnät svart bakgrund massändra scene settings -->

1. Use **Scenes → Settings… → Set defaults or update existing scenes…**. Choose grid type and size, dimensions, background, token vision, fog exploration and global illumination.
2. Try **Grid type → Gridless**, a black background or automatic dimensions using `0`. Check **Apply saved defaults to new scenes**, click **Save defaults**, then make a test scene.
3. To update existing scenes, check **Apply to existing** only beside fields you want changed. Select **Apply to existing scenes…**, choose scenes and click **Review changes**. Use **All scenes in this world** for a world-wide change.
4. Configure a single Foundry Scene directly to make an exception.

### Place a pin or link a scene
<!-- tome-manual map-markers|tutorial|gm|backgroundless pins map pin place note place marker waypoint karta markör kartnål flera scener bree -->

1. Right-click the map and choose **Place Marker…**. Pick an existing location or **New place**, set **Map pin appearance** and choose whether to show a new place to players.
2. Use **Place Note…** for a note, or **Create item / place on map…** for a custom symbol, size and visibility. **Edit marker…** changes an existing marker.
3. Right-click a place such as Bree and choose **Link scenes…**. Select the inn and any other scenes, then **Save scene links**. Use **Manage scene links…** to update the list.
4. When the flag reaches Bree, choose a linked scene as GM. **Preview for me** changes your view. **Activate for players…** asks for confirmation. Reopen the list from the pin or flag using **Open linked scenes…**.

### Open your character sheet from the map
<!-- tome-manual assigned-character-map|guide|all|open character sheet karaktärsblad kartmeny högerklick place token tilldelad assigned -->

Right-click an empty part of the map and choose **Open character sheet** for your assigned character. **Place token here** places your token. You can remove your placed token from its token controls when the action is available. Your character sheet remains available.

### Start a journey and assign the flag
<!-- tome-manual party-flag|guide|gm|party flag party location driver move set party position gruppflagga -->

1. Right-click a pin and choose **Set party position**, or choose a location pin from **Home → Current Location → Change party location…**. Both move the same party flag. **Home → Party Location** opens the map at the flag.
2. Right-click the flag and choose **Who can move this flag?**. Pick a player and **Save**. Use **GM only** to take back control.
3. Use **Open Travel Planner…** for waypoints and events. Enable the planner and choose **Session log** if the journey belongs to a session.

### Set waypoints, draw the route and share the goal
<!-- tome-manual routes|tutorial|gm|waypoint final destination draw route approx goal area slutmål delmål planera rutt -->

1. Set a pin as **Set final destination**, then add intermediate stops with **Add waypoint**. The final destination stays in place.
2. Choose **Draw route from flag…** from the map menu to follow paths on the image or adjust the next segment. Move the party flag to record where the party actually travelled.
3. To give an approximate goal use **Draw approximate goal area…** from the flag and draw a circle. **Share exact goal** and **Hide goal from players** choose what the party sees.
4. Players see their flag, travelled route and shared goal. The GM can see their planned path. Completed sections become subdued when the party moves past them.

### Marker events, split parties and travel history
<!-- tome-manual travel-events|reference|gm|encounter split party undo travel history archive session log resa historik händelse -->

- In free travel, choose **Add / edit marker event…** to attach a story event, check or scene to a marker. The GM can open or skip the decision when the party arrives.
- Use **Split party…** on the flag and assign characters and drivers. Use **Rejoin** when available.
- Use the flag or map menu to undo a move. **Manage travel routes…** shows older legs and journeys. GMs can remove eligible unlinked records. Viewers can color older routes for themselves.
- Use **Finish journey** when available. Read **Travel History** via Campaign Tools, the linked Session or My Chronicle according to access.

## Player chronicle and reminders
<!-- tome-manual chronicle|tutorial|all|my chronicle player signals reminders player notes privata spelaranteckningar påminnelse -->

[Back to contents](#contents)

1. In **My Chronicle → New note**, write a private note. Link a person, place or entry if needed. Add a date for **Remembered moments**.
2. Keep frequently used entries as bookmarks. Use **Reminders** to create a timed or scene-based reminder.
3. Use the available sharing option to send a specific note or observation to the GM. Revoke a share where the interface offers it. Use My Chronicle’s own import and export for personal notes.

## GM notes and session workflow
<!-- tome-manual gm-workflow|reference|gm|gm notes next session quick capture reveal queue dashboard notebook scratchpad förberedelser -->

[Back to contents](#contents)

Use **Home → Next Session** or **Campaign Tools → Assistant** before play. **Quick Capture** records a clue, NPC or consequence during play. **Reveal Queue** prepares reveals. **Post-Session Assistant** reviews open notes, quests and next steps. The GM Notebook has a scratchpad and custom notepads. **Campaign Settings → GM Notebook → Customize Workspace** controls how they are arranged.

Try **Session Prep** for preparation or **Writer’s Desk** for more writing space. Drag panel handles or use arrow controls to reorder. Hide panels or set their width to a quarter, half, three quarters or the full workspace. **Reset Standard** resets the layout and keeps notes and notepads.

Under **Reveal Queue → Recently Shown**, use **Show Again** to repeat a reveal. **Clear** removes entries from that history. It leaves their discovered status and source documents intact.

### Open Private Vault in writing mode
<!-- tome-manual private-token-note|tutorial|gm|gm notes hover notes private vault write ctrl < token hud skrivläge förhandsvisning -->

1. Select exactly one token as GM. Press **Ctrl + <** on a Nordic keyboard, or click **GM Notes** in its token controls. Change **Write Private Vault note** under **Configure Controls**.
2. Write a short note, optionally add a category, pin it or attach an image, and click **Save GM notes**.
3. Close the editor and hover over the token. Compatible Realm Guard markers also offer a hover preview. Use **Attach Note…** on an eligible map marker.
4. Open **Campaign Tools → Private Vault** to search or manage notes. Unlock an older encrypted vault before reading its notes. Private notes belong to the active GM account.
5. Use **GM Inbox** for supported protected imports. A GM must open their Vault once to prepare the inbox. [Vault, sharing and recovery](MANUAL-REFERENCE-EN.md#private-notes-and-recovery)

## Analysis, links and alternate names
<!-- tome-manual analysis-overview|reference|gm|analysis match review identity links identitet alias -->

[Back to contents](#contents)

Tome uses accessible source text, campaign entries, Foundry identities and earlier GM choices to suggest links. A linked Actor and Tome profile can represent the same identity. Tome prioritizes World when it finds the same identity elsewhere. Distinct entries can still require review.

### Help Tome choose the right identity
<!-- tome-manual identity-review|tutorial|gm|this is the one matching preferences aliases pallando matthis alias alternative names identity review -->

1. Open **Campaign Tools → Analysis** or review from the relevant session or quest. Select **Source** to read how a name appeared.
2. Choose **This is the one** for the existing person. Use **Link existing** to choose manually where needed, or keep the reference unresolved until you have more context.
3. Use **Matching preferences** to save or edit alternate names for later matches across the campaign. A source-specific link stays with that source. If a match is wrong, inspect earlier links from the candidate before changing them.
4. Look for the same name in another session or quest and check the result before accepting new suggestions.

Choose **Never ask about this again…** in Review and enter a reason. The rule applies when the same phrase occurs elsewhere in the campaign. Open **Campaign Tools → Memory → Ignored review questions** to read the reason and source. Use **Ask again** to restore review. **Keep unresolved** applies to the current source.

### Inspect language support as GM
<!-- tome-manual language-lab|reference|gm|language lab språk svensk engelsk svenska english -->

Open **Sessions → Language Lab** to inspect language analysis. Test a Swedish or English excerpt, check what Tome detects and use source review when a name is ambiguous. Language analysis supports the GM’s review of campaign links.

## Import, export and migration

[Back to contents](#contents)

### Import a report or Tome package
<!-- tome-manual import|tutorial|gm|import markdown session log quest package json undo ångra -->

1. Open **Import** and choose a supported session, quest or Tome package. For Markdown, use a title and clear sections. **Preview** shows what Tome can create, update, skip or link.
2. Review names, status, audience and source matches. Apply when the proposed changes are correct.
3. Use **Import history** to review the result. **Clear History** removes the audit list and keeps the imported Journals. **Undo Last Import** acts on the latest supported Tome import.

### Move to another world
<!-- tome-manual migration|tutorial|gm|migration export backup move campaign zip world world transfer migrera exportera -->

1. Back up the Foundry world. Use **Import & Export → Move campaign** or the matching migration tool to export the supported campaign ZIP.
2. Open the receiving world, load the ZIP and review mapped users, permissions, links and media. Resolve ambiguous account and content mappings before applying.
3. Use a separate private export where you need GM Notes and Vault content. A player-safe package is intended for sharing. A full private archive can contain readable secrets.
4. After import, verify key scenes, sessions and links as a GM and player. If interrupted, continue using the recorded result so existing imports can be recognized.

## Troubleshooting
<!-- tome-manual troubleshoot|reference|all|help troubleshoot error bug felsökning broken länkar health check -->

[Back to contents](#contents)

| Symptom | Check |
| --- | --- |
| A player cannot read an entry | Check Foundry ownership and page access, then **Discovered** and **GM-only** in Tome. |
| A token portrait is missing in chat | Check that the client enabled portraits and that the speaker’s token is visible or artwork is available to that viewer. |
| A private note is missing | Check the current GM account, vault unlock and **GM Inbox**. |
| An old link is broken | Run **Campaign Settings → Developer Tools → Tome Health Check** and review findings. Use **Repair Safe Issues** for supported stale links. |
| A scene is unavailable to a player | Check **Player access…** and **Show in navigation**. The active scene is shown to the table. |

## Manual version history
<!-- tome-manual history|reference|all|version ändringar changelog -->

[Back to contents](#contents)

- **2.1.10** adds guides for the Scenes sidebar drop area, import defaults and duplicate handling, and the movable scene controls.
- **2.1.9** adds the searchable bilingual manual with updated guides for frames, animations, player uploads and Campaign Memory.
- **2.1.8** covers the released workflows for scene navigation, scene import, bulk defaults, chat, storage, map links and Token Builder.
- The current documentation adds bilingual guides, a searchable manual and an index of workflows by earlier module name.
