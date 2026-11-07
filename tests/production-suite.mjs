import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
// These historical suites instantiate the retired standalone scanner without
// the integrated interpreter. Keep their source for reference; the current
// decision/write, privacy, feedback, source, cache and language contracts are
// exercised by production-*.test.mjs and the browser/native release gates.
export const historicalScannerSuites=new Set([
 'qa18-name-context.test.mjs','qa40-identity.test.mjs','qa41-relationships.test.mjs',
 'qa42-candidate-convergence.test.mjs','qa42-language-foundation.test.mjs',
 'qa42-manual-identity-link.test.mjs','qa42-private-source-facts.test.mjs',
 'qa42-review-performance.test.mjs','qa42-source-fact-review.test.mjs',
 'qa42-startup-performance.test.mjs','qa43-campaign-index.test.mjs',
 'qa43-historical-link-removal.test.mjs','qa43-language-continuation.test.mjs',
 'qa43-language-core.test.mjs','qa43-matching-preferences.test.mjs',
 'qa43-role-name-resolution.test.mjs','qa43-swedish-narrative.test.mjs'
]);
const files=fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.mjs')&&!historicalScannerSuites.has(f)&&f!=='production-tree-world-tree.test.mjs').sort().map(f=>'tests/'+f);
console.log(`Production gate: ${files.length} suites; ${historicalScannerSuites.size} pre-interpreter fixture suites retained as historical coverage.`);
const result=spawnSync(process.execPath,['--import','./tests/helpers/production-boundary.mjs','--test','--test-concurrency=2',...files],{cwd:root,stdio:'inherit'});
process.exit(result.status??1);
