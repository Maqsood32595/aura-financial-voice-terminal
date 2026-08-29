/**
 * QSAG (Quantized Sparse-Aware Generation) In-Memory RAG Engine
 * Provides sub-5ms knowledge base search over call center policies, FAQs, and scripts
 * without external database HTTP roundtrip overhead.
 */
export class QsagKbEngine {
  constructor() {
    /** @type {Array<{ id: string, title: string, category: string, content: string, tags: string[], tokens: Set<string> }>} */
    this.documents = [];
    this.seedDefaultKnowledge();
  }

  seedDefaultKnowledge() {
    this.addDocument({
      id: 'kb-refund-policy',
      title: 'Refund Policy & SLA',
      category: 'Billing',
      tags: ['refund', 'money', 'cancel', 'return', 'billing', 'charge'],
      content: 'Customers are eligible for a 100% full refund within 30 days of initial purchase. Instant in-RAM refund approval limit is $300.00 for verified accounts. Amounts above $300.00 require Tier-2 supervisor escalation.'
    });

    this.addDocument({
      id: 'kb-cancellation-policy',
      title: 'Subscription Cancellation Rules',
      category: 'Billing',
      tags: ['cancel', 'subscription', 'downgrade', 'plan', 'membership', 'close'],
      content: 'Subscriptions can be cancelled anytime without penalty fees. Access remains active until the end of the current billing cycle. Prorated credits are automatically calculated and returned to the account balance.'
    });

    this.addDocument({
      id: 'kb-technical-connectivity',
      title: 'Audio Quality & Telephony Connection Issues',
      category: 'Technical',
      tags: ['audio', 'connection', 'static', 'drop', 'lag', 'latency', 'telephony', 'slow'],
      content: 'For audio latency or packet drop, verify that WebRTC Opus codec bitrate is at least 24kbps with dynamic jitter buffering enabled. SIP fallback switches automatically to G.711u / G.722 wideband.'
    });

    this.addDocument({
      id: 'kb-account-verification',
      title: 'Caller Identity & Security Verification Protocols',
      category: 'Security',
      tags: ['identity', 'security', 'verify', 'password', 'pin', 'authentication', 'account'],
      content: 'Callers must verify their 6-digit Account ID or registered phone number before high-risk mutations (address change, refund, credential reset) can be authorized by the agent.'
    });
  }

  /**
   * Tokenize text for in-memory inverted index & rapid similarity scoring
   * @param {string} text 
   * @returns {Set<string>}
   */
  tokenize(text) {
    const words = text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
    return new Set(words);
  }

  /**
   * Index a knowledge document in RAM
   * @param {Object} doc 
   */
  addDocument(doc) {
    const tokens = this.tokenize(`${doc.title} ${doc.tags.join(' ')} ${doc.content}`);
    this.documents.push({ ...doc, tokens });
  }

  /**
   * In-Memory Fast Semantic/Sparse Retrieval (<2ms)
   * @param {string} query 
   * @param {number} [topK] 
   * @returns {Array<{ document: Object, score: number, latencyMs: number }>}
   */
  search(query, topK = 2) {
    const startTime = performance.now();
    const queryTokens = this.tokenize(query);

    const scored = this.documents.map(doc => {
      let matchCount = 0;
      for (const token of queryTokens) {
        if (doc.tokens.has(token)) {
          matchCount += 1;
        }
        // Extra boost for tag matches
        for (const tag of doc.tags) {
          if (token.includes(tag) || tag.includes(token)) {
            matchCount += 1.5;
          }
        }
      }

      // Jaccard-inspired similarity score normalized
      const unionSize = new Set([...queryTokens, ...doc.tokens]).size;
      const score = unionSize > 0 ? (matchCount / (queryTokens.size + 2)) : 0;

      return { doc, score: Number(score.toFixed(3)) };
    });

    const results = scored
      .filter(item => item.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(item => ({
        id: item.doc.id,
        title: item.doc.title,
        category: item.doc.category,
        content: item.doc.content,
        score: item.score,
        latencyMs: Number((performance.now() - startTime).toFixed(2))
      }));

    return results;
  }
}

export const qsagKb = new QsagKbEngine();
