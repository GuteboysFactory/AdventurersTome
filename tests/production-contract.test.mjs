import {test} from 'node:test';import assert from 'node:assert/strict';
import {decisionRows,discoveryGroups,sameDecision,writeDisposition} from '../scripts/interpretation-contract.js';
const decision=(action,extra={})=>({text:'Veyra',action,kind:'npc',reason:'source-evidence',evidence:[{proof:{quote:'Veyra',start:12,end:17}}],candidates:[],...extra});
test('Source coordinates and proofs survive both ordinary discovery adapters',()=>{
 const result={sourceHash:'hash',map:{text:'The captain Veyra arrived.'},decisions:[decision('link',{targetUuid:'Actor.real'})]};
 const row=decisionRows(result)[0],group=discoveryGroups(result)[0];assert.equal(row.target.uuid,'Actor.real');assert.deepEqual(row.occurrences,[{text:'Veyra',start:12,end:17}]);assert.equal(group.grouped.occurrences[0].context,result.map.text);assert.equal(group.interpretation.sourceHash,'hash');
});
test('Forged row actions/targets do not supply a current authoritative decision',()=>{const result={decisions:[]};assert.equal(sameDecision(result,{text:'Veyra',action:'create',targetUuid:'Actor.forged'}),null);assert.equal(writeDisposition(null).outcome,'UNVERIFIED');});
test('Review and observation cannot be promoted into writes by adapter',()=>{for(const action of ['review','observe','exclude'])assert.equal(writeDisposition(decision(action,{targetUuid:'Actor.real'})).outcome,'REVIEW');});
test('Creation requires a reference and linking requires a real target identifier',()=>{assert.equal(writeDisposition(decision('create')).outcome,'REVIEW');assert.equal(writeDisposition(decision('link')).outcome,'REVIEW');assert.equal(writeDisposition(decision('create',{reference:{packId:'fiction',id:'city'}})).outcome,'CREATE');});
test('Conflicting identities retain distinct UUIDs in the review result',()=>{const d=decision('review',{candidates:[{uuid:'Actor.one',kind:'npc'},{uuid:'JournalEntry.two',kind:'faction'}]});assert.deepEqual(writeDisposition(d).candidates,d.candidates);assert.equal(decisionRows({decisions:[d]})[0].status,'ambiguous');});
test('A GM-selected alias remains resolvable after occurrences merge under one UUID',()=>{const d=decision('link',{targetUuid:'Actor.chosen',evidence:[{proof:{quote:'Veyra'}},{proof:{quote:'The Captain'}}]});assert.equal(sameDecision({decisions:[d]},{text:'The Captain'}),d);assert.equal(sameDecision({decisions:[d]},{text:'Captain Elsewhere'}),null);});
