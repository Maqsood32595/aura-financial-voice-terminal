import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataPath = path.resolve(__dirname, '../../data/sec_financials_master.json');
const allFilings = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

export class HealthcarePharmaService {
  getFinancials(ticker, year) {
    const cleanTicker = (ticker || 'LLY').toUpperCase().trim();
    const targetYear = year ? parseInt(year, 10) : null;

    const matches = allFilings.filter(f => 
      f.ticker === cleanTicker && (targetYear ? f.fiscalYear === targetYear : true)
    );

    return matches.sort((a, b) => b.fiscalYear - a.fiscalYear);
  }
}

export const healthcarePharmaService = new HealthcarePharmaService();
