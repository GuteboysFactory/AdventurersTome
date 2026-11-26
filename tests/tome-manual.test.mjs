import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {test} from 'node:test';
import {buildManual,loadManual,manualMatches,parseManual} from '../scripts/tome-manual.mjs';

const docs=new URL('../docs/',import.meta.url);
const files={sv:['MANUAL.md','MANUAL-REFERENS.md'],en:['MANUAL-EN.md','MANUAL-REFERENCE-EN.md']};
const read=file=>readFileSync(new URL(file,docs),'utf8');
const catalog=Object.fromEntries(Object.entries(files).map(([locale,paths])=>
  [locale,paths.flatMap(file=>parseManual(read(file),file))]));
const byId=(list,id)=>list.find(section=>section.id===id);

test('both manual languages provide the same topics with unique search metadata',()=>{
  const metadata=sections=>Object.fromEntries(sections.map(({id,type,gmOnly,keywords})=>[id,{type,gmOnly,keywords}]));
  assert.deepEqual(metadata(catalog.sv),metadata(catalog.en));
  for(const [locale,sections] of Object.entries(catalog)){
    assert.equal(new Set(sections.map(section=>section.id)).size,sections.length);
    assert.ok(sections.length>=50,locale);
    for(const section of sections){
      assert.ok(section.category&&section.keywords&&section.body,section.id);
      assert.doesNotMatch(section.body,/<!-- (?:en:|tome-manual )/);
    }
    for(const file of files[locale]){
      const markers=(read(file).match(/<!-- tome-manual /g)||[]).length;
      assert.equal(sections.filter(section=>section.file===file).length,markers,file);
      for(const block of read(file).split(/(?=^#{2,3} )/m)){
        const heading=block.match(/^#{2,3} ([^\r\n]+)/)?.[1];
        if(!heading||['Innehåll','Contents'].includes(heading)||block.includes('<!-- tome-manual '))continue;
        const body=block.replace(/^#{2,3} [^\r\n]+/,'')
          .replace(/^\[(?:Till innehållet|Back to contents)\]\(#(?:innehåll|contents)\)\r?\n/gm,'').trim();
        assert.equal(body,'',file+': '+heading+' is missing search metadata');
      }
    }
  }
});

test('manual search uses both languages, aliases and instructions with appropriate player filtering',()=>{
  for(const locale of ['sv','en']){
    const gm=buildManual(catalog,locale,true),player=buildManual(catalog,locale,false);
    for(const [id,query] of [
      ['scene-defaults','gridless svart bakgrund'],
      ['map-markers','backgroundless pins'],
      ['private-token-note','skrivlage ctrl'],
      ['token-builder','outer thickness utsmyckning'],
      ['access','who can see observer'],
      ['scene-navigation','previous scene flytta spelarna'],
      ['quick-search','compendium kortkommando']
    ])assert.ok(manualMatches(byId(gm,id).searchText,query),locale+': '+query);
    assert.ok(player.every(section=>!section.gmOnly));
    assert.equal(byId(player,'private-token-note'),undefined);
    assert.match(byId(player,'token-builder').bodyHtml,/<ol>/);
    assert.ok(!manualMatches(byId(gm,'token-builder').searchText,'deadbeef'));
  }
});

test('manual uses topic links and escapes raw markup and unsupported protocols',()=>{
  const localized=buildManual(catalog,'sv',true);
  assert.match(byId(localized,'module-index').bodyHtml,/data-at-manual-link="token-builder"/);
  const text='### Test\n<!-- tome-manual test|guide|all|keywords -->\n\n<img src=x onerror=alert> [Try me](javascript:alert) **Bold**';
  const [rendered]=buildManual({sv:parseManual(text,'MANUAL.md'),en:[]},'sv',true);
  assert.match(rendered.bodyHtml,/&lt;img/);
  assert.match(rendered.bodyHtml,/<strong>Bold<\/strong>/);
  assert.doesNotMatch(rendered.bodyHtml,/<img|javascript:/);
});

test('manual and reference links resolve in each language',()=>{
  const headingId=title=>title.toLowerCase().trim().replace(/[^\p{L}\p{N} _-]/gu,'').replaceAll(' ','-');
  for(const file of Object.values(files).flat()){
    for(const [,target] of read(file).matchAll(/\]\(([^)]+)\)/g)){
      if(/^(https?:|mailto:)/.test(target))continue;
      const [path,fragment]=target.split('#');
      const dest=new URL(path||file,docs);
      assert.ok(existsSync(dest),file+': '+target);
      if(!fragment)continue;
      const headings=[...readFileSync(dest,'utf8').matchAll(/^#{1,6} (.+)$/gm)].map(match=>headingId(match[1]));
      assert.ok(headings.includes(decodeURIComponent(fragment)),file+': '+target);
    }
  }
});

test('manual loader recovers from file errors and groups local guides',async()=>{
  const original=globalThis.fetch;
  try{
    globalThis.fetch=async()=>new Response('',{status:404});
    assert.equal((await loadManual('sv',true)).failed,true);
    globalThis.fetch=async url=>new Response(readFileSync(url,'utf8'));
    const view=await loadManual('en',false);
    assert.equal(view.english,true);
    assert.equal(view.failed,undefined);
    assert.equal(view.groups.flatMap(group=>group.topics).length,view.sections.length);
    assert.equal(view.sections.length,catalog.en.filter(section=>!section.gmOnly).length);
  }finally{globalThis.fetch=original;}
});
