import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const ID = 'adventurers-tome';

function fixture() {
  const ready = [];
  const dialogs = [];
  let nextId = 0;
  const collections = {Actor: [], Item: [], JournalEntry: []};
  function documentClass(type) {
    return class {
      static async create(data, options) {
        return (await this.createDocuments([data], options))[0];
      }
      static async createDocuments(batch) {
        return batch.map(data => {
          const doc = {...data, documentName: type, uuid: `${type}.${data._id ?? ++nextId}`};
          collections[type].push(doc);
          return doc;
        });
      }
    };
  }
  const Actor = documentClass('Actor');
  const Item = documentClass('Item');
  const JournalEntry = documentClass('JournalEntry');
  const classes = {Actor, Item, JournalEntry};
  const api = {};
  const game = {
    user: {isGM: true}, world: {id: 'target'}, system: {id: 'realm-guard', version: '1.13.5'},
    packs: new Map(),
    actors: {contents: collections.Actor}, items: {contents: collections.Item}, journal: {contents: collections.JournalEntry}
  };
  const context = vm.createContext({
    ...classes, game, getDocumentClass: type => classes[type], setTimeout,
    CONFIG: {Actor: {}, Item: {dataModels: {trait: {}, gear: {}}}},
    Hooks: {once: (event, callback) => { if (event === 'ready') ready.push(callback); }, on() {}},
    ATTestAI: {assertEnabled() {}, modules: new Map([[ID, {api}]])},
    foundry: {
      utils: {randomID: () => `migration-${++nextId}`},
      applications: {api: {
        ApplicationV2: class {}, HandlebarsApplicationMixin: Base => Base,
        DialogV2: {wait: async dialog => { dialogs.push(dialog); return null; }}
      }}
    }
  });
  const load = file => {
    const source = readFileSync(new URL(`../scripts/${file}.js`, import.meta.url), 'utf8');
    // Files are evaluated together in the Foundry test context.
    vm.runInContext(source.replace(/^import '\.\/[^']+';\r?$/gm, ''), context, {filename: file});
  };
  load('identity-conflicts');
  return {Item, JournalEntry, game, dialogs, api, load, start: () => ready.splice(0).forEach(callback => callback())};
}

const stout = {
  name: 'Stout', type: 'trait', folder: 'traits',
  flags: {'realm-guard': {suppliedTrait: true, starterCategory: 'traits', starterKey: 'trait:stout'}}
};

test('Realm Guard restores missing catalog Traits beside similar Item and Lore names without a dialog', async () => {
  const {Item, JournalEntry, game, dialogs, start} = fixture();
  const scout = await Item.create({name: 'Scout', type: 'gear'});
  const lore = await JournalEntry.createDocuments(Array.from({length: 2}, () => ({name: 'Scout', flags: {[ID]: {type: 'lore'}}})));
  const nearWizard = await Item.create({name: 'Wizard’s Sigh', type: 'gear'});
  const wizard = {...stout, name: 'Wizard’s Sight', flags: {'realm-guard': {...stout.flags['realm-guard'], starterKey: 'trait:wizards-sight'}}};
  start();

  const created = await Item.createDocuments([stout, wizard]);

  assert.deepEqual(created.map(doc => doc.name), ['Stout', 'Wizard’s Sight']);
  assert.deepEqual(dialogs, []);
  assert.deepEqual(game.items.contents, [scout, nearWizard, ...created]);
  assert.deepEqual(game.journal.contents, lore);
  assert.equal(await Item.create(stout), undefined);
  assert.equal(dialogs.length, 1, 'An existing catalog Trait does not bypass the guard on a second creation');
});

test('Manual Items and incorrectly marked Traits still prompt on similar names', async () => {
  const {Item, game, dialogs, start} = fixture();
  const scout = await Item.create({name: 'Scout', type: 'gear'});
  start();

  assert.equal(await Item.create({name: 'Stout', type: 'trait'}), undefined);
  assert.equal(await Item.create({...stout, name: 'Shout'}), undefined);
  assert.equal(await Item.create({...stout, type: 'gear'}), undefined);
  game.system.id = 'other-system';
  assert.equal(await Item.create(stout), undefined);
  assert.equal(dialogs.length, 4);
  assert.ok(dialogs.every(dialog => dialog.window.title === 'Identity with a similar name'));
  assert.deepEqual(game.items.contents, [scout]);
});

test('Approved migration copies keep separate source identities without prompting for similar names', async () => {
  const {Item, game, dialogs, api, load, start} = fixture();
  const scout = await Item.create({name: 'Scout', type: 'gear'});
  for (const file of [
    'migration-core', 'migration-adapters', 'migration-import', 'migration-portraits',
    'migration-relationships', 'transfer-content', 'migration-ui'
  ]) load(file);
  start();
  const pkg = {
    packageId: 'qa-names', manifest: {source: {systemId: game.system.id, systemVersion: game.system.version, worldId: 'source'}},
    documents: ['Stout', 'Scout'].map((name, index) => ({
      name, sourceUuid: `Item.source-${index}`, documentType: 'Item',
      sourceData: {_id: `source-${index}`, name, type: 'gear', system: {}}
    })),
    identityMap: [], references: []
  };

  const result = await api.migration.execute(api.migration.approveReady(pkg));

  assert.equal(result.created.length, 2);
  assert.equal(dialogs.length, 0);
  assert.deepEqual(game.items.contents.map(doc => doc.name), ['Scout', 'Stout', 'Scout']);
  assert.equal(game.items.contents[0], scout);
  assert.deepEqual(game.items.contents.slice(1).map(doc => doc.flags[ID].migrationV1.sourceUuid), ['Item.source-0', 'Item.source-1']);
  const retry = await api.migration.execute(api.migration.approveReady(pkg));
  assert.equal(retry.created.length, 0);
  assert.equal(game.items.contents.length, 3);
  assert.equal(await Item.create({name: 'Shout', type: 'gear'}), undefined);
  assert.equal(dialogs.length, 1);
});
