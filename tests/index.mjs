import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const suites = [
  { name: 'PIET Master 6-Gate Falsification Suite', path: 'tests/piet/piet.mjs' },
  { name: 'Billing & VSAP In-RAM Mutation Suite', path: 'tests/modules/billing.test.mjs' },
  { name: 'Voice Session & Interruption Suite', path: 'tests/modules/voice_session.test.mjs' },
  { name: 'QSAG Sub-2ms Knowledge Retrieval Suite', path: 'tests/modules/qsag_kb.test.mjs' }
];

console.log(`\n🚀 [PIET MASTER RUNNER] Executing ${suites.length} In-RAM Test Suites...\n`);
const start = Date.now();

for (const suite of suites) {
  console.log(`================================================================`);
  console.log(`▶ Running ${suite.name} (${suite.path})...`);
  console.log(`================================================================`);
  execSync(`node "${path.join(projectRoot, suite.path)}"`, { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test_runner' } });
  console.log(`✅ [PASS] ${suite.name}\n`);
}

const elapsed = ((Date.now() - start) / 1000).toFixed(2);
console.log(`🎉 ALL ${suites.length} PIET SUITES PASSED 100% GREEN IN RAM IN ${elapsed}s!\n`);
