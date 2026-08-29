/**
 * Gemini Brain: Connects the Voice Agent to Google Gemini LLM
 * Formats voice-native conversational responses with natural cadence and empathetic tone.
 */

const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBLDQMETL_p5x1WPb49kTG1QXrpkrPE1jg';
const MODEL = 'gemini-2.5-flash';

export async function generateNaturalVoiceReply({
  userTranscript,
  session,
  kbResults,
  toolExecution
}) {
  if (!API_KEY) {
    return null;
  }

  const callerName = session.caller.name;
  const callerTier = session.caller.tier;
  const callerBalance = session.caller.balance;

  // Format relevant KB context
  const kbContext = (kbResults && kbResults.length > 0)
    ? kbResults.map(k => `[POLICY: ${k.title}] ${k.content}`).join('\n')
    : 'No specific policy found.';

  // Format Tool execution status
  let toolContext = 'No tools executed this turn.';
  if (toolExecution) {
    if (toolExecution.executed) {
      toolContext = `TOOL EXECUTED SUCCESSFULLY: ${toolExecution.name}. Parameters: ${JSON.stringify(toolExecution.params || {})}. Result: ${JSON.stringify(toolExecution.output || {})}. Updated Balance: $${callerBalance.toFixed(2)}.`;
    } else {
      toolContext = `TOOL BLOCKED BY VSAP SAFETY POLICY: ${toolExecution.name}. Reason: ${toolExecution.blockedReason}.`;
    }
  }

  // Format recent dialogue history (last 4 turns)
  const recentTurns = (session.turns || []).slice(-4).map(t => `${t.role.toUpperCase()}: ${t.text}`).join('\n');

  const systemInstruction = `You are "Aura", a highly competent, natural, warm, and helpful call center voice agent for enterprise support.
Your output is synthesized directly to speech.

CORE RULES:
1. When the customer asks about a policy or question (like refund policy or cancellations), provide the exact answer directly from the KNOWLEDGE BASE CONTEXT below. For refunds: 100% full refund within 30 days up to $300 instant in-RAM approval.
2. If a tool was executed or blocked, inform the customer of the exact status and balance.
3. Keep responses to 1-2 smooth, conversational spoken sentences.
4. Never say just "Hello" if the user asked a specific question. Always answer the question first.
5. Never use markdown symbols, bullet points, asterisks (*), or hashtags (#).

CALLER CONTEXT:
- Name: ${callerName}
- Tier: ${callerTier}
- Current Balance: $${callerBalance.toFixed(2)}

KNOWLEDGE BASE CONTEXT:
${kbContext}

TOOL EXECUTION STATUS:
${toolContext}
`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
    
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Dialogue History:\n${recentTurns}\n\nLatest Customer Utterance: "${userTranscript}"\n\nGenerate the next spoken agent response.`
            }
          ]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 100,
        topP: 0.95
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000)
    });

    if (!res.ok) {
      console.warn(`[Gemini API Error] HTTP ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (candidate && candidate.trim()) {
      // Clean any accidental markdown asterisks from LLM
      return candidate.replace(/[*_#`]/g, '').trim();
    }
    return null;
  } catch (err) {
    console.warn(`[Gemini API Warning] ${err.message}. Using fallback synthesis.`);
    return null;
  }
}
