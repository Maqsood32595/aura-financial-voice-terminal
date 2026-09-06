/**
 * Financial Dialogue State Machine
 */
export const FinancialState = {
  GREETING: 'GREETING',
  COMPANY_INQUIRY: 'COMPANY_INQUIRY',
  METRIC_ANALYSIS: 'METRIC_ANALYSIS',
  CROSS_COMPARISON: 'CROSS_COMPARISON',
  SEGMENT_DRILLDOWN: 'SEGMENT_DRILLDOWN',
  AUDIT_EXPORT: 'AUDIT_EXPORT',
  CLOSING: 'CLOSING'
};

export class FinancialFSM {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.currentState = FinancialState.GREETING;
    this.stateHistory = [
      { state: FinancialState.GREETING, timestamp: new Date().toISOString(), reason: 'Session Initialized' }
    ];
  }

  transition(newState, reason = '') {
    if (this.currentState === newState) return;
    this.currentState = newState;
    this.stateHistory.push({
      state: newState,
      timestamp: new Date().toISOString(),
      reason
    });
  }
}
