import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';
import {interpretSource} from '../scripts/interpretation-engine.js';

const ID = 'adventurers-tome';
const SOURCE = 'JournalEntry.session7';

function document(type, id, name, flags = {}) {
  return {id, uuid: `${type}.${id}`, name, documentName: type, type: type === 'Actor' ? 'npc' : undefined,
    flags: {[ID]: flags}, getFlag: (namespace, key) => namespace === ID ? flags[key] : undefined, update() {}};
}

function collection(documents) {
  return {contents: documents, get: id => documents.find(doc => doc.id === id)};
}

test('The campaign catalogue and Review use World for same-name people and preserve saved choices', async () => {
  const pallandoActor = document('Actor', 'pallandoNative', 'Pallando');
  const pallandoWorld = document('JournalEntry', 'pallandoWorld', 'Pallando', {worldProfile: {category: 'npc'}});
  const fullName = 'Röde Matthis, Rövare (Edrik Fiende)';
  const matthisActor = document('Actor', 'matthisNative', fullName);
  const matthisCard = document('JournalEntry', 'matthisCard', fullName, {
    worldProfile: {category: 'NPC'}, knownPersonV1: {actorUuid: matthisActor.uuid}
  });
  const edrik = document('Actor', 'edrik', 'Edrik ”Kråkan” Törne');
  const edrikWorld = document('JournalEntry', 'edrikWorld', edrik.name, {worldProfile: {category: 'npc', actorId: edrik.id}});
  const faction = document('JournalEntry', 'kullfolket', 'Kullfolket', {worldProfile: {category: 'faction'}});
  const session = document('JournalEntry', 'session7', 'Session 7', {type: 'session'});
  const quest = document('JournalEntry', 'quest1', 'Quest 1', {type: 'quest'});
  const settings = new Map([['campaignIntelligenceLearning', JSON.stringify({
    sourceChoices: {[SOURCE]: {matthis: {action: 'linked', sourceUuid: SOURCE, targetUuid: matthisCard.uuid}}},
    nameDefaults: {matthis: {targetUuid: matthisCard.uuid}}
  })]]);
  const hooks = new Map();
  const on = (name, fn) => { if (!hooks.has(name)) hooks.set(name, []); hooks.get(name).push(fn); };
  const emit = (name, ...args) => { for (const fn of hooks.get(name) || []) fn(...args); };
  const module = {api: {}};
  Object.assign(globalThis, {
    Hooks: {on, once: on, callAll: emit},
    ATTestAI: {assertEnabled() {}, flags: doc => doc, settings: {
      get: (_id, key) => settings.get(key), set: (_id, key, value) => settings.set(key,value)
    }, modules: new Map([[ID, module]])},
    game: {world: {id: 'fixture'}, user: {id: 'gm', isGM: true}, modules: new Map([[ID, module]]),
      actors: collection([pallandoActor, matthisActor, edrik]), journal: collection([pallandoWorld, matthisCard, session, quest, edrikWorld, faction]),
      folders: collection([]), items: collection([]), scenes: collection([]), users: collection([])}
  });
  for (const name of ['campaign-identity-reconciliation', 'campaign-review-learning']) {
    vm.runInNewContext(readFileSync(new URL(`../scripts/${name}.js`, import.meta.url), 'utf8'), {
      ATTestAI: globalThis.ATTestAI, Hooks: globalThis.Hooks, game: globalThis.game,
      fromUuid: async uuid => [...game.actors.contents,...game.journal.contents].find(doc=>doc.uuid===uuid)
    });
  }
  await import('../scripts/testai-language.js');
  emit('ready');
  const {testAILanguage: language, campaignReviewLearning: learning} = module.api;
  const catalog = language.catalogSnapshot();

  assert.equal(catalog.filter(row => row.name === fullName).length, 1);
  assert.equal(catalog.find(row => row.uuid === matthisActor.uuid).inWorld, true);
  assert.equal(language.resolveCatalogue('Pallando', SOURCE).target.uuid, pallandoWorld.uuid);
  const pair = [{uuid: pallandoActor.uuid, name: 'Pallando', kind: 'npc'},
    {uuid: pallandoWorld.uuid, name: 'Pallando', kind: 'NPC'}];
  assert.deepEqual(language.preferredReviewTargets(pair), [pair[1]]);
  assert.deepEqual(Array.from(learning.linkTargets({query: 'Pallando'}), row => row.uuid), [pallandoWorld.uuid]);
  assert.equal(language.resolveCatalogue('Matthis', SOURCE).target.uuid, matthisActor.uuid);
  assert.equal(language.resolveCatalogue('Matthis', 'JournalEntry.later').reason, 'campaign-default-choice');

  globalThis.DOMParser = class {
    parseFromString(html) {
      const body = {tagName: 'BODY', textContent: html, children: [], querySelectorAll: () => [],
        closest: () => null, cloneNode() { return this; }};
      return {body, querySelectorAll: () => []};
    }
  };
  const analysis = await interpretSource({html: 'Pallando varnade dem.', sourceUuid: SOURCE, catalog, tokens: []});
  assert.deepEqual(analysis.decisions.map(row => [row.action,row.targetUuid]), [['link',pallandoWorld.uuid]]);

  await learning.chooseForSource({text:'Edriks',sourceUuid:SOURCE,targetUuid:edrikWorld.uuid});
  await learning.chooseForSource({text:'Kråkan',sourceUuid:SOURCE,targetUuid:edrikWorld.uuid});
  await learning.chooseForSource({text:'Svarta Hjälmarna',sourceUuid:SOURCE,targetUuid:faction.uuid});
  await learning.chooseForSource({text:'Spionen',sourceUuid:SOURCE,targetUuid:edrikWorld.uuid,rememberAlias:false});
  assert.deepEqual(Array.from(learning.identityAliases().get(edrik.uuid)), ['Edrik','Kråkan']);
  assert.equal(language.resolveCatalogue('Spionen', SOURCE).target.uuid, edrik.uuid);
  assert.equal(language.resolveCatalogue('Spionen', quest.uuid).status, 'unknown');
  for (const name of ['Edrik','Edriks','Kråkan']) assert.equal(language.resolveCatalogue(name,quest.uuid).target.uuid,edrik.uuid);
  assert.equal(language.resolveCatalogue('Svarta Hjälmarna',quest.uuid).target.uuid,faction.uuid);
  const questAnalysis = await interpretSource({html:'Kråkan mötte Svarta Hjälmarna.',sourceUuid:quest.uuid,catalog:language.catalogSnapshot(),tokens:[]});
  assert.deepEqual(questAnalysis.decisions.map(row=>row.targetUuid).sort(),[edrik.uuid,faction.uuid].sort());
  assert.deepEqual(Array.from(learning.linkTargets({query:'Edriks'}),row=>row.uuid),[edrik.uuid]);

  const namesake = document('JournalEntry','krakan','Kråkan',{worldProfile:{category:'npc'}});
  game.journal.contents.push(namesake);
  emit('createJournalEntry',namesake);
  const learnedConflict = language.resolveCatalogue('Kråkan',quest.uuid);
  assert.equal(learnedConflict.reason,'confirmed-alias-conflict');
  assert.deepEqual(learnedConflict.candidates.map(row=>row.uuid).sort(),[edrik.uuid,namesake.uuid].sort());
  assert.equal(language.resolveCatalogue('Kråkan',SOURCE).target.uuid,edrik.uuid);

  await learning.setIdentityAliases({targetUuid:edrikWorld.uuid,names:['Edrik','Spejaren'],expected:['Edrik','Kråkan']});
  assert.equal(language.resolveCatalogue('Kråkan',quest.uuid).target.uuid,namesake.uuid);
  assert.equal(language.resolveCatalogue('Spejaren',quest.uuid).target.uuid,edrik.uuid);

  const otherWorld = document('JournalEntry', 'secondWorld', 'Pallando', {worldProfile: {category: 'npc'}});
  game.journal.contents.push(otherWorld);
  emit('createJournalEntry', otherWorld);
  const ambiguous = language.resolveCatalogue('Pallando', SOURCE);
  assert.equal(ambiguous.status, 'ambiguous');
  assert.deepEqual(ambiguous.candidates.map(row => row.uuid).sort(), [otherWorld.uuid, pallandoWorld.uuid].sort());
});
