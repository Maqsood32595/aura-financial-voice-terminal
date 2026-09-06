import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';

/**
 * Generate Spoken Financial Analysis grounded in SEC 10-K Filings
 */
export async function generateFinancialVoiceReply({
  userTranscript,
  session,
  kbResults = [],
  matchedFiling = null,
  toolExecution = null,
  customApiKey = null
}) {
  const apiKey = customApiKey || API_KEY;
  if (!apiKey) {
    console.warn('⚠️ GEMINI_API_KEY is not set.');
    return null;
  }

  // 1. Compile 30-Turn Dialogue History
  const recentTurns = (session?.turns || []).slice(-30).map(t => 
    `${t.role === 'user' ? 'Analyst' : 'Aura (Financial AI)'}: "${t.text}"`
  ).join('\n');

  // 2. Compile SEC Knowledge Context
  const kbContext = kbResults.length > 0
    ? kbResults.map(r => `[SEC 10-K Grounding]: ${r.content}`).join('\n\n')
    : 'No specific SEC filing matched.';

  // 3. Matched Filing Context (Complete Structured In-RAM Financial Tree)
  let filingContext = '';
  if (matchedFiling) {
    const gmDisplay = matchedFiling.grossMarginPercent !== null && matchedFiling.grossMarginPercent !== undefined
      ? `${matchedFiling.grossMarginPercent}%`
      : 'N/A under GAAP (Financial/Utility/Insurance)';
    const ocfDisplay = matchedFiling.operatingCashFlow ? `$${(matchedFiling.operatingCashFlow / 1e9).toFixed(2)}B` : '$0B';
    const capexDisplay = matchedFiling.capitalExpenditures ? `$${(matchedFiling.capitalExpenditures / 1e9).toFixed(2)}B` : '$0B';
    const fcfDisplay = matchedFiling.freeCashFlow ? `$${(matchedFiling.freeCashFlow / 1e9).toFixed(2)}B` : '$0B';
    const niDisplay = matchedFiling.netIncome ? `$${(matchedFiling.netIncome / 1e9).toFixed(2)}B` : '$0B';

    filingContext = `
================================================================================
OFFICIAL AUDITED IN-RAM SEC FORM 10-K GROUND TRUTH RECORD:
- Company: ${matchedFiling.companyName} (${matchedFiling.ticker})
- Fiscal Year: FY${matchedFiling.fiscalYear} (Period Ended: ${matchedFiling.periodEnd})
- Sector / GAAP Industry Classification: ${matchedFiling.sector} (${matchedFiling.industryType || 'STANDARD'})
- Total Revenue: ${matchedFiling.revenueDisplay}
- Gross Margin: ${gmDisplay}
- Operating Margin: ${matchedFiling.operatingMarginPercent}%
- Common GAAP Net Income: ${niDisplay} (Net Margin: ${matchedFiling.netMarginPercent}%)
- Operating Cash Flow (OCF): ${ocfDisplay}
- Capital Expenditures (CapEx): ${capexDisplay}
- Free Cash Flow (FCF = OCF - CapEx): ${fcfDisplay}
- Segment Breakdown: ${JSON.stringify(matchedFiling.segmentRevenue || {})}
- Audited Key Highlights: ${matchedFiling.keyHighlights}
================================================================================
CRITICAL DETERMINISTIC ENFORCEMENT:
You MUST articulate ONLY the exact figures provided in the In-RAM record above.
- When asked for Free Cash Flow (or if analyst replies 'Yes' to FCF), state EXACTLY: ${fcfDisplay}.
- When asked for Net Income, state EXACTLY: ${niDisplay}.
- When asked for Operating Margin, state EXACTLY: ${matchedFiling.operatingMarginPercent}%.
- NEVER hallucinate, estimate, or cite ungrounded figures from general memory.
`;
  }

  // 4. In-RAM Tool Execution Result
  let toolContext = '';
  if (toolExecution) {
    toolContext = `
================================================================================
DYNAMIC MANIFEST CALCULATION RESULT:
- Tool: ${toolExecution.tool}
- Data: ${JSON.stringify(toolExecution.output)}
(State these exact figures with 100% mathematical fidelity!)
================================================================================
`;
  }

  // 5. In-RAM Session Memory
  let analystMemory = '';
  if (session?.profile) {
    analystMemory = `
ANALYST PROFILE & DEEP SESSION MEMORY:
- Active Company: ${session.profile.activeCompany || 'None'}
- Inquired Companies so far: [${session.profile.inquiredCompanies?.join(', ') || 'None yet'}]
- Focus Sector: ${session.profile.focusSector || 'Broad Market'}
`;
  }

  const systemInstruction = `You are "Aura", a world-class Senior Wall Street Equity Research Analyst & SEC EDGAR Specialist.

CONVERSATIONAL CADENCE & DETERMINISTIC TREE GROUNDING:
1. Speak exactly like a charismatic, ultra-sharp Bloomberg Financial Analyst on a live voice call. Keep responses concise, punchy, and confident (1 to 2 spoken sentences, max 30 words).
2. DETERMINISTIC TREE ARTICULATION: Articulate ONLY the exact facts and figures contained in the active In-RAM 10-K record above. Do not extrapolate, invent, or use external unverified data.
3. SECTOR-AWARE GAAP ACCOUNTING RULES:
   - For Insurance Underwriters (e.g. Allstate, Progressive, Travelers): Never cite "gross margin". State that gross margin is N/A under insurance GAAP; cite Total Revenue, Operating Margin, or Common Net Income.
   - For Commercial & Investment Banks (e.g. JPMorgan, Bank of America, Wells Fargo): Never cite "gross margin". State that gross margin is N/A under banking GAAP; cite Total Net Revenue, Net Interest Margin (NIM), or Net Income.
   - For Regulated Utilities (e.g. Dominion Energy, Duke, NextEra): Never cite "gross margin". State that gross margin is N/A under utility GAAP; cite Operating Revenues, Operating Margin, or Net Income.
   - For Tech, Retail, Industrials, Autos, and Healthcare: Standard Gross Margin and Operating Margin apply.
4. REGULATORY NEUTRALITY: Never offer subjective buy/sell opinions or declare one stock "better". Provide pure objective SEC accounting facts.
5. ACTIVE FINANCIAL FOLLOW-UP: After stating the requested metric, briefly ask a relevant follow-up from the record (e.g. "Would you like to see their Free Cash Flow?").
6. DEEP MEMORY RETENTION: Remember all companies discussed earlier in the call. If the analyst replies "Yes", "Go ahead", or "Sure", immediately answer regarding the active company.
7. NO MARKDOWN: Plain spoken English only. No asterisks, markdown tables, or special characters.
8. CONVERSATIONAL GRACE: If the analyst makes a general greeting, respond smoothly (e.g. "I'm listening, which ticker or metric shall we pull up?").

${analystMemory}

VERIFIED SEC 10-K GROUNDING:
${filingContext}
${kbContext}
${toolContext}
`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Dialogue History:\n${recentTurns}\n\nAnalyst Utterance: "${userTranscript}"\n\nGenerate the next spoken financial reply.`
            }
          ]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        temperature: 0.2, // Low temperature for mathematical precision
        maxOutputTokens: 800,
        topP: 0.95,
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.warn(`Gemini API returned error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return candidate ? candidate.trim().replace(/[*_#`]/g, '') : null;
  } catch (err) {
    console.error('⚠️ Gemini Brain Error:', err.message);
    return null;
  }
}
