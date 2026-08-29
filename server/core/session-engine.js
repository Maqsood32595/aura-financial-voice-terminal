import crypto from 'node:crypto';

/**
 * In-RAM Ephemeral Session Twin (PIET Engine)
 * Manages live conversational state, turn histories, entity slots,
 * and audio stream buffers 100% in RAM with zero database I/O overhead.
 */
export class SessionEngine {
  constructor() {
    /** @type {Map<string, Object>} */
    this.sessions = new Map();
  }

  /**
   * Create or retrieve an ephemeral session twin
   * @param {string} [id]
   * @param {Object} [metadata]
   * @returns {Object}
   */
  createSession(id = null, metadata = {}) {
    const sessionId = id || `session-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      status: 'active', // 'active', 'interrupted', 'terminated'
      caller: {
        id: metadata.callerId || 'caller-guest-994',
        name: metadata.callerName || 'Alex Mercer',
        tier: metadata.tier || 'Enterprise Premium',
        accountNumber: metadata.accountNumber || 'ACC-882194',
        balance: metadata.balance !== undefined ? metadata.balance : 420.00
      },
      turns: [],
      pendingSimulation: null,
      activeToolExecution: null,
      metrics: {
        totalTurns: 0,
        totalInterruptions: 0,
        averageLatencyMs: 0,
        lastTurnLatencyMs: 0
      }
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Get an active in-RAM session
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActiveAt = Date.now();
    }
    return session || null;
  }

  /**
   * Record a dialogue turn in RAM (<0.05ms)
   * @param {string} sessionId 
   * @param {'user'|'agent'|'system'} role 
   * @param {string} text 
   * @param {Object} [meta]
   */
  appendTurn(sessionId, role, text, meta = {}) {
    const session = this.getSession(sessionId);
    if (!session) return null;

    const turn = {
      id: `turn-${Date.now().toString(36)}-${crypto.randomBytes(2).toString('hex')}`,
      role,
      text,
      timestamp: Date.now(),
      ...meta
    };

    session.turns.push(turn);
    session.metrics.totalTurns += 1;
    return turn;
  }

  /**
   * Handle Instant Barge-In (Interruption)
   * Flushes in-flight agent speech context and marks interruption
   * @param {string} sessionId 
   * @param {string} [reason]
   * @returns {Object}
   */
  handleBargeIn(sessionId, reason = 'User speech detected during agent playback') {
    const session = this.getSession(sessionId);
    if (!session) return { interrupted: false };

    session.status = 'interrupted';
    session.metrics.totalInterruptions += 1;

    // Find the last agent turn if it was in-flight and tag it as interrupted
    const lastTurn = session.turns[session.turns.length - 1];
    if (lastTurn && lastTurn.role === 'agent') {
      lastTurn.wasInterrupted = true;
      lastTurn.interruptedAt = Date.now();
    }

    return {
      interrupted: true,
      sessionId,
      totalInterruptions: session.metrics.totalInterruptions,
      reason
    };
  }

  /**
   * Mandatory Teardown Invariant
   * Flushes memory and prevents ghost sessions
   * @param {string} sessionId 
   * @returns {Object|null}
   */
  teardownSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const auditSnapshot = {
      sessionId: session.id,
      durationMs: Date.now() - session.createdAt,
      totalTurns: session.metrics.totalTurns,
      totalInterruptions: session.metrics.totalInterruptions,
      turns: [...session.turns],
      finalCallerState: { ...session.caller }
    };

    // Atomic In-RAM teardown
    this.sessions.delete(sessionId);
    return auditSnapshot;
  }

  /**
   * Get active sessions count
   */
  get activeCount() {
    return this.sessions.size;
  }
}

export const sessionEngine = new SessionEngine();
