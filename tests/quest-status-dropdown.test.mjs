import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const hbs = require('./helpers/vendor/handlebars-4.7.10.cjs');
const read = file => readFileSync(new URL('../'+file,import.meta.url),'utf8');
const source = read('scripts/adventurers-tome.js');
const statusMethod = source.slice(source.indexOf('  static async _onChangeQuestStatus('), source.indexOf('  static async _onEditAccess('));
const choices = ['active','dormant','completed','failed'];

test('Quest renders four statuses for the GM and the current status for players', () => {
  const render = hbs.compile(read('templates/tome.hbs'));
  const data = {isQuestDetail:true, questDetail:{id:'qa', status:'dormant', statusLabel:'Dormant', statusOptions:choices.map(id=>({id,label:id,selected:id==='dormant'}))}};
  const select = render({...data, isGM:true}).match(/<select data-at-quest-status[^]*?<\/select>/)[0];
  for (const option of choices) assert.ok(select.includes(`value="${option}"`));
  assert.match(select, /value="dormant" selected/);
  const player = render(data);
  assert.doesNotMatch(player,/data-at-quest-status/);
  assert.match(player,/at-status-dormant">Dormant/);
});

test('Changing quest status stays on its quest and rejects players and invalid choices', async () => {
  let current='dormant';
  const game={user:{isGM:true}}, writes=[];
  const change=vm.runInNewContext(`(class {${statusMethod}})._onChangeQuestStatus`,{
    game, QUEST_STATUSES:choices, MODULE_ID:'adventurers-tome', normalizeQuestStatus:String, displayQuestStatus:String,
    resolveTomeRefKey:key=>key==='quest:qa'?{}:null,
    ATTestAI:{flags:()=>({getFlag:()=>current,setFlag:async (_module,_flag,value)=>{writes.push(value);current=value;}})},
    ui:{notifications:{info(){},error(message){throw Error(message);}}}
  });
  const view={activeTab:'questDetail',activeQuestId:'qa'};
  const target={dataset:{journalId:'qa'}, disabled:false};
  for (const value of ['active','completed','failed','dormant','typo']) {
    target.value=value;
    await change.call(view,target);
  }
  game.user.isGM=false;
  target.value='active';
  await change.call(view,target);
  assert.deepEqual(writes,['active','completed','failed','dormant']);
  assert.deepEqual(view,{activeTab:'questDetail',activeQuestId:'qa'});
  assert.equal(target.disabled,false);
});
