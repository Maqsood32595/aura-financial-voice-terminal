import express from 'express';
import { semiconductorService } from './service.js';

const router = express.Router();

router.get('/:ticker', (req, res) => {
  const filings = semiconductorService.getFinancials(req.params.ticker, req.query.year);
  res.json({ success: true, count: filings.length, filings });
});

export default router;
