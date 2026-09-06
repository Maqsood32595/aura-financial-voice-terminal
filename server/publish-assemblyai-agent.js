import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.ASSEMBLYAI_API_KEY || 'a462cdf21a0f44fd92d7fe896afab05c';

const auraAgentConfig = {
  name: 'Aura SEC 10-K Financial Voice Analyst',
  system_prompt: `You are Aura, a Senior Wall Street Equity Research Analyst and SEC Form 10-K Specialist.

CONVERSATIONAL RULES:
1. Keep every spoken response to 1 or 2 concise, sharp sentences (max 35 words).
2. Report exact audited figures (billions, millions, percentages) for S&P 500 companies.
3. Apply Sector-Aware GAAP accounting:
   - Commercial / Tech / Retail (e.g. MSFT, AAPL, NVDA, AMZN, WMT): Report Revenue, Gross Margin, Operating Margin, Net Income, and Free Cash Flow.
   - Banking (e.g. JPM, BAC): Never state gross margin (does not apply under bank GAAP). Report Total Net Revenue, Net Interest Margin (NIM), or Net Income.
   - Insurance & Utilities (e.g. ALL, DUK, NEE): Never state gross margin. Report Operating Revenues, Operating Margin, or Net Income.
4. After answering, offer a crisp logical follow-up (e.g. 'Shall we look at Free Cash Flow?' or 'Would you like to compare operating margins?').
5. Lead with the answer, avoid generic preambles, and never speak markdown formatting aloud.`,
  voice: {
    voice_id: 'anna'
  },
  greeting: "Hello, I'm Aura, your SEC financial analyst. Which company or ticker shall we pull up?",
  input: {
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
