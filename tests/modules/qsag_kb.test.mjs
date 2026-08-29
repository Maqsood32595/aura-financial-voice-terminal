import assert from 'node:assert';
import { QsagKbEngine } from '../../server/core/qsag-kb.js';

console.log('▶ [PIET Grandchild] Running QSAG In-Memory Knowledge Base Suite...');

const kb = new QsagKbEngine();

// Test search accuracy
const results1 = kb.search('refund policy 30 days');
assert.ok(results1.length > 0);
assert.equal(results1[0].category, 'Billing');

const results2 = kb.search('telephony audio quality jitter');
assert.ok(results2.length > 0);
assert.equal(results2[0].category, 'Technical');

// Test latency invariant
const t0 = performance.now();
for (let i = 0; i < 100; i++) {
  kb.search('cancel my subscription');
}
const elapsed = performance.now() - t0;
const avgLatency = elapsed / 100;

assert.ok(avgLatency < 2.0, `Average In-Memory search must be <2ms (Actual: ${avgLatency.toFixed(3)}ms)`);

console.log(`  ✅ [PASS] 100 In-RAM searches completed at average ${avgLatency.toFixed(3)}ms per query.\n`);
