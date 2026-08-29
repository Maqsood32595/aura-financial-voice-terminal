/**
 * Billing Service & Pre-Flight Policy Validators
 */

// Max single refund limit allowed without supervisor elevation
const MAX_INSTANT_REFUND_USD = 300.00;

/**
 * VSAP Pre-flight validator for refunds
 */
export function validateRefund(params, session) {
  const amount = Number(params.amount);
  if (isNaN(amount) || amount <= 0) {
    return { valid: false, error: 'Invalid refund amount. Amount must be a positive number.' };
  }

  if (amount > MAX_INSTANT_REFUND_USD) {
    return {
      valid: false,
      error: `Refund of $${amount.toFixed(2)} exceeds instant in-RAM limit of $${MAX_INSTANT_REFUND_USD.toFixed(2)}. Requires Tier-2 escalation.`
    };
  }

  return { valid: true, sanitized: { amount } };
}

/**
 * Execute atomic refund
 */
export async function processRefund(params, session) {
  const amount = Number(params.amount);
  // Atomic In-RAM state mutation
  session.caller.balance += amount;
  return {
    success: true,
    transactionId: `tx-ref-${Date.now().toString(36)}`,
    amountRefunded: amount,
    newBalance: session.caller.balance,
    processedAt: new Date().toISOString()
  };
}

/**
 * VSAP Pre-flight validator for cancellations
 */
export function validateCancellation(params, session) {
  if (!session || !session.caller) {
    return { valid: false, error: 'No active authenticated session found.' };
  }
  return { valid: true, sanitized: { reason: params.reason || 'User request' } };
}

/**
 * Execute subscription cancellation
 */
export async function cancelSubscription(params, session) {
  session.caller.tier = `${session.caller.tier} (Pending Cancellation)`;
  return {
    success: true,
    effectiveDate: 'End of current billing cycle',
    tierStatus: session.caller.tier
  };
}
