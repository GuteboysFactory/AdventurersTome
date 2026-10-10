import {test} from 'node:test';
import assert from 'node:assert/strict';
import {world} from './helpers/tome-world.mjs';
const claims=[
 ['FRIEND_OF','current','positive','asserted','Rhea North is a friend of Tala Reed.','Rhea North är vän med Tala Reed.'],
 ['ACQUAINTANCE_OF','current','positive','asserted','Rhea North is an acquaintance of Tala Reed.','Rhea North är bekant med Tala Reed.'],
 ['QUARTERMASTER_OF','current','positive','asserted','Rhea North is quartermaster of Copper Circle.','Rhea North är kvartermästare för Copper Circle.'],
 ['COMMANDER_OF','current','positive','asserted','Rhea North commands Copper Circle.','Rhea North leder Copper Circle.'],
 ['KEEPER_OF','current','positive','asserted','Rhea North is keeper of Amber Inn.','Rhea North är värd på Amber Inn.'],
 ['MEMBER_OF','current','negative','asserted','Rhea North is not a member of Copper Circle.','Rhea North är inte medlem i Copper Circle.'],
 ['MEMBER_OF','current','negative','asserted','Rhea North is no longer a member of Copper Circle.','Rhea North är inte längre medlem i Copper Circle.'],
 ['MEMBER_OF','historical','positive','asserted','Rhea North is a former member of Copper Circle.','Rhea North är tidigare medlem i Copper Circle.'],
 ['MEMBER_OF','current','negative','asserted','Rhea North has never formally joined Copper Circle.','Rhea North har aldrig formellt anslutit sig till Copper Circle.'],
 ['MEMBER_OF','historical','positive','asserted','Rhea North previously joined Copper Circle.','Rhea North gick med i Copper Circle.'],
 ['INFORMATION_PROVIDER','historical','positive','asserted','Rhea North provided Tala Reed with information.','Rhea North försåg Tala Reed med information.'],
 ['INFORMANT_FOR','historical','positive','asserted','Rhea North was informant for Copper Circle.','Rhea North var informant för Copper Circle.'],
 ['WORKS_FOR','current','positive','possible','Rhea North may be working for Copper Circle.','Rhea North kanske arbetar för Copper Circle.'],
 ['WORKS_FOR','current','positive','rumoured','Rhea North is rumoured to work for Copper Circle.','Rhea North ryktas nu arbeta för Copper Circle.'],
 ['WORKS_WITH','current','positive','asserted','Rhea North currently works with Copper Circle.','Rhea North arbetar med Copper Circle.'],
 ['STAYS_AT','current','positive','asserted','Rhea North stays at Amber Inn.','Rhea North bor på Amber Inn.'],
 ['TREATED','historical','positive','asserted','Rhea North treated Tala Reed years ago.','Rhea North behandlade Tala Reed för två år sedan.'],
 ['OPERATES_FROM','current','positive','asserted','Rhea North operates from Amber Inn.','Rhea North verkar från Amber Inn.'],
 ['KNOWS','current','positive','asserted','Rhea North knows Tala Reed.','Rhea North känner Tala Reed.'],
 ['TRUSTS','current','positive','asserted','Rhea North trusts Tala Reed.','Rhea North litar på Tala Reed.'],
 ['OWES_FAVOUR_TO','current','positive','asserted','Rhea North owes Tala Reed a favour.','Rhea North är skyldig Tala Reed en tjänst.'],
 ['SERVES','historical','positive','asserted','Rhea North formerly served Tala Reed.','Rhea North tjänstgjorde under Tala Reed.'],
 ['MET','historical','positive','asserted','Rhea North met Tala Reed.','Rhea North träffade Tala Reed.'],
 ['SPEAKS_WITH','current','positive','asserted','Rhea North speaks with Tala Reed.','Rhea North talar med Tala Reed.']
];
function narrative(text,uiLanguage='en') {
 const w=world(text,false);w.game.i18n.lang=uiLanguage;
 w.person=w.add('Rhea North','Actor');w.other=w.add('Tala Reed','JournalEntry',{worldProfile:{category:'contact'}});
 w.group=w.add('Copper Circle','JournalEntry',{worldProfile:{category:'faction'}});w.place=w.add('Amber Inn','JournalEntry',{worldProfile:{category:'location'}});
 return w;
}
for(const [language,index] of [['en',4],['sv',5]])test(`${language} relationship pack preserves equivalent canonical semantics and source provenance`,async()=>{
 const w=narrative(claims.map(row=>row[index]).join('\n'),language==='sv'?'en':'sv');
 const result=await w.api.campaignRelationshipEvidence.sync();
 for(const [type,time,polarity,certainty,...texts]of claims){
  const text=texts[index-4],rows=result.evidence.filter(row=>row.sourceExcerpt===text&&row.relationType===type);
  assert.equal(rows.length,1,text);const row=rows[0];
  assert.equal(row.temporalScope,time,text);assert.equal(row.polarity,polarity,text);assert.equal(row.certainty,certainty,text);
  assert.equal(row.subjectUuid,w.person.uuid,text);assert.equal(row.provenance[0].language,language);assert.equal(row.provenance[0].packVersion,1);
  assert.ok(row.sourceSpan.text&&row.sourceSpan.end>row.sourceSpan.start,text);
 }
 assert.ok(result.evidence.filter(row=>row.certainty!=='asserted').every(row=>w.api.campaignRelationshipEvidence.review().some(review=>review.id===row.id)));
 const ids=result.evidence.map(row=>row.id);await w.api.campaignRelationshipEvidence.sync();assert.deepEqual([...w.api.campaignRelationshipEvidence.snapshot().evidence.filter(row=>row.active).map(row=>row.id)],[...ids]);
});

test('Swedish types, accented noise and full person references use the shared discovery resolver',async()=>{
 const w=world('Flera resenärer anlände. Ytterligare rapporter kom. Inuti fanns en låda. Gruppen träffade Älva Lind, en tidigare spejare som berättade om Bärn Ruiner. Älva väntade. Älva talade. Älva gick. De bar ett dokument med titeln Den Kopparkrönikan. Kopparkrönikan var förseglad.',false);
 const rows=await w.resolve();
 for(const word of ['Flera','Ytterligare','Inuti','Älva'])assert.ok(!rows.some(row=>row.text===word),word);
 assert.equal(rows.find(row=>row.text==='Älva Lind')?.outcome,'CREATED');
 assert.ok(rows.find(row=>row.text==='Älva Lind').identityBriefing.roles.includes('tidigare spejare'));
 assert.equal(rows.find(row=>row.text==='Bärn Ruiner')?.classification.kind,'location');
 assert.equal(rows.find(row=>row.text==='Kopparkrönikan')?.classification.kind,'item');
 assert.equal(rows.find(row=>row.text==='Kopparkrönikan')?.outcome,'REVIEW');
});

test('Mixed languages scope time and negation to their own assertion and preserve source text',async()=>{
 const text='Rhea North var informant för Copper Circle men känner Tala Reed och är nu skyldig Tala Reed en tjänst.\nRhea North works with Copper Circle but är inte medlem i Copper Circle.';
 const w=narrative(text);const result=await w.api.campaignRelationshipEvidence.sync();
 const find=type=>result.evidence.find(row=>row.relationType===type);
 assert.equal(find('INFORMANT_FOR')?.temporalScope,'historical');assert.equal(find('KNOWS')?.temporalScope,'current');assert.equal(find('OWES_FAVOUR_TO')?.temporalScope,'current');
 assert.equal(find('WORKS_WITH')?.polarity,'positive');assert.equal(find('MEMBER_OF')?.polarity,'negative');assert.equal(w.page.text.content,text);
});

test('Language rules do not invent relationships, merge namesakes or expose private endpoints',async()=>{
 const w=narrative('Rhea North frågade om Copper Circle. Tala Reed läste dokumentet. Rhea North kanske känner Tala Reed.');
 w.add('Tala Reed','Actor');const result=await w.api.campaignRelationshipEvidence.sync();assert.equal(result.evidence.length,0);
 w.game.user={id:'player',isGM:false};w.person.testUserPermission=()=>false;assert.equal(w.api.campaignRelationshipEvidence.graph().length,0);
 const audit=w.api.narrativeLanguage.audit();assert.deepEqual([...audit.languages],['en','sv']);assert.equal(audit.identityAuthority,false);assert.equal(audit.writeAuthority,false);assert.equal(audit.networkRequired,false);
});

test('Recognizing a name is not knowledge of a person and a generic Swedish title is not a personal alias',async()=>{
 const w=narrative('Rhea North känner igen Tala Reed.');
 assert.equal((await w.api.campaignRelationshipEvidence.sync()).evidence.length,0);
 const captain=w.add('Kapten Älva Lind','JournalEntry',{worldProfile:{category:'contact'}});
 w.page.text.content='Kapten Älva Lind känner Tala Reed. Kapten arbetar för Copper Circle.';
 const rows=(await w.api.campaignRelationshipEvidence.sync()).evidence.filter(row=>row.active);
 assert.ok(rows.some(row=>row.relationType==='KNOWS'&&row.subjectUuid===captain.uuid));
 assert.ok(!rows.some(row=>row.relationType==='WORKS_FOR'));
});

test('Accented and decomposed names retain exact source spans and normalization collisions remain ambiguous',async()=>{
 const text='Åsa Bäck arbetar med Copper Circle men känner Örn Åker.'.normalize('NFD');
 const w=narrative(text),person=w.add('Åsa Bäck','Actor'),other=w.add('Örn Åker','JournalEntry',{worldProfile:{category:'contact'}});
 const rows=(await w.api.campaignRelationshipEvidence.sync()).evidence;
 assert.equal(rows.length,2);assert.ok(rows.every(row=>row.subjectUuid===person.uuid));
 assert.equal(rows.find(row=>row.relationType==='KNOWS').objectUuid,other.uuid);
 for(const row of rows){assert.equal(row.sourceExcerpt,text);assert.equal(text.slice(row.sourceSpan.start,row.sourceSpan.end),row.sourceSpan.text);}
 w.add('Asa Back','Actor');const refreshed=await w.api.campaignRelationshipEvidence.sync();assert.ok(!refreshed.evidence.some(row=>row.active));
});
