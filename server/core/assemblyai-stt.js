import dotenv from 'dotenv';
dotenv.config();

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

// Financial Domain Vocabulary Keyphrase Boosting
const FINANCIAL_KEYPHRASE_BOOST = [
  '10-K', 'Form 10-K', 'SEC', 'EDGAR', 'GAAP', 'EBITDA', 'CapEx',
  'Free Cash Flow', 'Operating Cash Flow', 'Operating Margin', 'Gross Margin',
  'Net Interest Margin', 'NIM', 'Efficiency Ratio', 'Common Net Income',
  'NVDA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'TSLA', 'XOM',
  'JPM', 'WMT', 'JNJ', 'DELL', 'ALL', 'PGR', 'D', 'DUK', 'NEE',
  'Nvidia', 'Apple', 'Microsoft', 'Amazon', 'Google', 'Alphabet',
  'Tesla', 'Exxon', 'ExxonMobil', 'JPMorgan', 'Walmart', 'Johnson & Johnson',
  'Dell', 'Allstate', 'Dominion Energy', 'NextEra', 'Duke Energy'
];

/**
 * Transcribe Audio Buffer via AssemblyAI Universal Speech-to-Text API
 */
export async function transcribeWithAssemblyAI(audioBuffer) {
  const t0 = performance.now();
  const apiKey = (process.env.ASSEMBLYAI_API_KEY || ASSEMBLYAI_API_KEY || 'a462cdf21a0f44fd92d7fe896afab05c').trim().replace(/['"]/g, '');
  if (!apiKey) {
    throw new Error('ASSEMBLYAI_API_KEY is not set.');
  }

  // Step 1: Upload the audio buffer to AssemblyAI
  const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/octet-stream'
    },
    body: audioBuffer
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`AssemblyAI Upload Failed (${uploadRes.status}): ${errText}`);
  }

  const uploadData = await uploadRes.json();
  const audioUrl = uploadData.upload_url;

  // Step 2: Request transcription with Universal-3.5 & financial domain boosting
  const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      word_boost: FINANCIAL_KEYPHRASE_BOOST,
      boost_param: 'high',
      format_text: true,
      punctuate: true
    })
  });

  if (!transcriptRes.ok) {
    const errText = await transcriptRes.text();
    throw new Error(`AssemblyAI Transcription Request Failed (${transcriptRes.status}): ${errText}`);
  }

  const transcriptData = await transcriptRes.json();
  const transcriptId = transcriptData.id;

  // Step 3: Poll for completion with low-latency polling
  let pollingAttempts = 0;
  const maxAttempts = 30;

  while (pollingAttempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 150));
    pollingAttempts++;

    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      method: 'GET',
      headers: {
        'Authorization': apiKey
      }
    });

    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    if (pollData.status === 'completed') {
      const latencyMs = Number((performance.now() - t0).toFixed(2));
      return {
        transcript: pollData.text || '',
        confidence: pollData.confidence || 1.0,
        words: pollData.words || [],
        latencyMs,
        provider: 'AssemblyAI Universal-3.5'
      };
    } else if (pollData.status === 'error') {
      throw new Error(`AssemblyAI Transcription Failed: ${pollData.error}`);
    }
  }

  throw new Error('AssemblyAI Transcription timed out.');
}
