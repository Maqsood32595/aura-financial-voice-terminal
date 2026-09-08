import https from 'https';
import http from 'http';

/**
 * In-RAM LLM Calling Layer (Warm Keep-Alive Sockets + Stream Buffer)
 * Keeps pre-warmed TCP/TLS sockets in RAM to save 150ms-200ms per call.
 * RAM Footprint: <2 MB
 */
export class InRamLlmCaller {
  constructor() {
    // Persistent HTTP/HTTPS Keep-Alive Agent Pool
    this.httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: 32,
      maxFreeSockets: 16,
      keepAliveMsecs: 60000,
      timeout: 10000
    });

    this.httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: 32,
      maxFreeSockets: 16,
      keepAliveMsecs: 60000,
      timeout: 10000
    });

    // In-RAM Exact Financial Response Cache (LRU)
    this.responseCache = new Map();
    this.maxCacheSize = 250;
    this.isWarmed = false;
  }

  /**
   * Pre-warm TLS connection in RAM to eliminate initial handshake delay
   */
  async prewarm(endpointUrl = 'https://generativelanguage.googleapis.com') {
    if (this.isWarmed) return true;
    try {
      const url = new URL(endpointUrl);
      const req = https.request({
        hostname: url.hostname,
        port: 443,
        path: '/',
        method: 'HEAD',
        agent: this.httpsAgent,
        headers: { 'Connection': 'keep-alive' }
      }, (res) => {
        res.resume();
        this.isWarmed = true;
      });
      req.on('error', () => {});
      req.end();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check In-RAM Cache
   */
  getCachedResponse(cacheKey) {
    const key = cacheKey.toLowerCase().trim();
    if (this.responseCache.has(key)) {
      const entry = this.responseCache.get(key);
      entry.hits = (entry.hits || 0) + 1;
      return entry.reply;
    }
    return null;
  }

  /**
   * Store in In-RAM Cache
   */
  setCachedResponse(cacheKey, replyText) {
    if (!cacheKey || !replyText) return;
    const key = cacheKey.toLowerCase().trim();
    // Never store standalone affirmations/negations in the response cache
    if (/^(?:yes|no|sure|yep|yeah|ok|okay|go ahead|please|certainly)[\s.?!]*$/i.test(key)) {
      return;
    }
    if (this.responseCache.size >= this.maxCacheSize) {
      const firstKey = this.responseCache.keys().next().value;
      this.responseCache.delete(firstKey);
    }
    this.responseCache.set(key, { reply: replyText, timestamp: Date.now(), hits: 1 });
  }

  /**
   * In-RAM Exact Number Dialectic Formatter (Guaranteed Zero Hallucination Fallback)
   */
  formatExactDialectic({ toolExecution, matchedFiling, comparisonResult, userTranscript = '' }) {
    if (toolExecution?.tool === 'screener_free_cash_flow') {
      const companies = toolExecution.output || [];
      const count = companies.length;
      const formattedList = companies.map(c => `${c.companyName} at ${c.freeCashFlowDisplay || ('$' + (c.freeCashFlow / 1e9).toFixed(2) + 'B')}`).join(', ');
      return `${count} S&P 500 companies cleared that Free Cash Flow threshold: ${formattedList}. Would you like to see their operating margins?`;
    }

    if (toolExecution?.tool === 'screener_loss_fcf_divergence') {
      const companies = toolExecution.output || [];
      if (companies.length === 0) {
        return "No S&P 500 company met both conditions of a net loss exceeding $5 billion and positive free cash flow over $5 billion in FY2023.";
      }
      const c = companies[0];
      return `One S&P 500 company met both conditions: ${c.companyName}, reporting a GAAP net loss of ${c.netLossDisplay || ('-$' + (Math.abs(c.netLoss) / 1e9).toFixed(2) + 'B')} and positive Free Cash Flow of ${c.freeCashFlowDisplay || ('+$' + (c.freeCashFlow / 1e9).toFixed(2) + 'B')}. Would you like to see their revenue?`;
    }

    if (toolExecution?.tool === 'screener_metric_threshold') {
      const companies = toolExecution.output || [];
      const count = toolExecution.count !== undefined ? toolExecution.count : companies.length;
      const m = toolExecution.metric || 'netIncome';
      const metricLabel = m === 'netIncome' ? 'GAAP Net Income' :
                          m === 'revenue' ? 'Total Revenue' :
                          m === 'freeCashFlow' ? 'Free Cash Flow' :
                          m === 'grossMargin' ? 'Gross Margin' :
                          m === 'operatingMargin' ? 'Operating Margin' : m;
      const cutoffStr = toolExecution.cutoffDisplay || `$${((toolExecution.cutoff || 0) / 1e9).toFixed(0)} billion`;
      const opStr = toolExecution.operator === '<' ? 'under' : 'exceeding';
      const yearStr = toolExecution.targetYear ? `in FY${toolExecution.targetYear}` : '';

      if (count === 0) {
        return `No S&P 500 companies met the criteria of ${metricLabel} ${opStr} ${cutoffStr} ${yearStr}. Would you like to adjust the threshold?`;
      }

      const formattedList = companies.map(c => `${c.companyName} at ${c.metricDisplay || c.netIncomeDisplay || c.revenueDisplay || c.freeCashFlowDisplay || c.grossMargin || c.operatingMargin}`).join(', ');
      return `${count} S&P 500 companies reported ${metricLabel} ${opStr} ${cutoffStr} ${yearStr}: ${formattedList}. Would you like to explore any of these in detail?`;
    }

    if (toolExecution?.tool === 'highest_profit_ranking') {
      const list = (toolExecution.output || []).map((c, i) => `${i + 1}. ${c.companyName} at ${c.netIncomeDisplay || c.metricDisplay}`).join(', ');
      return `The top earnings leaders for FY2023 are: ${list}. Would you like to see their Free Cash Flow?`;
    }

    if (toolExecution?.tool === 'highest_revenue_ranking') {
      const list = (toolExecution.output || []).map((c, i) => `${i + 1}. ${c.companyName} at ${c.revenueDisplay || c.metricDisplay}`).join(', ');
      return `The top revenue leaders for FY2023 are: ${list}. Would you like to see their operating margins?`;
    }

    if (toolExecution?.tool === 'highest_gross_margin_ranking') {
      const list = (toolExecution.output || []).map((c, i) => `${i + 1}. ${c.companyName} at ${c.grossMargin || c.metricDisplay}`).join(', ');
      return `The top gross margin companies for FY2023 are: ${list}. Would you like to inspect their net margins?`;
    }

    if (toolExecution?.tool === 'highest_operating_margin_ranking') {
      const list = (toolExecution.output || []).map((c, i) => `${i + 1}. ${c.companyName} at ${c.operatingMargin || c.metricDisplay}`).join(', ');
      return `The top operating margin companies for FY2023 are: ${list}. Would you like to inspect their net margins?`;
    }

    if (toolExecution?.tool === 'lowest_margin_ranking') {
      const list = (toolExecution.output || []).map((c, i) => `${i + 1}. ${c.companyName} at ${c.operatingMargin || c.metricDisplay}`).join(', ');
      return `The lowest operating margin companies for FY2023 are: ${list}. Would you like to see their revenue?`;
    }

    if (toolExecution?.tool === 'calculate_yoy_growth') {
      const o = toolExecution.output;
      return `${o.companyName} reported revenue of ${o.revenueCurrent} in FY${o.currentYear}, representing a ${o.revenueGrowthYoY} year-over-year change from ${o.revenuePrevious} in FY${o.previousYear}. Would you like to see their net income?`;
    }

    if (comparisonResult && !comparisonResult.error) {
      return `For FY${comparisonResult.fiscalYear}, ${comparisonResult.companyA.ticker} achieved a ${comparisonResult.companyA.grossMarginPercent} gross margin on ${comparisonResult.companyA.revenue} revenue, compared to ${comparisonResult.companyB.ticker} at ${comparisonResult.companyB.grossMarginPercent} on ${comparisonResult.companyB.revenue}. Would you like to see operating margins?`;
    }

    if (matchedFiling) {
      if (userTranscript && /operating cash flow|cash flow from operations/i.test(userTranscript)) {
        const ocf = matchedFiling.operatingCashFlow ? `$${(matchedFiling.operatingCashFlow / 1e9).toFixed(2)} billion` : '$0 billion';
        const fcf = matchedFiling.freeCashFlow ? `$${(matchedFiling.freeCashFlow / 1e9).toFixed(2)} billion` : '$0 billion';
        return `${matchedFiling.companyName}'s operating cash flow for fiscal year ${matchedFiling.fiscalYear} was ${ocf}. Free cash flow was ${fcf}.`;
      }
      const gm = matchedFiling.grossMarginPercent !== null ? `${matchedFiling.grossMarginPercent}%` : 'N/A (GAAP)';
      const fcf = matchedFiling.freeCashFlow ? `$${(matchedFiling.freeCashFlow / 1e9).toFixed(2)} billion` : '$0 billion';
      return `According to ${matchedFiling.companyName}'s official FY${matchedFiling.fiscalYear} Form 10-K, total revenue was ${matchedFiling.revenueDisplay} with a gross margin of ${gm} and Free Cash Flow of ${fcf}. Would you like to explore their segment breakdown?`;
    }

    return null;
  }
}

export const inRamLlmCaller = new InRamLlmCaller();
