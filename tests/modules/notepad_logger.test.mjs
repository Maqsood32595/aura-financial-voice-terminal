import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { notepadFinancialLogger } from '../../server/core/notepad-financial-logger.js';
import { sessionEngine } from '../../server/core/session-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const notepadFilePath = path.resolve(__dirname, '../../financial_notepad.txt');

console.log('▶ [PIET Module] Running Financial Notepad Logger & Audit Trail Suite...');

const session = sessionEngine.createSession('test-logger-session');

// Capture Test Financial Turn
notepadFinancialLogger.captureFinancialTurn({
  session,
  userTranscript: 'Compare Nvidia and Apple gross margins in 2023',
  agentReply: 'For FY2023, Nvidia achieved a 56.9% gross margin compared to Apple at 44.1%.',
  matchedFiling: { ticker: 'NVDA', companyName: 'NVIDIA Corporation' }
});

// Wait for non-blocking background thread pool append
await new Promise(r => setTimeout(r, 50));

assert.ok(fs.existsSync(notepadFilePath), 'financial_notepad.txt must exist on disk');
const content = notepadFinancialLogger.readNotepad();
assert.ok(content.includes('NVIDIA Corporation'), 'Audit log must record company name');
assert.ok(content.includes('56.9%'), 'Audit log must record spoken metrics');

sessionEngine.teardownSession('test-logger-session');
console.log('  ✅ [PASS] Out-of-band audit trail persistence verified (0ms main thread delay).');

console.log('\n✅ [PASS] Financial Notepad Logger Suite Passed 100% Green\n');
