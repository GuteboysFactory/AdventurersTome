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
