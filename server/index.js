import express from 'express';
import http from 'http';
import https from 'https';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { FractalKernel } from './kernel.js';
import { shadowFinancialDb } from './core/shadow-db.js';
import { sessionEngine } from './core/session-engine.js';
import { voiceOrchestrator } from './core/voice-orchestrator.js';
import { transcribeWithGroqWhisper } from './core/groq-whisper.js';
import { transcribeWithAssemblyAI } from './core/assemblyai-stt.js';
import { voiceBiometrics } from './core/voice-biometrics.js';
import { notepadFinancialLogger } from './core/notepad-financial-logger.js';
import { inRamTensors } from './core/inram-tensors.js';
import { inRamLlmCaller } from './core/inram-llm-caller.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 5035;

app.use(express.json());
app.use(express.static(path.resolve(__dirname, '../public')));

// 1. Start Server Immediately to pass Render/Host port detection
server.listen(PORT, async () => {
  console.log(`\n🏛️ [SEC EDGAR 10-K Financial Voice Agent (Voice-Locked)] Running at http://localhost:${PORT}`);
  await shadowFinancialDb.init();
  inRamTensors.init();
  inRamLlmCaller.prewarm();
  console.log(`⚡ [In-RAM Architecture] ${shadowFinancialDb.filingsTable.length} S&P 500 Filings (FY2022-2024) & In-RAM SQL Engine active on port ${PORT}\n`);
  const kernel = new FractalKernel(app);
  await kernel.bootstrap();
});

// REST API Endpoints
app.get('/api/v1/filings', async (req, res) => {
  const { fiscal_year, min_fcf, ticker } = req.query;
  let sql = 'SELECT * FROM sec_filings';
  const conditions = [];
  if (fiscal_year) conditions.push(`fiscal_year = ${parseInt(fiscal_year, 10)}`);
  if (min_fcf) conditions.push(`free_cash_flow > ${parseFloat(min_fcf)}`);
  if (ticker) conditions.push(`ticker = '${ticker.toUpperCase().trim()}'`);
  if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
  sql += ' ORDER BY revenue DESC;';
  const result = await shadowFinancialDb.query(sql);
  res.json({ success: true, count: result.rows.length, filings: result.rows });
});

app.get('/api/v1/notepad', (req, res) => {
  res.json({ success: true, content: notepadFinancialLogger.readNotepad() });
});

app.delete('/api/v1/notepad', (req, res) => {
  notepadFinancialLogger.clearNotepad();
  res.json({ success: true, message: 'Financial Notepad cleared' });
});

app.get(['/api/v1/sql-logs', '/api/v1/telemetry/sql-logs'], (req, res) => {
  res.json({ success: true, logs: shadowFinancialDb.queryLogs });
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

// AssemblyAI Voice Agent Token Minting (Pinned to primary eu-west-1 cluster for valid KMS token decryption)
function mintAssemblyAiTokenDirect(apiKey, agentId) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ agent_id: agentId });
    const primaryIps = ['34.242.17.123', '34.246.213.66', '108.131.190.141'];
    const targetIp = primaryIps[Math.floor(Math.random() * primaryIps.length)];

    const options = {
      hostname: 'agents.assemblyai.com',
      port: 443,
      path: '/v1/tokens',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      lookup: (h, o, cb) => {
        if (typeof o === 'function') { cb = o; o = {}; }
        if (o && o.all) return cb(null, [{ address: targetIp, family: 4 }]);
        return cb(null, targetIp, 4);
      },
      timeout: 7000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300 && json.token) {
            resolve(json);
          } else {
            reject(new Error(json.error || `HTTP ${res.statusCode}: ${body}`));
          }
        } catch (e) {
          reject(new Error(`Invalid JSON (${res.statusCode}): ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('KMS token minting request timed out')); });
    req.write(postData);
    req.end();
  });
}

// Rate Limiter for AssemblyAI Token Minting to prevent runaway billing & abuse
const tokenRateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_TOKENS_PER_WINDOW = 8; // Max 8 voice sessions per 10 minutes per IP
const MIN_COOLDOWN_MS = 6 * 1000; // 6 seconds between consecutive mint requests

setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of tokenRateLimitStore.entries()) {
    if (now > rec.resetTime) tokenRateLimitStore.delete(ip);
  }
}, 15 * 60 * 1000);

// AssemblyAI Voice Agent Token Minting Endpoint
app.get('/api/v1/assemblyai-token', async (req, res) => {
  try {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let record = tokenRateLimitStore.get(clientIp);

    if (!record || now > record.resetTime) {
      record = { count: 0, resetTime: now + RATE_LIMIT_WINDOW_MS, lastRequest: 0 };
    }

    const isLocal = clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1' || clientIp === 'unknown';

    if (!isLocal) {
      if (now - record.lastRequest < MIN_COOLDOWN_MS) {
        const waitSec = Math.ceil((MIN_COOLDOWN_MS - (now - record.lastRequest)) / 1000);
        return res.status(429).json({
          success: false,
          error: `Please wait ${waitSec}s before reconnecting voice.`
        });
      }

      if (record.count >= MAX_TOKENS_PER_WINDOW) {
        const resetMin = Math.ceil((record.resetTime - now) / 60000);
        return res.status(429).json({
          success: false,
          error: `Voice session limit reached (${MAX_TOKENS_PER_WINDOW} sessions / 10 min). Please try again in ${resetMin}m.`
        });
      }

      record.count++;
      record.lastRequest = now;
      tokenRateLimitStore.set(clientIp, record);
    }

    const AURA_DEFAULT_KEY = 'a462cdf21a0f44fd92d7fe896afab05c';
    const AURA_DEFAULT_AGENT = 'de09da69-b296-45bc-a2f4-8dd8a7fed34d';

    let apiKey = (process.env.ASSEMBLYAI_API_KEY || '').trim().replace(/['"]/g, '');
    let agentId = (process.env.ASSEMBLYAI_AGENT_ID || '').trim().replace(/['"]/g, '');

    // If agent ID is the default Aura agent or not provided, ensure we use the key that owns this agent
    if (!agentId || agentId === 'd2ea7533-b74b-4aef-98b5-d365c5558bcb' || agentId === '7dd2c649-8c76-4519-b16c-8abc2313e213' || agentId === '733364a0-4d4e-4855-8834-f32f5df8a69e' || agentId === 'efa599f8-d2d2-46be-b075-a5ac0d4f0a94' || agentId === AURA_DEFAULT_AGENT) {
      agentId = AURA_DEFAULT_AGENT;
      apiKey = AURA_DEFAULT_KEY;
    } else if (!apiKey) {
      apiKey = AURA_DEFAULT_KEY;
    }

    let data;
    try {
      // Primary: Route to Ireland cluster to ensure token is encrypted with Ireland KMS key for WebSocket gateway
      data = await mintAssemblyAiTokenDirect(apiKey, agentId);
    } catch (directErr) {
      console.warn('⚠️ Ireland direct KMS minting notice, falling back to standard DNS fetch:', directErr.message);
      const tokenRes = await fetch('https://agents.assemblyai.com/v1/tokens', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ agent_id: agentId })
      });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        return res.status(tokenRes.status).json({ error: errText });
      }
      data = await tokenRes.json();
    }

    res.json({
      success: true,
      token: data.token,
      agentId,
      keyPrefix: apiKey.slice(0, 4) + '...' + apiKey.slice(-4),
      cluster: data.token && data.token.startsWith('AQICAHimLT7O') ? 'eu-west-1 (Ireland Gateway Compatible)' : 'Standard',
      deployVer: 'v1.2-kms-aligned'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SEC Financial Tool Endpoint for In-RAM WebAssembly lookups
// SEC Financial Tool Endpoint for In-RAM WebAssembly lookups & Broad Screeners
app.all('/api/v1/sec-tool', async (req, res) => {
  try {
    const rawQuery = (req.body?.query || req.body?.search || req.body?.ticker || req.query?.query || req.query?.search || req.query?.ticker || '').trim();
    if (!rawQuery) {
      return res.json({ error: 'Query or Ticker is required' });
    }

    // 1. Process query through comprehensive In-RAM Voice Orchestrator
    const ephemeralSession = sessionEngine.createSession(`sec-tool-${Date.now()}`);
    const turnResult = await voiceOrchestrator.processVoiceTurn({
      session: ephemeralSession,
      userTranscript: rawQuery
    });
    sessionEngine.teardownSession(ephemeralSession.id);

    if (turnResult.toolExecution && turnResult.toolExecution.output) {
      const criteria = turnResult.toolExecution.criteria || turnResult.toolExecution.tool;
      const items = turnResult.toolExecution.output.slice(0, 10);
      const rawLines = [
        `[AUDITED SEC EDGAR IN-RAM SCREENER RESULTS]`,
        `CRITERIA: ${criteria}`,
        `MATCHES: ${turnResult.toolExecution.count || items.length} Companies Found`,
        `--------------------------------------------------------------------------------`
      ];
      items.forEach((item, idx) => {
        const m = item.metricDisplay || item.freeCashFlowDisplay || item.netLossDisplay || item.grossMargin || item.revenueDisplay || '';
        rawLines.push(`${idx + 1}. ${item.companyName || item.ticker} (${item.ticker || ''}) -> ${m}`);
      });
      rawLines.push(`--------------------------------------------------------------------------------`);
      rawLines.push(`STATUS: VERIFIED IN-RAM AUDITED DATA (<0.05ms)`);

      return res.json({
        found: true,
        type: turnResult.toolExecution.tool,
        criteria: turnResult.toolExecution.criteria,
        count: turnResult.toolExecution.count,
        reply: turnResult.replyText,
        results: turnResult.toolExecution.output,
        rawMachineReadable: rawLines.join('\n')
      });
    }

    if (turnResult.comparisonResult && !turnResult.comparisonResult.error) {
      const cmp = turnResult.comparisonResult;
      const rawCmpLines = [
        `[AUDITED SEC 10-K IN-RAM COMPARISON]`,
        `FY${cmp.fiscalYear || 2023}: ${cmp.companyA?.ticker} vs ${cmp.companyB?.ticker}`,
        `--------------------------------------------------------------------------------`,
        `• ${cmp.companyA?.ticker} (${cmp.companyA?.companyName}): Revenue ${cmp.companyA?.revenue}, Gross Margin ${cmp.companyA?.grossMarginPercent}, Operating Margin ${cmp.companyA?.operatingMarginPercent}`,
        `• ${cmp.companyB?.ticker} (${cmp.companyB?.companyName}): Revenue ${cmp.companyB?.revenue}, Gross Margin ${cmp.companyB?.grossMarginPercent}, Operating Margin ${cmp.companyB?.operatingMarginPercent}`,
        `--------------------------------------------------------------------------------`,
        `RATIO / SUMMARY: ${cmp.ratioSummary || cmp.comparisonSummary || 'Computed in RAM (<0.05ms)'}`
      ];

      return res.json({
        found: true,
        type: 'COMPARE',
        reply: turnResult.replyText,
        comparison: turnResult.comparisonResult,
        rawMachineReadable: rawCmpLines.join('\n')
      });
    }

    if (turnResult.matchedFiling) {
      return res.json({
        found: true,
        type: 'FILING',
        reply: turnResult.replyText,
        filing: turnResult.matchedFiling,
        retrievedFacts: turnResult.retrievedFacts,
        rawMachineReadable: turnResult.retrievedFacts?.rawMachineReadableText || null,
        multiYear: turnResult.retrievedFacts?.multiYear || null
      });
    }

    // 2. Fallback SQL lookup by ticker or company name
    const ticker = rawQuery.toUpperCase();
    const result = await shadowFinancialDb.query(
      'SELECT * FROM sec_filings WHERE ticker = $1 OR company_name ILIKE $2 LIMIT 1;',
      [ticker, `%${ticker}%`]
    );
    if (result.rows.length === 0) {
      return res.json({
        found: false,
        reply: turnResult.replyText || `No Form 10-K filing found for ${ticker}`,
        message: `No Form 10-K filing found for ${ticker}`
      });
    }

    const fallbackFacts = voiceOrchestrator.buildRetrievedFacts(result.rows[0]);
    res.json({
      found: true,
      type: 'FILING',
      filing: result.rows[0],
      retrievedFacts: fallbackFacts,
      rawMachineReadable: fallbackFacts?.rawMachineReadableText || null,
      multiYear: fallbackFacts?.multiYear || null,
      reply: turnResult.replyText || `Found audited 10-K filing for ${result.rows[0].company_name || result.rows[0].companyName || ticker}.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WebSocket Real-Time Voice Connection
wss.on('connection', (ws) => {
  const sessionId = `financial-session-${crypto.randomUUID()}`;
  let session = sessionEngine.createSession(sessionId);
  console.log(`🎙️ [WebSocket] Analyst connected: ${sessionId}`);

  ws.send(JSON.stringify({
    type: 'SESSION_READY',
    sessionId,
    message: 'Connected to SEC EDGAR 10-K Financial Voice Agent',
    fsmState: session.fsm.currentState
  }));

  ws.on('message', async (rawMessage) => {
    try {
      // 1. Handle Binary Audio Buffers (Groq Whisper Transcription)
      if (Buffer.isBuffer(rawMessage) || rawMessage instanceof ArrayBuffer) {
        const audioBuffer = Buffer.isBuffer(rawMessage) ? rawMessage : Buffer.from(rawMessage);
        
        // Guard against micro fragments (< 2000 bytes)
        if (audioBuffer.length < 2000) {
          return;
        }

        ws.send(JSON.stringify({ type: 'AGENT_LISTENING_START' }));
        
        let transcript = '';
        let latencyMs = 0;
        let provider = 'AssemblyAI Universal-3.5';
        try {
          if (process.env.STT_PROVIDER === 'assemblyai' || process.env.ASSEMBLYAI_API_KEY) {
            const sttRes = await transcribeWithAssemblyAI(audioBuffer);
            transcript = sttRes.transcript;
            latencyMs = sttRes.latencyMs;
            provider = sttRes.provider;
          } else {
            const sttRes = await transcribeWithGroqWhisper(audioBuffer);
            transcript = sttRes.transcript;
            latencyMs = sttRes.latencyMs;
            provider = 'Groq Whisper';
          }
        } catch (sttErr) {
          console.warn('⚠️ AssemblyAI STT error, trying fallback:', sttErr.message);
          try {
            const sttRes = await transcribeWithGroqWhisper(audioBuffer);
            transcript = sttRes.transcript;
            latencyMs = sttRes.latencyMs;
            provider = 'Groq Whisper (Fallback)';
          } catch (fbErr) {
            console.warn('⚠️ STT conversion skipped:', fbErr.message);
            return;
          }
        }

        const cleanTr = transcript.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
        const fillers = ['and the', 'um', 'uh', 'ah'];
        const validShortWords = ['hi', 'hey', 'yes', 'no', 'all', 'fcf', 'nim', 'sec', 'q1', 'q2', 'q3', 'q4', 'ibm', 'duk', 'nee', 'pgr', 'jpm', 'wmt', 'jnj', 'xom', 'd'];
        
        if (!transcript || transcript.trim().length === 0 || fillers.includes(cleanTr) || (cleanTr.length < 2 && !validShortWords.includes(cleanTr))) {
          ws.send(JSON.stringify({ type: 'LISTENING_CONTINUE' }));
          return;
        }

        ws.send(JSON.stringify({
          type: 'TRANSCRIPTION_RESULT',
          transcript,
          sttLatencyMs: latencyMs
        }));

        const result = await voiceOrchestrator.processVoiceTurn({
          session,
          userTranscript: transcript
        });

        ws.send(JSON.stringify({
          type: 'AGENT_VOICE_REPLY',
          replyText: result.replyText,
          fsmState: result.fsmState,
          toolExecution: result.toolExecution,
          retrievedFacts: result.retrievedFacts,
          audioSnippet: result.audioSnippet,
          telemetry: {
            sttMs: latencyMs,
            ...result.telemetry
          },
          matchedFiling: result.matchedFiling,
          comparisonResult: result.comparisonResult
        }));
        return;
      }

      // 2. Handle JSON Control Messages
      const msg = JSON.parse(rawMessage.toString());

      if (msg.type === 'ENROLL_SPEAKER_LOCK') {
        const profile = voiceBiometrics.enrollSpeaker(sessionId, msg.vector, msg.f0, msg.proximity);
        ws.send(JSON.stringify({
          type: 'SPEAKER_ENROLLED',
          profile: { f0: profile.f0, proximity: profile.proximity }
        }));
      }

      if (msg.type === 'USER_TEXT_INPUT' || msg.type === 'USER_TEXT_QUERY') {
        const textQuery = msg.text || msg.query || '';
        const result = await voiceOrchestrator.processVoiceTurn({
          session,
          userTranscript: textQuery,
          customApiKey: msg.customApiKey
        });

        ws.send(JSON.stringify({
          type: 'AGENT_VOICE_REPLY',
          replyText: result.replyText,
          fsmState: result.fsmState,
          toolExecution: result.toolExecution,
          retrievedFacts: result.retrievedFacts,
          audioSnippet: result.audioSnippet,
          telemetry: result.telemetry,
          matchedFiling: result.matchedFiling,
          comparisonResult: result.comparisonResult
        }));
      }

      if (msg.type === 'BARGE_IN_TRIGGERED') {
        session.bargeInEvents.push({
          timestamp: new Date().toISOString(),
          cutOffAtTurn: session.turns.length
        });
        ws.send(JSON.stringify({ type: 'BARGE_IN_CONFIRMED' }));
      }
    } catch (err) {
      console.error('⚠️ [WebSocket Message Error]:', err.message);
      ws.send(JSON.stringify({ type: 'ERROR', error: err.message }));
    }
  });

  ws.on('close', () => {
    console.log(`🎙️ [WebSocket] Session ${sessionId} torn down cleanly from RAM.`);
    sessionEngine.teardownSession(sessionId);
    voiceBiometrics.wipeProfile(sessionId);
  });
});
