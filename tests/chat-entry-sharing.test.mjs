import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../scripts/universal-sharing.js', import.meta.url), 'utf8');

function setup() {
  const gm = {id: 'gm', name: 'GM'};
  const player = {id: 'player'};
  const offline = {id: 'offline'};
  const contents = [gm, player, offline];
  const visibleTo = new Set([gm, player]);
  const messages = [], warnings = [];
  const documents = new Map();
  const hooks = new Map();
  const packs = new Map();
  const entry = {
    name: 'QA Quest',
    uuid: 'JournalEntry.qa',
    documentName: 'JournalEntry',
    testUserPermission: user => visibleTo.has(user),
    privateNote: 'Private fixture',
    toAnchor: () => ({outerHTML: '<a class="content-link" data-link data-uuid="JournalEntry.qa">Open QA Quest</a>'})
  };
  const api = {
    resolveEntry: (key) => key === 'quest:qa' ? entry : null,
    canView: (document, user) => document === entry && visibleTo.has(user)
  };
  documents.set(entry.uuid,entry);
  const context = vm.createContext({
    Hooks: {once() {}, on(name,callback) { hooks.set(name,callback); }},
    game: {user: gm, packs, users: {contents, get: (id) => contents.find((user) => user.id === id)}},
    CONST: {DOCUMENT_OWNERSHIP_LEVELS:{OBSERVER:2}},
    foundry: {utils:{fromUuid:async uuid => documents.get(uuid) || null}},
    ATTestAI: {assertEnabled() {}, modules: {get: () => ({api})}},
    ChatMessage: {create: async (data) => messages.push(data)},
    ui: {notifications: {warn: (message) => warnings.push(message)}}
  });
  vm.runInContext(source, context);
  return {post: context.atusCreateChat, player, offline, visibleTo, messages, warnings, hooks, packs, entry, documents};
}

test('entry links can only be posted publicly if offline users also have access', async () => {
  const {post, offline, visibleTo, messages, warnings} = setup();
  await post({refKey: 'quest:qa'});
  assert.equal(messages.length, 0);
  assert.equal(warnings.length, 1);
  visibleTo.add(offline);
  await post({refKey: 'quest:qa'});
  assert.equal(messages.length, 1);
  assert.match(messages[0].content, /data-uuid="JournalEntry.qa"/);
  assert.doesNotMatch(messages[0].content, /Private fixture/);
  assert.equal(messages[0].whisper, undefined);
});

test('native links work with Tome closed and recheck compendium permissions', async () => {
  const {post, player, packs, entry, hooks, messages}=setup();
  entry.pack='world.qa';
  packs.set(entry.pack,{testUserPermission:()=>false});
  const payload={documentUuid:entry.uuid, document:entry};
  await post(payload,[player.id]);
  assert.equal(messages.length,0);
  packs.set(entry.pack,{testUserPermission:()=>true});
  await post(payload,[player.id]);
  assert.equal(messages.length,1);
  const options=[];
  hooks.get('getJournalEntryContextOptions')({},options);
  hooks.get('getJournalEntryContextOptions')({},options);
  assert.equal(options.length,1);
  assert.equal(options[0].name,'Send to Chat');
  assert.ok(hooks.has('renderApplicationV2'));
});

test('entry whispers recheck access and keep their explicitly selected audience', async () => {
  const {post, player, visibleTo, messages} = setup();
  await post({refKey: 'quest:qa'}, ['player']);
  assert.equal(messages.length, 1);
  assert.deepEqual([...messages[0].whisper], ['player', 'gm']);
  visibleTo.delete(player);
  await post({refKey: 'quest:qa'}, ['player']);
  await post({refKey: 'quest:qa'}, ['wrong-user']);
  assert.equal(messages.length, 1);
});

test('an excerpt is sent in place of the link only when the recipient can read each selected page', async () => {
  const {post, player, entry, messages, documents} = setup();
  let readable = false;
  const page = {uuid:`${entry.uuid}.JournalEntryPage.page`, documentName:'JournalEntryPage', parent:entry, testUserPermission:()=>readable};
  documents.set(page.uuid,page);
  const payload = {sourceUuids:[entry.uuid,page.uuid], title:entry.name, html:'<strong>Selected passage</strong>', text:'Selected passage'};
  await post(payload,[player.id]);
  assert.equal(messages.length,0);
  readable = true;
  await post(payload,[player.id]);
  assert.match(messages[0].content,/<strong>Selected passage<\/strong>/);
  assert.doesNotMatch(messages[0].content,/data-uuid=/);
  documents.delete(page.uuid);
  await post(payload,[player.id]);
  assert.equal(messages.length,1);
});
