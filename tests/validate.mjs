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
if(['1.7.0-qa.41','1.7.0','1.8.0-qa.1','1.8.0-qa.2','1.8.0-qa.3','1.8.0-qa.4'].includes(manifest.version)) {
  for(const file of ['scripts/campaign-relationship-evidence.js','tests/qa41-relationships.test.mjs','docs/V1.7_QA41_RELATIONSHIP_HISTORY_FOUNDATION.md'])if(!fs.existsSync(file))throw Error(`Missing qa.41 foundation file: ${file}`);
  console.log('PASS: required qa.41 relationship foundation files.');
}
if(['1.7.0-qa.42','1.7.0-qa.43','1.7.0','1.8.0-qa.1','1.8.0-qa.2','1.8.0-qa.3','1.8.0-qa.4'].includes(manifest.version)) {
  for(const file of ['scripts/campaign-relationship-evidence.js','scripts/campaign-entity-intelligence.js','tests/qa42-intelligence.test.mjs','tests/qa42-relationship-presentation.test.mjs','tests/qa42-context-dedupe.test.mjs','tests/helpers/vendor/handlebars-4.7.10.cjs','docs/V1.7_QA42_ENTITY_INTELLIGENCE_CONTEXTUAL_NAVIGATION.md'])if(!fs.existsSync(file))throw Error(`Missing qa.42 foundation file: ${file}`);
  console.log('PASS: required qa.42 intelligence and contextual navigation files.');
  if(!fs.existsSync('tests/qa42-clean-surfaces.test.mjs'))throw Error('Missing qa.42 clean surface regression file');
  if(!fs.existsSync('tests/qa42-manual-identity-link.test.mjs'))throw Error('Missing qa.42 manual identity link regression file');
  for(const file of ['scripts/startup-performance.js','tests/qa42-startup-performance.test.mjs','tests/helpers/startup-world.mjs'])if(!fs.existsSync(file))throw Error(`Missing startup audit file: ${file}`);
  for(const file of ['scripts/review-decision-performance.js','tests/qa42-review-performance.test.mjs','tests/helpers/review-world.mjs'])if(!fs.existsSync(file))throw Error(`Missing Review hotfix file: ${file}`);
}
if(['1.7.0-qa.43','1.7.0','1.8.0-qa.1','1.8.0-qa.2','1.8.0-qa.3','1.8.0-qa.4'].includes(manifest.version)) {
  for(const file of ['tests/qa43-role-name-resolution.test.mjs','docs/V1.7_QA43_ROLE_ATTRIBUTION_NAME_FORM_RESOLUTION.md'])if(!fs.existsSync(file))throw Error(`Missing qa.43 file: ${file}`);
  console.log('PASS: required qa.43 role attribution and name-form resolution files.');
}
if(manifest.version==='1.8.0-qa.4')for(const file of ['tests/qa18-chronicle-browser.mjs','docs/V1.8_QA4_CHRONICLE_ENTITY_SURFACES.md'])if(!fs.existsSync(file))throw Error(`Missing qa.4 Chronicle entity-surface file: ${file}`);
if(manifest.version.startsWith('1.9.')) {
  for(const file of ['scripts/migration-core.js','scripts/migration-ui.js','styles/migration.css','templates/migration.hbs','tests/qa19-migration.test.mjs','docs/V1.9_QA1_MIGRATION_TOOLKIT.md','scripts/campaign-index.js','scripts/campaign-entity-intelligence.js','scripts/player-chronicle.js','scripts/player-chronicle-storage.js','scripts/player-chronicle-ui.js','scripts/campaign-rumour-review.js'])if(!fs.existsSync(file))throw Error(`Missing migration or inherited feature: ${file}`);
  for(const file of ['scripts/migration-core.js','scripts/migration-ui.js','scripts/player-chronicle.js','scripts/player-chronicle-storage.js','scripts/player-chronicle-ui.js','scripts/campaign-index.js'])if(!manifest.esmodules.includes(file))throw Error(`Feature missing from manifest: ${file}`);
  if(manifest.version==='1.9.0'||/^1\.9\.0-qa\.(?:[2-9]|\d{2,})(?:\.\d+)?$/.test(manifest.version))for(const file of ['scripts/migration-adapters.js','scripts/migration-taf-realm-guard.js','scripts/migration-import.js'])if(!manifest.esmodules.includes(file))throw Error(`Missing qa.2 import runtime: ${file}`);
  if(!manifest.styles.includes('styles/migration.css'))throw Error('Migration style missing from manifest');
  if(['1.9.0','1.9.0-qa.3','1.9.0-qa.4','1.9.0-qa.4.1','1.9.0-qa.4.2','1.9.0-qa.4.3','1.9.0-qa.4.4','1.9.0-qa.4.10','1.9.0-qa.4.11','1.9.0-qa.4.12','1.9.0-qa.4.13','1.9.0-qa.4.14','1.9.0-qa.4.15','1.9.0-qa.4.16'].includes(manifest.version)&&!manifest.esmodules.includes('scripts/migration-private-data.js'))throw Error('Missing owner-scoped migration runtime');
  if((manifest.version==='1.9.0'||manifest.version.startsWith('1.9.0-qa.4'))&&!manifest.esmodules.includes('scripts/transfer-content.js'))throw Error('Missing shared content transfer engine');
  console.log('PASS: migration and inherited Chronicle/index runtime included.');
}

if(manifest.version==='1.9.0') {
  for(const file of ['docs/V1.9_STABLE_RELEASE.md','scripts/window-dock.js','styles/window-dock.css','styles/campaign-overview.css','styles/campaign-workspace.css'])if(!fs.existsSync(file))throw Error(`Missing stable release file: ${file}`);
  if(!manifest.esmodules.includes('scripts/window-dock.js'))throw Error('Missing launcher minimization runtime');
}
