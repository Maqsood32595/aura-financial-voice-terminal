import { Router } from 'express';
import { vsapGuard } from '../../core/vsap-guard.js';
import { sessionEngine } from '../../core/session-engine.js';
import { processRefund } from './service.js';

const router = Router();

// REST Pre-flight Simulation & Trigger
router.post('/simulate-refund', async (req, res) => {
  const { sessionId, amount } = req.body;
  const session = sessionEngine.getSession(sessionId) || sessionEngine.createSession(sessionId);
  
  const simulation = await vsapGuard.simulate('process_refund', { amount }, session);
  
  if (!simulation.approved) {
    return res.status(403).json({
      approved: false,
      simulation,
      message: 'VSAP Hard-Block: In-RAM policy validation failed'
    });
  }

  const result = await processRefund(simulation.sanitizedParams, session);
  return res.json({
    approved: true,
    simulation,
    result,
    callerState: session.caller
  });
});

export default router;
