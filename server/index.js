import express from 'express';
import http from 'http';
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
  console.log(`⚡ [In-RAM Architecture] 200 S&P 500 Companies & In-RAM SQL Engine active on port ${PORT}\n`);

  await shadowFinancialDb.init();
  const kernel = new FractalKernel(app);
  await kernel.bootstrap();
});

// REST API Endpoints
app.get('/api/v1/filings', async (req, res) => {
  const result = await shadowFinancialDb.query('SELECT * FROM sec_filings ORDER BY revenue DESC;');
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

// AssemblyAI Voice Agent Token Minting Endpoint
app.get('/api/v1/assemblyai-token', async (req, res) => {
  try {
    const AURA_DEFAULT_KEY = 'a462cdf21a0f44fd92d7fe896afab05c';
    const AURA_DEFAULT_AGENT = 'd2ea7533-b74b-4aef-98b5-d365c5558bcb';

    let apiKey = (process.env.ASSEMBLYAI_API_KEY || '').trim().replace(/['"]/g, '');
    let agentId = (process.env.ASSEMBLYAI_AGENT_ID || '').trim().replace(/['"]/g, '');

    // If agent ID is the default Aura agent or not provided, ensure we use the key that owns this agent
    if (!agentId || agentId === AURA_DEFAULT_AGENT) {
      agentId = AURA_DEFAULT_AGENT;
      apiKey = AURA_DEFAULT_KEY;
    } else if (!apiKey) {
      apiKey = AURA_DEFAULT_KEY;
    }

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

    const data = await tokenRes.json();
    res.json({ success: true, token: data.token, agentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SEC Financial Tool Endpoint for In-RAM WebAssembly lookups
app.all('/api/v1/sec-tool', async (req, res) => {
  try {
    const ticker = (req.body?.ticker || req.query?.ticker || req.query?.search || '').toUpperCase();
    if (!ticker) {
      return res.json({ error: 'Ticker is required' });
    }
    const result = await shadowFinancialDb.query(
      'SELECT * FROM sec_filings WHERE ticker = $1 OR company_name ILIKE $2 LIMIT 1;',
      [ticker, `%${ticker}%`]
    );
    if (result.rows.length === 0) {
      return res.json({ found: false, message: `No Form 10-K filing found for ${ticker}` });
    }
    res.json({ found: true, filing: result.rows[0] });
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
        
        // Guard against micro fragments (< 500 bytes)
        if (audioBuffer.length < 500) {
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
