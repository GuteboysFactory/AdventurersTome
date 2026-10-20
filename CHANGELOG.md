## 1.9.0 — Migration Toolkit and a clearer Tome

- Promote the campaign-tested TAF → Realm Guard migration and shared Import & Export workspace, including media, account mapping, privacy-preserving transfers, contact review and safe retry.
- Include the completed Campaign Tools style pass, grouped Player Signals, stable library/profile controls and minimization into the existing movable launcher.
- Put Session Chronicle text before linked content while retaining compact counters above it and preserving editing/source actions.
- Other system mechanics still require verified adapters; production Genesys conversion remains future work. Foundry 13.351 remains the verified runtime baseline.
- See docs/V1.9_STABLE_RELEASE.md for scope and installation. The standalone My Chronicle visual refresh is deferred.

## 1.9.0-qa.4.16 — Minimize into the original Tome launcher

- Reuse the existing draggable Tome button as the single minimized-window control. Remove the separate bottom bar.
- Read the launcher's actual rectangle for each minimize/restore animation. Moving it while Tome is parked changes the restore animation's origin; the complete-close control follows the same movement and viewport clamping.
- Keep the original launcher's drag, saved position and right-click reset behavior. Add a small complete-close control only while Tome is parked, with keyboard access and no nested buttons.
- Preserve the previous draft, scroll, navigation, deferred refresh, reduced-motion and real-close protections. Player Signals, migration and system data unchanged. Local QA only; stable 1.8.0 unchanged.

## 1.9.0-qa.4.15 — Player groups and a resting Tome window

- Group GM Player Signals by player with counts, last-shared dates and expandable sections. Add All · latest first. Search notes and player names across all groups and reveal matching groups without changing their manual open state.
- Make the main title-bar X park the live Tome in a bottom dock with a short animation. Restore through the dock or launcher; keep the existing DOM, input drafts, focus, scroll and normal window rectangle. A separate dock control closes the application completely.
- Defer background renders while parked; resume clean surfaces when restored and retain unsaved inputs. Keep adaptive sizing/window-state observers from saving hidden geometry. Respect reduced motion and clean up on real close.
- No campaign writes from docking, no migration or Realm Guard changes. Local QA only; stable 1.8.0 unchanged.

## 1.9.0-qa.4.14 — Consistent Campaign Tools workspace

- Extend Overview's typography, reading width, warm panels, focus treatment and responsive navigation to Memory, Analysis, Index, Player Signals and Assistant.
- Separate Memory filters from evidence cards, make Analysis review controls readable, clarify Index state, and give Assistant tools and private notepads consistent spacing.
- Add the full six-tab navigation to Player Signals. Scope styles to GM Campaign Tools; personal Chronicles and the accepted Overview layout retain their presentation.
- Preserve existing actions, source/target payloads, filtering, index scroll/focus, explicit player sharing and private note ownership. No new timers or observers; no migration or Realm Guard changes.
- Local QA only; stable 1.8.0 unchanged. No export or reimport required.

## 1.9.0-qa.4.13 — Clearer Campaign Overview

- Replace the repeated full-width metric/card stack with two primary areas: decisions needing attention and the private GM Notebook. Add a readable overview heading and next-session context.
- Give Memory, Session Assistant and Player Signals distinct cards, clearer descriptions and direct shortcuts. Move evidence counters into Memory and remove implementation/roadmap copy from the overview.
- Add explanations to decision counters, calm all-clear/empty-note states, due-only emphasis, a bounded scrollable preview of existing private notes, and readable responsive typography.
- Preserve recommendation/source payloads, Undo, existing navigation and private-note actions. Styles are scoped to Overview; no new render timers, document writes, migration changes or Realm Guard changes.
- Local QA only; stable 1.8.0 unchanged.

## 1.9.0-qa.4.12 — Keep profile link management stable

- Mount the GM profile link manager before paint and continuity restoration instead of waiting for a delayed render hook. The following Relations cards no longer jump when Manage links arrives.
- Reuse an existing profile editor across duplicate/deferred hooks. Preserve its open state, selected target and focus; refresh changed target options in place.
- Reconcile stale unlink actions without deleting canonical source navigation. Remove GM controls after permission loss and avoid duplicate fallback panels when Entity Context owns the controls.
- No campaign, migration adapter or Realm Guard data changes. Local QA only; stable 1.8.0 unchanged.

## 1.9.0-qa.4.11 — Stable layout and bounded background refresh

- Do not save unchanged base/adaptive window positions. Exclude client presentation and private user settings from campaign-index jobs; document edits and world rules still invalidate analysis.
- Prepare library headers, explorer, folder/entry tools and import/search controls synchronously in Tome's render lifecycle. Permission reconciliation runs after the workspace is mounted and before paint.
- Update catalog filter nodes in place. Background mounts preserve plugin controls and the focused search input.
- Stop observer feedback from unchanged library counts, empty player header wrappers, duplicate World creators and competing legacy/task-specific Session/Quest creators.
- No migration adapter or Realm Guard system changes. Existing imported data needs no reimport. Local QA only; stable 1.8.0 unchanged.

## 1.9.0-qa.4.10 — Keep reviewed contact roles visible

- Keep a Character / Role / Selected person review table above Import after a corrected Actor becomes ready. Change reopens only that Actor's controls.
- Present repair controls in a stable Friend, Senior Artisan, Mentor, Enemy order. Show advisory hints when a selected name explicitly suggests the opposite Mentor/Enemy role; never silently rewrite a deliberate choice.
- Keep the current Actor controls open while selecting replacements; the ready summary remains available when they are complete.
- No adapter mechanics changed. Local QA only, stable 1.8.0 unchanged.

## 1.9.0-qa.4.9 — Readable Item descriptions and role-specific contact repair

- Convert every TAF → Realm Guard Item description to plain text, including embedded gear, Talents, Traits, Wises, skills and standalone reference Items. Preserve headings/paragraphs and retain original rich text in the source archive. Generated inventory/reference descriptions use labelled text rather than HTML.
- Add Repair missing contact links for true TAF exceptions. Choose an existing package Actor for each explicit role; Friend and Senior Artisan may be corrected differently even if the source used the same missing ID. Do not infer target identities from similar names.
- Recheck dependencies after explicit contact choices, rewrite only the matching role links, and retain unrelated missing references. Store approved choices on imported copies for retry; reject outside-package, self and compendium targets.
- Local QA only, stable 1.8.0 unchanged. Reuse the current source ZIP in a fresh target world.

## 1.9.0-qa.4.8 — Readable imported biography and source notes

- Convert TAF biography HTML into plain sheet text with separate headings, paragraphs, lists and table rows. Preserve Foundry link identities and inline media paths; keep the original source HTML in the migration archive.
- Write TAF source references, counters, annotations and additional fields as labelled text rather than HTML tables in PC/NPC Notes. Zero values remain explicit.
- Retain the complete converted TAF text with paragraph boundaries when creating its Tome projection, rather than using only a flattened 320-character summary. Ordinary projections/private notes fallbacks are unchanged.
- Split inline Contacts role/UUID lists before target legacy migration. Resolve exact source identities, keep distinct roles for a shared person, and retain missing identities as separate unresolved contacts. Support multiline named Talent descriptions, annotated Wises and explicit lv1 Trait notation.
- Local QA only; stable 1.8.0 unchanged. Reuse the current campaign ZIP for a fresh target import; retry does not overwrite existing copies.

## 1.9.0-qa.4.7 — TAF trained skills and biography sheet fields

- Restore narrative Nature into `natureDescriptors` and Creed into the matching sheet field, separately from numeric Nature. Accept explicit headings, labelled text, bold labels and two-column field tables for biography/header information.
- Convert Will/Health Skills attributes into Realm Guard role Items with original ratings and identities. Positive ratings are trained, zero ratings remain untrained, including custom skills. Invalid/conflicting ratings stay readable in Notes; source Macro triggers and effects stay inactive.
- Recover station and homeland from an unambiguous actor-matching self-description. Use canonical station keys; never borrow another person's information or invent missing age/concept. Show missing header values in document preview.
- Existing media-bearing QA.4.6 campaign ZIPs can be reused. Test in a fresh target world: retry intentionally reuses already imported copies instead of overwriting their fields. Local QA only; stable 1.8.0 unchanged.

## 1.9.0-qa.4.6 — Portrait transfer and readable biography conversion

- Include accessible media in campaign ZIP exports by default, with a visible choice for reference-only export. Restore checksum-verified files into a package-specific world directory before creating documents; remap portrait, token, inline media and private presentation references. Retry reuses matching files and refuses to overwrite different content.
- Cache failed Tome template images for the browser session and use a fallback before later template rendering. Original document paths remain intact.
- Parse explicit TAF biography headings and unambiguous relationship table roles into matching Realm Guard sheet fields. Import explicit rated Traits, named Wises as unrated, and named Talents with their written effect in manual mode and zero automatic bonus. Preserve the complete original Biography and show an escaped readable preview. Conflicting text remains reference material.
- Restore contacts into Character → Relationships through the target Social Network API and link unique imported NPCs. Restore Fate/Persona/Checks to header counters, preserve lifetime spends and use target-system progression to calculate Level. Conditions and counter definitions do not become gear. Missing portraits may borrow packaged target art without creating template Actors.
- Local QA only. Stable 1.8.0 is unchanged. Export a new ZIP from the source world with media enabled to carry actual image files; old reference-only ZIPs cannot recreate missing files.

## 1.9.0-qa.4.5 — Merge old GM accounts safely

- Allow explicitly mapped old GM accounts to share the importing GM. Keep the exporting GM bound to the current GM and reject shared Player destinations.
- Merge old GM ownership levels using the highest explicit level, independently of source object order. Existing default-visibility and unmapped-account safeguards remain.
- Reserve Player destinations during automatic proposals so repeated source names cannot claim the same existing account twice. Keep deliberate saved choices editable.
- Identify conflicting source/target names and open account mapping on a mapping conflict. Reject conflicts before creating Player accounts or importing documents; retry continues to reuse migration-created accounts.
- Local QA only; stable 1.8.0 and the existing migration ZIP format are unchanged.

## 1.9.0-qa.4.4 — Prepare TAF proposals immediately; approve once

- Prepare a read-only TAF conversion proposal during ZIP preview instead of first presenting hundreds of unconverted exceptions. Remove the separate Apply Group Conversion activation step.
- Use the actual dependency-eligible copy set for the initial summary. Proposed group/fallback and base-Actor Scene policies are stated before the single Approve proposal & Import action; changes update automatically.
- Propose saved mappings, uniquely named existing Players, or new Player accounts without creating anything during preview. Other GMs remain private by default. New account counts are visible and all choices remain editable.
- Keep deliberate per-document roles, exclusions and attribute choices. Preserve proposal metadata through untouched exception forms. Collapse exceptions and show only relevant core mapping fields initially.
- Retain private GM Notes restoration, separate NPC compendiums, original source information, retry and relationship suggestions. Local-only QA delivery; stable 1.8.0 unchanged.

## 1.9.0-qa.4.3 — TAF group migration, Player accounts and story review

- Support the supplied TAF 3.1.0 schema alongside 3.2.0. Confirm Character/NPC per source folder/compendium group and reuse compatible core-field conversion across the package.
- Preserve non-equivalent attributes/skills/traits and Freeform Sheet text as readable Actor references; keep inventory details, token appearance, original identities and separate NPC compendiums. Use an explicit shared policy for cross-system Scene token overrides.
- Retain true missing-link exceptions while ignoring references in inactive module automation. Validate converted copies before import.
- Add an explicit Create new Player account choice, resolved only at Do Import, with role-safe creation and retry reuse. Existing source GM ownership remains mapped to the importing GM.
- Restore GM Notes module text into the importing GM's private contextual Vault and redact it from document source archives before restoring player visibility.
- Reuse existing bilingual relationship extraction and canonical identities to propose imported biography/sheet/folder relationships for GM review. Repeated analysis replaces stale proposals without duplicate NPC creation or fact confirmation; Session/Quest analysis continues through Campaign Index.
- Local package simulation: 1,023 of 1,031 documents copied after shared choices, 8 genuine dependency exceptions, 186 compendium Actors preserved, no unresolved copied references or duplicate retry copies. Live Foundry confirmation remains pending. Stable 1.8.0 unchanged; not published.

## 1.9.0-qa.4.2 — Gear menu and GM Notes & Vault backup

- Put Import & Export under the top-right gear for GM and players. GM also has Campaign Settings and Export GM Notes & Vault; players have Export my Chronicle.
- Add a dedicated, restorable private JSON backup of the current GM’s notebook, scratchpad, Vault/contextual notes and reveal queue. No Chronicle books, shared inbox or campaign settings are read/exported.
- Merge restores preserve local notes. Cross-world restore requires an existing completed campaign mapping; the same backup can recover deleted data again without duplicating notes.
- Keep explicit startup dependencies and role checks. Do not publish; stable channel stays 1.8.0.

## 1.9.0-qa.4 — Shared Import & Export and hardening

- Replace the three GM settings cards with one role-aware Import & Export workspace. Existing Session/Quest import shortcuts route into the same window.
- Recognize campaign ZIPs, legacy Tome packages, Markdown and text. Reuse the native content import review, Create/Update/Skip, cross-links, history and confirmed latest-transaction Undo.
- Retain campaign ZIP, portable content, player-safe content, private GM archive and clipboard export. Reference archives are clearly distinguished from restorable campaign ZIPs.
- Put each player's own Chronicle transfer in the same shared workspace, with no GM inventory/history access. Support own-account backups in the same world without GM mapping; cross-world migration remains account-mapped.
- Reject stale/modified/consumed previews and invalid choices. Stop content import between documents while preserving saved partial work and snapshots for Undo.
- Existing migration retry, folder continuity, private data, encryption and permission handling retained. Actual TAF campaign testing remains pending; stable channel stays 1.8.0. Local QA delivery only.

## 1.9.0-qa.3 — Owner-aware campaign and Chronicle migration

- Include the exporting GM’s Campaign Memory, private vaults, workspace, reveal queue, campaign/group settings, their Chronicle books and already-shared inbox in the private GM package.
- Map source accounts once before importing. Restore ownership, including Journal page overrides, after private staging. Unmapped accounts keep affected copies GM-only; migrated compendiums remain private.
- Remap UUIDs, legacy private-vault keys and document IDs. Merge local private notes and preserve original settings/Undo snapshots in an inactive user-scoped archive. Checkpoint private restoration for retries.
- Add My Chronicle → Move my Chronicle for each player’s own export/import. Keep encrypted notes encrypted with their original authentication context and permission-checked remapped links; repeat imports do not duplicate notes or auto-share saved versions.
- Older ZIPs remain supported as GM-only document imports. A new qa.3 export is needed for private data/account mapping. Live TAF testing remains pending; optional cross-system contract fixtures do not imply a production Genesys mechanical converter.
- Local QA build only; stable channel remains 1.8.0.

## 1.9.0-qa.2.6 — Expected review/index retry

- Propagate stale-input signals from deterministic auto-link back to Campaign Index instead of logging them as failures.
- GM identity decisions remain saved; changed inputs are requeued through the existing index handler. Real errors still warn and affect audit health.
- Migration/UI behavior from qa.2.5 retained.

## 1.9.0-qa.2.5 — Standard folder continuity

- Reuse the destination's canonical Tome root, sections and World categories; persist source-folder aliases without replacing existing folder metadata.
- Pause automatic backend projections and source parity during writes, then resume after imported Actors and Journals are present.
- Remap managed projection Actor/Folder IDs as well as UUIDs. Serialize concurrent standard-folder bootstrap calls.
- Preserve custom folders and content. Existing duplicate filled trees are not automatically merged or deleted. Stable channel remains 1.8.0.

## 1.9.0-qa.2.4 — Campaign data versus system libraries

- Exclude system-owned packs and Realm Guard's eight starter libraries from export, including Quick NPC templates. Active world Actors are retained even if originally based on a starter template.
- Older migration ZIPs also exclude these libraries during import; earlier migrated library copies are not re-exported as campaign Actors.
- GM-created compendium content stays in private migrated packs, preserving types, folders and remapped links; it is never instantiated as world Actors. Existing packs are not overwritten.
- Import/Export tabs and progress UI retained. Stable channel remains 1.8.0.

## 1.9.0-qa.2.3 — Import progress

- Updated same-version local build: separate Import/Export tabs, numbered workflows, Preview Import / Do Import and Preview Export / Download Export ZIP. One main import action; advanced and technical details are collapsed.
- Show a progress bar directly beneath the import action, with percentage, saved copies / total copies and the current document.
- Advance only after creation succeeds; interrupted runs retain their actual saved count and stopped status.
- No change to migration selection or mapping. Stable channel remains 1.8.0.

## 1.9.0-qa.2.2 — Native persistence and interrupted import

- Store UUID identity mappings as list entries: Foundry dotted-key expansion no longer crashes at the first Actor with embedded Items.
- Read earlier Folder identity records in both flat and Foundry-expanded forms so interrupted imports can resume without duplicate folders.
- Report the failed document and remaining copies prominently; failed runs show stopped status and a persistent notification.
- A missing saved-document response is a failure, never a completed copy.
- Stable channel remains 1.8.0; this is a local qa.2 fix.

## 1.9.0-qa.2.1 — Same-system copy fix

- Same-system Actor/Item copies no longer require individual approval just because source and target QA versions differ. Native target data validation still isolates incompatible records.
- Historical source/compendium provenance does not become a live missing-link dependency, including archives from earlier migrations.
- Preserve same-system flags and token overrides; remap Realm Guard bag/container Item IDs.
- Unique build version is visible in the toolkit. Taf conversion controls appear only for taf → Realm Guard.
- Counts/exception-only review and one-action ready-copy import remain the default. Stable channel stays 1.8.0.

## 1.9.0-qa.2 — Reviewed target copies

- Target package validation, copy-only imports and explicit GM review.
- Optional taf 3.2.0 → Realm Guard adapter: biography, generic inventory and confirmed attribute mappings.
- Preserve explicit semantic categories independently of backend document types and field mapping. Remap Contact Actor IDs and stored UUID relations; missing parties remain exceptions.
- Move ready copies in one action with counts/exception-only review. Reuse confirmed field mappings for matching fields without changing Character/NPC roles; batch classification is explicit only for genuinely unknown Actors.
- Resolve exceptions in a later pass without duplicating earlier copies from the same package.
- Original source data archived on private target copies; unknown systems remain unsupported rather than guessed.
- Selected compendium documents import as world copies. Included media remains in the ZIP; automatic upload and complete private storage migration are not in this QA.

## 1.9.0-qa.1 — Migration Core + Generic Foundry Content

GM-only Migration Toolkit in Campaign Settings → Developer Tools. Read-only world/selected-compendium analysis, portable ZIP export, embedded identity mapping, reference/dependency reports, optional media files and SHA-256 integrity checks. Source data remains intact; Actors/Items are preserved as unmapped. Target import, rules conversion and owner-aware campaign-state migration follow in later QA. See [qa.1 documentation](docs/V1.9_QA1_MIGRATION_TOOLKIT.md).

## 1.8.0 — 2026-10-11

Stable promotion of the verified Player Chronicle QA build. Players can keep private campaign notes, choose explicit GM or party sharing, record remembered moments, and browse knowledge derived only from notes visible to them. GMs can review player-shared signals without turning them into campaign facts. Chronicle references are available on Tome entity surfaces while private player notes remain outside Campaign Index and campaign analysis. See [release notes](docs/V1.8_STABLE_RELEASE.md).

## 1.7.0 — 2026-10-11

Stable promotion of the verified 1.7 QA build. Includes bilingual Swedish/English analysis, Campaign Index and background processing, identity and relationship review improvements, decision history/Undo, private GM fact correction, scroll preservation and review/name cleanup. See [release notes](docs/V1.7_STABLE_RELEASE.md).

# CHANGELOG

## 1.8.0-qa.4 — Chronicle Entity Surface Verification

- Adds cross-surface regression checks for Player Chronicle on Actor, World, Session, Quest and generic entity details.
- Verifies each surface uses its canonical Foundry UUID, filters notes to that entity, preselects the entity when creating a note, and keeps the player Chronicle panel out of GM views.
- No runtime behavior or campaign data format changed; the audit confirms the existing integration works consistently across all five surfaces.

## 1.8.0-qa.3 — Player Signals in Next Session Prep

- Adds a GM-only Player Signals summary to Next Session Dashboard, grouped by explicit signal type and currently visible canonical entity.
- Shows distinct player and signal counts plus the shared note context, with a direct route to the existing Player Signals review.
- Includes only live notes deliberately shared with the GM. Private notes, party-only shares, withdrawn snapshots and GM-authored notes are excluded.
- Keeps signals descriptive and user-authored; Tome does not convert them into campaign facts or inferred intentions.

## 1.8.0-qa.2 — Player Knowledge & Memory Views

- Adds **Known to Me**, derived only from the current user's private notes and explicitly shared notes visible to them. Each entity stays linked by canonical UUID and shows the notes that mention it.
- Adds an optional, player-entered remembered-moment date and a chronological timeline. Note edit timestamps are never treated as event dates.
- Expands My Chronicle search across private notes, received shares, signal type and currently visible linked entity names.
- Keeps all derived views user-scoped and outside Campaign Index, Campaign Memory, campaign discovery and shared search.
- Defers broader narrative synthesis; Next Session shows only transparent counts and excerpts from explicit GM-shared signals.

## 1.7.0-qa.40 — Identity Briefing & Clean Session UX

- Adds direct identity briefing rows to Guided GM Decision candidates so GMs can decide without opening More info.
- Candidate briefings may show role/type, occupation, faction/group, location, relations, linked Contact/Actor context and previous mentions.
- World Contact candidates now identify linked Actors when available.
- Low-data candidates explicitly state that no useful campaign profile information is recorded instead of relying on opaque IDs.
- Keeps More info for secondary Facts, Relations and previous Campaign Memory mentions.
- Removes visible Tome noticed blocks from Session and Quest detail pages.
- Preserves all Mention evidence in Campaign Memory and keeps GM Review / Analysis / Memory as the review workflow.
- Keeps qa.38/qa.39 decision writes, focused Analysis, no-auto-create policy and player privacy unchanged.

## 1.7.0-qa.39 — Decision UX & Contextual Indicators

- Makes Guided GM Decision candidates full-width, larger and easier to read.
- Candidate cards now emphasize portrait, identity name, role/profile metadata, context reason and a large **This is the one** action.
- Adds expandable **More info** with Facts, Relations and previous Campaign Memory mentions when available.
- Retires the large inline Campaign Analysis panel from Session and Quest pages.
- Adds a GM-only **GM review** status tile to Session and Quest information views.
- Clicking the contextual GM review tile opens Campaign Tools → Analysis focused on that exact source.
- Focused Analysis can be cleared with **Show all decisions** while Overview remains global.
- Keeps qa.38 guided decision writes, conservative recommendations, source-scoped defer behavior, Undo and player privacy unchanged.

## 1.7.0-qa.38 — Guided GM Decisions

- Turns Campaign Tools → Analysis into a guided GM decision inbox instead of a passive diagnostic list.
- Adds a Campaign Intelligence **Decision Monitor** to Overview with Ambiguous / Unresolved / Review / Tome noticed counts.
- Overview shows the next pending GM question and can one-click confirm a sufficiently strong Tome recommendation.
- Replaces technical review rows with explicit questions such as “Which existing identity does this mention mean here?”
- Presents ranked existing canonical candidates with portraits, profile metadata and evidence/context reasons when available.
- Marks **★ Tome recommends** only when the evidence produces a clear lead; tied candidates remain undecided.
- Choosing a candidate writes the canonical Campaign Link through the existing Campaign Entity Links API.
- Adds source-scoped **Keep unresolved** and **Keep as Mention only** actions so dismissed questions do not pile up.
- Adds safe Undo for the most recent guided decision in the current Tome session.
- Rescans Campaign Mention Evidence after each decision so the pending queue can shrink immediately.
- Preserves canonical UUID authority, no-auto-create policy, ambiguity safety and player privacy.

## 1.7.0-qa.37 — Campaign Analysis & Entity Review

- Adds a fourth GM-only Campaign Tools tab: **Analysis**.
- Adds an Entity Review Queue for Ambiguous, Unresolved and Mentioned · review Campaign Memory states.
- Groups repeated active evidence for the same identity/state into one review row.
- Shows latest evidence context, total evidence count and source count.
- Adds safe Target and authoritative Source navigation from review rows.
- Adds a separate **Tome noticed** area for ordinary active mentions that are informational rather than decision-required.
- Adds Analysis to contextual Campaign Tools navigation on Dashboard, Quick Capture, Reveal Queue and Post-Session pages.
- Keeps Analysis read-only: no auto-create, ambiguity resolution or canonical Link writes are introduced.
- Preserves deterministic auto-link, unlink suppression, Campaign Memory lifecycle and player privacy semantics.

## 1.7.0-qa.36 — GM Workspace Decomposition & Token UX

- Moves Notebook Overview into Campaign Tools → Overview.
- Moves Campaign Scratchpad and Custom Notepads directly into Campaign Tools → Assistant.
- Removes the legacy GM Notebook entry from Campaign Settings navigation.
- Redirects existing Notebook actions to the Assistant workspace.
- Adds a GM-only Private Vault control to the Foundry Token HUD.
- Private Vault opens the token's canonical Actor profile editor in an explicit GM-only Vault mode.
- Reuses existing private GM workspace and private overlay storage; no parallel database or authority changes.
- Preserves qa.35 Campaign Tools navigation and player privacy.

## 1.7.0-qa.35 — Campaign Tools Consolidation

- Locks the UX principle: **Header = global utility actions; Campaign Tools = GM campaign workflows.**
- Adds **Assistant** beside Overview and Memory in the GM-only Campaign Tools workspace.
- Moves Next Session Dashboard, Quick Capture, Reveal Queue and GM Notebook launchers out of the top-right header.
- Adds Assistant launchers for Next Session Dashboard, Quick Capture, Reveal Queue, Post-Session Assistant and GM Notebook.
- Keeps Manual/Help and Campaign Settings in the global header.
- Keeps Campaign Tools highlighted on dedicated Dashboard / Quick Capture / Reveal Queue / Post-Session pages and adds contextual Campaign Tools sub-navigation there.
- Preserves all existing GM workflow implementations, Campaign Memory behavior, canonical authority and player privacy semantics.

## 1.7.0-qa.34 — Campaign Memory Search & Filters

- Adds a GM-only top-level **Campaign Tools** workspace with **Overview** and **Memory** sub-tabs.
- Moves Campaign Memory Evidence Search out of ordinary Tome Search and into **Campaign Tools → Memory**.
- Adds a lightweight Campaign Tools Overview with Evidence, Linked + Mentioned, Unresolved and Historical counts.
- Preserves ordinary Tome Search as the normal document/entity search.
- Free-text searches target/entity names, mention text, snippets, sources, pages, relation labels and lifecycle metadata.
- Adds filters for relation state, Active/Historical lifecycle, Session/Quest source type and target/entity type.
- Adds Newest / Oldest / First seen / Last seen sorting.
- Adds target navigation from evidence results into Tome/Foundry and preserves separate Tome-source and authoritative Foundry-source navigation.
- Extends the Campaign Mention Evidence API with lifecycle and target-kind filters.
- Preserves the GM-private evidence boundary and does not expose Campaign Memory evidence to players.
- Keeps deterministic auto-link, ambiguity and canonical authority semantics unchanged.

# CHANGELOG

## 1.7.0-qa.33 — Evidence History & Source Jump

- Adds compact Campaign Memory history presentation with First Mention, Last Mention, Recent Evidence and expandable older/historical evidence.
- Prioritizes the five newest active mentions so long campaign histories remain readable.
- Adds a dedicated Source action that opens the authoritative Foundry JournalEntryPage when page provenance is available.
- Keeps normal Tome navigation on the source Session/Quest name.
- Extends Campaign Mention Evidence queries with newest/oldest/first-seen/last-seen sorting.
- Adds target summary and recent-evidence API helpers as foundations for later search/filter UI.
- Does not change deterministic auto-link, ambiguity or auto-create policy.

# CHANGELOG

## 1.7.0-qa.32 — Deterministic Campaign Auto-Link

- Automatically creates canonical Campaign Links for detected Session/Quest mentions that resolve to exactly one existing canonical identity.
- Requires exact existing-name evidence plus one reconciled identity; raw confidence alone is not sufficient.
- Keeps ambiguous same-name identities such as two unrelated Gunthers out of auto-link.
- Never auto-creates new entities.
- Keeps persistent Mention evidence after linking so **Linked + Mentioned** coexist.
- Adds canonical Foundry Item targets to Campaign Entity Links for Item-backed Tome World projections.
- Projects canonical Item links back into Tome World presentation without replacing Item UUID authority.
- Records auto-link provenance and respects GM unlink suppression.
- Hardens release automation so feature-branch READY changes cannot publish releases before merge.

# CHANGELOG

## 1.7.0-qa.31 — Campaign Mention Foundation

- Adds the first persistent Campaign Memory evidence ledger for Session/Quest mentions.
- Keeps **Linked**, **Mentioned**, and **Suggested/Ambiguous** as separate semantics.
- Persists source UUID, page UUID, target UUID when resolved, mention text, snippet, confidence, provenance and lifecycle state.
- Keeps disappeared evidence as Historical instead of silently deleting campaign memory.
- Adds GM-only **Mentioned In** history to World profiles with First/Last Mention and source navigation.
- Keeps Mention evidence after a canonical Campaign Link is created, allowing **Linked + Mentioned** to coexist.
- Adds query/search foundations through `campaignMentionEvidence`.
- Uses GM-private user-scoped storage for qa.31; player-safe viewer-scoped persistence remains a later layer.
- Does not auto-link, auto-create or merge identities.

# CHANGELOG

## 1.7.0-qa.30 — World Campaign Link Authority Parity

- Makes World Detail Campaign Links canonical/explicit-only, matching Session and Quest authority semantics.
- Removes prose-only Session, Quest and Actor matches from authoritative World Campaign Links.
- Preserves those heuristic relationships in a separate read-only **Tome noticed** section with provenance-style reasons.
- Shows an explicit empty-state when a World entry has no canonical Campaign Links.
- Keeps reciprocal explicit links authoritative from either source or target side.
- Preserves qa.24–qa.29 identity, source-scoped resolution, Foundry backend parity and GM-explicit graph-write behavior.

# CHANGELOG

## 1.7.0-qa.29 — Universal Foundry Backend Folder Parity

- Locks Foundry folders/documents and their UUIDs as the backend/source of truth for Tome standard folders.
- Adds a universal backend-folder parity API with registry, synchronization, lifecycle hooks and diagnostics.
- Mirrors Actor-backed NPC/NPC Group trees, Actor-backed Contact folders, real Foundry Item folders, and external Journal category folders into the Journal-rendered Tome World tree.
- Mirrors empty nested backend folders as well as document-bearing folders.
- Routes supported Tome folder/document rename, move, delete and subfolder creation back to the canonical Foundry backend.
- Routes native/generic Tome NPC creation into the canonical Actor folder when a backend mapping exists.
- Keeps managed backend projections read-only and opens the real Actor/Item/Journal source instead of treating projection Journals as authorities.
- Extends Campaign Identity Reconciliation so backend projections collapse to Actor, Item or Journal source UUID authority.
- Keeps Sessions, Quests, Rules and direct World Journals as real Foundry Journal-backed content.
- Preserves qa.24–qa.28 Campaign Intelligence semantics and GM-explicit graph writes.

# CHANGELOG

## 1.7.0-qa.28 — Source-Scoped API Binding Hotfix

- Fixes the qa.27 Session/Quest render-time `ReferenceError: sourceScopedApi is not defined`.
- Binds the Source-Scoped Identity API locally inside suggested mention reconciliation.
- No qa.27 identity-resolution policy or graph-write behavior changes.

# CHANGELOG

## 1.7.0-qa.27 — Source-Scoped Identity Resolution

- Adds a shared read-only Source-Scoped Identity Resolution layer.
- Resolves mention identity from current Session/Quest canonical Campaign Links before broad campaign candidates.
- Uses explicit source/page Foundry references as the next authority signal.
- Prefers active world candidates over compendium templates when source-local authority is absent.
- Reconciles Actor + Contact/World projections before ambiguity is determined.
- Campaign Analysis and Tome noticed now consume the same source-scoped identity interpretation.
- Prevents unrelated same-name campaign/compendium records from overriding stronger source evidence.
- Keeps all graph writes GM-explicit; no auto-linking, creation or document merging is introduced.

# CHANGELOG

## 1.7.0-qa.26 — Campaign Analysis Identity Parity

- Makes Campaign Analysis reconcile all resolver candidates before presenting identity state.
- Actor + managed Contact/World projections that converge on the same Actor UUID now present as Reconciled instead of inheriting a stale Ambiguous resolver decision.
- Genuine same-name collisions remain Ambiguous and expose the remaining identity count.
- Keeps Tome noticed and Campaign Analysis on the same shared identity semantics.
- No Campaign Link, creation, document merge or confidence-driven write behavior changes.

# CHANGELOG

## 1.7.0-qa.25 — Suggested Mention Identity Reconciliation

- Adds a shared read-only Campaign Identity Reconciliation layer for advisory campaign intelligence.
- Collapses Actor + managed Contact/World projections when they resolve to the same canonical Actor UUID.
- Keeps unrelated same-name canonical identities ambiguous instead of silently merging them.
- Reconciles Tome noticed suggestions across Actor and World/Contact categories before rendering.
- Reuses the same identity interpretation in Campaign Analysis known mentions.
- Aggregates mention/confidence presentation across reconciled representations without performing campaign writes.
- Keeps qa.24 canonical Campaign Link authority and all GM-explicit graph-write boundaries unchanged.

## 1.7.0-qa.24 — Canonical Link Authority & Suggested Mentions

- Separates authoritative Campaign Links from heuristic text-derived matches in Session and Quest detail views.
- World / Character / Quest counters now represent explicit or canonical relationships only.
- Canonical Actor UUIDs and Journal UUIDs from `campaignEntityLinksV1` are included in Tome detail-link authority.
- Moves prose-only matches into a separate read-only **Tome noticed** section.
- Adds provenance-style reasons for Actor name, unique first-name, title, alias, World and Quest text mentions.
- Marks duplicate display-name suggestion groups as **Ambiguous** instead of silently presenting them as canonical identities.
- Keeps all graph writes GM-explicit; no auto-linking or auto-creation is introduced.

## 1.7.0-qa.23 — Native Empty Query Preservation Hotfix

- Fixes the final native NPC bridge still replacing an explicit empty template query with the candidate Actor name.
- `quick-npc-ui.js` now preserves `initialQuery:""` and falls back to `options.name` only when the property is absent.
- Character/NPC Create & Link can therefore open the full native Quick NPC library without a manual Clear step.
- Item, Location, Contact, Faction and Lore creation flows are unchanged.
- Keeps qa.21 completion waiting and qa.20 canonical convergence unchanged.

## 1.7.0-qa.22 — Native NPC Template Query Separation

- Separates Campaign Intelligence NPC Actor naming from native Quick NPC template filtering.
- Character/NPC Create & Link now opens the native template library unfiltered while preserving the confirmed candidate as the Actor name.
- Universal Folder Quick Create distinguishes an explicitly empty `initialQuery` from an absent query, preserving existing fallback behavior for other callers.
- Removes the manual Clear workaround observed in qa.21.
- Keeps qa.21 completion waiting, canonical UUID authority, Campaign Learning and Campaign Link convergence unchanged.

## 1.7.0-qa.21 — Native Creation Completion / Canonical UUID Hotfix

- Fixes Campaign Intelligence Character/NPC Create & Link treating the opened native Quick NPC Library as if Actor creation had already completed.
- Adds an explicit completion-aware native Quick NPC path that waits for the provider's real `onCreated(actor)` callback before canonical UUID resolution continues.
- Forwards `awaitCreation` through Universal Folder Quick Create only when explicitly requested.
- Preserves normal native Quick NPC behavior outside Campaign Intelligence.
- Closing the native library without creating an Actor resolves as cancellation with no learned canonical target or Campaign Link write.
- Keeps canonical UUID authority, GM-explicit graph writes and qa.20 World-entity convergence unchanged.

## 1.7.0-qa.20 — Canonical Convergence & Campaign Links

- Persists real Session/Quest Campaign Links after explicit Create & Link or Link Existing actions.
- Extends canonical Session/Quest link storage with generic entity UUIDs while preserving existing Actor UUID and legacy compatibility projections.
- Writes reciprocal Session/Quest references to created/linked Actor or World targets.
- Adds canonical convergence verification: target resolves, is visible in Campaign Discovery, and is persistently linked.
- Keeps all graph writes GM-explicit; no confidence-driven automatic linking is introduced.


## 1.7.0-qa.19 — Confirmed Entity Creation & Canonical Identity

- Adds the first controlled Campaign Intelligence entity-creation path.
- Explicitly Confirmed candidates gain Create & Link alongside Link Existing and Reset.
- Reuses Tome's existing Universal Folder Quick Create and native Quick NPC/system-provider stack rather than introducing a separate creation engine.
- Prefills the confirmed candidate name into delegated creation flows.
- Records the successfully created canonical UUID in world-scoped Campaign Learning.
- Blocks silent exact-name duplicate creation and requires explicit GM confirmation.
- Normal Session/Quest Campaign Link writes remain disabled.


## 1.7.0-qa.18 — GM Review & Campaign Learning Foundation

- Adds explicit GM review actions to Campaign Analysis: Confirm, Ignore once, Suppress and Link existing.
- Stores review decisions in a hidden world-scoped Campaign Intelligence learning setting.
- Applies campaign suppressions and source-local ignores to future new-entity scans.
- Preserves confirmed and linked decisions as explicit learned state in Campaign Analysis.
- Link Existing records a candidate-to-canonical-UUID teaching decision only; it does not write Tome Campaign Links yet.
- No entity creation, prose mutation, automatic self-learning or silent campaign writes are introduced.


## 1.7.0-qa.17 — NLP Arbitration & Fantasy Entity Semantics

- Hardens the qa.16 NLP provider so generic Verb tagging can no longer destructively trim a fantasy proper-name candidate.
- Keeps stronger grammar classes (Auxiliary, Copula, Modal, Preposition, Determiner, QuestionWord, Conjunction) as boundary evidence.
- Adds fantasy-domain Location semantics such as Abbey, Temple, Monastery, Shrine, Citadel, Stronghold, Manor, Palace, Camp, Outpost and Chapel.
- Strengthens contextual Faction evidence for phrases such as soldiers/members/agents/followers/warriors of X and adds Choir as a faction-like semantic suffix.
- Keeps Compromise advisory only; Tome remains identity authority and no campaign writes are introduced.


## 1.7.0-qa.16 — NLP Provider Foundation

- Adds a local advisory NLP provider layer using vendored Compromise 14.17.0 (MIT).
- Records third-party attribution and the upstream MIT license in-repo.
- Uses grammatical tagging to refine candidate boundaries before canonical-name / alias filtering.
- Fixes grammar-edge candidates such as "Is Dev" and "TrueBlood the" without turning the NLP provider into identity authority.
- Preserves Tome's deterministic scanner, identity resolver and GM-controlled write boundary.
- Runs locally with no external NLP service or campaign-text transmission.


## 1.7.0-qa.15 — Question & Alias Boundary Precision

- Fixes the live qa.14 edge case where question/auxiliary starters such as "Is" could become part of a proper-name candidate, producing noise like "Is Dev".
- Trims common question/auxiliary starters before canonical-name and known-alias filtering.
- Preserves qa.13 verified Character/NPC, Location, Faction, Item and Lore candidates.
- Remains read-only with no entity creation, Campaign Link writes or persistent alias learning.


## 1.7.0-qa.14 — Session / Quest Analysis Preview

- Adds a GM-only, read-only Campaign Analysis panel directly to Session and Quest detail views.
- Presents known direct mentions from Semantic Mention Discovery without broad relation-graph expansion.
- Presents qa.13 possible-new-entity candidates with inferred type, confidence and mention count.
- Keeps Confirm / Ignore / Create actions intentionally disabled.
- Defers analysis-panel refresh while live authoring is active so qa.11 editor continuity remains protected.
- No entity creation, Campaign Link writes or Session/Quest text mutations are introduced.


## 1.7.0-qa.13 — New Entity Candidate Precision

- Tightens qa.12 Unknown/New Entity Discovery using the live Session 7 baseline.
- Trims leading context/preposition words before proper-name candidate evaluation.
- Suppresses one-off single-token candidates when they have no meaningful entity-type evidence.
- Keeps suppressed noise available through a diagnostic suppressedForSource(uuid) API.
- Preserves useful Character/NPC, Location, Faction, Item and Lore detection.
- Remains read-only with no entity creation or Campaign Link writes.


## 1.7.0-qa.12 — Unknown / New Entity Discovery

- Adds a read-only Campaign Intelligence layer that detects likely proper-name entities in Session and Quest prose when they do not resolve to an existing canonical campaign identity.
- Separates detection confidence, entity-type confidence and identity confidence.
- Filters known canonical names and likely known single-token aliases before producing new-entity candidates.
- Adds contextual classification for Character/NPC, Location, Faction, Item, Lore and Unknown candidates.
- Repeated mentions strengthen detection only and do not create identity certainty.
- Exposes campaignNewEntityDiscovery scan/snapshot/candidatesForSource/audit APIs.
- No Actors, Journals, Items, Campaign Links or other campaign data are created or modified.


## 1.7.0-qa.11 — Source Parity Live-Authoring Render Guard

- Fixes the verified remaining autosave interruption caused by legacy Foundry Source Parity issuing an unconditional full Tome render after JournalEntryPage updates.
- Source Parity now defers its render while Tome authoring is active or the app is bulk-updating.
- A single pending Source Parity refresh resumes only after the editor session has ended and save state has settled.
- Source Parity synchronization itself remains enabled.
- Campaign Intelligence and Campaign Link persistence are unchanged.


## 1.7.0-qa.10 — Live Authoring DOM Preservation

- Fixes the remaining Session/Quest autosave focus loss at its actual local-render root cause.
- Session/Quest Journal page shells are no longer removed/rebuilt while they contain a live editor, even when autosave changes JournalEntryPage modifiedTime.
- Alpha6 page-navigation rebuilds are also deferred while authoring is active.
- Deferred structural refresh resumes after the user deliberately exits editing.
- World authoring remains unchanged; Rules keep qa.9 editor-session protection.
- Campaign Intelligence and Campaign Link persistence are unchanged.


## 1.7.0-qa.9 — Universal Tome Authoring Convergence

- Converges Tome authoring around the World editor-session model instead of leaving World as a special case.
- A live Journal-backed editor now owns the Tome render lock for the full editing session; autosave no longer releases the lock underneath the caret.
- Generic Session/Quest Create controls are removed for GMs in favor of New Session / New Quest.
- Generic Session/Quest Page toolbar controls are removed from normal detail UX; extra pages remain available through Advanced Pages.
- Rules now participate in the shared Tome editor lifecycle so their overlay is protected from background rerenders while active.
- World rich-text editing continues using the existing editor bridge.
- Campaign Intelligence and Campaign Link persistence are unchanged.


## 1.7.0-qa.8 — Editor Continuity Guard

- Fixes Session Chronicle / Quest Overview autosave ending the active writing session through downstream Tome background renders.
- Tracks active Tome editors centrally and keeps autosave independent from edit-mode lifetime.
- Registry, Campaign Discovery and Mention Discovery may continue updating while the GM writes, but full Tome background renders are deferred while an editor owns the caret.
- Deferred refreshes coalesce and resume after the user deliberately exits editing and the save lock settles.
- Applies centrally to the shared Journal-backed authoring path instead of special-casing Sessions or Quests.
- Campaign Link persistence remains off.


## 1.7.0-qa.7 — Campaign Authoring Body-first Hotfix

- Adds a large Chronicle field directly to New Session so the GM can write or paste the full session log during creation.
- Adds a matching Quest Overview field directly to New Quest.
- Initial Chronicle/Overview text is written straight into the canonical JournalEntryPage.text.content; no parallel Tome body storage is introduced.
- Simplifies normal Session/Quest detail presentation around the primary writing surface and moves generic page-management UI behind an Advanced Pages action.
- Hides the competing legacy GM create control on Sessions/Quests so the task-specific Authoring 2.0 flow is the normal GM path; delegated-editor behavior remains untouched.
- Semantic Mention behavior and Campaign Link persistence remain unchanged.


## 1.7.0-qa.6 — Campaign Authoring 2.0: Sessions + Quests

- Adds direct GM-facing **New Session** and **New Quest** actions on their normal Tome pages.
- Normal creation no longer requires selecting an Explorer folder first.
- Sessions automatically resolve/create the canonical Sessions folder, suggest the next Session number, store draft/date/number metadata, create a Chronicle page, open the new Session, and hand editing to the existing Journal-backed autosave flow.
- Quests resolve/create the canonical Quests folder, preserve the existing Quest status flag, store structured Quest metadata, create an Overview page, open the new Quest, and reuse the same Journal-backed authoring flow.
- Chronicle and Overview remain canonical Foundry JournalEntryPage text; no parallel Tome body storage is introduced.
- Existing Explorer management and legacy Sessions/Quests remain compatible.
- Campaign Link persistence and Semantic Mention behavior remain unchanged.


## 1.7.0-qa.5 — Mention Confidence Gate

- Separates mention detection confidence from identity confidence for Session/Quest semantic mention discovery.
- Adds confidence bands: deterministic, high-confidence, review, weak and suppressed.
- Suppresses lowercase single-token prose entities such as `test` unless the same page provides an explicit visible canonical anchor for that identity.
- Keeps proper-name single tokens such as Aldari, Bree and Angmar detectable.
- Repeated mentions strengthen detection only and never prove identity.
- Explicit Foundry references remain deterministic.
- Same-page explicit canonical references can corroborate matching prose mentions.
- Campaign Link persistence remains OFF; all qa.5 classifications are read-only evidence only.


## 1.7.0-qa.4 — Projection-aware Identity Resolution

- Live QA confirmed that a canonical Actor and its active Tome Semantic Contact Journal projection could appear as two same-name candidates even though the projection's `linkedUuid` points to that exact Actor.
- Campaign Mention resolution now collapses an active Contact projection onto its visible linked canonical identity before same-name ambiguity is evaluated.
- Projection collapse requires a visible linked target in the current viewer-scoped Discovery snapshot and never broadens permissions.
- Genuine separate same-name identities remain ambiguous.
- Display-name-only evidence still requires review and never becomes auto-link eligible solely because a projection was collapsed.
- No Campaign Link writes, projection mutations, Contact lifecycle changes or Migration Workspace behavior are introduced.


## 1.7.0-qa.3 — Prose Mention Precision Hotfix

- Live qa.2 verified the Session/Quest scanner pipeline, including explicit canonical refs, prose-name detection, read-only behavior and cleanup.
- Tightens single-token prose-name matching to case-sensitive exact matching so ordinary lowercase words do not collide with title-cased entity names such as `Test`.
- Multi-word canonical entity names remain case-insensitive exact phrase matches.
- No identity-resolution, privacy, Campaign Link persistence or authority behavior changes.


## 1.7.0-qa.2 — Session / Quest Semantic Mention Discovery

- Promotes the qa.1 Campaign Mention identity resolver to VERIFIED after live canonical, name-only and same-name ambiguity tests.
- Adds viewer-scoped read-only scanning for Session and Quest Journal text pages.
- Detects explicit Foundry refs and exact visible entity names in prose, then routes every candidate through the qa.1 conservative identity resolver.
- Non-GM scans strip secret HTML and only use targets present in the current viewer-scoped Campaign Discovery snapshot.
- Explicit refs to unreadable targets are suppressed from the derived mention snapshot.
- Campaign Link writes, persistence, entity creation and Migration Workspace remain OFF.


## 1.7.0-qa.1 — Campaign Links / Semantic Mention Foundation

- Starts the v1.7 Campaign Graph line from stable v1.6.0 with a read-only Campaign Mention resolver contract.
- Adds normalized MentionCandidate support for Characters, NPCs, Locations, Factions, Items, Lore, Quests and Sessions.
- Locks conservative identity order: canonical UUID → semantic identity → external/import identity → corroborating context; display name remains supporting evidence only.
- Same-name entities never auto-merge, and name-only matches require GM review rather than automatic Campaign Links.
- Contextual auto-link eligibility requires multiple independent corroborating signals.
- Resolution operates only against the current viewer-scoped Campaign Discovery snapshot; no hidden evidence is broadened or exposed.
- Text scanning and Campaign Link persistence remain OFF in qa.1. The next QA step may add Session/Quest mention extraction on top of this contract.


## 1.1.0 — Tome Authoring & Journal Takeover

- Promoted the fully approved `v1.1.0-rc.1` baseline to stable without runtime feature changes.
- Added persistent Campaign Explorer organization backed by real Foundry Journal folders while preserving Tome's rich World / Quests / Sessions presentation.
- Added Tome-native folder management for create, rename, safe empty-only delete, and drag/drop reorganization with protected section roots.
- Added Tome-native entry management for create, rename, Open in Tome, Open Foundry Source, move, and guarded permanent Journal deletion.
- Added Journal Page management and navigation including create, rename, reorder, duplicate, move, delete, player access, primary-page handling, and direct page navigation inside Tome.
- Expanded Journal-backed authoring and autosave so campaign content can be maintained from Tome instead of relying on Foundry Journal sheets for normal workflow.
- Added delegated authoring roles: Section Editors can manage their assigned Tome section through a validated GM socket broker, while Entry Editors can author assigned entries/pages without structure privileges.
- Preserved strict Player read-only presentation and GM-private Notes/workspace isolation.
- Removed retired Explorer/tree/workspace prototypes and hardened release CI against their return.
- Hardened manifest, language, runtime-file, release-URL, ZIP-integrity, package-content, and retired-prototype validation.
- Added formal beta regression and RC-to-stable release gates for GM, Section Editor, Entry Editor, and Player workflows.
- Stable `v1.0.0` campaign data remains Journal-backed and compatible with the v1.1 authoring model.

## 1.0.0-rc.1 — Release Candidate

- Promoted the live-approved v0.20.8 runtime line into the Adventurer's Tome 1.0 release-candidate phase.
- No new runtime feature was added in this version; the RC deliberately freezes the established behavior for final regression testing.
- Kept the stable Glass UI with Normal/25/50/75/90% scene transparency, movable per-client launcher, Foundry close behavior, and customizable per-GM workspace.
- Kept the experimental minimize/restore feature retired; a future dock/minibar implementation remains a post-1.0 backlog item.
- Refreshed the v1.0 readiness/public-release documentation around the current v0.20.8 baseline rather than the older v0.15 audit state.
- Public RC packaging excludes the legacy private `assets/Bree.webp` compatibility asset and retains the original neutral default hero plus The Ashen Road demo assets.
- Public GitHub publication remains gated on repository metadata, a software-license decision, and the hosted clean-install smoke test.


## 0.20.8 - Stable Window Rollback

- Removed the experimental Tome minimize/restore control and all live compact-bar geometry handling.
- Removed the retired client minimize-state setting from active registration. Existing stored values are simply ignored.
- Returned Tome window persistence and viewport handling to the normal ApplicationV2 path: only the regular expanded window rectangle is saved.
- Kept the successful movable per-user launcher, right-click launcher reset, Normal/25/50/75/90% scene transparency, Glass UI, and GM Workspace Builder unchanged.
- The minimize/dock concept is intentionally parked for a future implementation that can use a separate dock surface instead of resizing the Tome ApplicationV2 window.

## 0.20.7 — Right-Anchored Compact Bar Hotfix

- Keeps the Tome window's **right edge fixed** when minimizing, so the compact bar collapses leftward instead of jumping away from the minimize button/pointer.
- Restore uses the compact bar's current **right edge** as its anchor and expands the saved full-size Tome leftward from that point.
- Moving the compact bar still works; restoring after a move preserves the saved expanded width/height while following the bar's new right-edge position.
- No transparency, launcher, GM Notebook, campaign data, permissions, import/export, or rule behavior changed.

## 0.20.6 — Compact Bar Minimize Hotfix

- Replaced the v0.20.5 geometry-neutral clip with a strict two-state minimize model: Expanded Tome or a genuinely small compact title bar.
- Minimizing now snapshots and persists the full expanded window rectangle, then resizes only the live ApplicationV2 instance to a compact 420px-or-smaller bar containing title, Transparency, Restore, and Close.
- The compact bar can still be moved. Restore returns to the previously saved expanded width/height and uses the compact bar's current top-left as the restore anchor, clamped safely to the current viewport.
- Minimized dimensions are never written into the normal client window-state setting, preventing the small bar from becoming the next full Tome size.
- Viewport resize handling now preserves compact mode instead of running the mini bar through normal-window minimum sizing.
- Removed the old clip-path minimize CSS; compact mode now hides Tome content and resize handles while keeping window chrome usable.
- No transparency, launcher, GM Notebook, campaign data, permissions, import/export, or rule behavior changed in this hotfix.

## 0.20.5 — Geometry-Neutral Minimize Hotfix

- Rebuilt Tome minimize/restore so it no longer resizes the ApplicationV2 root at all. The expanded Foundry window rectangle remains untouched while the app is visually clipped to its native title bar.
- Restore now removes the clip instead of reconstructing width/height/position, eliminating the ApplicationV2/ResizeObserver race that could make repeated minimize/restore cycles drift, collapse, or restore at the wrong size.
- Removed title-bar double-click minimize/restore to avoid collisions with native/window-manager double-click behavior; the explicit `_` button is now the single minimize/restore control.
- The minimized title strip remains draggable and keeps Transparency, `_`, and `X` available. Moving the minimized strip is persisted when the Tome is restored.
- No transparency, launcher, GM Notebook, campaign data, permissions, import/export, or rule behavior changed in this hotfix.

## 0.20.4 — Window UX Polish

- Reworked the movable Tome launcher so drag motion uses compositor `translate3d()` positioning instead of layout-heavy top/left updates; the button now tracks the pointer much more directly and only persists its position when released.
- Hardened Tome minimize/restore by snapshotting the expanded client window geometry before collapse and preventing the 34px minimized shell from overwriting the saved window size.
- Restore re-applies the exact pre-minimize width, height and position after ApplicationV2/CSS settle, then restores the captured scroll position.
- Added title-bar double-click as an additional minimize/restore gesture while preserving the explicit `_` control.
- The minimized Tome remains a draggable title strip with transparency, minimize/restore and close controls available.
- No transparency, GM Notebook, campaign data, permissions, import/export, or rule behavior changed in this hotfix.

## 0.20.3 — Glass UI & Freeform GM Workspace Hotfix

- Added 90% Tome transparency and rebuilt the glass model so Foundry Scene transparency affects Tome surfaces rather than fading text, controls, and the whole Application.
- Added a Windows-style minimize/restore control in the Tome window header. Minimized Tome collapses to the title bar while keeping transparency, minimize, and close controls available. Minimize state is client-scoped.
- Made the Adventurer's Tome launcher movable per client with pointer drag. The default launcher position is raised slightly above the connected-user area; right-click resets it to default.
- Hardened GM Workspace customization with direct ApplicationV2 actions for Move Earlier/Later, 1/4 / 1/2 / 3/4 / Full width, and Hide. These changes save immediately per GM and do not depend on fragile delegated DOM state.
- Replaced native HTML5 drag for live Notebook windows and private Custom Notepads with pointer-based reordering to avoid Foundry/ApplicationV2 drag conflicts.
- Preserved all v0.20.x GM-private Scratchpad, Notes, Custom Notepads, presets, migration, archive, and role-aware Manual behavior.

## 0.20.2 — True Canvas Glass & GM Workspace Builder Hotfix

- Corrected Tome transparency semantics: 25%, 50%, and 75% now reveal the actual Foundry Scene/canvas behind the Adventurer's Tome application instead of merely fading Tome's own background artwork.
- In glass mode the ApplicationV2/window content and large Tome page backgrounds become transparent; Tome text and controls remain fully opaque and common panels become translucent surfaces for readability.
- Large Tome hero/section artwork is suppressed while glass transparency is active so the Foundry Scene is the visual layer revealed behind the Tome.
- Transparency remains client-scoped, so every GM/player can choose their own Normal/25/50/75 setting without changing anyone else's view.
- Hardened GM Notebook layout editing after v0.20.1 live feedback: builder visibility, width, and order changes now persist immediately instead of waiting for a separate save step.
- Reworked drag-and-drop to use explicit drag handles rather than making entire Notebook windows draggable, avoiding conflicts with textareas, inputs, buttons, and ApplicationV2 interaction.
- Added explicit left/right move controls to every visible Notebook window as a reliable alternative to drag-and-drop.
- Added explicit left/right move controls to Custom Notepads and retained per-pad 1/4, 1/2, 3/4, and Full width controls.
- Live workspace size, hide, move, and builder-list changes re-render from the saved private GM layout immediately, making persistence visible during editing.
- No campaign document migration; existing v0.20.x GM notes, Scratchpad content, Quick Captures, Custom Notepads, and per-GM privacy are preserved.

## 0.20.1 — True GM Workspace Builder & Tome Transparency

- Rebuilt the v0.20.0 GM Notebook layout controls around the three failed live-QA gates: show/hide, reorder, and width control.
