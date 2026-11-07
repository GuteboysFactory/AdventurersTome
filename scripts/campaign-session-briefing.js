globalThis.ATTestAI.assertEnabled();
/* Session-based preparation. Derived, GM-only and deliberately read-only. */
const ATSB_ID = 'adventurers-tome';
const atSbSourceLinksInFlight = new Map();
function atSbApi() { return globalThis.ATTestAI.modules.get(ATSB_ID)?.api || {}; }
function atSbVisible(doc) {
  if (!doc || !game.user?.isGM) return false;
  const canView = atSbApi().canView;
  return typeof canView === 'function' ? Boolean(canView(doc, game.user)) : doc.testUserPermission?.(game.user, 'OBSERVER') === true;
}
function atSbText(html) {
  // A template is inert: imported images, scripts and event handlers never run.
  const template = document.createElement('template');
  template.innerHTML = String(html || '').slice(0, 500000);
  template.content.querySelectorAll('script,style,iframe,object,.secret,[data-secret="true"]').forEach(node => node.remove());
  template.content.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
  template.content.querySelectorAll('p,div,section,li,h1,h2,h3,h4,tr').forEach(node => node.append('\n'));
  return template.content.textContent.replace(/@UUID\[[^\]]+\](?:\{([^}]+)\})?/g, (_, label) => label || '[linked entry]')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
}
function atSbSnapshot() {
  if (!game.user?.isGM) return {status:'unavailable', sessions:[], followUps:[]};
  const api = atSbApi(), candidates = [];
  for (const entry of game.journal?.contents || []) {
    if (!atSbVisible(entry) || globalThis.ATTestAI.flags(entry).getFlag?.(ATSB_ID, 'chronicleV1')) continue;
    const kind = api.campaignRelationshipEvidence?.sourceKind?.(entry) || globalThis.ATTestAI.flags(entry).getFlag?.(ATSB_ID, 'type');
    if (!['session','sessions'].includes(kind)) continue;
    const ordinal = Number(globalThis.ATTestAI.flags(entry).getFlag?.(ATSB_ID, 'session')?.number || globalThis.ATTestAI.flags(entry).getFlag?.(ATSB_ID, 'sessionNumber') || entry.name?.match(/\bsession\s*0*(\d+)\b/i)?.[1]);
    candidates.push({entry, ordinal:Number.isSafeInteger(ordinal) && ordinal > 0 ? ordinal : null});
  }
  candidates.sort((a,b) => (b.ordinal ?? -1) - (a.ordinal ?? -1) || Number(b.entry.sort || 0) - Number(a.entry.sort || 0) || a.entry.uuid.localeCompare(b.entry.uuid));
  const sessions = [], followUps = [];
  for (const {entry,ordinal} of candidates) {
    const pages = (entry.pages?.contents || []).filter(page => page.type === 'text' && atSbVisible(page));
    const sources = [];
    for (const page of pages.slice(0,40)) {
      const text = atSbText(page.text?.content);
      if (!text) continue;
      const source = {sourceUuid:entry.uuid, pageUuid:page.uuid, pageName:page.name, excerpt:text.slice(0,600), shortened:text.length > 600};
      sources.push(source);
      // Quoted future intentions are prompts to review, never inferred facts or
      // assertions that a thread is still unresolved in later sessions.
      for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
        if (sentence.length < 15 || sentence.length > 360 || /\b(?:inte|aldrig|ingen|inget|not|never|no longer|didn't|won't)\b/i.test(sentence)) continue;
        // A time phrase alone ("stannade till nästa morgon") is history, not
        // an intention. Require a promise or a modal plus a follow-up action.
        const promise = /\b(?:lovade|lovar|promised)\b/i.test(sentence);
        const intention = /\b(?:ska|skulle|will|would)\s+(?:(?:de|vi|han|hon|jag|gruppen|they|we|he|she|i|the party)\s+)?(?:fråga|återvända|söka|undersöka|jämföra|besöka|leta|ta reda på|ask|return|investigate|compare|visit|look for)\b/i.test(sentence);
        if (!promise && !intention) continue;
        if (followUps.filter(row => row.sourceUuid === entry.uuid).length >= 3) break;
        followUps.push({sourceUuid:entry.uuid,pageUuid:page.uuid,pageName:page.name,sourceName:entry.name,excerpt:sentence,state:'possible'});
      }
    }
    if (!sources.length) continue;
    let linked = [];
    try {
      linked = (api.entityIntelligence?.profile?.(entry.uuid)?.context?.rows || [])
        .filter(row => (row.campaignLinked || row.appearedIn) && row.uuid !== entry.uuid && api.entityIntelligence?.resolve?.(row.uuid)?.status === 'ready')
        .slice(0,12).map(row => ({uuid:row.uuid,name:row.name,category:row.category}));
    } catch (_) { /* Existing source text remains usable without the index. */ }
    sessions.push({uuid:entry.uuid,name:entry.name,ordinal,sources,linked,limited:pages.length > 40});
    if (sessions.length === 3) break;
  }
  return {status:'ready',sessions,followUps,scope:'Recent numbered sessions first; unnumbered entries use library order. Empty sessions are skipped. Quotes may already have been resolved later.'};
}
async function atSbOpen(sourceUuid, pageUuid = '') {
  if (!game.user?.isGM) return {status:'unavailable'};
  // Resolve again on every click: deleted sources and changed permissions must
  // not turn an old briefing into a way around the document boundary.
  const resolved = atSbApi().entityIntelligence?.resolve?.(sourceUuid);
  if (resolved?.status !== 'ready' || !atSbVisible(resolved.document)) return {status:'unavailable'};
  if (pageUuid) {
    const page = resolved.document.pages?.contents?.find(row => row.uuid === pageUuid);
    if (!atSbVisible(page)) return {status:'unavailable'};
  }
  return atSbApi().entityIntelligence.open(sourceUuid, null, {pageUuid});
}
function atSbCreatedQuest(row) {
  return (game.journal?.contents || []).find(entry => {
    const source = globalThis.ATTestAI.flags(entry).getFlag?.(ATSB_ID, 'briefingSourceV1');
    return source?.sourceUuid === row.sourceUuid && source.pageUuid === row.pageUuid && source.excerpt === row.excerpt && atSbVisible(entry);
  });
}
function atSbCheckDraft(row) {
  if (!game.user?.isGM) throw new Error('Only a GM can create Quests.');
  if (!atSbSnapshot().followUps.some(current => current.sourceUuid === row.sourceUuid && current.pageUuid === row.pageUuid && current.excerpt === row.excerpt)) {
    throw new Error('The source changed or is unavailable. Refresh the briefing before creating this Quest.');
  }
  if (atSbCreatedQuest(row)) throw new Error('A Quest already exists for this follow-up. Refresh the briefing to open it.');
}
function atSbQuestDraft(row) {
  atSbCheckDraft(row);
  const authoring = atSbApi().campaignAuthoringV2;
  if (!authoring?.openCreateDialog) throw new Error('Quest authoring is unavailable. Reload Tome and try again.');
  authoring.openCreateDialog('quests', {
    title:'Follow up: ' + row.excerpt.slice(0,90),
    status:'dormant',visibility:'gm',
    body:`Possible follow-up\n\n${row.excerpt}\n\nReview whether this intention is still relevant and define the goal before sharing.`,
    sourceLabel:row.sourceName + ' · ' + row.pageName,
    briefingSource:{sourceUuid:row.sourceUuid,pageUuid:row.pageUuid,excerpt:row.excerpt},
    beforeCreate:() => atSbCheckDraft(row)
  });
}
async function atSbLinkQuestSource(quest) {
  if (!game.user?.isGM) throw new Error('Only a GM can link Quest sources.');
  if (!quest?.uuid) throw new Error('Quest not found.');
  if (atSbSourceLinksInFlight.has(quest.uuid)) return atSbSourceLinksInFlight.get(quest.uuid);
  const work = atSbWriteQuestSourceLink(quest);
  atSbSourceLinksInFlight.set(quest.uuid, work);
  try { return await work; }
  finally { atSbSourceLinksInFlight.delete(quest.uuid); }
}
async function atSbWriteQuestSourceLink(quest) {
  const api = atSbApi(), source = globalThis.ATTestAI.flags(quest).getFlag?.(ATSB_ID,'briefingSourceV1');
  const questKind = api.campaignRelationshipEvidence?.sourceKind?.(quest) || globalThis.ATTestAI.flags(quest).getFlag?.(ATSB_ID,'type');
  if (quest.documentName !== 'JournalEntry' || !game.journal.contents.includes(quest) || !['quest','quests'].includes(questKind) || !source) throw new Error('Briefing Quest source not found.');
  const marked = globalThis.ATTestAI.flags(quest).getFlag?.(ATSB_ID,'briefingSourceLinkV1');
  // Once completed, preserve subsequent manual unlinking. This is not a
  // background rule that keeps putting a GM's removed links back.
  if (marked?.version === 1 && marked.sourceUuid === source.sourceUuid && marked.pageUuid === source.pageUuid) return {status:'already-processed'};
  const session = game.journal.contents.find(entry => entry.uuid === source.sourceUuid);
  const kind = session && (api.campaignRelationshipEvidence?.sourceKind?.(session) || globalThis.ATTestAI.flags(session).getFlag?.(ATSB_ID,'type'));
  const page = session?.pages?.contents?.find(entry => entry.uuid === source.pageUuid);
  if (!['session','sessions'].includes(kind) || !atSbVisible(quest) || !atSbVisible(session) || !atSbVisible(page) || globalThis.ATTestAI.flags(session).getFlag?.(ATSB_ID,'chronicleV1')) throw new Error('Source session or page is unavailable.');
  if (!api.campaignEntityLinks?.linkCanonical) throw new Error('Campaign Links is unavailable.');
  // Session -> Quest is the existing canonical direction. The link API also
  // saves Quest.links.sessions, which drives the Sessions count and backlink.
  await api.campaignEntityLinks.linkCanonical({sourceUuid:session.uuid,targetUuid:quest.uuid});
  if (!game.user?.isGM) throw new Error('GM permission changed.');
  await globalThis.ATTestAI.flags(quest).setFlag(ATSB_ID,'briefingSourceLinkV1',{version:1,sourceUuid:session.uuid,pageUuid:page.uuid});
  return {status:'linked',sourceUuid:session.uuid,targetUuid:quest.uuid};
}
async function atSbRepairSourceLinks() {
  if (!game.user?.isGM) return {status:'unavailable',linked:0,failed:0};
  const result = {status:'ready',linked:0,failed:0};
  for (const quest of [...(game.journal?.contents || [])]) {
    if (!game.user?.isGM) break;
    if (!globalThis.ATTestAI.flags(quest).getFlag?.(ATSB_ID,'briefingSourceV1') || globalThis.ATTestAI.flags(quest).getFlag?.(ATSB_ID,'briefingSourceLinkV1')?.version === 1) continue;
    try { if ((await atSbLinkQuestSource(quest)).status === 'linked') result.linked++; }
    catch (error) { result.failed++; console.warn("Adventurer's Tome | Quest source link not completed",quest.uuid,error); }
  }
  return result;
}
function atSbMount(_app, root) {
  for (const host of root?.querySelectorAll?.('[data-at-session-briefing]') || []) {
    if (host.dataset.briefingBound || !game.user?.isGM) continue;
    host.dataset.briefingBound = 'true';
    const output = host.querySelector('[data-at-briefing-output]');
    host.querySelector('[data-at-briefing-refresh]')?.addEventListener('click', () => {
      output.replaceChildren();
      const model = atSbSnapshot();
      const element = (tag, text, parent = output) => { const node = document.createElement(tag); node.textContent = text; parent.append(node); return node; };
      const sourceButton = (label, uuid, pageUuid, parent) => {
        const button = element('button', label, parent); button.type = 'button'; button.className = 'at-secondary';
        button.addEventListener('click', async () => {
          const result = await atSbOpen(uuid, pageUuid);
          if (result?.status !== 'opened') ui.notifications.warn('This source is no longer available. Refresh the briefing.');
        });
      };
      if (model.status !== 'ready') return;
      element('p', model.scope).className = 'at-briefing-scope';
      if (!model.sessions.length) element('p', 'No session text yet. Add a Chronicle to a session in Tome, then refresh.');
      for (const session of model.sessions) {
        const card = element('article', ''); card.className = 'at-session-briefing-card';
        element('h3', session.name, card);
        for (const source of session.sources) {
          const details = element('details', '', card); details.open = source === session.sources[0];
          element('summary', source.pageName, details);
          element('blockquote', source.excerpt + (source.shortened ? '…' : ''), details);
          sourceButton('Open source', source.sourceUuid, source.pageUuid, details);
        }
        if (session.limited) element('p', 'Showing up to 40 text pages. Open the session for the rest.', card);
        if (session.linked.length) {
          element('h4', 'Linked people, places & entries', card);
          const links = element('div', '', card); links.className = 'at-briefing-links';
          for (const row of session.linked) sourceButton(row.name, row.uuid, '', links);
        }
      }
      element('h3', 'Possible follow-ups');
      element('p', 'Quoted intentions to review — these may already be resolved. Create Quest opens an editable GM-only draft; nothing is saved until you confirm.');
      for (const row of model.followUps) {
        const card = element('article', ''); card.className = 'at-session-briefing-card';
        element('blockquote', row.excerpt, card);
        sourceButton(row.sourceName + ' · ' + row.pageName, row.sourceUuid, row.pageUuid, card);
        const existing = atSbCreatedQuest(row);
        if (existing) sourceButton('Open created Quest', existing.uuid, '', card);
        else {
          const create = element('button', 'Create Quest', card); create.type = 'button'; create.className = 'at-primary';
          create.dataset.atBriefingQuest = 'true';
          create.addEventListener('click', () => {
            try { atSbQuestDraft(row); }
            catch (error) { ui.notifications.warn(error.message); }
          });
        }
      }
      if (!model.followUps.length) element('p', 'No explicit follow-up phrases found in these excerpts. Review the session sources for other threads.');
    });
  }
}
Hooks.once('ready', () => {
  const module = globalThis.ATTestAI.modules.get(ATSB_ID); module.api ||= {};
  module.api.sessionBriefing = Object.freeze({version:1,snapshot:atSbSnapshot,openSource:atSbOpen,linkQuestSource:atSbLinkQuestSource,repairSourceLinks:atSbRepairSourceLinks});
  // One startup pass on the active GM only; never write on render or Refresh.
  if (game.user?.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id)) {
    void atSbRepairSourceLinks().then(result => {
      if (result.linked) ui.notifications.info(`Adventurer's Tome: Linked ${result.linked} briefing Quest(s) to their source sessions.`);
      if (result.failed) ui.notifications.warn('Some briefing Quest sources could not be linked. Their Quests are preserved; check that the source sessions still exist.');
    }).catch(error => console.warn("Adventurer's Tome | Quest source repair",error));
  }
});
Hooks.on('adventurersTomeViewPrepared', atSbMount);
