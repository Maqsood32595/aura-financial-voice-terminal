import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const suites = [
  { name: 'SEC EDGAR 6-Gate Master Falsification Suite', path: 'tests/piet/piet.mjs' },
  { name: 'In-RAM Financial Calculations & Comparison Suite', path: 'tests/modules/financial_calculations.test.mjs' },
  { name: 'SEC 10-K Data Accuracy & Schema Invariant Suite', path: 'tests/modules/sec_accuracy.test.mjs' },
  { name: 'Broad Multi-Company Screener & Multi-Year Suite', path: 'tests/modules/broad_screener.test.mjs' },
  { name: 'In-RAM Speeding Architecture & Exact Numbers Suite', path: 'tests/modules/inram_speeding_and_screener.test.mjs' },
  { name: 'Financial Notepad Logger & Audit Trail Suite', path: 'tests/modules/notepad_logger.test.mjs' },
  { name: 'Financial Multi-Turn Deep Memory Suite', path: 'tests/modules/deep_memory.test.mjs' }
];

console.log('\n🏛️ [SEC EDGAR 10-K FINANCIAL AGENT - PIET MASTER RUNNER] Executing In-RAM Test Suites...\n');

let passed = 0;
let failed = 0;

for (const suite of suites) {
  console.log('================================================================');
  console.log(`▶ Running ${suite.name} (${suite.path})...`);
  console.log('================================================================');

  const fullPath = path.resolve(__dirname, '..', suite.path);
  
  await new Promise((resolve) => {
    const proc = spawn('node', [fullPath], { stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ [PASS] ${suite.name}\n`);
        passed++;
      } else {
        console.error(`❌ [FAIL] ${suite.name} (Exit code: ${code})\n`);
        failed++;
      }
      resolve();
    });
  });
}

console.log('================================================================');
if (failed === 0) {
  console.log(`🎉 ALL ${passed} SEC EDGAR PIET TEST SUITES PASSED 100% GREEN IN RAM! ✅\n`);
  process.exit(0);
} else {
  console.error(`💥 ${failed} test suite(s) failed out of ${passed + failed}.\n`);
  process.exit(1);
}
