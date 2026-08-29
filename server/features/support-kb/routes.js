import { Router } from 'express';
import { searchKnowledgeBase } from './service.js';

const router = Router();

router.get('/search', async (req, res) => {
  const query = req.query.q || '';
  const topK = parseInt(req.query.topK || '3', 10);
  const result = await searchKnowledgeBase({ query, topK });
  res.json(result);
});

export default router;
