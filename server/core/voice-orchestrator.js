import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { financialKb } from './financial-kb.js';
import { shadowFinancialDb } from './shadow-db.js';
import { generateFinancialVoiceReply } from './gemini-brain.js';
import { FinancialState } from './financial-fsm.js';
import { notepadFinancialLogger } from './notepad-financial-logger.js';
import { financialCalculatorService } from '../features/financial-calculator/service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.resolve(__dirname, '../data/sec_financials_master.json');
const allFilings = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

export class FinancialVoiceOrchestrator {
  constructor() {
    this.filings = this.getFilings();
  }

  getFilings() {
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }

  findMatchedFiling(text) {
    const cleanText = ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')} `;
    const filings = this.getFilings();

    // 1. Check for Year Mention
    let year = null;
    if (cleanText.includes(' 2024 ')) year = 2024;
    else if (cleanText.includes(' 2023 ')) year = 2023;
    else if (cleanText.includes(' 2022 ')) year = 2022;

    // 2. Check for Ticker with boundary or Company Name
    for (const f of filings) {
      const ticker = ` ${f.ticker.toLowerCase()} `;
      const company = f.companyName.toLowerCase();
      const firstWord = ` ${company.split(' ')[0]} `;

      if (cleanText.includes(ticker) || cleanText.includes(firstWord) || cleanText.includes(company)) {
        if (year && f.fiscalYear === year) {
          return f;
        }
      }
    }

    // Default fallback to first matching company
    for (const f of filings) {
      const ticker = ` ${f.ticker.toLowerCase()} `;
      const firstWord = ` ${f.companyName.toLowerCase().split(' ')[0]} `;
      if (cleanText.includes(ticker) || cleanText.includes(firstWord)) {
        return f;
      }
    }

    return null;
  }

  detectComparison(text) {
    const clean = text.toLowerCase();
    const isCompare = clean.includes('compare') || clean.includes('versus') || clean.includes('vs') || clean.includes('higher') || clean.includes('difference');

    if (!isCompare) return null;

    const detectedTickers = [];
    for (const f of this.filings) {
      const t = f.ticker.toLowerCase();
      const firstWord = f.companyName.toLowerCase().split(' ')[0];
      if ((clean.includes(t) || clean.includes(firstWord)) && !detectedTickers.includes(f.ticker)) {
        detectedTickers.push(f.ticker);
      }
    }

    if (detectedTickers.length >= 2) {
      const year = clean.includes('2024') ? 2024 : 2023;
      return financialCalculatorService.compareCompanies({
        tickerA: detectedTickers[0],
        tickerB: detectedTickers[1],
        fiscalYear: year
      });
    }

    return null;
  }

  async processVoiceTurn({ session, userTranscript, customApiKey = null }) {
    const t0 = performance.now();

    // 1. Update In-RAM Session Turn
    session.turns.push({
      turnIndex: session.turns.length + 1,
      role: 'user',
      text: userTranscript,
      timestamp: new Date().toISOString()
    });

    // 2. Filing & Comparison Lookup in RAM (<0.05ms)
    let matchedFiling = this.findMatchedFiling(userTranscript);
    const comparisonResult = this.detectComparison(userTranscript);

    // Multi-Turn Entity Retention: If current utterance has no entity (e.g. 'Yes', 'Go ahead', 'Sure', 'give me that'), bind active company
    if (!matchedFiling && !comparisonResult && session?.profile?.activeCompany) {
      const yearMatch = userTranscript.match(/\b(2022|2023|2024)\b/);
      const targetYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
      const filings = this.getFilings();
      if (targetYear) {
        matchedFiling = filings.find(f => f.ticker === session.profile.activeCompany && f.fiscalYear === targetYear) || null;
      }
      if (!matchedFiling) {
        matchedFiling = filings.find(f => f.ticker === session.profile.activeCompany) || null;
      }
    }

    if (matchedFiling) {
      session.fsm.transition(FinancialState.COMPANY_INQUIRY, `Inquired about ${matchedFiling.ticker}`);
      if (session.profile) {
        session.profile.activeCompany = matchedFiling.ticker;
        if (!session.profile.inquiredCompanies.includes(matchedFiling.ticker)) {
          session.profile.inquiredCompanies.push(matchedFiling.ticker);
        }
      }
    } else if (comparisonResult && !comparisonResult.error && session?.profile) {
      session.profile.activeCompanies = [comparisonResult.companyA.ticker, comparisonResult.companyB.ticker];
    }

    // 3. In-RAM Sparse Token Knowledge Base Search (<0.05ms)
    const tKb0 = performance.now();
    const kbResults = financialKb.search(userTranscript, 3);
    const kbLookupMs = Number((performance.now() - tKb0).toFixed(2));

    // 4. In-RAM Shadow PostgreSQL Query Logging
    if (matchedFiling) {
      await shadowFinancialDb.query(
        `SELECT * FROM sec_filings WHERE ticker = $1 AND fiscal_year = $2;`,
        [matchedFiling.ticker, matchedFiling.fiscalYear]
      );
    }

    // 5. Dynamic Manifest Tool & SQL Aggregate Execution
    let toolExecution = null;
    if (comparisonResult && !comparisonResult.error) {
      toolExecution = {
        tool: 'compare_companies',
        output: comparisonResult
      };
    } else if (/highest profit|most profitable|top net income/i.test(userTranscript)) {
      const sqlRes = await shadowFinancialDb.query('SELECT ticker, company_name, net_income, revenue, fiscal_year FROM sec_filings ORDER BY net_income DESC LIMIT 3;');
      toolExecution = {
        tool: 'highest_profit_ranking',
        output: sqlRes.rows.map(r => ({
          ticker: r.ticker,
          companyName: r.company_name,
          netIncome: `$${(r.net_income / 1e9).toFixed(2)}B`,
          fiscalYear: r.fiscal_year
        }))
      };
    } else if (/highest gross margin|best gross margin|top margin/i.test(userTranscript)) {
      const sqlRes = await shadowFinancialDb.query('SELECT ticker, company_name, gross_margin_pct, fiscal_year FROM sec_filings ORDER BY gross_margin_pct DESC LIMIT 3;');
      toolExecution = {
        tool: 'highest_gross_margin_ranking',
        output: sqlRes.rows.map(r => ({
          ticker: r.ticker,
          companyName: r.company_name,
          grossMargin: `${r.gross_margin_pct}%`,
          fiscalYear: r.fiscal_year
        }))
      };
    } else if (/highest revenue|largest company|top sales/i.test(userTranscript)) {
      const sqlRes = await shadowFinancialDb.query('SELECT ticker, company_name, revenue, fiscal_year FROM sec_filings ORDER BY revenue DESC LIMIT 3;');
      toolExecution = {
        tool: 'highest_revenue_ranking',
        output: sqlRes.rows.map(r => ({
          ticker: r.ticker,
          companyName: r.company_name,
          revenue: `$${(r.revenue / 1e9).toFixed(2)}B`,
          fiscalYear: r.fiscal_year
        }))
      };
    } else if (/lowest operating margin|lowest performing|worst margin/i.test(userTranscript)) {
      const sqlRes = await shadowFinancialDb.query('SELECT ticker, company_name, operating_margin_pct, fiscal_year FROM sec_filings ORDER BY operating_margin_pct ASC LIMIT 3;');
      toolExecution = {
        tool: 'lowest_margin_ranking',
        output: sqlRes.rows.map(r => ({
          ticker: r.ticker,
          companyName: r.company_name,
          operatingMargin: `${r.operating_margin_pct}%`,
          fiscalYear: r.fiscal_year
        }))
      };
    } else if (/growth|yoy|year over year/i.test(userTranscript) && matchedFiling) {
      const growth = financialCalculatorService.calculateYoYGrowth(matchedFiling.ticker);
      if (!growth.error) {
        toolExecution = {
          tool: 'calculate_yoy_growth',
          output: growth
        };
      }
    }

    // 6. Generate Natural Spoken Response via Gemini
    const tLlm0 = performance.now();
    let replyText = await generateFinancialVoiceReply({
      userTranscript,
      session,
      kbResults,
      matchedFiling,
      toolExecution,
      customApiKey
    });

    // High-speed fallback if API unavailable
    if (!replyText) {
      if (comparisonResult && !comparisonResult.error) {
        replyText = `For FY${comparisonResult.fiscalYear}, ${comparisonResult.companyA.ticker} generated ${comparisonResult.companyA.revenue} with a ${comparisonResult.companyA.grossMarginPercent} gross margin, while ${comparisonResult.companyB.ticker} generated ${comparisonResult.companyB.revenue} with a ${comparisonResult.companyB.grossMarginPercent} gross margin.`;
      } else if (matchedFiling) {
        replyText = `In FY${matchedFiling.fiscalYear}, ${matchedFiling.companyName} reported total revenue of ${matchedFiling.revenueDisplay} with a gross margin of ${matchedFiling.grossMarginPercent}% and Free Cash Flow of $${(matchedFiling.freeCashFlow / 1e9).toFixed(2)} billion.`;
      } else {
        replyText = "Welcome to the SEC EDGAR Financial Voice Analyst. Which public company's 10-K filing or financial metrics shall we analyze today?";
      }
    }

    const llmTtftMs = Number((performance.now() - tLlm0).toFixed(2));

    // 7. Append Agent Turn to Session
    session.turns.push({
      turnIndex: session.turns.length + 1,
      role: 'agent',
      text: replyText,
      timestamp: new Date().toISOString()
    });

    // 8. Non-Blocking Background Audit Logger
    notepadFinancialLogger.captureFinancialTurn({
      session,
      userTranscript,
      agentReply: replyText,
      matchedFiling,
      comparisonResult
    });

    const totalTurnMs = Number((performance.now() - t0).toFixed(2));

    return {
      replyText,
      matchedFiling,
      comparisonResult,
      fsmState: session.fsm.currentState,
      telemetry: {
        totalTurnMs,
        kbLookupMs,
        llmTtftMs
      }
    };
  }
}

export const voiceOrchestrator = new FinancialVoiceOrchestrator();
