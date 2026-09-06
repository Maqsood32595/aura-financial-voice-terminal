import express from 'express';
import { financePaymentsService } from './service.js';

const router = express.Router();

router.get('/:ticker', (req, res) => {
  const filings = financePaymentsService.getFinancials(req.params.ticker, req.query.year);
  res.json({ success: true, count: filings.length, filings });
});

export default router;
