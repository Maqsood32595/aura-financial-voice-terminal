import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.resolve(__dirname, 'sec_financials_master.json');

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let fixedCount = 0;

data.forEach((d) => {
  // Ensure revenueDisplay is properly formatted for all entries
  if (typeof d.revenue === 'number' && (!d.revenueDisplay || d.revenueDisplay.startsWith('.') || !d.revenueDisplay.startsWith('$'))) {
    d.revenueDisplay = '$' + (d.revenue / 1e9).toFixed(2) + 'B';
    fixedCount++;
  }

  // Fix specific known corrupted keyHighlights
  if (d.ticker === 'WMT' && d.fiscalYear === 2023) {
    d.revenueDisplay = '$611.29B';
    d.segmentRevenue = {
      'Walmart U.S.': '$420.55B (69%)',
      'Walmart International': '$100.98B (17%)',
      "Sam's Club": '$84.34B (14%)'
    };
    d.keyHighlights = 'Official Audited SEC Form 10-K Filing for WALMART INC. (WMT). FY2023 (Ended Jan 31, 2023) Total Revenue: $611.29B | Operating Margin: 3.3% | Common Net Income: $11.68B | Free Cash Flow: $11.98B.';
    fixedCount++;
  }
  if (d.ticker === 'WMT' && d.fiscalYear === 2024) {
    d.revenueDisplay = '$642.64B';
    d.keyHighlights = 'Official Audited SEC Form 10-K Filing for WALMART INC. (WMT). FY2024 (Ended Jan 31, 2024) Total Revenue: $642.64B | Free Cash Flow: $15.12B | Net Income: $15.51B.';
    fixedCount++;
  }
  if (d.ticker === 'GOOG' && d.fiscalYear === 2022) {
    d.revenueDisplay = '$282.84B';
    d.keyHighlights = 'Official Audited SEC Form 10-K Filing for Alphabet Inc. (GOOG). Total Revenue: $282.84B | Operating Margin: 26.5% | Common Net Income: $59.97B.';
    fixedCount++;
  }
  if (d.ticker === 'DELL' && d.fiscalYear === 2023) {
    d.revenueDisplay = '$102.30B';
    d.keyHighlights = 'Official Audited SEC Form 10-K Filing for Dell Technologies Inc. (DELL) for Fiscal Year 2023 (ended Feb 3, 2023). Revenue: $102.30B | Gross Margin: 22.5% | Operating Margin: 5.6% | GAAP Net Income: $2.44B | Free Cash Flow: $2.71B.';
    fixedCount++;
  }
  if (d.ticker === 'JNJ' && d.fiscalYear === 2023) {
    d.revenueDisplay = '$85.16B';
    d.keyHighlights = 'Official Audited SEC Form 10-K Filing for Johnson & Johnson (JNJ). Revenue: $85.16B | Gross Margin: 68.8% | Operating Margin: 21.8% | Net Income (Continuing Operations): $13.32B | Free Cash Flow: $18.25B (reflects Kenvue spinoff adjustment).';
    fixedCount++;
  }
  if (d.ticker === 'BAC' && d.fiscalYear === 2023) {
    d.revenueDisplay = '$98.77B';
    d.keyHighlights = 'Official Audited SEC Form 10-K Filing for Bank of America (BAC). Total Revenue: $98.77B | Consolidated Net Income: $26.52B ($24.66B applicable to common shareholders).';
    fixedCount++;
  }
  if (d.ticker === 'BAC' && d.fiscalYear === 2022) {
    d.revenueDisplay = '$94.88B';
    d.keyHighlights = 'Official Audited SEC Form 10-K Filing for Bank of America (BAC). Total Revenue: $94.88B | Consolidated Net Income: $27.53B ($26.02B applicable to common shareholders).';
    fixedCount++;
  }
  if (d.ticker === 'JPM' && d.fiscalYear === 2023) {
    d.revenueDisplay = '$158.10B';
    d.keyHighlights = 'Official Audited SEC Form 10-K Filing for JPMORGAN CHASE & CO (JPM). Total Net Revenue: $158.10B | Operating Margin: 36.3% | Consolidated Net Income: $49.55B ($47.76B applicable to common stockholders after preferred dividends).';
    fixedCount++;
  }
  if (d.ticker === 'BRK.B' && d.fiscalYear === 2022) {
    d.revenueDisplay = '$265.10B';
    d.keyHighlights = 'Official Audited SEC Form 10-K Filing for BERKSHIRE HATHAWAY INC. Revenue: $265.10B | GAAP Net Loss: -$22.82B (due to equity market portfolio declines; operating earnings were +$30.8B).';
    fixedCount++;
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
console.log(`Successfully patched sec_financials_master.json! Total updates applied: ${fixedCount}`);
