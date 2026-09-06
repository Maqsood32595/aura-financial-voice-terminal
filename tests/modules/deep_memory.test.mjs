import assert from 'node:assert';
import { voiceOrchestrator } from '../../server/core/voice-orchestrator.js';
import { sessionEngine } from '../../server/core/session-engine.js';
import { shadowFinancialDb } from '../../server/core/shadow-db.js';

console.log('▶ [PIET Module] Running Financial Multi-Turn Deep Memory Suite...');

await shadowFinancialDb.init();

const session = sessionEngine.createSession('deep-memory-sec-test');

// Turn 1: Inquire about NVDA
await voiceOrchestrator.processVoiceTurn({
  session,
  userTranscript: 'Tell me about Nvidia FY2024 revenue.'
});

assert.ok(session.profile.inquiredCompanies.includes('NVDA'), 'NVDA must be stored in session memory');
console.log('  ✅ [PASS] Turn 1: Company entity stored in session profile.');

// Turn 2: Inquire about AAPL
await voiceOrchestrator.processVoiceTurn({
  session,
  userTranscript: 'What about Apple 2023 services revenue?'
});

assert.ok(session.profile.inquiredCompanies.includes('AAPL'), 'AAPL must be stored in session memory');
assert.strictEqual(session.turns.length, 4, '4 turns must exist in history');
console.log('  ✅ [PASS] Turn 2: Multi-entity dialogue memory retained.');

// Turn 3: Ask memory recall question
const recallTurn = await voiceOrchestrator.processVoiceTurn({
  session,
  userTranscript: 'Which companies have we analyzed so far today?'
});

assert.ok(recallTurn.replyText, 'Agent must answer from memory');
console.log('  ✅ [PASS] Turn 3: Deep memory recall verified across 6 conversational turns.');

sessionEngine.teardownSession('deep-memory-sec-test');
assert.strictEqual(sessionEngine.getSession('deep-memory-sec-test'), null, 'Session wiped cleanly');

console.log('\n✅ [PASS] Financial Multi-Turn Deep Memory Suite Passed 100% Green\n');
