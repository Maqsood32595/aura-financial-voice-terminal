import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.resolve(__dirname, '../../server/data/sec_financials_master.json');
const filings = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('▶ [PIET Module] Running SEC 10-K Data Accuracy & Schema Invariant Suite...');

// 1. Check all filings have required fields
for (const f of filings) {
  assert.ok(f.ticker, `Filing ${f.id} must have ticker`);
  assert.ok(f.companyName, `Filing ${f.id} must have companyName`);
  assert.ok(f.fiscalYear >= 2020, `Filing ${f.id} must have valid fiscalYear`);
  assert.ok(f.revenue > 0, `Filing ${f.id} must have positive revenue`);
  if (f.industryType === 'STANDARD' && f.isGrossMarginApplicable !== false && f.grossProfit !== null) {
    assert.ok(typeof f.grossMarginPercent === 'number', `Standard Commercial filing ${f.id} must have numeric grossMarginPercent`);
  } else if (f.isGrossMarginApplicable === false || f.grossProfit === null) {
    assert.strictEqual(f.grossMarginPercent, null, `Financial/Utility filing ${f.id} must have null grossMarginPercent under GAAP`);
  }
  assert.ok(f.isAudited10K === true, `Filing ${f.id} must be flagged as audited 10-K`);
}
console.log(`  ✅ [PASS] All ${filings.length} SEC 10-K filings verified for sector-aware schema integrity.`);

// 2. Exact Numerical Verification (Nvidia FY2024 & Apple FY2023)
const nvda2024 = filings.find(f => f.ticker === 'NVDA' && f.fiscalYear === 2024);
assert.strictEqual(nvda2024.grossMarginPercent, 72.7, 'Nvidia FY2024 gross margin must be 72.7%');
assert.strictEqual(nvda2024.revenue, 60922000000, 'Nvidia FY2024 revenue must be $60.922B');

const aapl2023 = filings.find(f => f.ticker === 'AAPL' && f.fiscalYear === 2023);
assert.strictEqual(aapl2023.grossMarginPercent, 44.1, 'Apple FY2023 gross margin must be 44.1%');
assert.strictEqual(aapl2023.revenue, 383285000000, 'Apple FY2023 revenue must be $383.285B');

console.log('  ✅ [PASS] Exact numerical SEC EDGAR line-item fidelity verified.');

console.log('\n✅ [PASS] SEC 10-K Data Accuracy Suite Passed 100% Green\n');
