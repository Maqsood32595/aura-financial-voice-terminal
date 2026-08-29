import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Load .env if present
try {
  if (fs.existsSync('.env')) {
    process.loadEnvFile('.env');
  }
} catch (e) {
  // Ignore
}
import { WebSocketServer, WebSocket } from 'ws';
import { kernel } from './kernel.js';
import { sessionEngine } from './core/session-engine.js';
import { voiceOrchestrator } from './core/voice-orchestrator.js';
import { vsapGuard } from './core/vsap-guard.js';
import { qsagKb } from './core/qsag-kb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 5020;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Boot Fractal Kernel
await kernel.boot(app);

// Core System Diagnostics & Metrics Route
app.get('/api/v1/system/status', (req, res) => {
  res.json({
    status: 'online',
    activeSessions: sessionEngine.activeCount,
    featuresLoaded: kernel.getManifests().map(m => m.name),
    recentSimulations: vsapGuard.getTraces(5),
    timestamp: new Date().toISOString()
  });
});

// Full-Duplex WebSocket Audio & Signaling Gateway
wss.on('connection', (ws) => {
  let activeSessionId = null;

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      // 1. Session Initialization Event
      if (msg.type === 'SESSION_INIT') {
        const session = sessionEngine.createSession(msg.sessionId, msg.caller);
        activeSessionId = session.id;
        ws.send(JSON.stringify({
          type: 'SESSION_READY',
          session: {
            id: session.id,
            caller: session.caller,
            activeCount: sessionEngine.activeCount
          }
        }));
      }

      // 2. User Utterance Event (STT output / Voice Turn)
      else if (msg.type === 'USER_SPEECH') {
        const sessionId = msg.sessionId || activeSessionId;
        if (!sessionId) {
          return ws.send(JSON.stringify({ type: 'ERROR', message: 'No active session' }));
        }

        const result = await voiceOrchestrator.processUserUtterance(sessionId, msg.text);

        ws.send(JSON.stringify({
          type: 'AGENT_REPLY',
          ...result
        }));
      }

      // 3. Instant Barge-In / Interruption Event
      else if (msg.type === 'BARGE_IN') {
        const sessionId = msg.sessionId || activeSessionId;
        const result = sessionEngine.handleBargeIn(sessionId, msg.reason);

        ws.send(JSON.stringify({
          type: 'BARGE_IN_ACK',
          ...result,
          timestamp: Date.now()
        }));
      }

      // 4. Session Hangup / Teardown
      else if (msg.type === 'SESSION_HANGUP') {
        const sessionId = msg.sessionId || activeSessionId;
        const audit = sessionEngine.teardownSession(sessionId);
        activeSessionId = null;

        ws.send(JSON.stringify({
          type: 'SESSION_TERMINATED',
          audit
        }));
      }

    } catch (err) {
      ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
    }
  });

  ws.on('close', () => {
    if (activeSessionId) {
      sessionEngine.teardownSession(activeSessionId);
    }
  });
});

if (process.env.NODE_ENV !== 'test_runner') {
  server.listen(PORT, () => {
    console.log(`🎙️  [VoiceAgent] Server running on http://localhost:${PORT}`);
    console.log(`⚡  [In-RAM Engine] Active & ready for full-duplex audio connections`);
  });
}

export { app, server };
