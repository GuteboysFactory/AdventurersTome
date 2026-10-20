import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Handlebars=require('./helpers/vendor/handlebars-4.7.10.cjs').create();
const render=Handlebars.compile(fs.readFileSync(new URL('../templates/migration.hbs',import.meta.url),'utf8'));
test('chosen roles remain visible before Import even when no document exception rows remain',()=>{
  const html=render({isGM:true,isImport:true,hasPackage:true,importPackage:{},hasTafGroups:true,canDoImport:true,importRows:[],contactRepairSummary:[{sourceUuid:'Actor.pc',actor:'PC',role:'Friend',person:'Friend NPC'},{sourceUuid:'Actor.pc',actor:'PC',role:'Senior Artisan',person:'Artisan NPC'},{sourceUuid:'Actor.pc',actor:'PC',role:'Mentor',person:'Mentor NPC'},{sourceUuid:'Actor.pc',actor:'PC',role:'Enemy',person:'Enemy NPC'}]});
  assert.equal((html.match(/data-contact-summary-role=/g)||[]).length,4);
  assert.ok(html.indexOf('Review contact roles before importing')<html.indexOf('data-action="importReady"'));
  assert.equal((html.match(/data-action="editContacts"/g)||[]).length,4);
  assert.match(html,/No individual decisions needed/);
});
test('review hints stay advisory and source labels are escaped',()=>{
  const html=render({isGM:true,isImport:true,hasPackage:true,importPackage:{},canDoImport:true,contactRepairSummary:[{sourceUuid:'Actor.pc',actor:'PC',role:'Enemy',person:'<img src=x onerror=bad()>',warning:'The selected name suggests another role. Check this choice before importing.'}]});
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);
  assert.match(html,/Check this choice before importing/);
  assert.match(html,/data-action="importReady" >Do Import/);
});

test('completed copies keep their reviewed roles visible without offering to edit already-saved copies',()=>{
  const html=render({isGM:true,isImport:true,hasPackage:true,importPackage:{},contactRepairSummary:[{sourceUuid:'Actor.pc',actor:'PC',role:'Mentor',person:'Mentor NPC',imported:true}]});
  assert.match(html,/Mentor NPC/);assert.match(html,/<small>Imported<\/small>/);assert.doesNotMatch(html,/data-action="editContacts"/);
});
