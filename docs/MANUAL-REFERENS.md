# Adventurer’s Tome – fördjupning och funktionsregister

**Version 2.1.10.** [Till manualens innehåll](MANUAL.md#innehåll) · [English reference](MANUAL-REFERENCE-EN.md)

## Innehåll

- [Inställningar och demokampanj](#inställningar-och-demokampanj)
- [Författarverktyg, mappar och dokument](#författarverktyg-mappar-och-dokument)
- [Quick Search och tangentbord](#quick-search-och-tangentbord)
- [GM Dock och sessionens arbetsverktyg](#gm-dock-och-sessionens-arbetsverktyg)
- [Fakta, relationer, rykten och index](#fakta-relationer-rykten-och-index)
- [Privata anteckningar och återställning](#privata-anteckningar-och-återställning)
- [Importformat och migreringsbeslut](#importformat-och-migreringsbeslut)
- [System- och modulintegrationer](#system--och-modulintegrationer)
- [GM-verktyg efter modulnamn](#gm-verktyg-efter-modulnamn)
- [Funktionsregister](#funktionsregister)

## Inställningar och demokampanj
<!-- tome-manual settings|reference|gm|campaign settings theme artwork home builder navigation defaults permission -->

Som GM öppnar du **Campaign Settings** via kugghjulet i Tome. Ändra först en sak och välj **Preview** för att se hur den visas. **Save Campaign Settings** tillämpar ändringarna i världen. **Reset Form** återställer formuläret för det du håller på att redigera.

| När du vill ändra | Gå till |
| --- | --- |
| Kampanjnamn och text på startsidan | **Campaign Info** |
| Tema, logotyp, huvudbild och bakgrunder för enskilda flikar | **Theme & Artwork**. **Campaign Logo** ersätter bokikonen i Tomes toppmeny. Välj en bild per flik under **Section Backgrounds**. Ett tomt fält använder huvudbilden för den fliken. |
| Startsida, fält och genvägar | **Home Builder** och **Home Widgets**. I **Custom** påverkar varje widgets storlek placeringen. **Minimal** kan ha en **Enter**-genväg till en vald flik. |
| Visa eller göm en flik | **Navigation**. En dold flik försvinner från navigationen, dess kampanjposter finns kvar. |
| Gruppens sortering och antal kort på Home | **Group Presentation**. **Active Group Members** avgör vilka Actors som tillhör gruppen. |
| Förval för status, kategori och synlighet | **Content Defaults** och **Permission Defaults**. Förvalen används när posten saknar egna val. Kontrollera källans behörighet innan du delar något. |
| Åtkomst för en viss kampanjpost | **Content Access → Manage** för respektive typ. Du kan även öppna behörigheten från postens verktygsrad. |

**Foundry → Configure Settings → Adventurer’s Tome** innehåller även modulens integrationsinställningar, exempelvis scenförval, kartnålarnas stil, chattporträtt och Quick Search. Under **Configure Controls** kan du söka efter Tomes kortkommandon och ändra dem. Fönstrets genomskinlighet och flera val för presentation gäller din egen klient.

### Prova med en färdig demokampanj
<!-- tome-manual demo|tutorial|gm|ashen road demo generate remove demo demokampanj -->

1. Öppna en separat Foundry-värld. Som GM går du till **Campaign Settings → Developer Tools → The Ashen Road Demo Campaign**.
2. Välj **Generate Small Demo** för att prova de vanliga flikarna eller **Generate Full Demo** om du vill testa större listor, länkar och sökning. Demot lägger upp exempel på Actors, Journals och mappar.
3. Öppna **Sessions**, följ en questlänk och sök upp en person i **World**. Prova som spelare för att se skillnaden i åtkomst.
4. Välj **Remove Demo Campaign** när du är klar. Städningen väljer dokument med demomärkning och återställer presentationen som sparades före genereringen.

## Författarverktyg, mappar och dokument

### Arbeta i dokumentvyn
<!-- tome-manual authoring|guide|all|editor pages authoring text image open foundry source redigera dokument -->

- Öppna posten i **Sessions**, **Quests**, **World** eller **Rules** och använd redigeringsåtgärden där du har åtkomst. Ändra rubrik, sammanfattning och spelarvänd text på rätt post. Källtext som är synkroniserad med en Journal kan också ändras på motsvarande källsida.
- Vid arbete med längre texter använder du **Pages** där det finns. Välj aktuell sida innan du redigerar. I World kan GM ordna Journal-sidor, lägga till text eller media samt hantera den spelarvända texten under **Known Information**.
- Använd länken till källan när du behöver en Foundry-funktion som hör till dokumentet. World kan visa **Open Journal**, och ett länkat NPC-blad kan visa **Open Sheet** och **Actor Access** för GM.
- Stjärnan gör posten till en personlig favorit. **Open Journal** eller **Open Foundry Source** tar dig till originalet. Postens sammanfattning är användbar för kort och träfflistor. Använd krönikan eller Journalsidan för hela texten.

### Ordna World och Campaign Explorer
<!-- tome-manual folders|tutorial|gm|tree view custom structure by content original folders mappar kategorier -->

1. Under **World → Tree view**, välj **Original structure** för den sparade grundstrukturen, **By content** för en innehållsgrupperad vy eller **Custom structure** när du ska organisera mapparna.
2. I den egna strukturen använder du **New category** för en samlande indelning och **New folder** för en mapp. Via mappens meny kan du skapa undermapp, byta namn, flytta eller ändra mappens inställningar. Du kan också dra mappar och poster där funktionerna erbjuds.
3. Med **Copy folder structure** kan du som GM utgå från en befintlig Foundry-hierarki. Välj vilken samling du vill kopiera strukturen från och kontrollera resultatet i **Custom structure**. World-trädet kan ordnas utan att de länkade Actors och Items flyttas i Foundrys egna listor.
4. Via Campaign Explorer i **Sessions** och **Quests** kan behöriga redaktörer välja mapp för poster, fälla ihop trädet och öppna mappens verktyg. Läs alltid vilken källa en ändring gäller. Om **Delete Entry** säger att det kanoniska Foundry-dokumentet ska tas bort raderas källan permanent. När du bara vill ordna om använder du mapp- och flyttverktygen.

### Skapa, återanvänd eller importera en NPC
<!-- tome-manual quick-npc|tutorial|gm|quick npc template compendium preview plan npc mall -->

1. Välj **World → Quick NPC** som GM. Skriv namnet och välj de uppgifter som tillgänglig skapare frågar efter.
2. Klicka **Preview Plan**. Jämför **Use Existing World Actor**, **Import Compendium Actor** och **Create New NPC** när de erbjuds.
3. Välj den rätta posten eller granska den nya innan du klickar **Use Actor** eller **Apply**. En systemintegration kan ge fler alternativ och ett eget flöde.
4. Öppna World-profilen och kontrollera identitet, Actor-länk och upptäcktsstatus. Om dokumentet skapas manuellt och Tome frågar om ett liknande namn, jämför förslagen före bekräftelse.

## Quick Search och tangentbord
<!-- tome-manual quick-search|guide|gm|ctrl shift space search quick search insert link håll öppen kortkommando shortcut -->

Som GM kan du använda **Campaign Tools → Quick Search** eller standardkommandot **Ctrl+Shift+Mellanslag**. När en kompatibel textredigerare är aktiv kan **Insert link** lägga en Foundry-länk i texten. Filtrera på **Type**, **Folder** eller **Compendium**. Använd pil upp/ned för träffarna, **Tab** för åtgärd och **Enter** för att använda den. **Shift** kan hålla sökningen öppen enligt panelens tangentbordsrad.

### Ändra kortkommandot
<!-- tome-manual keybindings|reference|gm|configure controls settings quick search tangenter hotkey shortcut commands kortkommando -->

Öppna **Foundry → Game Settings → Configure Controls** och leta efter **Tome Quick Search** under **Adventurer’s Tome**. Redigera bindningen, tryck den nya kombinationen och spara. **Ctrl + <** är redan standard för **Write Private Vault note** på nordiskt tangentbord. Om du vill använda den för Quick Search, ändra först bindningen för anteckningar.

| Skriv | Quick Search gör |
| --- | --- |
| **?** | Visar hjälpen och de stödda prefixen |
| **@** följt av typ | Visar typfilter |
| **!** följt av föremålsnamn | Söker i valda karaktärers föremål, eller i din tilldelade karaktärs föremål om ingen token är markerad |
| **#** följt av spellista | Söker spellistor och erbjuder kontroller för uppspelning |
| **=** följt av ett uttryck | Räknar ut värdet |
| **/** följt av kommando | Skickar kommandot genom Foundrys chatt när du väljer det |
| **>** följt av namn | Söker bland tillgängliga tangentbordskommandon |

För vanliga träffar kan du öppna dokument, kopiera länk, se länkade poster, placera en Actor-token eller förhandsvisa en scen. Behörighet och dokumenttyp avgör om ytterligare funktioner visas, till exempel **Activate scene**, **Configure ownership…**, **Execute macro**, **Draw result**, **Roll and insert** och **Use / system action…**. De två senare gäller respektive en rolltabell i en kompatibel redigerare och en tillgänglig systemåtgärd.

Välj **Private Vault** bland typerna för att söka i dina egna anteckningar när valvet är öppet. För att inkludera Journal-rubriker slår du på **Quick Search: journal headings**. Ändringar i **Quick Search: excluded compendiums** kan följas av **Rebuild index** i snabbsökningen.

## GM Dock och sessionens arbetsverktyg
<!-- tome-manual gm-dock|guide|gm|dock tools pin context quick capture dockan -->

**GM Dock** är en liten meny på Foundrys arbetsyta. Den finns fristående eller som en del av ett kompatibelt värdgränssnitt. Använd knappen **Adventurer’s Tome** i docken för att öppna Tomes meny. I den fristående docken kan du dra handtaget för att flytta den och högerklicka på handtaget för att återställa placeringen.

1. Öppna en Actor eller Journal i Foundry eller gå till posten i Tome. När docken visar dokumentet som aktuell kontext kan du välja **Pin Context** för att arbeta vidare med samma källa medan du bläddrar.
2. Välj **Private Vault** för källans anteckningar eller **Quick Capture** för att spara en ny anteckning. Kontrollera målet i formuläret. Det kan vara ett dokument eller **GM Quick Capture Inbox**.
3. Använd **Reveal Queue**, **Next Session**, senaste Tome-poster eller **Quick Search** direkt från docken. Tillgängliga systemintegrationer kan ge egna åtgärder. Välj **Unpin Context** när docken ska följa din navigation igen.

### Från anteckning till nästa spelkväll
<!-- tome-manual session-prep|tutorial|gm|next session reveal queue post-session assistant quick capture gm notebook -->

- Sätt **Type**, **Target Session**, **Trigger / when it matters** och en fästmarkering i **Quick Capture** eller GM Notebook när du vill att anteckningen ska dyka upp i rätt sammanhang. **Notes Feed** kan filtreras på exempelvis fäst, förfallen eller löst. Använd **Resolve** eller **Reopen** när uppgiften ändras.
- I **Next Session** samlar du förfallna anteckningar, aktiva quests, platskontext och väntande avslöjanden. **Player Signals** ger dig tillgång till det spelarna har delat. Lägg en privat påminnelse för en viss tid eller scen när uppföljningen behöver ett eget larm.
- I **Reveal Queue** granskar du posten innan du väljer **Show to Players**. I **Post-Session Assistant** följer du upp det som fortfarande är öppet och kan gå vidare till export när du behöver en kontrollpunkt.
- Använd **Campaign Tools → Overview** som startpunkt när du vill se vilka analysbeslut, förberedelser och privata anteckningar som väntar.

### Skapa en påminnelse eller quest från ett arbetsverktyg
<!-- tome-manual reminder|tutorial|all|new reminder when i view a scene create quest påminnelse -->

1. Öppna **My reminders** som GM eller **Reminders** i My Chronicle som spelare. Välj **New reminder**. Du kan länka en privat anteckning eller låta påminnelsen stå för sig själv.
2. Under **Remind me**, välj en tid eller **When I view a Scene**. Tidspåminnelser kan visas nästa gång du loggar in. GM kan välja att påminnelsen erbjuder **New session**. Den valfria inställningen för inaktivitet ligger under **New session reminder**.
3. Om en sessionsbriefing visar ett citerat uppslag till ett uppdrag kan GM välja **Create Quest** där. Granska det redigerbara utkastet, kontrollera källan och spara först när uppdraget ska in i kampanjen.

## Fakta, relationer, rykten och index

### Läs och granska källor
<!-- tome-manual memory|tutorial|gm|memory review source facts rumour relation previous session links källor -->

1. Öppna **Campaign Tools → Memory** och sök på person, plats eller uppgift. Använd de filter som visas för att begränsa vyn. Öppna en träff och välj källan för att läsa det faktiska sammanhanget.
2. Öppna en identitets **Review source facts** för att jämföra befintliga uppgifter med förslag från ett källdokument. Granska varje förslag innan du sparar. Behåll privata uppgifter i deras avsedda GM-vy.
3. Under **Analysis** kan du välja **Confirm relationship**, **Keep as possible / rumour**, **Reject** eller **Leave unresolved** när en relation behöver ett beslut. Ett rykte kan sparas för uppföljning, och spelarens egna observationer finns kvar i Chronicle.
4. Om en länk gällde en tidigare session, öppna **Manage previous session links** där det visas vid kandidaten. Läs varje källa innan du tar bort en länk. För en återkommande felträff öppnar du **Matching preferences** och granskar tidigare val eller pausar automatisk matchning för identiteten.

### Håll indexet aktuellt
<!-- tome-manual index|reference|gm|index check changes rebuild pause archive reactivate -->

Öppna **Campaign Tools → Index** för att se bakgrundsarbetet. **Check changes** kontrollerar källorna. **Pause** och **Continue** styr arbetet. **Rebuild analysis index** bygger om analysen för den aktuella världen och GM-klienten. Vänta tills pågående arbete har stannat om knappen är avstängd. Under historiken kan **Archive** ta en identitet ur automatisk matchning medan äldre hänvisningar finns kvar. **Reactivate** återtar den. Vid en borttagen källa kan **Forget index marker** rensa den kvarvarande indexmarkeringen. Foundrys dokument och sparade GM-beslut är källorna bakom indexet.

## Privata anteckningar och återställning
<!-- tome-manual vault|reference|gm|private vault encrypted lock unlock backup export återställning privat valv -->

- **Campaign Tools → Private Vault** samlar dina anteckningar. Sök, filtrera på kategori och fäst viktiga poster. Lägg till en anteckning genom att välja dess Foundry-källa. När en bild har bifogats kan du öppna den från valvet. Tokenens snabba förhandsvisning hämtar text utan att automatiskt öppna bilden.
- För en källbunden anteckning kan du också öppna låsikonen på Foundry-bladet, använda tangentkommandot på kartan eller gå via den länkade Tome-profilen. Kontrollera dokumentnamnet så att du hamnar på rätt källpost.
- När du delar ur Vault markerar du texten eller väljer den enskilda bilden och kontrollerar mottagarna. En Vault-viskning är avsedd för de valda mottagarna. Åtkomsten till äldre krypterade viskningar kan bero på den webbläsarprofil där de mottogs.
- I ett äldre krypterat valv kan du låsa valvet igen eller välja att glömma en ihågkommen enhetsnyckel. Under **Vault access** kan ett upplåst gammalt valv kopieras till kontoläge. Det ursprungliga krypterade arkivet finns kvar. Det gamla lösenordet eller en fungerande ihågkommen nyckel behövs för att öppna arkivet igen.
- **Export GM Notes & Vault** skapar en privat säkerhetskopia med det exportflödet stöder, inklusive kategorier och portabla bilder. Privat export kan innehålla läsbara hemligheter. För fler bilder än exporten stöder använder du även en vanlig säkerhetskopia av världen. Privata spelaranteckningar använder sin egen export från **My Chronicle**. [Private Vaults användar- och säkerhetsgränser](V2.1.2_STABLE_RELEASE.md)

## Importformat och migreringsbeslut
<!-- tome-manual formats|reference|gm|import export formats json markdown backup migration spelarvänlig -->

- **Session Log Markdown:** börja med en sessionsrubrik och ge exempelvis sammanfattning, viktiga händelser, questuppdateringar, NPC:er och platser egna rubriker. Kontrollera i förhandsvisningen vilka namn som länkas eller föreslås som nya poster.
- **Quest Log Markdown:** gruppera uppdrag efter status och ge varje quest en rubrik med sin beskrivning. Status kan anges på svenska eller engelska enligt importformatet. Kontrollera valet för publik eller personlig målgrupp när det visas.
- **Tome Package JSON:** nyttigt när en importerbar leverans har sessioner, quests, världsposter och uttryckliga länkar. Använd **Create**, **Update** eller **Skip** där förhandsvisningen erbjuder valet. **Import history** hjälper dig kontrollera vad som sparats.
- **Move campaign (ZIP):** använd för att flytta kampanjmaterial mellan världar. Granska målkonton, föreslagna nya spelarkonton, behörigheter och mediefiler innan du sparar. Låt olösta, inte stödda eller oklara fält ligga kvar för beslut. Fortsätt efter avbrott via resultatet så att redan sparade kopior kan kännas igen.
- **GM Notes & Vault (private JSON):** använd när just dina privata GM-anteckningar ska flyttas. Vid byte av värld behöver importen kunna mappa rätt kampanj och källor. Kontrollera den föreslagna mappningen och vad som kommer att läggas till innan du kör importen.
- **Private GM archive (JSON):** använd som privat referens eller säkerhetsunderlag. För full återställning av en Foundry-värld, använd en ordinarie Foundry-backup. [Exempel och format för Sessions, Quests och paket](IMPORT-FORMATS.md)

## System- och modulintegrationer
<!-- tome-manual integrations|reference|gm|realm guard adapter system actions module integration -->

En aktiv integration kan lägga till systemåtgärder i till exempel **GM Dock**, **Quick NPC** eller **Quick Search**. Vilka val som visas beror på ditt regelsystem, dokumentet, dina behörigheter och vilka integrationer som är påslagna.

- Om en integration föreslår en uppdatering av **Known Information**, granska vilken Actor eller Journal som berörs, läs den föreslagna texten och bekräfta när den ska läggas till.
- Om en integration ber en GM om privata anteckningar gäller dialogen en viss källa i den GM:ens Vault. Läs vilket tillägg och dokument som anges. Ett godkännande ger en tidsbegränsad engångsläsning. Stäng dialogen om åtkomst inte ska ges.
- För den som bygger ett tillägg finns [Integration API](INTEGRATION_API.md), [granskade innehållsförslag](INTEGRATION_SUBMISSIONS.md) och [privata läsningar](INTEGRATION_PRIVATE_NOTES.md). Exempelmodulen finns i repots exempelmaterial.

## GM-verktyg efter modulnamn
<!-- tome-manual module-index|reference|gm|third party mods modules fire moduler -->

Slå upp den tidigare modulens namn och gå vidare till guiden för motsvarande arbetsflöde i Tome.

| Tidigare modul eller referens | Guide i Tome |
| --- | --- |
| Backgroundless Pins | [Kartnålar och bakgrund](MANUAL.md#placera-en-nål-eller-länka-en-scen) |
| Chat Portrait | [Karaktärsnamn och tokenporträtt](MANUAL.md#visa-tokenporträtt-och-välj-vem-som-talar) |
| Monk’s Scene Navigation | [Bläddra och växla scen](MANUAL.md#öppna-scener-och-flytta-gruppen) |
| Scene Express | [Skapa scener från bildfiler](MANUAL.md#skapa-scener-från-bildfiler) |
| Scene Defaults | [Scenförval och massändringar](MANUAL.md#förval-för-nya-scener) |
| Multiple Document Selection | [Markera, flytta och exportera dokument](MANUAL.md#arbeta-med-flera-foundry-dokument) |
| Ownership Viewer | [Kontrollera och ändra åtkomst](MANUAL.md#kontrollera-åtkomst-som-gm) |
| Quick Send to Chat | [Skicka ett utdrag i chatten](MANUAL.md#skicka-ett-utdrag-en-bild-eller-en-post) |
| Token Defaults | [Styr tokenens rotation](MANUAL.md#håll-tokenporträttet-upprätt) |
| Tokenizer 2 | [Skapa en karttoken](MANUAL.md#skapa-en-karttoken) |
| GM Notes och Hover Notes | [Skriv och läs privata anteckningar](MANUAL.md#öppna-private-vault-direkt-i-skrivläge) |

[Till manualens innehåll](MANUAL.md#innehåll)

## Funktionsregister
<!-- tome-manual feature-index|reference|all|feature list content function coverage funktionsregister -->

Registret pekar från användarytan till instruktionerna. Behörighet, valda inställningar och installerat spelsystem påverkar vad som visas.

| Yta i Tome eller Foundry | Funktioner och vägledning |
| --- | --- |
| Startknapp, fönster, frågetecken och Home | Flytta startknapp, minimera, snabbhjälp, transparens, senaste session, grupp, aktiva quests, upptäckter, favoriter och kartposition. [Startknapp och fönster](MANUAL.md#startknapp-och-fönster) |
| Sessions | Skrollområden, författarverktyg, redaktörer, uppladdning, krönika, briefing, källsidor, länkar och resehistorik. [Sessions](MANUAL.md#sessions-och-quests) |
| Quests | Skapa, importera, ändra status, länka källor och karaktärer, dela till grupp eller personlig målgrupp. [Quests](MANUAL.md#skapa-och-ändra-en-quest-som-gm) |
| Group och Actor-blad | Gruppmedlemskap, publik profil, biografi, relationer, bildval, profilknappar, karaktärsblad och Token Builder. [Gruppen och Token Builder](MANUAL.md#gruppen-karaktärsprofiler-och-token-builder) |
| World | Kategorier, mappar, Journal-sidor och medier, källkopplingar, Quick NPC, NPC-kort, läsbehörighet, redaktörer och alternativa namn. [World](MANUAL.md#world-rules-och-sökning) |
| Rules, Search och Quick Search | Skapa och länka regler, hitta poster, bokmärken, senaste träffar, Foundry-sökning, åtkomst och åtgärder på träffar. [Sökverktygen](#quick-search-och-tangentbord) |
| Chatt, dokument och Foundrys sidopaneler | Speak as, chattporträtt, markerade utdrag, viskning, delning, flerval, behörighet och dokumentåtgärder. [Delning och åtkomst](MANUAL.md#dela-i-chatten-och-styr-åtkomst) |
| Scener, kartan och dess markörer | Scennavigering, scenimport, scenåtkomst, scenförval, massändring, flera scenlänkar per markör och tokenplacering. [Kartverktygen](MANUAL.md#scener-kartnålar-och-resor) |
| Gruppflagga och Travel Planner | Flytt, spelartilldelning, delmål, friritning, målvisning, händelser, delad grupp, återförening, ångra och arkivera. [Resor och historik](MANUAL.md#händelser-delat-sällskap-och-historik) |
| My Chronicle och Player Signals | Privat anteckning, länkade poster, bokmärken, minnen, delning och återkallning, import/export och påminnelser. [Spelarens krönika](MANUAL.md#spelarens-krönika-och-påminnelser) |
| Campaign Tools | Overview, Memory, Analysis, Index, Player Signals, NPCs/Contacts/Items, Private Vault, Assistant, Quick Search och Travel History. [GM-arbetsflödet](MANUAL.md#gms-anteckningar-och-arbetsflöde) och [granskning](#fakta-relationer-rykten-och-index) |
| GM Notebook, GM Dock och Private Vault | Kontext, paneler, snabbanteckningar, notepads, påminnelser, inkorg, skrivläge, valvåtkomst och säkerhetskopior. [Dock](#gm-dock-och-sessionens-arbetsverktyg) och [Vault](#privata-anteckningar-och-återställning) |
| Campaign Settings och Developer Tools | Presentation, innehålls- och åtkomstförval, mappstruktur, hälsokontroll och Ashen Road-demot. [Inställningar](#inställningar-och-demokampanj) |
| Import & Export | Markdown, JSON, kampanj-ZIP, migrering och separata privata överföringar. [Format och migrering](#importformat-och-migreringsbeslut) |
| System- och modulintegrationer | Valfria systemåtgärder, granskade uppdateringar av Known Information, tillfällig Vault-åtkomst och utvecklarkontrakt. [Integrationer](#system--och-modulintegrationer) |
| Group och Inventory & Gear | Flytta föremål mellan karaktär, packdjur, basförråd och behållare. [Delad förvaring](MANUAL.md#packdjur-basförråd-kistor-och-lådor) |
