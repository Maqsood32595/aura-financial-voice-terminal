import { Router } from 'express';
import { sessionEngine } from '../../core/session-engine.js';
import { verifyCaller } from './service.js';

const router = Router();

// Create new ephemeral session
router.post('/sessions', (req, res) => {
  const session = sessionEngine.createSession(req.body.id, req.body.metadata);
  res.status(201).json({ success: true, session });
});

// Get session details
router.get('/sessions/:id', (req, res) => {
  const session = sessionEngine.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found in RAM' });
  }
  res.json({ session });
});

// Verify caller
router.post('/sessions/:id/verify', (req, res) => {
  const session = sessionEngine.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found in RAM' });
  }
  const result = verifyCaller(req.body, session);
  res.json(result);
});

// Teardown session
router.delete('/sessions/:id', (req, res) => {
  const audit = sessionEngine.teardownSession(req.params.id);
  if (!audit) {
    return res.status(404).json({ error: 'Session not found in RAM' });
  }
  res.json({ success: true, message: 'Session torn down. 0 ghost state remaining.', audit });
});

export default router;
