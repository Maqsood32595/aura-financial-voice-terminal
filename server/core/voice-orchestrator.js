import { sessionEngine } from './session-engine.js';
import { vsapGuard } from './vsap-guard.js';
import { qsagKb } from './qsag-kb.js';
import { generateNaturalVoiceReply } from './gemini-brain.js';
import { neuralTts } from './neural-tts.js';

/**
 * Voice Orchestrator
 * Coordinates real-time speech-to-text turns, smart endpointing,
 * in-memory RAG, pre-flight tool verification, and streaming response synthesis.
 */
export class VoiceOrchestrator {
  constructor() {
    this.activeTools = new Map();
  }

  /**
   * Register a tool handler dynamically via Fractal Kernel
   * @param {string} name 
   * @param {Object} def { description, execute, validate }
   */
  registerTool(name, def) {
    this.activeTools.set(name, def);
    if (def.validate) {
      vsapGuard.registerPolicy(name, def.validate);
    }
  }

  /**
   * Process incoming user speech turn
   * @param {string} sessionId 
   * @param {string} transcript 
   * @returns {Promise<{ replyText: string, latency: Object, kbResults: Array, toolExecution: Object|null }>}
   */
  async processUserUtterance(sessionId, transcript) {
    const t0 = performance.now();
    const session = sessionEngine.getSession(sessionId) || sessionEngine.createSession(sessionId);

    // 1. Record User Turn in RAM (<0.05ms)
    sessionEngine.appendTurn(sessionId, 'user', transcript);

    // 2. Ultra-Fast In-RAM Knowledge Base Retrieval (<2ms via QSAG)
    const tKb0 = performance.now();
    const kbResults = qsagKb.search(transcript, 2);
    const kbLatencyMs = Number((performance.now() - tKb0).toFixed(2));

    // 3. Intent & Tool Extraction (Action Mutations vs Knowledge Queries)
    let toolExecution = null;
    let toolResult = null;
    const lower = transcript.toLowerCase();

    const isPolicyQuestion = lower.includes('policy') || lower.includes('what is') || lower.includes('how does') || lower.includes('explain') || lower.includes('tell me about') || lower.includes('rules');

    // Action: Refund Mutation (Only if not asking for policy definition)
    const isRefundAction = !isPolicyQuestion && (
      lower.includes('process a refund') ||
      lower.includes('request a refund') ||
      lower.includes('give me a refund') ||
      lower.includes('refund of') ||
      lower.includes('refund $') ||
      lower.includes('refund my') ||
      (lower.includes('refund') && (lower.includes('please') || lower.includes('want') || lower.includes('need') || /\$\d+/.test(transcript)))
    );

    if (isRefundAction) {
      const match = transcript.match(/\$?(\d+(\.\d{1,2})?)/);
      const amount = match ? parseFloat(match[1]) : 50.00;

      const simulation = await vsapGuard.simulate('process_refund', { amount }, session);
      
      if (simulation.approved) {
        const toolDef = this.activeTools.get('process_refund');
        if (toolDef && toolDef.execute) {
          toolResult = await toolDef.execute({ amount }, session);
        }
        toolExecution = {
          name: 'process_refund',
          params: { amount },
          simulation,
          executed: true,
          output: toolResult
        };
      } else {
        toolExecution = {
          name: 'process_refund',
          params: { amount },
          simulation,
          executed: false,
          blockedReason: simulation.reason
        };
      }
    } 
    // Action: Cancellation Mutation
    else if (!isPolicyQuestion && (lower.includes('cancel my subscription') || lower.includes('cancel my plan') || lower.includes('cancel my membership') || lower.includes('cancel subscription'))) {
      const simulation = await vsapGuard.simulate('cancel_subscription', { reason: 'Caller voice request' }, session);
      if (simulation.approved) {
        const toolDef = this.activeTools.get('cancel_subscription');
        if (toolDef && toolDef.execute) {
          toolResult = await toolDef.execute({ reason: 'Caller voice request' }, session);
        }
        toolExecution = {
          name: 'cancel_subscription',
          params: { reason: 'Caller voice request' },
          simulation,
          executed: true,
          output: toolResult
        };
      } else {
        toolExecution = {
          name: 'cancel_subscription',
          simulation,
          executed: false,
          blockedReason: simulation.reason
        };
      }
    }
    // Action: Balance Inquiry
    else if (lower.includes('balance') || lower.includes('account status') || lower.includes('how much money') || lower.includes('my balance')) {
      toolExecution = {
        name: 'get_account_balance',
        executed: true,
        output: { balance: session.caller.balance, tier: session.caller.tier }
      };
    }

    // 4. Generate Natural Conversational Response (Gemini Brain + In-RAM Fallback)
    let replyText = await generateNaturalVoiceReply({
      userTranscript: transcript,
      session,
      kbResults,
      toolExecution
    });

    if (!replyText) {
      replyText = this.synthesizeNaturalResponse(transcript, session, kbResults, toolExecution);
    }
    const ttftMs = Number((performance.now() - t0).toFixed(1));

    // 5. Synthesize Studio-Grade Female Neural Audio (Microsoft Jenny / Aria)
    const tTts0 = performance.now();
    const audioBase64 = await neuralTts.synthesizeToBase64(replyText, 'en-US-JennyNeural');
    const ttsLatencyMs = Number((performance.now() - tTts0).toFixed(1));

    // 6. Record Agent Turn in RAM
    sessionEngine.appendTurn(sessionId, 'agent', replyText, {
      latencyMs: ttftMs,
      toolExecution
    });

    session.metrics.lastTurnLatencyMs = ttftMs;

    return {
      sessionId,
      replyText,
      audioBase64,
      latency: {
        sttEstimatedMs: 85,
        llmTtftMs: ttftMs,
        ttsEstimatedMs: ttsLatencyMs || 65,
        totalMouthToEarMs: Math.round(85 + ttftMs + (ttsLatencyMs || 65)),
        kbLookupMs: kbLatencyMs
      },
      kbResults,
      toolExecution,
      caller: session.caller
    };
  }

  /**
   * Synthesizes conversational dialog with natural fillers and persona inflection
   */
  synthesizeNaturalResponse(userText, session, kbResults, toolExecution) {
    const callerName = session.caller.name;

    // Response when tool execution occurred
    if (toolExecution) {
      if (toolExecution.name === 'process_refund') {
        if (toolExecution.executed) {
          return `I have processed that refund of $${toolExecution.params.amount.toFixed(2)} directly to your account, ${callerName}. Your updated balance is $${session.caller.balance.toFixed(2)}. Is there anything else I can assist you with today?`;
        } else {
          return `I checked our system for a refund of $${toolExecution.params.amount.toFixed(2)}, but our security policy notes: ${toolExecution.blockedReason}. Would you like me to connect you with a Tier-2 supervisor?`;
        }
      }

      if (toolExecution.name === 'cancel_subscription') {
        if (toolExecution.executed) {
          return `I understand, ${callerName}. Your subscription has been scheduled for cancellation at the end of the billing cycle. You will not be charged again.`;
        } else {
          return `I was unable to automatically cancel the subscription due to policy restrictions: ${toolExecution.blockedReason}.`;
        }
      }

      if (toolExecution.name === 'get_account_balance') {
        return `Your current account balance is $${session.caller.balance.toFixed(2)} under your ${session.caller.tier} plan.`;
      }
    }

    // Response when Knowledge Base hit occurred
    if (kbResults && kbResults.length > 0 && kbResults[0].score > 0.25) {
      const topKb = kbResults[0];
      return `Based on our ${topKb.category.toLowerCase()} policy, ${topKb.content} Does that clarify things for you?`;
    }

    // General conversational fallbacks
    const lower = userText.toLowerCase();
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      return `Hello ${callerName}! Thanks for calling customer support. How can I help you today?`;
    }

    if (lower.includes('thank') || lower.includes('bye') || lower.includes('goodbye')) {
      return `You're very welcome, ${callerName}! Have a wonderful rest of your day. Goodbye!`;
    }

    return `I heard you say: "${userText}". I can help you with refund requests, subscription management, balance inquiries, or policy information. How would you like to proceed?`;
  }
}

export const voiceOrchestrator = new VoiceOrchestrator();
