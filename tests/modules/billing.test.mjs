import assert from 'node:assert';
import { vsapGuard } from '../../server/core/vsap-guard.js';
import { validateRefund, processRefund, validateCancellation, cancelSubscription } from '../../server/features/billing/service.js';

console.log('▶ [PIET Grandchild] Running Billing & VSAP Guard In-RAM Suite...');

// Register policies if not already registered
vsapGuard.registerPolicy('process_refund', validateRefund);
vsapGuard.registerPolicy('cancel_subscription', validateCancellation);

const mockSession = {
  caller: {
    id: 'test-user-1',
    name: 'Bruce Wayne',
    tier: 'Wayne Enterprises Platinum',
    balance: 1000.00
  }
};

// 1. Negative Test: Negative or non-numeric amount
const negTest1 = validateRefund({ amount: -50 }, mockSession);
assert.equal(negTest1.valid, false, 'Negative amounts must be rejected');

const negTest2 = validateRefund({ amount: 'invalid' }, mockSession);
assert.equal(negTest2.valid, false, 'Non-numeric amounts must be rejected');

// 2. Boundary Test: Amount > $300
const boundaryTest = validateRefund({ amount: 300.01 }, mockSession);
assert.equal(boundaryTest.valid, false, 'Amounts above $300 must be rejected');

// 3. Valid Test: Amount = $150
const validTest = validateRefund({ amount: 150 }, mockSession);
assert.equal(validTest.valid, true, 'Valid refund under $300 must pass');

// 4. Execution Test: Process Refund
await processRefund(validTest.sanitized, mockSession);
assert.equal(mockSession.caller.balance, 1150.00, 'Balance must increase by refund amount');

// 5. Subscription Cancellation Test
const cancelVal = validateCancellation({}, mockSession);
assert.equal(cancelVal.valid, true);
await cancelSubscription(cancelVal.sanitized, mockSession);
assert.ok(mockSession.caller.tier.includes('Pending Cancellation'));

console.log('  ✅ [PASS] 5 Billing & VSAP Pre-flight assertions passed in RAM.\n');
