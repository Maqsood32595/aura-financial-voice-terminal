import { FinancialFSM } from './financial-fsm.js';

export class SessionEngine {
  constructor() {
    this.sessions = new Map();
  }

  createSession(sessionId) {
    const session = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      fsm: new FinancialFSM(sessionId),
      turns: [],
      profile: {
        analystName: null,
        focusSector: null,
        activeCompany: null,
        activeCompanies: [],
        inquiredCompanies: [],
        favoriteMetrics: [],
        currentPortfolioView: null
      },
      bargeInEvents: []
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  teardownSession(sessionId) {
    this.sessions.delete(sessionId);
  }
}

export const sessionEngine = new SessionEngine();
