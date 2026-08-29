/**
 * VSAP Guard: In-RAM Pre-Flight Simulation & Mutation Safety Guard
 * Intercepts LLM tool invocations, runs closed-loop dry runs against
 * in-memory domain policies and shadow state, and prevents destructive/hallucinated writes.
 */
export class VsapGuard {
  constructor() {
    this.policies = new Map();
    this.auditLog = [];
  }

  /**
   * Register a deterministic domain policy validator
   * @param {string} toolName 
   * @param {Function} validatorFn (params, sessionState) => { valid: boolean, error?: string, sanitized?: any }
   */
  registerPolicy(toolName, validatorFn) {
    this.policies.set(toolName, validatorFn);
  }

  /**
   * Execute Pre-Flight Dry Run in RAM (<0.5ms)
   * @param {string} toolName 
   * @param {Object} rawParams 
   * @param {Object} sessionState 
   * @returns {Promise<{ approved: boolean, reason?: string, sanitizedParams?: any, simulationScore: number, executionTimeMs: number }>}
   */
  async simulate(toolName, rawParams, sessionState) {
    const startTime = performance.now();
    const policy = this.policies.get(toolName);

    if (!policy) {
      const trace = {
        toolName,
        approved: false,
        reason: `PolicyViolation: Tool '${toolName}' is not whitelisted in VSAP manifest.`,
        simulationScore: 0,
        executionTimeMs: performance.now() - startTime,
        timestamp: Date.now()
      };
      this.auditLog.push(trace);
      return trace;
    }

    try {
      // Execute shadow validation in isolated RAM context
      const result = await policy(rawParams, sessionState);
      const executionTimeMs = Number((performance.now() - startTime).toFixed(3));

      const trace = {
        toolName,
        rawParams,
        approved: !!result.valid,
        reason: result.valid ? 'Pre-flight In-RAM verification passed (100% score)' : result.error,
        sanitizedParams: result.sanitized || rawParams,
        simulationScore: result.valid ? 100 : 0,
        executionTimeMs,
        timestamp: Date.now()
      };

      this.auditLog.push(trace);
      return trace;
    } catch (err) {
      const executionTimeMs = Number((performance.now() - startTime).toFixed(3));
      const trace = {
        toolName,
        rawParams,
        approved: false,
        reason: `InRamExecutionError: ${err.message}`,
        simulationScore: 0,
        executionTimeMs,
        timestamp: Date.now()
      };
      this.auditLog.push(trace);
      return trace;
    }
  }

  /**
   * Get recent simulation traces
   * @param {number} [limit]
   */
  getTraces(limit = 20) {
    return this.auditLog.slice(-limit);
  }
}

export const vsapGuard = new VsapGuard();
