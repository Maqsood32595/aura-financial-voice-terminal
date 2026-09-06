import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestOfficialSecFacts } from './sec_xbrl_pipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_AGENT = 'SafiSecVoiceAgent research@saficapital.com';

async function syncAll500SpCompanies() {
  console.log('📡 [Full S&P 500 Sync] 1. Fetching master SEC CIK directory...');
  const secTickersRes = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': USER_AGENT }
  });
  const secTickersData = await secTickersRes.json();

  const tickerToCik = new Map();
  for (const key of Object.keys(secTickersData)) {
    const item = secTickersData[key];
    tickerToCik.set(item.ticker.toUpperCase().trim(), String(item.cik_str).padStart(10, '0'));
  }

  console.log(`✅ Loaded ${tickerToCik.size} public companies from SEC CIK registry.`);

  // 2. Fetch S&P 500 constituents list
  console.log('📡 [Full S&P 500 Sync] 2. Fetching S&P 500 constituents universe...');
  const constituentsRes = await fetch('https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv');
  const constituentsCsv = await constituentsRes.text();
  const lines = constituentsCsv.trim().split('\n');

  const sp500List = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const ticker = parts[0]?.replace(/"/g, '').trim().toUpperCase();
    const name = parts[1]?.replace(/"/g, '').trim();
    const sector = parts[2]?.replace(/"/g, '').trim() || 'Diversified';

    if (!ticker) continue;
    const cik = tickerToCik.get(ticker) || tickerToCik.get(ticker.replace('.', '')) || `0000000000`;
    sp500List.push({ ticker, name, sector, cik });
  }

  console.log(`📊 Found ${sp500List.length} S&P 500 constituent companies.`);

  // 3. Run verified XBRL extraction across all constituents
  const xbrlResults = await ingestOfficialSecFacts(sp500List);

  const masterPath = path.resolve(__dirname, 'sec_financials_master.json');
  let currentList = [];
  if (fs.existsSync(masterPath)) {
    currentList = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
  }

  // Preserve marquee filings with multi-year segment detail
  const marqueeFilings = currentList.filter(f => f.id && (f.id.endsWith('-2024') || f.id.endsWith('-2023') && (f.ticker === 'NVDA' || f.ticker === 'AAPL' || f.ticker === 'MSFT' || f.ticker === 'TSLA' || f.ticker === 'META')));

  const finalMap = new Map();
  for (const m of marqueeFilings) {
    finalMap.set(m.id, m);
  }

  for (const r of xbrlResults) {
    if (!finalMap.has(r.id)) {
      finalMap.set(r.id, r);
    }
  }

  // Fill in any remaining
  for (const c of currentList) {
    if (!finalMap.has(c.id)) {
      finalMap.set(c.id, c);
    }
  }

  const finalOutput = Array.from(finalMap.values());
  fs.writeFileSync(masterPath, JSON.stringify(finalOutput, null, 2), 'utf8');

  console.log(`\n🎉 [ALL S&P 500 SYNC COMPLETE] Successfully processed and saved ${finalOutput.length} company records directly from SEC EDGAR to ${masterPath}!\n`);
}

syncAll500SpCompanies().catch(err => {
  console.error('Fatal sync error:', err);
});
