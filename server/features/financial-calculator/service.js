import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.resolve(__dirname, '../../data/sec_financials_master.json');
const allFilings = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

export class FinancialCalculatorService {
  getFilings() {
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }

  findFiling(ticker, year) {
    const t = ticker.toUpperCase().trim();
    const filings = this.getFilings();
    if (year) {
      const y = parseInt(year, 10);
      const match = filings.find(f => f.ticker === t && f.fiscalYear === y);
      if (match) return match;
    }
    return filings.find(f => f.ticker === t) || null;
  }

  compareCompanies({ tickerA, tickerB, fiscalYear = 2023 }) {
    const filingA = this.findFiling(tickerA, fiscalYear);
    const filingB = this.findFiling(tickerB, fiscalYear);

    if (!filingA || !filingB) {
      return { error: `Could not find filings for ${tickerA} or ${tickerB} for FY${fiscalYear}` };
    }

    const hasGmA = filingA.grossMarginPercent !== null && filingA.grossMarginPercent !== undefined;
    const hasGmB = filingB.grossMarginPercent !== null && filingB.grossMarginPercent !== undefined;

    let marginDiff = 'N/A';
    let higherGrossMargin = 'N/A';

    if (hasGmA && hasGmB) {
      const diffVal = Number((filingA.grossMarginPercent - filingB.grossMarginPercent).toFixed(1));
      marginDiff = `${diffVal > 0 ? '+' : ''}${diffVal}% (${filingA.ticker} vs ${filingB.ticker})`;
      higherGrossMargin = filingA.grossMarginPercent >= filingB.grossMarginPercent ? filingA.ticker : filingB.ticker;
    } else {
      marginDiff = `Gross Margin N/A for ${!hasGmA ? filingA.ticker + ' (' + (filingA.industryType || 'Financial/Utility') + ')' : ''} ${!hasGmB ? filingB.ticker + ' (' + (filingB.industryType || 'Financial/Utility') + ')' : ''} under GAAP accounting`;
    }

    const opMarginDiff = Number((filingA.operatingMarginPercent - filingB.operatingMarginPercent).toFixed(1));

    return {
      fiscalYear,
      companyA: {
        ticker: filingA.ticker,
        companyName: filingA.companyName,
        industryType: filingA.industryType || 'STANDARD',
        revenue: filingA.revenueDisplay,
        grossMarginPercent: hasGmA ? `${filingA.grossMarginPercent}%` : 'N/A (GAAP)',
        operatingMarginPercent: `${filingA.operatingMarginPercent}%`,
        netIncome: `$${(filingA.netIncome / 1e9).toFixed(2)}B`,
        rdExpense: `$${(filingA.rdExpense / 1e9).toFixed(2)}B`,
        freeCashFlow: `$${(filingA.freeCashFlow / 1e9).toFixed(2)}B`
      },
      companyB: {
        ticker: filingB.ticker,
        companyName: filingB.companyName,
        industryType: filingB.industryType || 'STANDARD',
        revenue: filingB.revenueDisplay,
        grossMarginPercent: hasGmB ? `${filingB.grossMarginPercent}%` : 'N/A (GAAP)',
        operatingMarginPercent: `${filingB.operatingMarginPercent}%`,
        netIncome: `$${(filingB.netIncome / 1e9).toFixed(2)}B`,
        rdExpense: `$${(filingB.rdExpense / 1e9).toFixed(2)}B`,
        freeCashFlow: `$${(filingB.freeCashFlow / 1e9).toFixed(2)}B`
      },
      comparison: {
        grossMarginDifference: marginDiff,
        higherGrossMargin: higherGrossMargin,
        operatingMarginDifference: `${opMarginDiff > 0 ? '+' : ''}${opMarginDiff}% (${filingA.ticker} vs ${filingB.ticker})`,
        higherOperatingMargin: filingA.operatingMarginPercent >= filingB.operatingMarginPercent ? filingA.ticker : filingB.ticker,
        higherRevenue: filingA.revenue >= filingB.revenue ? filingA.ticker : filingB.ticker
      }
    };
  }

  calculateYoYGrowth(ticker) {
    const filings = this.getFilings()
      .filter(f => f.ticker === ticker.toUpperCase().trim())
      .sort((a, b) => a.fiscalYear - b.fiscalYear);

    if (filings.length < 2) {
      return { error: `Insufficient historical filings for ${ticker}` };
    }

    const previous = filings[filings.length - 2];
    const current = filings[filings.length - 1];

    const revGrowth = Number((((current.revenue - previous.revenue) / previous.revenue) * 100).toFixed(1));
    const netIncomeGrowth = Number((((current.netIncome - previous.netIncome) / Math.abs(previous.netIncome)) * 100).toFixed(1));

    return {
      ticker: current.ticker,
      companyName: current.companyName,
      previousYear: previous.fiscalYear,
      currentYear: current.fiscalYear,
      revenueGrowthYoY: `${revGrowth > 0 ? '+' : ''}${revGrowth}%`,
      netIncomeGrowthYoY: `${netIncomeGrowth > 0 ? '+' : ''}${netIncomeGrowth}%`,
      revenuePrevious: previous.revenueDisplay,
      revenueCurrent: current.revenueDisplay
    };
  }
}

export const financialCalculatorService = new FinancialCalculatorService();
