import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ingestOfficialSecFacts } from './sec_xbrl_pipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const marqueeFilings = [
  {
    "id": "nvda-2024",
    "ticker": "NVDA",
    "companyName": "NVIDIA Corporation",
    "sector": "Semiconductors",
    "cik": "0001045810",
    "fiscalYear": 2024,
    "periodEnd": "2024-01-28",
    "filingDate": "2024-02-21",
    "revenue": 60922000000,
    "revenueDisplay": "$60.92B",
    "costOfRevenue": 16621000000,
    "grossProfit": 44301000000,
    "grossMarginPercent": 72.7,
    "operatingIncome": 32972000000,
    "operatingMarginPercent": 54.1,
    "netIncome": 29760000000,
    "netMarginPercent": 48.8,
    "rdExpense": 8675000000,
    "rdPercentOfRevenue": 14.2,
    "operatingCashFlow": 28090000000,
    "capitalExpenditures": 1037000000,
    "freeCashFlow": 27053000000,
    "segmentRevenue": {
      "Data Center": "$47.52B (78.0%)",
      "Gaming": "$10.45B (17.2%)",
      "Professional Visualization": "$1.55B (2.5%)",
      "Automotive": "$1.09B (1.8%)"
    },
    "keyHighlights": "Data Center surged 217% YoY driven by Hopper architecture (H100 GPUs) for generative AI.",
    "isAudited10K": true
  },
  {
    "id": "nvda-2023",
    "ticker": "NVDA",
    "companyName": "NVIDIA Corporation",
    "sector": "Semiconductors",
    "cik": "0001045810",
    "fiscalYear": 2023,
    "periodEnd": "2023-01-29",
    "filingDate": "2023-02-24",
    "revenue": 26974000000,
    "revenueDisplay": "$26.97B",
    "costOfRevenue": 11618000000,
    "grossProfit": 15356000000,
    "grossMarginPercent": 56.9,
    "operatingIncome": 4224000000,
    "operatingMarginPercent": 15.7,
    "netIncome": 4368000000,
    "netMarginPercent": 16.2,
    "rdExpense": 7339000000,
    "rdPercentOfRevenue": 27.2,
    "operatingCashFlow": 5641000000,
    "capitalExpenditures": 1833000000,
    "freeCashFlow": 3808000000,
    "segmentRevenue": {
      "Data Center": "$15.01B (55.6%)",
      "Gaming": "$9.07B (33.6%)",
      "Professional Visualization": "$1.54B (5.7%)",
      "Automotive": "$903M (3.3%)"
    },
    "keyHighlights": "Data Center became primary revenue engine at 55.6% of revenue overcoming gaming inventory correction.",
    "isAudited10K": true
  },
  {
    "id": "aapl-2023",
    "ticker": "AAPL",
    "companyName": "Apple Inc.",
    "sector": "Mega-Cap Tech",
    "cik": "0000320193",
    "fiscalYear": 2023,
    "periodEnd": "2023-09-30",
    "filingDate": "2023-11-03",
    "revenue": 383285000000,
    "revenueDisplay": "$383.29B",
    "costOfRevenue": 214137000000,
    "grossProfit": 169148000000,
    "grossMarginPercent": 44.1,
    "operatingIncome": 114301000000,
    "operatingMarginPercent": 29.8,
    "netIncome": 96995000000,
    "netMarginPercent": 25.3,
    "rdExpense": 29915000000,
    "rdPercentOfRevenue": 7.8,
    "operatingCashFlow": 110543000000,
    "capitalExpenditures": 10959000000,
    "freeCashFlow": 99584000000,
    "segmentRevenue": {
      "iPhone": "$200.58B (52.3%)",
      "Services": "$85.20B (22.2%)",
      "Wearables, Home & Accessories": "$39.85B (10.4%)",
      "Mac": "$29.36B (7.7%)",
      "iPad": "$28.30B (7.4%)"
    },
    "keyHighlights": "Services revenue set an all-time record of $85.2B (+9.1% YoY) with gross margins reaching 70.8%.",
    "isAudited10K": true
  },
  {
    "id": "aapl-2024",
    "ticker": "AAPL",
    "companyName": "Apple Inc.",
    "sector": "Mega-Cap Tech",
    "cik": "0000320193",
    "fiscalYear": 2024,
    "periodEnd": "2024-09-28",
    "filingDate": "2024-11-01",
    "revenue": 391035000000,
    "revenueDisplay": "$391.04B",
    "costOfRevenue": 210352000000,
    "grossProfit": 180683000000,
    "grossMarginPercent": 46.2,
    "operatingIncome": 123216000000,
    "operatingMarginPercent": 31.5,
    "netIncome": 93736000000,
    "netMarginPercent": 24.0,
    "rdExpense": 31370000000,
    "rdPercentOfRevenue": 8.0,
    "operatingCashFlow": 118254000000,
    "capitalExpenditures": 9450000000,
    "freeCashFlow": 108804000000,
    "segmentRevenue": {
      "iPhone": "$201.18B (51.4%)",
      "Services": "$96.17B (24.6%)",
      "Wearables & Accessories": "$37.01B (9.5%)",
      "Mac": "$29.98B (7.7%)",
      "iPad": "$26.69B (6.8%)"
    },
    "keyHighlights": "Gross margin expanded to 46.2% driven by Services growth approaching $100B milestone. $108.8B in Free Cash Flow.",
    "isAudited10K": true
  },
  {
    "id": "msft-2024",
    "ticker": "MSFT",
    "companyName": "Microsoft Corporation",
    "sector": "Mega-Cap Tech",
    "cik": "0000789019",
    "fiscalYear": 2024,
    "periodEnd": "2024-06-30",
    "filingDate": "2024-07-31",
    "revenue": 245122000000,
    "revenueDisplay": "$245.12B",
    "costOfRevenue": 74163000000,
    "grossProfit": 170959000000,
    "grossMarginPercent": 69.7,
    "operatingIncome": 109433000000,
    "operatingMarginPercent": 44.6,
    "netIncome": 88136000000,
    "netMarginPercent": 36.0,
    "rdExpense": 29510000000,
    "rdPercentOfRevenue": 12.0,
    "operatingCashFlow": 118548000000,
    "capitalExpenditures": 44477000000,
    "freeCashFlow": 74071000000,
    "segmentRevenue": {
      "Intelligent Cloud (Azure)": "$105.36B (43.0%)",
      "Productivity and Business (Office/LinkedIn)": "$77.71B (31.7%)",
      "More Personal Computing (Windows/Gaming)": "$62.05B (25.3%)"
    },
    "keyHighlights": "Microsoft Cloud revenue exceeded $137B with Azure and other cloud services growing 30% YoY.",
    "isAudited10K": true
  },
  {
    "id": "tsla-2023",
    "ticker": "TSLA",
    "companyName": "Tesla, Inc.",
    "sector": "Automotive & Energy",
    "cik": "0001318605",
    "fiscalYear": 2023,
    "periodEnd": "2023-12-31",
    "filingDate": "2024-01-29",
    "revenue": 96773000000,
    "revenueDisplay": "$96.77B",
    "costOfRevenue": 79113000000,
    "grossProfit": 17660000000,
    "grossMarginPercent": 18.2,
    "operatingIncome": 8891000000,
    "operatingMarginPercent": 9.2,
    "netIncome": 14997000000,
    "netMarginPercent": 15.5,
    "rdExpense": 3969000000,
    "rdPercentOfRevenue": 4.1,
    "operatingCashFlow": 13256000000,
    "capitalExpenditures": 8898000000,
    "freeCashFlow": 4358000000,
    "segmentRevenue": {
      "Automotive Sales & Leasing": "$82.42B (85.2%)",
      "Energy Generation and Storage": "$6.04B (6.2%)",
      "Services and Other": "$8.32B (8.6%)"
    },
    "keyHighlights": "1.81 million vehicle deliveries (+38% YoY). Energy storage deployments grew 125% to 14.7 GWh.",
    "isAudited10K": true
  },
  {
    "id": "tsla-2024",
    "ticker": "TSLA",
    "companyName": "Tesla, Inc.",
    "sector": "Automotive & Energy",
    "cik": "0001318605",
    "fiscalYear": 2024,
    "periodEnd": "2024-12-31",
    "filingDate": "2025-01-30",
    "revenue": 97690000000,
    "revenueDisplay": "$97.69B",
    "costOfRevenue": 80165000000,
    "grossProfit": 17525000000,
    "grossMarginPercent": 17.9,
    "operatingIncome": 7077000000,
    "operatingMarginPercent": 7.2,
    "netIncome": 7089000000,
    "netMarginPercent": 7.3,
    "rdExpense": 4540000000,
    "rdPercentOfRevenue": 4.6,
    "operatingCashFlow": 14942000000,
    "capitalExpenditures": 11300000000,
    "freeCashFlow": 3642000000,
    "segmentRevenue": {
      "Automotive Sales & Leasing": "$77.08B (78.9%)",
      "Energy Generation and Storage": "$10.08B (10.3%)",
      "Services and Other": "$10.53B (10.8%)"
    },
    "keyHighlights": "Energy Storage revenue surpassed $10B milestone (+67% YoY) with 31.4 GWh deployed.",
    "isAudited10K": true
  },
  {
    "id": "meta-2023",
    "ticker": "META",
    "companyName": "Meta Platforms, Inc.",
    "sector": "Mega-Cap Tech",
    "cik": "0001326801",
    "fiscalYear": 2023,
    "periodEnd": "2023-12-31",
    "filingDate": "2024-02-02",
    "revenue": 134902000000,
    "revenueDisplay": "$134.90B",
    "costOfRevenue": 26084000000,
    "grossProfit": 108818000000,
    "grossMarginPercent": 80.7,
    "operatingIncome": 46751000000,
    "operatingMarginPercent": 34.7,
    "netIncome": 39098000000,
    "netMarginPercent": 29.0,
    "rdExpense": 38483000000,
    "rdPercentOfRevenue": 28.5,
    "operatingCashFlow": 71113000000,
    "capitalExpenditures": 28100000000,
    "freeCashFlow": 43013000000,
    "segmentRevenue": {
      "Family of Apps (Facebook/IG/WhatsApp)": "$133.01B (98.6%)",
      "Reality Labs (VR/Quest)": "$1.89B (1.4%)"
    },
    "keyHighlights": "Meta's 'Year of Efficiency' delivered 80.7% gross margin and $43.0B in Free Cash Flow.",
    "isAudited10K": true
  }
];

const targetCompanies = [
  { ticker: 'AMZN', cik: '0001018724', name: 'Amazon.com, Inc.', sector: 'Broadline Retail' },
  { ticker: 'IBM', cik: '0000051143', name: 'International Business Machines Corp', sector: 'Information Technology' },
  { ticker: 'NVDA', cik: '0001045810', name: 'NVIDIA Corporation', sector: 'Semiconductors' },
  { ticker: 'AAPL', cik: '0000320193', name: 'Apple Inc.', sector: 'Technology Hardware' },
  { ticker: 'MSFT', cik: '0000789019', name: 'Microsoft Corporation', sector: 'Software' },
  { ticker: 'GOOGL', cik: '0001652044', name: 'Alphabet Inc.', sector: 'Interactive Media' },
  { ticker: 'META', cik: '0001326801', name: 'Meta Platforms, Inc.', sector: 'Interactive Media' },
  { ticker: 'TSLA', cik: '0001318605', name: 'Tesla, Inc.', sector: 'Automobiles' },
  { ticker: 'WMT', cik: '0000104169', name: 'Walmart Inc.', sector: 'Consumer Staples' },
  { ticker: 'CAT', cik: '0000018230', name: 'Caterpillar Inc.', sector: 'Machinery' },
  { ticker: 'CSCO', cik: '0000858877', name: 'Cisco Systems, Inc.', sector: 'Communications Equipment' },
  { ticker: 'ORCL', cik: '0001341439', name: 'Oracle Corporation', sector: 'Software' },
  { ticker: 'CRM', cik: '0001108524', name: 'Salesforce, Inc.', sector: 'Software' },
  { ticker: 'ADBE', cik: '0000796343', name: 'Adobe Inc.', sector: 'Software' },
  { ticker: 'COST', cik: '0000909832', name: 'Costco Wholesale Corp', sector: 'Consumer Staples' },
  { ticker: 'AMD', cik: '0000002488', name: 'Advanced Micro Devices, Inc.', sector: 'Semiconductors' },
  { ticker: 'QCOM', cik: '0000804328', name: 'QUALCOMM Incorporated', sector: 'Semiconductors' },
  { ticker: 'TXN', cik: '0000097476', name: 'Texas Instruments Incorporated', sector: 'Semiconductors' },
  { ticker: 'AVGO', cik: '0001730168', name: 'Broadcom Inc.', sector: 'Semiconductors' },
  { ticker: 'JPM', cik: '0000019617', name: 'JPMorgan Chase & Co.', sector: 'Financials' },
  { ticker: 'V', cik: '0001403161', name: 'Visa Inc.', sector: 'Financials' },
  { ticker: 'MA', cik: '0001141391', name: 'Mastercard Incorporated', sector: 'Financials' },
  { ticker: 'DIS', cik: '0001744489', name: 'The Walt Disney Company', sector: 'Communication Services' },
  { ticker: 'NFLX', cik: '0001065280', name: 'Netflix, Inc.', sector: 'Communication Services' },
  { ticker: 'PEP', cik: '0000077476', name: 'PepsiCo, Inc.', sector: 'Consumer Staples' },
  { ticker: 'KO', cik: '0000021344', name: 'The Coca-Cola Company', sector: 'Consumer Staples' },
  { ticker: 'UNH', cik: '0000731766', name: 'UnitedHealth Group Incorporated', sector: 'Health Care' },
  { ticker: 'LLY', cik: '0000059478', name: 'Eli Lilly and Company', sector: 'Health Care' },
  { ticker: 'JNJ', cik: '0000200406', name: 'Johnson & Johnson', sector: 'Health Care' },
  { ticker: 'XOM', cik: '0000034088', name: 'Exxon Mobil Corporation', sector: 'Energy' },
  { ticker: 'CVX', cik: '0000093410', name: 'Chevron Corporation', sector: 'Energy' },
  { ticker: 'GE', cik: '0000040545', name: 'General Electric Company', sector: 'Industrials' },
  { ticker: 'BA', cik: '0000012927', name: 'The Boeing Company', sector: 'Industrials' },
  { ticker: 'PG', cik: '0000080424', name: 'The Procter & Gamble Company', sector: 'Consumer Staples' },
  { ticker: 'HD', cik: '0000354950', name: 'The Home Depot, Inc.', sector: 'Consumer Discretionary' },
  { ticker: 'MCD', cik: '0000063908', name: "McDonald's Corporation", sector: 'Consumer Discretionary' },
  { ticker: 'NKE', cik: '0000320187', name: 'NIKE, Inc.', sector: 'Consumer Discretionary' },
  { ticker: 'ATO', cik: '0000731802', name: 'Atmos Energy Corporation', sector: 'Gas Utilities' },
  { ticker: 'AOS', cik: '0000091142', name: 'A. O. Smith Corporation', sector: 'Building Products' }
];

async function syncAndMerge() {
  console.log('🚀 Running SEC EDGAR XBRL synchronization...');
  const xbrlResults = await ingestOfficialSecFacts(targetCompanies);

  const masterPath = path.resolve(__dirname, 'sec_financials_master.json');
  let currentList = [];
  if (fs.existsSync(masterPath)) {
    currentList = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
  }

  // Marquee filings come first
  const updatedList = [...marqueeFilings];
  const processedIds = new Set(marqueeFilings.map(f => f.id));
  const marqueeTickersWith2023 = new Set(marqueeFilings.filter(f => f.fiscalYear === 2023).map(f => f.ticker));

  // Add freshly synced XBRL results (excluding any covered in marquee)
  for (const r of xbrlResults) {
    if (!marqueeTickersWith2023.has(r.ticker) && !processedIds.has(r.id)) {
      updatedList.push(r);
      processedIds.add(r.id);
    }
  }

  // Retain all other S&P 500 records
  for (const item of currentList) {
    if (!processedIds.has(item.id)) {
      updatedList.push(item);
      processedIds.add(item.id);
    }
  }

  fs.writeFileSync(masterPath, JSON.stringify(updatedList, null, 2), 'utf8');
  console.log(`🎉 [SEC EDGAR XBRL Sync Complete] Saved ${updatedList.length} verified company records to ${masterPath}`);
}

syncAndMerge().catch(err => {
  console.error('Sync error:', err);
});
