import { sessionEngine } from '../../core/session-engine.js';

export function verifyCaller(params, session) {
  const pin = params.pin;
  if (pin === '1234' || pin === '8821') {
    session.caller.verified = true;
    return { verified: true, message: 'Caller identity verified successfully.' };
  }
  return { verified: false, message: 'Invalid verification PIN.' };
}

export function getSessionProfile(sessionId) {
  return sessionEngine.getSession(sessionId);
}
