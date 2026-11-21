import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

function fixture() {
  const callbacks = new Map(), timers = new Map(), keybindings = new Map(), opened = [], writes = [], reads = [];
  let nextTimer = 0;
  const journal = {documentName: 'JournalEntry', name: 'Old Bridge', uuid: 'JournalEntry.bridge'};
  const accountNotes = new Map([['gm', [{title: 'Reminder', body: 'Bridge patrol at dusk'}]]]);
  const game = {system: {id: 'realm-guard'}, world: {id: 'qa'}, user: {id: 'gm', isGM: true}};
  game.keybindings = {register: (_module, name, binding) => keybindings.set(name, binding)};
  const security = {unlocked: () => true};
  class Element {
    children = [];
    dataset = {};
    style = {};
    attributes = {};
    classes = new Set();
    classList = {
      add: (...classes) => classes.forEach(name => this.classes.add(name)),
      remove: (...classes) => classes.forEach(name => this.classes.delete(name)),
      toggle: (name, force) => force ? this.classes.add(name) : this.classes.delete(name)
    };
    append(...children) { for (const child of children) child.parent = this; this.children.push(...children); }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    querySelector(selector) { return selector === '.window-header' ? this.header : null; }
    closest(selector) { return selector === '.window-header' && this.parent?.isHeader ? this.parent : null; }
    getBoundingClientRect() { return {width: 200, height: 100}; }
    addEventListener() {}
  }
  const document = {body: new Element(), createElement: () => new Element(), addEventListener() {}};
  const api = {
    securePrivateVault: security,
    privateVault: {canonical: input => input, notes: () => { reads.push(game.user.id); return accountNotes.get(game.user.id) || []; }},
    privateVaultUI: {open: async (source, options) => {
      opened.push(source);
      if (options?.write) writes.push(source);
    }}
  };
  const context = vm.createContext({
    game, document, innerWidth: 900, innerHeight: 700, canvas: {ready: true}, performance, HTMLElement: Element,
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: id => timers.delete(id),
    Hooks: {once: (name, callback) => callbacks.set(name, callback), on: (name, callback) => callbacks.set(name, callback)},
    ATTestAI: {modules: new Map([['adventurers-tome', {api}]])}
  });
  const load = file => vm.runInContext(readFileSync(new URL(`../scripts/${file}.js`, import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/, ''), context);
  const marker = {
    entry: journal,
    document: {documentName: 'Note', texture: {src: 'systems/realm-guard/assets/ui/map-icons/bridge.svg'}}
  };
  const hover = (note = marker) => {
    callbacks.get('hoverNote')(note, true);
    for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
    return document.body.children[0];
  };
  return {load, callbacks, hover, marker, document, game, journal, security, opened, reads, writes, keybindings, canvas: context.canvas, Element};
}

test('Realm Guard marker previews use the current GM Vault and clear on lock', () => {
  const qa = fixture();
  qa.load('private-vault-token-ui');
  const preview = qa.hover();
  assert.equal(preview.dataset.atVaultHover, qa.journal.uuid);
  assert.equal(preview.children[1].children[0].children[1].textContent, 'Bridge patrol at dusk');
  preview.children[2].children[0].onclick();
  assert.deepEqual(qa.opened, [qa.journal]);

  qa.game.user = {id: 'other-gm', isGM: true};
  assert.equal(qa.hover().children[1].children.length, 0);
  qa.security.unlocked = () => false;
  qa.callbacks.get('adventurersTomeVaultLockChanged')();
  assert.equal(qa.document.body.children.length, 0);
  assert.equal(qa.hover().children[1].children.length, 0);
  assert.deepEqual(qa.reads, ['gm', 'other-gm']);

  qa.game.user = {id: 'player', isGM: false};
  qa.callbacks.get('updateUser')();
  assert.equal(qa.hover(), undefined);
  assert.deepEqual(qa.reads, ['gm', 'other-gm']);
});

test('Ordinary map pins do not open the Realm Guard Vault preview', () => {
  const qa = fixture();
  qa.load('private-vault-token-ui');
  qa.marker.document.texture.src = 'icons/svg/book.svg';
  assert.equal(qa.hover(), undefined);
  assert.deepEqual(qa.reads, []);
});

test('The Vault shortcut requests writing mode for exactly one selected token and only for a GM', () => {
  const qa = fixture();
  qa.load('private-vault-token-ui');
  qa.callbacks.get('init')();
  const binding = qa.keybindings.get('writePrivateTokenNote');
  assert.equal(binding.restricted, true);
  assert.equal(binding.onDown(), false);
  const token = {id: 'qa-token'};
  qa.canvas.tokens = {controlled: [token, {id: 'other'}]};
  assert.equal(binding.onDown(), false);
  qa.canvas.tokens.controlled.pop();
  assert.equal(binding.onDown(), true);
  assert.deepEqual(qa.writes, [token]);
  qa.game.user = {id: 'player', isGM: false};
  assert.equal(binding.onDown(), false);
  assert.deepEqual(qa.writes, [token]);
});

test('Actor sheet header uses an icon-only, labelled Private Vault button', () => {
  const qa = fixture();
  qa.load('private-vault-ui');
  const root = new qa.Element();
  root.header = new qa.Element();
  root.header.isHeader = true;
  qa.callbacks.get('renderApplicationV2')({document: {documentName: 'Actor', uuid: 'Actor.pc', name: 'PC'}}, root);
  const [button] = root.header.children;
  assert.equal(button.title, 'Open Private Vault');
  assert.equal(button.attributes['aria-label'], 'Open Private Vault');
  assert.match(button.innerHTML, /fa-lock/);
  assert.doesNotMatch(button.innerHTML, /GM Notes/);
  assert.equal(button.classes.has('at-vault-header-button'), true);
});
