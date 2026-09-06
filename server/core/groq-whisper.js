import dotenv from 'dotenv';
dotenv.config();

/**
 * Transcribe Audio Buffer using Groq Whisper LPU (<100ms)
 */
export async function transcribeWithGroqWhisper(audioBuffer, mimeType = 'audio/webm', customKey = null) {
  const apiKey = customKey || process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const formData = new FormData();
  const ext = mimeType.includes('wav') ? 'wav' : 'webm';
  const blob = new Blob([audioBuffer], { type: mimeType });
  formData.append('file', blob, `audio.${ext}`);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('temperature', '0');
  formData.append('language', 'en');
  formData.append('prompt', 'Nvidia, NVDA, Apple, AAPL, Tesla, TSLA, Microsoft, MSFT, Google, Alphabet, GOOGL, Amazon, AMZN, Meta, META, AMD, gross margin, operating margin, free cash flow, CapEx, 10-K, SEC EDGAR, FY2023, FY2024, balance sheet, revenue');

  const t0 = performance.now();
  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq Whisper API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const latencyMs = Number((performance.now() - t0).toFixed(2));

  return {
    transcript: data.text ? data.text.trim() : '',
    latencyMs
  };
}
