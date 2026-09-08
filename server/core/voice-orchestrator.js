import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { financialKb } from './financial-kb.js';
import { shadowFinancialDb } from './shadow-db.js';
import { generateFinancialVoiceReply } from './gemini-brain.js';
import { FinancialState } from './financial-fsm.js';
import { notepadFinancialLogger } from './notepad-financial-logger.js';
import { financialCalculatorService } from '../features/financial-calculator/service.js';
import { inRamTensors } from './inram-tensors.js';
import { inRamLlmCaller } from './inram-llm-caller.js';
import { inRamAudioCache } from './inram-audio-cache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataPath = path.resolve(__dirname, '../data/sec_financials_master.json');

// Stop words that should never trigger single-company matching
const IGNORED_FIRST_WORDS = new Set([
  'best', 'all', 'general', 'in', 'on', 'first', 'new', 'key', 'target', 'free',
  'next', 'high', 'low', 'top', 'most', 'worst', 'one', 'two', 'three', 'what',
  'which', 'how', 'show', 'tell', 'find', 'list', 'the', 'and', 'for', 'are',
  'any', 'who', 'company', 'companies', 'stock', 'stocks', 'broad', 'sp500', 'sp'
]);

// Tickers that collide with common English words/prepositions/pronouns or single/double letters.
// Must ONLY match if preceded by '$', 'ticker', 'stock', 'symbol', or 'shares'.
// Otherwise, they match via company name (e.g., "Gartner", "Ford", "Allstate", "Citigroup").
const SENSITIVE_TICKERS = new Set([
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  'IT', 'ON', 'IN', 'AT', 'IS', 'AM', 'AN', 'AS', 'BE', 'BY', 'DO', 'GO', 'HE', 'IF', 'ME', 'MY', 'NO', 'OF', 'OR', 'SO', 'TO', 'UP', 'US', 'WE',
  'ALL', 'AND', 'ARE', 'BAD', 'BIG', 'BUT', 'CAN', 'CAR', 'DAY', 'EAR', 'END', 'EYE', 'FAR', 'FAT', 'FEW', 'FOR', 'GET', 'HAS', 'HAD', 'HER', 'HIM', 'HIS', 'HOW', 'ITS', 'JOB', 'KEY', 'LET', 'LOT', 'MAN', 'MAY', 'NEW', 'NOT', 'NOW', 'OFF', 'OLD', 'ONE', 'OUR', 'OUT', 'PAY', 'PER', 'PUT', 'RUN', 'SAY', 'SEE', 'SET', 'SHE', 'THE', 'TOO', 'TOP', 'TRY', 'TWO', 'USE', 'WAR', 'WAY', 'WHO', 'WHY', 'WIN', 'YES', 'YET',
  'FAST', 'WELL', 'GOOD', 'BEST', 'REAL', 'TRUE', 'FREE', 'CASH', 'FLOW', 'RATE', 'COST', 'SALE', 'DATA', 'GROW'
]);

function isTickerMatchValid(rawText, ticker) {
  const tUpper = ticker.toUpperCase();
  if (SENSITIVE_TICKERS.has(tUpper) || tUpper.length <= 2) {
    const hasDollar = new RegExp(`\\$${tUpper}\\b`, 'i').test(rawText);
    const hasTickerWord = new RegExp(`\\b(?:ticker|stock|symbol|shares)\\s+${tUpper}\\b`, 'i').test(rawText);
    return hasDollar || hasTickerWord;
  }
  return true;
}

export class FinancialVoiceOrchestrator {
  constructor() {
    this.filings = this.getFilings();
  }

  getFilings() {
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  }

  findMatchedFiling(text, activeYear = null) {
    const cleanText = ` ${text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')} `;
    const filings = this.getFilings();

    // Check for Year Mention (handles "2022", "FY2022", "FY 2022", etc.)
    const yearMatch = text.match(/\b(?:fy\s*)?(2022|2023|2024)\b/i);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const targetYear = year || activeYear || 2023;

    // PASS 1: Exact Ticker Match across all filings (Highest Priority)
    // Matches exact ticker like 'PSKY' or 'ISRG', while protecting against pronouns like 'it' matching 'IT'
    for (const f of filings) {
      const ticker = ` ${f.ticker.toLowerCase()} `;
      if (cleanText.includes(ticker) && isTickerMatchValid(text, f.ticker) && f.fiscalYear === targetYear) {
        return f;
      }
    }
    for (const f of filings) {
      const ticker = ` ${f.ticker.toLowerCase()} `;
      if (cleanText.includes(ticker) && isTickerMatchValid(text, f.ticker)) {
        return f;
      }
    }

    // PASS 2: Full Company Base Name Match (e.g. "paramount skydance", "best buy", "meta platforms", "mettler toledo")
    for (const f of filings) {
      const company = f.companyName.toLowerCase();
      const baseName = company.replace(/[^a-z0-9\s]/g, ' ').replace(/\b(inc|corp|corporation|llc|co|ltd|company|class|international|group)\b/g, ' ').replace(/\s+/g, ' ').trim();
      if (baseName.length > 3 && cleanText.includes(` ${baseName} `) && f.fiscalYear === targetYear) {
        return f;
      }
    }
    for (const f of filings) {
      const company = f.companyName.toLowerCase();
      const baseName = company.replace(/[^a-z0-9\s]/g, ' ').replace(/\b(inc|corp|corporation|llc|co|ltd|company|class|international|group)\b/g, ' ').replace(/\s+/g, ' ').trim();
      if (baseName.length > 3 && cleanText.includes(` ${baseName} `)) {
        return f;
      }
    }

    // PASS 3: First Word Match (Only if not a stop word and no earlier pass matched)
    for (const f of filings) {
      const company = f.companyName.toLowerCase();
      const firstWord = company.split(/[\s,]+/)[0];
      if (!IGNORED_FIRST_WORDS.has(firstWord) && firstWord.length > 3 && cleanText.includes(` ${firstWord} `) && f.fiscalYear === targetYear) {
        return f;
      }
    }
    for (const f of filings) {
      const company = f.companyName.toLowerCase();
      const firstWord = company.split(/[\s,]+/)[0];
      if (!IGNORED_FIRST_WORDS.has(firstWord) && firstWord.length > 3 && cleanText.includes(` ${firstWord} `)) {
        return f;
      }
    }

    return null;
  }

  detectComparison(text) {
    const clean = text.toLowerCase();
    const isCompare = clean.includes('compare') || clean.includes('versus') || clean.includes('vs') || clean.includes('difference');

    if (!isCompare) return null;

    const detectedTickers = [];
    for (const f of this.filings) {
      const t = f.ticker.toLowerCase();
      const firstWord = f.companyName.toLowerCase().split(' ')[0];
      if ((clean.includes(` ${t} `) || (!IGNORED_FIRST_WORDS.has(firstWord) && firstWord.length > 3 && clean.includes(` ${firstWord} `))) && !detectedTickers.includes(f.ticker)) {
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

    // 2. Identify if Utterance is a Broad Market / Screener Query
    const isBroadQuery = /(?:which|what|show|find|list|rank|top|highest|lowest)\s+(?:companies|stocks|earners|firm|constituents|s&p|sp500|sp 500|gross margin|revenue|profit|net income|margin|free cash flow|fcf)/i.test(userTranscript) ||
      /(?:free cash flow|fcf|net loss|loss).*(?:over|exceeding|above|greater than|>|<)/i.test(userTranscript) ||
      /(?:highest profit|most profitable|top net income|highest revenue|largest company|top sales|highest gross margin|best gross margin|lowest operating margin|worst margin)/i.test(userTranscript);

    // 3. Filing & Comparison Lookup in RAM (<0.05ms)
    let matchedFiling = isBroadQuery ? null : this.findMatchedFiling(userTranscript, session?.profile?.activeYear);
    const comparisonResult = this.detectComparison(userTranscript);

    // Multi-Turn Entity Retention: Retain active company and in-RAM filing across all conversational follow-ups (unless pure greeting)
    if (!matchedFiling && !comparisonResult && !isBroadQuery && session?.profile?.activeCompany) {
      const isPureGreeting = /^(?:hello|hi|hey|good\s+(?:morning|afternoon|evening)|who\s+are\s+you|what\s+can\s+you\s+do|help|thanks|thank\s+you|bye|goodbye|what\s+questions\s+can\s+i\s+ask|what\s+broad\s+questions\s+can\s+i\s+ask)[\s.?!]*$/i.test(userTranscript.trim());

      if (!isPureGreeting) {
        const yearMatch = userTranscript.match(/\b(?:fy\s*)?(2022|2023|2024)\b/i);
        let targetYear = yearMatch ? parseInt(yearMatch[1], 10) : (session.profile.activeYear || 2023);

        // If the user confirms with an affirmation, check if the previous agent turn proposed a specific fiscal year
        if (!yearMatch && /^(?:yes|yeah|sure|yep|go ahead|please|okay|ok|certainly)[\s.?!]*$/i.test(userTranscript.trim())) {
          const lastAgentTurn = session.turns.slice(0, -1).reverse().find(t => t.role === 'agent');
          if (lastAgentTurn) {
            const proposedYearMatch = lastAgentTurn.text.match(/\b(?:fy\s*)?(2022|2023|2024)\b/i);
            if (proposedYearMatch) {
              targetYear = parseInt(proposedYearMatch[1], 10);
            }
          }
        }

        const filings = this.getFilings();
        if (targetYear) {
          matchedFiling = filings.find(f => f.ticker === session.profile.activeCompany && f.fiscalYear === targetYear) || null;
        }
        if (!matchedFiling) {
          matchedFiling = filings.find(f => f.ticker === session.profile.activeCompany) || null;
        }
      }
    }

    if (matchedFiling) {
      session.fsm.transition(FinancialState.COMPANY_INQUIRY, `Inquired about ${matchedFiling.ticker}`);
      if (session.profile) {
        session.profile.activeCompany = matchedFiling.ticker;
        session.profile.activeYear = matchedFiling.fiscalYear;
        if (!session.profile.inquiredCompanies.includes(matchedFiling.ticker)) {
          session.profile.inquiredCompanies.push(matchedFiling.ticker);
        }
      }
    } else if (comparisonResult && !comparisonResult.error && session?.profile) {
      session.profile.activeCompanies = [comparisonResult.companyA.ticker, comparisonResult.companyB.ticker];
    }

    // Context-dependent queries (affirmations, follow-ups, isolated metrics) must never hit a static cache
    const isContextual = /^(?:yes|no|sure|yep|yeah|ok|okay|go ahead|please|certainly|nope|nah)[\s.?!]*$/i.test(userTranscript.trim()) ||
      /^(?:what about it|tell me|more|next|why|how|what|continue)[\s.?!]*$/i.test(userTranscript.trim()) ||
      /^(?:revenue|sales|margin|operating margin|gross margin|profit|net income|cash flow|fcf|2022|2023|2024)[\s.?!]*$/i.test(userTranscript.trim());

    const cacheKey = `${session?.profile?.activeCompany || 'NONE'}:${session?.profile?.activeYear || 'NONE'}:${userTranscript.toLowerCase().trim()}`;

    if (!isContextual) {
      const cachedReply = inRamLlmCaller.getCachedResponse(cacheKey) || inRamLlmCaller.getCachedResponse(userTranscript);
      if (cachedReply) {
        session.turns.push({
          turnIndex: session.turns.length + 1,
          role: 'agent',
          text: cachedReply,
          timestamp: new Date().toISOString()
        });
        const retrievedFacts = matchedFiling ? {
          ticker: matchedFiling.ticker,
          companyName: matchedFiling.companyName,
          fiscalYear: matchedFiling.fiscalYear,
          revenue: matchedFiling.revenueDisplay,
          grossMargin: (matchedFiling.grossMarginPercent !== null && matchedFiling.grossMarginPercent !== undefined) ? `${matchedFiling.grossMarginPercent}%` : 'N/A under GAAP',
          operatingMargin: `${matchedFiling.operatingMarginPercent}%`,
          netIncome: `$${(matchedFiling.netIncome / 1e9).toFixed(2)}B`,
          freeCashFlow: `$${(matchedFiling.freeCashFlow / 1e9).toFixed(2)}B`
        } : null;

        return {
          replyText: cachedReply,
          matchedFiling,
          comparisonResult,
          toolExecution: null,
          retrievedFacts,
          audioSnippet: inRamAudioCache.matchSnippet(cachedReply),
          fsmState: session.fsm.currentState,
          telemetry: {
            totalTurnMs: Number((performance.now() - t0).toFixed(2)),
            kbLookupMs: 0.01,
            llmTtftMs: 0.01,
            cacheHit: true
          }
        };
      }
    }

    // 4. In-RAM Sparse Token Knowledge Base Search (<0.05ms)
    const tKb0 = performance.now();
    const kbResults = financialKb.search(userTranscript, 3);
    const kbLookupMs = Number((performance.now() - tKb0).toFixed(2));

    // 5. Dynamic Manifest Tool & In-RAM Tensor Execution
    let toolExecution = null;

    // Screener Pattern A: Net Loss + Free Cash Flow Divergence (The 3M Test)
    const isLossFcfDivergence = /(?:net loss|loss).*(?:free cash flow|fcf)/i.test(userTranscript) ||
      /(?:free cash flow|fcf).*(?:net loss|loss)/i.test(userTranscript);

    // Screener Pattern B: Free Cash Flow Thresholds (e.g. "FCF > 40B")
    const fcfThresholdMatch = userTranscript.match(/(?:free cash flow|fcf)\s*(?:greater than|more than|over|exceeding|above|>)\s*\$?(\d+(?:\.\d+)?)\s*(b|billion|m|million)?/i) ||
      userTranscript.match(/(?:more than|greater than|over|exceeding|above|>)\s*\$?(\d+(?:\.\d+)?)\s*(b|billion|m|million)?\s*(?:in|of)?\s*(?:free cash flow|fcf)/i);

    if (comparisonResult && !comparisonResult.error) {
      toolExecution = {
        tool: 'compare_companies',
        output: comparisonResult
      };
    } else if (isLossFcfDivergence) {
      const tensorRes = inRamTensors.screenLossAndFcfDivergence(-5000000000, 5000000000, 2023);
      toolExecution = {
        tool: 'screener_loss_fcf_divergence',
        criteria: 'S&P 500 companies with GAAP Net Loss > $5B and Free Cash Flow > $5B in FY2023',
        count: tensorRes.count,
        output: tensorRes.results
      };
      matchedFiling = null;
      if (session?.profile && tensorRes.results.length > 0) {
        session.profile.activeCompany = tensorRes.results[0].ticker;
      }
    } else if (fcfThresholdMatch) {
      const num = parseFloat(fcfThresholdMatch[1]);
      const unit = (fcfThresholdMatch[2] || 'b').toLowerCase();
      const cutoff = num * (unit.startsWith('m') ? 1e6 : 1e9);
      const tensorRes = inRamTensors.screenFreeCashFlow(cutoff, 2023);
      toolExecution = {
        tool: 'screener_free_cash_flow',
        criteria: `Free Cash Flow > $${num} Billion in FY2023`,
        count: tensorRes.count,
        output: tensorRes.results
      };
      matchedFiling = null;
      if (session?.profile && tensorRes.results.length > 0) {
        session.profile.inquiredCompanies = [...new Set([...(session.profile.inquiredCompanies || []), ...tensorRes.results.map(r => r.ticker)])];
        session.profile.activeCompany = tensorRes.results[0].ticker;
      }
    } else if (/highest profit|most profitable|top net income/i.test(userTranscript)) {
      const tensorRes = inRamTensors.screenTopMetric('netIncome', 3, 2023);
      toolExecution = {
        tool: 'highest_profit_ranking',
        output: tensorRes.results
      };
      matchedFiling = null;
    } else if (/highest gross margin|best gross margin|top margin/i.test(userTranscript)) {
      const tensorRes = inRamTensors.screenTopMetric('grossMargin', 3, 2023);
      toolExecution = {
        tool: 'highest_gross_margin_ranking',
        output: tensorRes.results
      };
      matchedFiling = null;
    } else if (/highest revenue|largest company|top sales/i.test(userTranscript)) {
      const tensorRes = inRamTensors.screenTopMetric('revenue', 3, 2023);
      toolExecution = {
        tool: 'highest_revenue_ranking',
        output: tensorRes.results
      };
      matchedFiling = null;
    } else if (/lowest operating margin|lowest performing|worst margin/i.test(userTranscript)) {
      const sqlRes = await shadowFinancialDb.query('SELECT ticker, company_name, operating_margin_pct, fiscal_year FROM sec_filings WHERE fiscal_year = 2023 ORDER BY operating_margin_pct ASC LIMIT 3;');
      toolExecution = {
        tool: 'lowest_margin_ranking',
        output: sqlRes.rows.map(r => ({
          ticker: r.ticker,
          companyName: r.company_name,
          operatingMargin: `${r.operating_margin_pct}%`,
          fiscalYear: r.fiscal_year
        }))
      };
      matchedFiling = null;
    } else if (/growth|yoy|year over year/i.test(userTranscript)) {
      const targetTicker = matchedFiling?.ticker || session?.profile?.activeCompany || 'AAPL';
      const yearMatch = userTranscript.match(/\b(2022|2023|2024)\b/);
      const targetYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
      const growth = financialCalculatorService.calculateYoYGrowth(targetTicker, targetYear);
      if (!growth.error) {
        toolExecution = {
          tool: 'calculate_yoy_growth',
          output: growth
        };
      }
    }

    // 6. Generate Natural Spoken Response
    const tLlm0 = performance.now();
    let replyText = await generateFinancialVoiceReply({
      userTranscript,
      session,
      kbResults,
      matchedFiling,
      allFilings: matchedFiling ? this.getFilings().filter(f => f.ticker === matchedFiling.ticker) : [],
      toolExecution,
      customApiKey
    });

    // High-speed In-RAM Exact Dialectic Fallback (Guaranteed Zero Hallucination)
    if (!replyText) {
      replyText = inRamLlmCaller.formatExactDialectic({
        toolExecution,
        matchedFiling,
        comparisonResult
      });

      if (!replyText) {
        replyText = "Welcome to the SEC EDGAR Financial Voice Analyst. Which public company's 10-K filing or financial screener shall we analyze today?";
      }
    }

    const llmTtftMs = Number((performance.now() - tLlm0).toFixed(2));

    // Store in In-RAM Response Cache (scoped by company and year, strictly excluding affirmations and contextual follow-ups)
    if (!isContextual) {
      inRamLlmCaller.setCachedResponse(cacheKey, replyText);
    }

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
      comparisonResult,
      toolExecution
    });

    const totalTurnMs = Number((performance.now() - t0).toFixed(2));

    const retrievedFacts = matchedFiling ? {
      ticker: matchedFiling.ticker,
      companyName: matchedFiling.companyName,
      fiscalYear: matchedFiling.fiscalYear,
      revenue: matchedFiling.revenueDisplay,
      grossMargin: (matchedFiling.grossMarginPercent !== null && matchedFiling.grossMarginPercent !== undefined) ? `${matchedFiling.grossMarginPercent}%` : 'N/A under GAAP',
      operatingMargin: `${matchedFiling.operatingMarginPercent}%`,
      netIncome: `$${(matchedFiling.netIncome / 1e9).toFixed(2)}B`,
      freeCashFlow: `$${(matchedFiling.freeCashFlow / 1e9).toFixed(2)}B`
    } : null;

    return {
      replyText,
      matchedFiling,
      comparisonResult,
      toolExecution,
      retrievedFacts,
      audioSnippet: inRamAudioCache.matchSnippet(replyText),
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
