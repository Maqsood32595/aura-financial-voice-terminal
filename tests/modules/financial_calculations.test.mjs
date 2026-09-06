import assert from 'node:assert';
import { financialCalculatorService } from '../../server/features/financial-calculator/service.js';

console.log('▶ [PIET Module] Running In-RAM Financial Calculations & Comparison Suite...');

// 1. Cross-Company Comparison
const comp = financialCalculatorService.compareCompanies({
  tickerA: 'NVDA',
  tickerB: 'AAPL',
  fiscalYear: 2023
});

assert.strictEqual(comp.companyA.ticker, 'NVDA');
assert.strictEqual(comp.companyB.ticker, 'AAPL');
assert.strictEqual(comp.companyA.grossMarginPercent, '56.9%');
assert.strictEqual(comp.companyB.grossMarginPercent, '44.1%');
console.log('  ✅ [PASS] In-RAM multi-company ratio calculation verified.');

// 2. Year-over-Year Growth Calculation
const growth = financialCalculatorService.calculateYoYGrowth('NVDA');
assert.strictEqual(growth.ticker, 'NVDA');
assert.strictEqual(growth.previousYear, 2023);
assert.strictEqual(growth.currentYear, 2024);
assert.ok(growth.revenueGrowthYoY.includes('+125'), 'Nvidia YoY revenue growth was >125%');
console.log('  ✅ [PASS] In-RAM YoY growth calculations verified.');

console.log('\n✅ [PASS] Financial Calculations Suite Passed 100% Green\n');
