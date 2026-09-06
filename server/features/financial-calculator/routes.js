import express from 'express';
import { financialCalculatorService } from './service.js';

const router = express.Router();

router.get('/compare', (req, res) => {
  const result = financialCalculatorService.compareCompanies({
    tickerA: req.query.a || 'NVDA',
    tickerB: req.query.b || 'AAPL',
    fiscalYear: req.query.year ? parseInt(req.query.year, 10) : 2023
  });
  res.json({ success: true, result });
});

router.get('/growth/:ticker', (req, res) => {
  const result = financialCalculatorService.calculateYoYGrowth(req.params.ticker);
  res.json({ success: true, result });
});

export default router;
