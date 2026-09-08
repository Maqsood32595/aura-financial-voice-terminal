import assert from 'node:assert';
import { shadowDb } from '../../server/core/shadow-db.js';
import { voiceOrchestrator } from '../../server/core/voice-orchestrator.js';
import { financialCalculatorService } from '../../server/features/financial-calculator/service.js';
import { sessionEngine } from '../../server/core/session-engine.js';

console.log('▶ [PIET Module] Running Broad Multi-Company Screener & Multi-Year Test Suite...');

// Ensure In-RAM DB is initialized
await shadowDb.initialize();

// Test 1: S&P 500 Free Cash Flow > $40 Billion Screener
console.log('  Testing SQL query: FCF > $40B...');
const fcf40Result = await shadowDb.query(
  'SELECT ticker, company_name, free_cash_flow FROM filings WHERE fiscal_year = 2023 AND free_cash_flow > 40000000000 ORDER BY free_cash_flow DESC;'
);

assert.ok(fcf40Result.rows.length >= 6, 'Must return at least 6 filings exceeding $40B FCF');
const tickersOver40B = fcf40Result.rows.map(r => r.ticker);
assert.ok(tickersOver40B.includes('AAPL'), 'Apple must be in FCF > $40B');
assert.ok(tickersOver40B.includes('MSFT'), 'Microsoft must be in FCF > $40B');
assert.ok(tickersOver40B.includes('GOOGL') || tickersOver40B.includes('GOOG'), 'Alphabet must be in FCF > $40B');
assert.ok(tickersOver40B.includes('META'), 'Meta Platforms ($43.01B) must be in FCF > $40B (ChatGPT omission test)');

const metaRow = fcf40Result.rows.find(r => r.ticker === 'META');
assert.strictEqual(metaRow.free_cash_flow, 43013000000, 'Meta Platforms FY2023 FCF must match $43.013B audited 10-K');

console.log(`  ✅ [PASS] In-RAM FCF > $40B Screener verified (${fcf40Result.rows.length} filings found).`);

// Test 2: Dual-Condition Screener (Net Loss > $5B AND Positive FCF > $5B - The 3M Test)
console.log('  Testing SQL query: Net Loss > $5B AND FCF > $5B...');
const lossFcfResult = await shadowDb.query(
  'SELECT ticker, company_name, net_income, free_cash_flow FROM filings WHERE fiscal_year = 2023 AND net_income < -5000000000 AND free_cash_flow > 5000000000;'
);

const lossFcfTickers = lossFcfResult.rows.map(r => r.ticker);
assert.ok(lossFcfTickers.includes('MMM'), '3M Company (MMM) must qualify under Net Loss > $5B and FCF > $5B');
assert.ok(!lossFcfTickers.includes('T'), 'AT&T must NOT qualify because FY2023 GAAP Net Income was profitable (~+$14.19B)');

const mmmRow = lossFcfResult.rows.find(r => r.ticker === 'MMM');
assert.ok(mmmRow.net_income < -5000000000, '3M Net Loss must be deeper than -$5B (-$6.995B)');
assert.ok(mmmRow.free_cash_flow > 5000000000, '3M Free Cash Flow must exceed +$5B ($5.141B)');

console.log('  ✅ [PASS] In-RAM Loss > $5B and FCF > $5B Screener verified (3M passed, AT&T excluded).');

// Test 3: Multi-Year FY2022 vs FY2023 YoY Growth
console.log('  Testing YoY Growth calculation across FY2022 and FY2023...');
const appleYoY2023 = financialCalculatorService.calculateYoYGrowth('AAPL', 2023);
assert.strictEqual(appleYoY2023.ticker, 'AAPL');
assert.strictEqual(appleYoY2023.previousYear, 2022);
assert.strictEqual(appleYoY2023.currentYear, 2023);
assert.ok(appleYoY2023.revenueGrowthYoY.includes('-2.8%'), 'Apple FY2022 to FY2023 revenue growth was -2.8% ($394.3B to $383.3B)');

const metaYoY = financialCalculatorService.calculateYoYGrowth('META');
assert.strictEqual(metaYoY.ticker, 'META');
assert.strictEqual(metaYoY.previousYear, 2022);
assert.strictEqual(metaYoY.currentYear, 2023);
assert.ok(metaYoY.revenueGrowthYoY.includes('+15.7%'), 'Meta YoY growth was +15.7% ($116.6B to $134.9B)');

const appleLatestYoY = financialCalculatorService.calculateYoYGrowth('AAPL');
assert.strictEqual(appleLatestYoY.currentYear, 2024);
assert.strictEqual(appleLatestYoY.previousYear, 2023);
assert.ok(appleLatestYoY.revenueGrowthYoY.includes('+2%') || appleLatestYoY.revenueGrowthYoY.includes('+2.0%'), 'Apple FY2023 to FY2024 revenue growth was +2%');

console.log('  ✅ [PASS] Multi-Year FY2022 vs FY2023 and FY2024 YoY calculations verified.');

// Test 4: Voice Orchestrator Spoken Query Intent Detection
console.log('  Testing Voice Orchestrator spoken intent detection for broad screeners...');
const session = sessionEngine.createSession('test-broad-session');

// 4a. FCF Screener spoken query
const resFCF = await voiceOrchestrator.processVoiceTurn({
  session,
  userTranscript: 'Which S&P 500 companies generated free cash flow over 40 billion in 2023?'
});
assert.strictEqual(resFCF.toolExecution.tool, 'screener_free_cash_flow');
assert.ok(resFCF.toolExecution.output.length >= 6, 'Must identify all qualifying FCF > $40B companies');
assert.ok(session.profile.inquiredCompanies.includes('META'), 'Meta must be remembered in session context');

// 4b. Loss + FCF divergence spoken query
const resLoss = await voiceOrchestrator.processVoiceTurn({
  session,
  userTranscript: 'Which companies had net loss exceeding 5 billion and positive free cash flow over 5 billion?'
});
assert.strictEqual(resLoss.toolExecution.tool, 'screener_loss_fcf_divergence');
assert.ok(resLoss.toolExecution.output.some(m => m.ticker === 'MMM'), '3M Company must be in matches');

// 4c. YoY growth spoken query
const resYoY = await voiceOrchestrator.processVoiceTurn({
  session,
  userTranscript: 'What was Apple YoY growth?'
});
assert.strictEqual(resYoY.toolExecution.tool, 'calculate_yoy_growth');
assert.strictEqual(resYoY.toolExecution.output.ticker, 'AAPL');

console.log('  ✅ [PASS] Voice Orchestrator natural language screener routing verified.');

console.log('\n✅ [PASS] Broad Screener & Multi-Year Test Suite Passed 100% Green\n');
