import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
process.chdir(root);
// Reuse the repository's existing manifest and release-URL validation blocks
// verbatim. Do not run packaging/publishing shell steps from the release job.
const workflow=fs.readFileSync('.github/workflows/release.yml','utf8');
const blocks=[...workflow.matchAll(/          node <<'NODE'\r?\n([\s\S]*?)          NODE/g)];
for(const block of blocks.slice(0,2)) {
  const code=block[1].split(/\r?\n/).map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
  execFileSync(process.execPath,['--input-type=commonjs','-'],{input:code,stdio:['pipe','inherit','inherit']});
}
const manifest=JSON.parse(fs.readFileSync('module.json','utf8'));
for(const file of [...manifest.esmodules,...(manifest.scripts||[])])execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
for(const file of ['templates/tome.hbs','assets/default-hero.webp','LICENSE','README.md',
  'docs/V1.7_QA40_IDENTITY_BRIEFING_CLEAN_SESSION_UX.md'])if(!fs.existsSync(file))throw Error(`Missing required file: ${file}`);
console.log(`PASS: workflow manifest and URL checks; ${manifest.esmodules.length} ES modules and ${manifest.scripts.length} vendor script syntax; required qa.40 files.`);
if(manifest.version === '1.7.0-qa.41') {
  for(const file of ['scripts/campaign-relationship-evidence.js','tests/qa41-relationships.test.mjs','docs/V1.7_QA41_RELATIONSHIP_HISTORY_FOUNDATION.md'])if(!fs.existsSync(file))throw Error(`Missing qa.41 foundation file: ${file}`);
  console.log('PASS: required qa.41 relationship foundation files.');
}
