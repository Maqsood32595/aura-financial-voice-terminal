import express from 'express';
import { megaCapTechService } from './service.js';

const router = express.Router();

router.get('/:ticker', (req, res) => {
  const filings = megaCapTechService.getFinancials(req.params.ticker, req.query.year);
  res.json({ success: true, count: filings.length, filings });
});

export default router;
