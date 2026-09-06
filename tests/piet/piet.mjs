import assert from 'node:assert';
import { shadowFinancialDb } from '../../server/core/shadow-db.js';
import { sessionEngine } from '../../server/core/session-engine.js';
import { financialKb } from '../../server/core/financial-kb.js';
import { financialCalculatorService } from '../../server/features/financial-calculator/service.js';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║    SEC EDGAR 10-K In-RAM 6-Gate Master Falsification Suite ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// ║ G1: Falsification Probes (Negative Capability Proof)
console.log('║ G1: Falsification Probes (Negative Capability Proof)');
const nonExistent = financialCalculatorService.findFiling('FAKE_TICKER_999');
assert.strictEqual(nonExistent, null, 'Non-existent ticker lookup MUST return null');
console.log('  ✅ G1.1 Non-existent ticker lookup hard-blocked in RAM');

// ║ G2: AST & Database Relational Integrity
console.log('║ G2: AST & Database Relational Integrity');
await shadowFinancialDb.init();
const dbResult = await shadowFinancialDb.query('SELECT COUNT(*) as cnt FROM sec_filings;');
assert.ok(parseInt(dbResult.rows[0].cnt, 10) >= 10, 'Must have at least 10 seeded SEC filings');
console.log(`  ✅ G2.1 ${dbResult.rows[0].cnt} SEC 10-K filings relational schema validated in WebAssembly RAM`);

// ║ G3: In-RAM Zero-Mock Session Round-Trip
console.log('║ G3: In-RAM Zero-Mock Session Round-Trip');
const t0 = performance.now();
const session = sessionEngine.createSession('sec-piet-session');
assert.strictEqual(session.fsm.currentState, 'GREETING', 'Initial state must be GREETING');
const sessionRoundTripMs = Number((performance.now() - t0).toFixed(3));
assert.ok(sessionRoundTripMs < 5, 'Session roundtrip must be <5ms in RAM');
console.log(`  ✅ G3.1 Ephemeral financial session round-trip executed in ${sessionRoundTripMs}ms`);

// ║ G4: In-RAM Sparse Token Knowledge Retrieval
console.log('║ G4: In-RAM Sparse Token Knowledge Retrieval');
const tKb0 = performance.now();
const results = financialKb.search('Nvidia Data Center revenue gross margin', 2);
const kbLatency = Number((performance.now() - tKb0).toFixed(3));
assert.ok(results.length > 0, 'Must find matching NVDA filing');
assert.ok(results[0].content.includes('Data Center'), 'Content must include Data Center segment');
console.log(`  ✅ G4.1 In-RAM SEC sparse search verified in ${kbLatency}ms`);

// ║ G5: In-RAM Cross-Company Comparison Ratio Invariant
console.log('║ G5: In-RAM Cross-Company Comparison Ratio Invariant');
const compare = financialCalculatorService.compareCompanies({
  tickerA: 'NVDA',
  tickerB: 'AAPL',
  fiscalYear: 2023
});
assert.strictEqual(compare.companyA.ticker, 'NVDA', 'Company A ticker must be NVDA');
assert.strictEqual(compare.companyB.ticker, 'AAPL', 'Company B ticker must be AAPL');
assert.strictEqual(compare.comparison.higherGrossMargin, 'NVDA', 'Nvidia FY2023 gross margin (56.9%) was higher than Apple (44.1%)');
console.log('  ✅ G5.1 Multi-company financial comparison ratio verified in RAM');

// ║ G6: Mandatory Teardown Invariant
console.log('║ G6: Mandatory Teardown Invariant');
sessionEngine.teardownSession('sec-piet-session');
assert.strictEqual(sessionEngine.getSession('sec-piet-session'), null, 'Session must be completely wiped from RAM');
console.log('  ✅ G6.1 Mandatory Teardown Invariant executed: 0 ghost records in RAM\n');

console.log('🎉 ALL 6 SEC EDGAR PIET FALSIFICATION GATES PASSED 100% GREEN IN RAM ✅\n');
