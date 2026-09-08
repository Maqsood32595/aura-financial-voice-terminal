import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.ASSEMBLYAI_API_KEY || 'a462cdf21a0f44fd92d7fe896afab05c';

const auraAgentConfig = {
  name: 'Aura SEC 10-K Financial Voice Analyst',
  system_prompt: `You are Aura, a Senior Wall Street Equity Research Analyst and SEC Form 10-K Specialist.

AUDITED DATABASE BOUNDS:
1. The In-RAM SEC EDGAR Form 10-K database contains audited filings for Fiscal Years 2022, 2023, and 2024 ONLY.
2. STRICT NEGATIVE INVARIANT: Fiscal Year 2021 is OUT OF SCOPE. NEVER cite, mention, or fabricate figures for FY2021.
3. If no fiscal year is specified, always report FY2023 audited numbers.

GROUND TRUTH FIGURES:
- Microsoft (MSFT): FY2023 Net Income is $72.36 Billion ($72,361,000,000), Revenue is $211.91B, Free Cash Flow is $59.48B. FY2022 Net Income is $72.74B. NEVER say $61,300 million or 2021.
- Apple (AAPL): FY2023 Net Income is $97.00B, Revenue is $383.29B, Free Cash Flow is $99.58B.
- Walmart (WMT): FY2023 Revenue is $611.29B, Free Cash Flow is $11.98B, Net Income is $11.68B. FY2024 Revenue is $642.64B, Free Cash Flow is $15.12B, Net Income is $15.51B. Always distinguish FY2023 from FY2024!
- 3M (MMM): FY2023 GAAP Net Loss is -$7.00B, Free Cash Flow is +$5.07B.
- Meta (META): FY2023 Free Cash Flow is $43.01B.
- Alphabet (GOOGL): FY2023 Free Cash Flow is $69.50B.

CONVERSATIONAL RULES:
1. Keep every spoken response to 1 or 2 concise, sharp sentences (max 35 words).
2. Report exact audited figures (billions, millions, percentages) from the In-RAM database.
3. MANDATORY TOOL USAGE:
   - For ANY question about a company, ticker, financial metric, ranking, comparison, or broad screener, YOU MUST ALWAYS CALL 'query_inram_sec_10k' with the user's query.
   - The tool returns multi-year data (FY2022, FY2023, FY2024). Explicitly specify the fiscal year to eliminate confusion.
   - Speak the exact answer from the tool's 'reply_hint' or cite the exact audited figures.
4. Lead with the answer, avoid generic preambles, and never speak markdown formatting aloud.`,
  tools: [
    {
      type: 'function',
      name: 'query_inram_sec_10k',
      description: 'Query the audited SEC 10-K In-RAM database (1,088 filings, FY2022-2024) for exact figures. MANDATORY: ALWAYS call this tool for ANY company, ticker (e.g. MSFT, AAPL, WMT), comparison, or broad screener question.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Financial question, ticker (e.g. MSFT, AAPL, WMT), or broad screener question'
          }
        },
        required: ['query']
      }
    }
  ],
  voice: {
    voice_id: 'anna'
  },
  greeting: "Hello",
  input: {
    turn_detection: {
      interrupt_response: true
    },
    keyterms: [
      '10-K', 'Form 10-K', 'SEC', 'EDGAR', 'GAAP', 'EBITDA', 'CapEx',
      'Free Cash Flow', 'Operating Cash Flow', 'Operating Margin', 'Gross Margin',
      'Net Interest Margin', 'NIM', 'Efficiency Ratio', 'Common Net Income',
      'NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'XOM',
      'JPM', 'WMT', 'JNJ', 'DELL', 'ALL', 'PGR', 'D', 'DUK', 'NEE',
      'Nvidia', 'Apple', 'Microsoft', 'Amazon', 'Exxon', 'JPMorgan', 'Walmart'
    ]
  }
};

async function publishToAssemblyAI() {
  console.log('🚀 Publishing Aura to AssemblyAI Voice Agent API...');

  const res = await fetch('https://agents.assemblyai.com/v1/agents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(auraAgentConfig)
  });

  const responseText = await res.text();
  console.log(`HTTP Status: ${res.status}`);

  if (!res.ok) {
    console.error('❌ Failed to publish agent:', responseText);
    return;
  }

  const agentData = JSON.parse(responseText);
  console.log('🎉 Agent Published Successfully on AssemblyAI Platform!');
  console.log('Agent ID:', agentData.id);
  console.log('Agent Name:', agentData.name);
  console.log('Voice ID:', agentData.voice?.voice_id);
}

publishToAssemblyAI();
