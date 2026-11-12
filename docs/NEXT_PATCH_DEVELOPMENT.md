# Next Tome patch — local development and verification

**Current packaging rule:** the user explicitly prohibited creating QA packages
until they request one. Finish implementation and tests, then provide a report
for their patch decision. The old local QA.2 archive predates this instruction
and does not contain the visibility, Q/S or reminder changes described below.

Development authorized on 2026-11-12. Base: release 2.1.1, commit
`c858c17888ae5c6a8e685e0ca10718439f6d379d`. Branch: `work/next-tome-patch`.
This is an unpublished development change, not an installed upgrade or release.
Stable channel manifests, release markers and published version numbers remain
unchanged pending the user's test-patch and publication decisions.

Local QA archive 2.1.2-qa.1 was subsequently created at the user's request.
The Items follow-up below is a newer local working change and is not included
in that already-delivered archive. Its source remains open for Fire's feedback.

## Items follow-up — 2026-11-12

The workspace is now **NPCs, Contacts & Items**. Root world Items and their
explicitly linked Tome Item journals support the same native ownership actions
and undo. Item statistics, artwork and Actor inventories are not changed.
Compendium Items and Items embedded in characters are excluded from these writes.

Type selection uses exact category membership: All / NPC / Contact / Item.
An entity explicitly linked as both NPC and Contact can appear in either of
those category filters; an NPC journal alone does not make an NPC a Contact.
A separate Subtype selector uses exact native document/type IDs, such as
Item:gear. Type/subtype changes clear the previous selection, and subtype
choices are restricted to the selected category.

Four additional domain tests cover Items, canonical journal linking, exclusion
of inventory/compendium Items, exact filters and preservation of stats on undo.
The native fixture adds exact type/selection checks and real Item hide/undo
checks against Foundry permissions and unchanged Actor inventory.

Follow-up validation: 509 production tests and 21 native checks pass. Manifest
validation and whitespace checks pass. The isolated test server was stopped.
The delivered qa.1 ZIP was not overwritten or modified by this follow-up.

## Implemented behavior

### NPCs & Contacts

Campaign Tools has a GM-only people workspace with name/folder search, type and
folder filters, access groups, selection across the matching group and bounded
display of long lists. Empty access groups start collapsed. Canonically linked
Actor/Contact/NPC journals share a row; equal names alone never merge identities.
Assigned player characters are excluded. Additional NPC Actor type IDs can be
configured for other game systems without using ownership as an NPC heuristic.

Actions: Hide from all players, Share with all players, Configure ownership and
Undo last change. The configuration uses native None / Limited / Observer / Owner
levels, per-player Default, and Keep existing for untouched bulk values. Current
values, including inherited levels, are shown before choosing changes.

Changes write actual Foundry Actor/Journal ownership. Hide sets All Players to
None and removes individual non-GM overrides so players inherit Default. GM
overrides are retained. Explicit Contact permission overrides survive projection
synchronization, and the Contact read guard respects the GM's explicit choice
without granting access to its source Actor. Embedded Contacts without a separate
document cannot receive separate native ownership; their character's permissions
remain authoritative.

Batches preflight all documents, ownership/projection snapshots and user roles.
Each write rechecks current state. Failed batches retain successful receipts;
undo rejects later conflicting decisions rather than overwriting them. Undo is
local to the current client session, not a persistent audit history.

### Tome Quick Search

GM-only floating search, available from Campaign Tools, GM Dock and configurable
Ctrl+Shift+Space. Quick Insert keeps its own Ctrl+Space. The shortcut also works
inside text fields and Foundry ProseMirror editors, with selection-aware insertion
and rejection if the original target's content changed while searching.

World and compendium metadata are indexed incrementally. Full compendium
documents are resolved only for a chosen action. Supported documents: Actors,
Items, Journals/pages, Scenes, RollTables and Macros. Optional world-journal TOC
headings, type/subtype/folder/compendium filters, @ filter selection, excluded
compendium IDs, approximate name matching and bounded result display are included.
Linked world Actor/Journal results are grouped by canonical reference, with linked
entries still available. Drag/drop uses native UUID payloads. Shift keeps the
search open; arrows select results, Tab chooses actions, Enter executes.

Actions include open, open in Tome, insert/copy a UUID link, place an Actor token
at a chosen scene point, configure ownership, view/activate scenes, execute
macros, draw tables and insert rolled table results. Actor sheets with a native
drop handler get a Find items header control; selected Items go through that
sheet's native drop pipeline. Owned-item actions use system adapters or the
Item's own use/sheet behavior. Specialized section filtering and rule-specific
actions remain dependent on adapters and the active system's capabilities.

Modes: ? help, @ filters, ! character inventory, # playlist play/stop/previous/next,
= arithmetic with short in-memory history, / native chat commands, and > native
keyboard commands. Arithmetic is parsed by a restricted grammar, not eval.

Private Vault is an explicit type choice. Only the current unlocked GM's notes
are searched; they never enter the general index. Locking removes displayed
private results. A selected result opens its source in the Vault workspace.
No Quick Insert source was copied and Quick Insert is not a dependency.

### Chronicles

New/Edit note dialogs and the Linked entry list are resizable. The list has an
enforced usable height, text filtering and removable selected-link controls.
Enter in link search selects a matching entry instead of saving the note.
Cancel returns false: Foundry DialogV2 otherwise replaces a null callback result
with the action string, which previously allowed cancellation to save empty notes.

### Scene token menus

Players get Remove my token in their assigned character token's native HUD.
Deletion affects only the scene Token, never the Actor. Native delete permission
is used when available; otherwise an active GM handles an authenticated Foundry
user query with ownership, character, scene, token and sender checks. Hidden or
other characters' tokens are rejected. Query payload user IDs are not trusted.

GM right-click on empty canvas offers Add player character, followed by a chooser
of currently assigned player characters. A system/module canvas menu receives
the extra action instead of a competing Tome overlay. Without a host menu Tome
provides its own. Placement uses the native Actor-drop pipeline. RealmGuard
source code is untouched.

### HTTP Vault and chat hook

The existing AES-256-GCM / PBKDF2-SHA-256 v1 envelopes, 600,000 iterations, owner
binding and image AAD remain unchanged. HTTPS/localhost uses native WebCrypto;
HTTP has a portable implementation with key derivation in a module worker.
Notes and image bytes interoperate across implementations. Device remembering
works on HTTP, but its local key is portable/extractable, unlike a native
non-extractable CryptoKey. Changing origin still requires the recovery phrase.
HTTP encrypts stored Vault content, not the network connection; the unlock UI
states that distinction without blocking use.

Versions and source hashes for vendored noble dependencies are recorded in
`vendor/noble-sources.json`; upstream licenses and notices are retained.
There is no cleartext Vault fallback and the passphrase is not persisted.

Private whispers register only renderChatMessageHTML. Text and image buttons,
recipient decryption and absence of cleartext in stored messages were verified.

## Verification

- `node tests/validate.mjs`: manifest, referenced runtime syntax and existing
  release-workflow validation pass.
- `node tests/production-suite.mjs`: 505 tests pass.
- Focused ownership, search, token and `tests/private-vault/*.test.mjs` run:
  73 tests pass. This overlaps production coverage; counts are not additive.
- `git -c core.whitespace=cr-at-eol diff --check`: preserve the repository's
  existing CRLF convention while checking actual whitespace errors.
- Real browser/native Foundry checks are in `tests/next-patch-native.mjs`:
  19 checks pass, including zero browser exceptions or deprecated chat-hook warnings.
  The temporary QA server was stopped after verification.

The native run used a new disposable world, Foundry 13.351, Edge Chromium and a
copied locally installed RealmGuard 1.14.0-qa.4. No original world was opened or
modified. Only production Tome was enabled, not the separate TestAI module.
HTTP was tested at a real insecure browser origin using a local hostname mapping;
isSecureContext and crypto.subtle were both false. It was not simulated by merely
removing an HTTPS warning. A live HTTPS server was not needed for the separate
native-WebCrypto/portable cryptographic interoperability tests.

Native assertions cover document ownership and undo, canonical result grouping,
compendium filters, text-field and ProseMirror shortcuts/insertion, macro/table
actions, table-result insertion, character-sheet Item drops, the actual GM menu,
the actual player token HUD, Chronicle search/Cancel, text/image whispers, HTTP
worker encryption/device memory, explicit Vault search and lock cleanup, and
absence of browser exceptions/deprecated chat-hook warnings.

The browser fixture refuses writes outside the named disposable world
`tome-next-patch-qa`, requires a loopback server and explicit fixture opt-in, and
does not start/install Foundry itself. Prepare an isolated licensed data directory
with the desired system, this development module and that empty world first.
Set TOME_QA_ALLOW_FIXTURES=yes, TOME_QA_URL to the isolated server, and optional
PLAYWRIGHT_MODULE / PLAYTEST_CHROME paths, then run:

```text
node tests/next-patch-native.mjs
```

The fixture creates only synthetic QA documents/accounts. It prunes stale public
whisper-device keys on its own QA accounts because repeated fresh browser profiles
otherwise hit the existing eight-device-per-recipient limit; it changes no real
user keys or whisper history. Runtime licensing/configuration, worlds, browser
profiles, logs and screenshots stay under ignored `.build/`, outside deliverables.

## Review boundary

No release ZIP, production installation, push, tag or publication was performed.
Foundry v14 and exhaustive adapters for other game systems are not native-verified.
Before publishing: obtain the user's decision on a test patch, assign candidate
version/packaging metadata, package and test the resulting artifact, and obtain
explicit publication approval.

## QA.2 follow-up — 2026-11-12

Local QA.2 includes World Item ownership and exact type/subtype filters, the
scrollable Chronicle dialog with a visible footer on short screens, and the
combined "Place existing NPC or PC…" blank-canvas GM action. Hosting integration
waits until event dispatch finishes, which was verified with a trusted browser
right-click rather than only synthetic event dispatch. RealmGuard source was not
changed. The separate token-name header request was withdrawn by the user.

Verification: production suite 511/511; native Foundry browser checks 23/23;
manifest/runtime validation passes. Native checks include a 1024×680 Chronicle
dialog and the combined GM picker alongside existing RealmGuard menu actions.
Screenshots were inspected. Test suites overlap; counts are not additive.

The original QA.1 archive remains unchanged. QA.2 is a local manual-install test
package, not a public release. No production world installation, push, tag or
publication is authorized by this packaging step. Items remains provisional for
Fire's review.

## Rapport inför beslut om nästa testpatch — 2026-11-12

### Färdigt i arbetsversionen

- Show to players ger den Foundry-åtkomst som krävs, markerar posten Discovered
  och presenterar den för anslutna spelare. Även frånkopplade spelare får senare
  åtkomst. En Contacts privata relationsägare delas inte som bieffekt.
- Personliga Quests behåller sin mottagare även med Show to players. Befintliga
  Quests med explicit spelarspecifik Observer/Owner och låg default behandlas
  också som en begränsad mottagargrupp vid presentation.
- Importerade Sessions och vanliga Quests blir synliga direkt efter lyckad
  import. GM-only-delar och påminnelser sparas separat i Vault/GM Inbox först.
  En misslyckad privat överföring lämnar importen privat och återupptagningsbar.
- Quest-import har All players, Personal · spelarnamn och GM only. Samma val
  finns för nya Quest-förslag från Sessions. Länkning till en befintlig Quest
  ändrar inte dess behörigheter.
- Trusted Player-import använder en autentiserad Foundry userQuery till aktiv
  GM, eftersom Foundry endast låter GM/Assistant GM ändra ownership. Mottagaren
  verifierar avsändare, roll, eget Journal-ägarskap, rätt importtyp, planHash och
  färdigbehandlat ready-kvitto. En spelare kan inte dela någon annans dokument
  eller skapa en personlig Quest åt en annan spelare via denna funktion.
- Små Q/S till höger om Tome-knappen visar olästa, åtkomliga Quests/Sessions.
  Kvittering är individuell och beständig över inloggningar. Inga indikatorer
  syns när inget är oläst. Små textändringar ger inga nya aviseringar. Avslutade
  och misslyckade Quests aviseras inte.
- Personliga påminnelser kan knytas till datum/tid eller en Scene, till en egen
  Chronicle-anteckning och för GM även till en privat GM-anteckning. Reminders
  öppnas från My Chronicle eller Campaign Tools. Remind me finns på egna notes.
- Klockan bredvid Tome syns bara när en påminnelse är förfallen. Ingen dialog
  öppnas automatiskt. Open följer källan; Done kvitterar; Remind later erbjuder
  5/15/60 minuter eller ett dygn. Påminnelser kan också tas bort.
- GM kan skapa en tids-/Scene-kopplad New session-påminnelse, eller aktivera
  påminnelse efter valbar inaktivitet (12 timmar förvalt; avstängd från början).
- GM:s egen påminnelsetext sparas i den krypterade Private Vault, inte i det
  separata schemat. Låsning rensar texten ur dialogen; en generisk klocka kan
  fortfarande indikera att något är förfallet. Spelares påminnelser använder
  kontots privata user-settings, i likhet med vanliga Chronicle-notes.
- Reduced motion stänger av indikatorernas pulsering.

### Verifiering

- Produktionssvit: 529 tester passerar, inga fel.
- Native Foundry/browser: 34 kontroller passerar, inga browser exceptions eller
  deprecated chat-hook-varningar. Foundry 13.351, Edge Chromium, kopierad lokal
  RealmGuard 1.14.0-qa.4, enbart syntetisk data i tome-next-patch-qa.
- 18 riktade tester för presentation, import, delegering, privat publik och
  påminnelser passerar. De ingår i produktionssviten och ska inte adderas.
- Native testet använder GM och separata Player, Outsider och Trusted Player.
  Det verifierar faktisk ownership, spelarspecifik synlighet/avisering,
  inloggning/kvittering, tid/Scene, snooze, note-länkning, UI Save/Done,
  kryptering/låsning och inaktivitetsvalets New session-åtgärd.
- Inaktivitetsgränsen verifierades med bakdaterad testtid, inte genom att hålla
  en server öppen i tolv timmar.
- Manifest/runtime-syntax och whitespace-kontroll passerar. Skärmbilden för
  påminnelsedialogen är visuellt granskad.

### Praktiska gränser inför ditt beslut

- Påminnelser körs medan Foundry är öppet. Förfallen tid under utloggning visas
  vid nästa inloggning; inga OS-/e-postaviseringar skickas.
- Trusted Player behöver en aktiv GM med Tome och QUERY_USER-behörighet för att
  slutföra delningen. Saknas GM sparas importen privat med ready-kvitto och ett
  tydligt felmeddelande; samma fil/val kan prövas igen när GM är ansluten.
- Scene-påminnelsen aktiveras när användaren själv visar den valda scenen,
  även vid inloggning där. Den kvarstår tills Done eller snooze valts.
- Personliga Quest-val skyddar hela Quest-dokumentet. GM-only-information
  hålls i separata privata anteckningar, inte i spelartexten.
- Foundry 14 och andra regelsystem är inte native-verifierade.
- Items-delen är fortfarande preliminär inför Fires bedömning.
- Ingen ny QA-ZIP, publicering eller installation i ordinarie värld har gjorts.
  Den gamla QA.2-filen innehåller inte detta arbete. Nästa steg är användarens
  genomgång av rapporten och uttryckliga beslut om en ny QA-paketering.

## QA.3 paketeringsbeslut — 2026-11-12

Efter rapporten godkände användaren uttryckligen en ny QA: "vi kör en qa på den".
Denna arbetsversion paketeras därför som lokal 2.1.2-qa.3, inklusive synlighet,
privata Quest-mottagare, importdelning via GM, Q/S och tid-/Scene-påminnelser.
529 produktionstester och 34 native kontroller passerar; syntax och whitespace
kontrolleras åter inför paketering. Det är samma funktionella arbetsversion som
rapporterades före beslutet. Äldre QA.1/QA.2 arkiv lämnas oförändrade.
Godkännandet gäller detta lokala testpaket, inte publicering eller installation
i ordinarie värld. Framtida QA-paket kräver fortsatt uttrycklig begäran.

## Uppföljning efter QA.3 — spelarvyn och mötta personer

Användarens återkoppling gällde den trånga Session-läsaren, en hel My Chronicle
under Session-texten och grundläggande synlighet för personer som gruppen mött.
Detta är en ny arbetsändring och ingår inte i den redan levererade QA.3-filen.
Ingen ytterligare QA-ZIP får skapas utan uttrycklig begäran.

### Ändrat beteende

- Spelare får en bred Session-läsare bredvid mappträdet. Den dubbla masterlistan
  döljs normalt. När spelaren söker visas kompakta, valbara resultat och valet
  återgår till läsvyn. Sökningen bevaras vid bakgrundsomladdning av vyn.
- Den inbäddade My Chronicle-panelen är borttagen från Sessions. Den egna fliken
  finns kvar. GM:s arbetslayout påverkas inte av spelarens läs-CSS.
- Aktiva GM-klienten skapar separata, läsbara World-grundkort för NPC-Actors som
  är bekräftat länkade till spelarsynliga Sessions. Kortet innehåller endast namn
  och porträtt. Original-Actors ownership, sheet, systemdata, biografi, facts,
  relationer och privata GM-notes delas inte genom den automatiska funktionen.
- Även faktiska Actor-UUID-länkar i läsbara Journal-sidor räknas. Secret-block och
  sidor som spelaren inte får se räknas inte. Ett vanligt namn i löptext skapar
  ingen person. Oavslutade Session-importer och tilldelade PC-Actors undantas.
- World och Session visar samma grundkort. Actor-länken i spelarens sessionstext
  öppnar grundkortet. Befintliga Actor/Journal-representationer ger inte extra
  dubbletter i World för den personen.
- Rättigheten är Observer för de konton som får se källsessionen. Automatisk
  åtkomst dras tillbaka om källan döljs eller länkas bort. Flera tillåtna Sessions
  kan tillsammans ge åtkomst. Ett uttryckligt GM-beslut överstyr automatiken.
- GM har Release player information på grundkortet. En uttryckligen godkänd
  beskrivning sparas på kortets egen Journal-sida, aldrig genom att ge tillgång
  till original-Actor. GM kan godkänna tom text för att ta tillbaka beskrivningen.
- Namnkonfliktvakten känner igen grundkortets exakta Actor-UUID. Den behandlar
  inte kortet som en ny identitet och behöver därför ingen automatisk dialog.
  Matchning sker inte genom namnlikhet.
- HTML-formatering bevarar Foundry secret-markeringar. Den tidigare unwrapping-
  regeln kunde tappa markeringen och göra hemlig text till vanlig läsbar text.
- Bulk-ownership och Undo tar även med grundkortets automatiska delningspolicy.
  Filtrering och markeringar i NPCs, Contacts & Items bevaras vid bakgrundsrender.

### Verifiering och gränser

- Produktionssviten: 539 tester passerar. Manifest/runtime-syntax samt whitespace
  kontrolleras också. Alla mutationer av Foundry gjordes i den isolerade världen
  tome-next-patch-qa med syntetiska dokument, aldrig i ordinarie spelvärld.
- Den breda native-sviten passerade 38 kontroller, inklusive tidigare QA-funktioner
  och de första fyra kontrollerna för grundkort/läsare/GM-frisläppning/åtkomst.
- Separat tests/known-people-native.mjs passerar 11 riktade browserkontroller:
  minimal datakopia, hemliga källor, sökning/val, bred/smal vy, inline-länk,
  World-kort utan Actor-sheet, GM-godkännande/återtag, spelaravvisning,
  bulk-ownership Undo, källrevokering, explicit GM-override och inga exceptions.
  Kontrollerna överlappar annan täckning; antalen ska inte summeras.
- Screenshots native-player-sessions.png och native-player-sessions-narrow.png
  är visuellt granskade och ligger under ignorerad .build/.
- Automatisk framställning/synk kräver en aktiv GM-klient med Tome. Redan skapade
  kort och deras Observer-rättigheter finns kvar när GM är frånkopplad.
- NPC-identiteten måste komma från en bekräftad länk eller faktisk Actor-UUID;
  osäkra namnförslag och enbart fetmarkerad text publiceras inte automatiskt.
- Rättigheter som tidigare redan givits till original-Actor återkallas inte av
  denna funktion. Använd GM:s bulkverktyg för att ta bort sådan äldre fullåtkomst.
- Foundry 13.351 och lokal RealmGuard 1.14.0-qa.4 verifierade. Foundry 14 och övriga
  system är inte native-verifierade. Nästa QA-paketering kräver nytt klartecken.

## QA.4 godkänd för lokal paketering

Efter genomgång av spelarvyn och grundkorten bad användaren uttryckligen:
"skapa QA så jag kan testa". Den testade arbetsversionen paketeras därför som
2.1.2-qa.4. Det inkluderar den nya Session-läsaren, bevarad sökning/markering,
grundkort för länkade NPCs, explicit GM-godkännande för mer information,
sekretessmarkeringar och korrekt ownership Undo för automatisk policy.
539 produktionstester och 11 riktade Foundry-kontroller passerar, med tidigare
bred native-regression enligt avsnittet ovan. Ingen publicering eller installation
i ordinarie värld ingår. Senare QA-paket kräver fortsatt uttrycklig begäran.

## QA.5 — synlig sessionslista och inga PCs i World

Användaren gav ny arbetsorder: bygg, testa och skapa QA. Tidigare insamlingsläge
ersätts för dessa ändringar. Referensbild 2 styr layouten: synlig sessionslista
bredvid vald session på normal skärmbredd. Listan är inte längre dold utom vid
sökning. Smala fönster staplar innehållet utan horisontell overflow.

PC-kontrollen använder karaktärstyp (character/pc/player-character m.fl.),
uttryckliga PC-markeringar i Tome-profiler och användarnas karaktärstilldelning.
Även en otilldelad PC undantas. Namn och ownership används inte som PC-bevis.
Native Actor, äldre Journal-representationer och automatiska grundkort filtreras
bort från World för både GM och spelare. PC-länkar fortsätter fungera under
Session Characters och i karaktärens profil, inte i World.

En aktiv GM-klient arkiverar felaktiga version-1-grundkort med exakt, levande
Actor-UUID som bevisligen tillhör en PC. Arkivmappen heter Tome · Archived PC
cards. Kortet får GM-only/Undiscovered och spelarrättigheter tas bort. Original-
Actor, manuella PC-journaler, text/sidor, privata Vault-notes och Session-länkar
raderas inte. Arkivering är vald för att bevara eventuell information som lagts
på ett felaktigt grundkort. En PC-kategori i World skapas inte.

Kontrollen stoppar även nya PC-grundkort och håller pensionerade PC-poster
utanför NPCs, Contacts & Items. Gamla direkta World-profiler för PC styrs till
karaktärens profil/Group vid navigation. Övriga NPC-grundkort behåller tidigare
funktion, sekretess, GM-godkännande och ownership Undo.

Verifiering: 546 produktionstester, 38 breda native/browser-kontroller och 13
riktade kontroller passerar. Sviterna överlappar och ska inte summeras. Det
riktade native-testet använder otilldelad character, en npc-typ med explicit
PC-markering, ett simulerat gammalt felkort med extra beskrivning och privat
Vault-anteckning, samt en manuell PC-journal. Det verifierar arkivering utan
förlust, båda användarvyerna, PC-länkar under Characters, alltid synlig lista,
sökning, smal vy och befintligt NPC-flöde. Layoutskärmbilden är visuellt granskad.
Manifest/runtime-syntax och whitespace passerar.

Detta paketeras enbart som lokal 2.1.2-qa.5 efter användarens uttryckliga order.
Ingen publicering, installation eller städning i användarens ordinarie värld har
gjorts av agenten. Efter installation: logga in som GM med Tome aktiverat och
ladda om klienten så att arkiveringen körs i testvärlden. Foundry 13.351 och
RealmGuard 1.14.0-qa.4 är native-verifierade; övriga system/v14 är inte det.

## QA.6 — Campaign Explorer, Group och enklare Private Vault

Användarens nya order "Då gör vi nästa QA patch" avslutar insamlingsläget för
ovanstående önskemål och godkänner lokal utveckling, testning och QA-paketering.
Campaign Explorer kan minimeras och öppnas igen i Sessions och Quests. Valet
sparas separat per värld, användare och flik i webbläsaren. Sessionslista och
vald läsare ligger kvar; smal layout stöds och knappen har aria-expanded.

Group behåller offentliga biografier och filtrerar privata relationer. En
relation till en känd NPC öppnar spelarens läsbara grundkort i World, även när
original-Actor inte har Observer-rättighet. Dolda grundkort ger ingen reservväg
till Actor. Inga nya rättigheter till NPC:s biografi, stats eller GM-information
ges. PC-profiler fortsätter använda Foundrys befintliga Actor-rättigheter.

En ny GM Private Vault använder kontobaserad åtkomst utan extra lösenord.
Anteckningar och bilder lagras i den egna användarens Foundry user settings,
med kontroll av GM-roll, värld och användare. Detta är enklare kontoavskildhet,
inte kryptering mot serverns filadministratör; gränsen förklaras i gränssnittet.
Befintliga krypterade Vaults fortsätter i krypterat läge tills GM uttryckligen
väljer kontoåtkomst i Vault access. Om den gamla Vaulten är upplåst kopieras
text, bildinnehåll och övriga nycklar efter att pågående skrivningar slutförts.
Den krypterade originalbehållaren bevaras. Om lösenordet är glömt startas en
separat kontobaserad Vault utan att ändra den äldre krypterade datan; detta
återställer inte det gamla innehållet. GM kan öppna tidigare krypterad Vault
igen med sitt tidigare lösenord eller en sparad enhetsnyckel.

Verifiering: 10 riktade native/browser-kontroller i Foundry 13.351 passerar för
Explorer, Group, kontoisolering, lösenordsfri inloggning, oförändrade krypterade
original och flytt av text/bildbytes. Den breda native-sviten passerar också
samtliga 38 kontroller utan browser exceptions. Sviterna överlappar och ska
inte summeras. Explorer-skärmbilden är visuellt granskad. Runtime/manifest-
validering och whitespace passerar. Produktionssvitens slutresultat noteras
nedan före paketering. Foundry 14 är inte native-verifierad.

Paketet skapas lokalt som 2.1.2-qa.6, utan publicering eller ändringar i den
ordinarie världen. Testserver, licens, konton och fixture-data ingår inte.

Slutlig produktionsverifiering QA.6: 558 tester passerar, 0 misslyckade.

## QA.7 — automatisk grupprelation och Explorer utan text

Ny uttrycklig order: "kör nu patch bygge på deta". Minimerad Campaign Explorer
visar endast expandera-ikonen; tillgänglig etikett och tooltip finns kvar.

En aktiv GM-klient skapar ömsesidiga Relations-rader mellan karaktärer som är
medlemmar i Group: Party Member, Players. Detta är gruppmedlemskap, inte
spelarens online-status. Befintliga offentliga manuella relationer till samma
karaktär bevaras utan en extra rad. Privata relationer ändras eller avslöjas
inte; en separat generell Party Member-rad kan skapas. Synkningen ger inte
utökad Actor-ownership. Automatiska, fortfarande märkta rader tas bort om
någon lämnar Group. Manuellt redigerade/sparade relationer behålls som historik.
Short note lämnas tom utan bekräftat första möte och kan redigeras av GM.
Ingen fiktiv mötesplats eller datum läggs in av modulen.

Verifierat: 562 produktionstester passerar; 6 riktade native/browser-kontroller
passerar i Foundry 13.351. Native-kontrollen använder ordinarie automatiska
Actor-hooks, två klienter, ömsesidiga sparade relationer, spelarens klickbara
profilrelation, bevarad offentlig Bio, idempotens, borttaget gruppmedlemskap
och ikonknappens kollaps/expansion. Inga browser exceptions. Visuell kontroll
av minimerad Explorer genomförd. Manifest/syntax och whitespace passerar.

Paketeras som lokal 2.1.2-qa.7. Ingen installation eller ändring i ordinarie
spelvärld och ingen publicering. Kanonuppgifter om spelkampanjen ligger i ett
separat lokalt GM-spelminne utanför modulens paket. Marvin har inte skapats i
testvärlden. Foundry 14 har inte native-verifierats.

## QA.8 — Group member ger automatisk offentlig profilåtkomst

Användaren har uttryckligen beställt nästa patch efter förtydligandet att
Group member ska räcka, utan ett extra Show to players-klick. Den aktiva
GM-klienten synkar nu native LIMITED (1) för övriga gruppmedlemmars spelare.
Mottagare är icke-GM-användare med tilldelad gruppkaraktär eller Owner på en
karaktär i Group. Inloggningsstatus styr inte detta. Ingen default-ownership
breddas och befintlig Observer/Owner nedgraderas inte.

Tome tillåter läsning av den offentliga Actor-profilen när målkaraktären är
medlem, användaren tillhör gruppen och Foundry LIMITED faktiskt finns. Denna
avgränsade väg gäller även om tidigare Tome access var GM/undiscovered, eftersom
Group member nu uttryckligen är delningssignalen. Övriga dokument använder
fortsatt tidigare Observer- och discovery-kontroller. Privata profilrader och
Vault-information filtreras som tidigare. Relationen öppnar profilen direkt;
PC blir inte World-NPC. Full-sheet-knappen visas bara vid native Observer eller
bättre, och openActor kontrollerar samma gräns även om en åtgärd anropas direkt.

Automatiska LIMITED-grants märks med tidigare individuellt ownership-värde.
När någon lämnar gruppen eller användaren inte längre tillhör den återställs
just de grants som fortfarande är automatiska LIMITED. Manuellt uppgraderad
åtkomst och förhandsbefintliga rättigheter bevaras. Native LIMITED-åtkomst kan
också ge namn/porträtt i Foundrys egna ytor; ingen full Actor-Observer beviljas.
GM-klienten måste vara ansluten för att skriva grants/revokeringar; Tome läser
aktuellt medlemskap vid varje åtkomstkontroll. QA.7:s ömsesidiga Party Member-
relationer och manuellt bevarade anteckningar kvarstår.

Verifiering: 566 produktionstester passerar. 8 riktade native/browser-kontroller
passerar i Foundry 13.351: två ursprungligen otillgängliga profiler, automatiska
Actor-hooks utan Show to players, båda spelarklienterna, LIMITED utan Observer,
offentlig Bio/länk och dolda privata fakta/full-sheet-knapp, utomstående spelare,
omladdning, återkallad automatisk åtkomst och inga browser exceptions. Den breda
sviten passerar också 38 kontroller före den sista full-sheet-knappavgränsningen;
den riktade sviten och produktionstesterna kördes om på den slutliga koden.
Manifest/runtime-syntax och whitespace passerar. Sviterna överlappar.

Paketeras lokalt som 2.1.2-qa.8. Ingen publicering eller live-installation.
Foundry 14 och andra spelsystem är inte native-verifierade. GM-spelminnet och
Marvin ingår inte i paketet eller i nya testkaraktärer.

## Stable 2.1.2 publication authorization

The user explicitly requested publication and confirmed stable version 2.1.2.
The 291 runtime payload files match the verified QA.8 ZIP byte for byte.
On the stable manifest: 566 production tests and 52 Vault tests pass, as do
workflow manifest/URL validation and whitespace checks. Versioned release notes,
gold/test manifests and release/READY now identify 2.1.2. The release workflow
excludes .build and refuses to overwrite an existing stable 2.1.2 release.
The isolated Foundry fixture, license and local campaign memory remain outside
version control and release assets. Publication results are recorded separately
once the hosted workflow and downloadable package have been verified.
