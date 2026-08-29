import assert from 'node:assert';
import crypto from 'node:crypto';

export const BASE_URL = process.env.BASE_URL || 'http://localhost:5020';

/**
 * Universal JSON HTTP Client for PIET In-RAM Testing
 */
export async function j(url, opts = {}) {
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {})
  };

  const res = await fetch(fullUrl, { ...opts, headers });

  let body = null;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return { res, body, headers: res.headers, status: res.status, ok: res.ok };
}

/**
 * Ephemeral Unique Nonce Generator
 */
export function uniqueId(prefix = 'piet') {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}
