import assert from 'node:assert';
import { SessionEngine } from '../../server/core/session-engine.js';

console.log('▶ [PIET Grandchild] Running Voice Session & Interruption Suite...');

const engine = new SessionEngine();
const session = engine.createSession('test-interruption-session', {
  callerName: 'Diana Prince',
  tier: 'Gold Tier'
});

assert.equal(engine.activeCount, 1);
assert.equal(session.caller.name, 'Diana Prince');

// Add turns
engine.appendTurn(session.id, 'user', 'What is my current balance?');
engine.appendTurn(session.id, 'agent', 'Your current balance is $420.00.');
assert.equal(session.turns.length, 2);

// Barge-in
const barge = engine.handleBargeIn(session.id, 'User voice detected');
assert.equal(barge.interrupted, true);
assert.equal(session.metrics.totalInterruptions, 1);
assert.equal(session.turns[1].wasInterrupted, true);

// Teardown
const audit = engine.teardownSession(session.id);
assert.ok(audit);
assert.equal(engine.activeCount, 0);
assert.equal(engine.getSession(session.id), null);

console.log('  ✅ [PASS] Voice session lifecycle & barge-in invariants verified.\n');
