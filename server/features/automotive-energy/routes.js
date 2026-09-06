import express from 'express';
import { automotiveEnergyService } from './service.js';

const router = express.Router();

router.get('/:ticker', (req, res) => {
  const filings = automotiveEnergyService.getFinancials(req.params.ticker, req.query.year);
  res.json({ success: true, count: filings.length, filings });
});

export default router;
