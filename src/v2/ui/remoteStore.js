// RemoteStore — browser-side EscalationStore that talks ONLY to the local UI server's
// loopback /api/store endpoints (Loop 23). SAME-ORIGIN, RELATIVE-PATH fetches only: this is
// the single UI file allowed to call fetch, and every call targets a literal '/api/...'
// path — never an absolute URL, never a third-party host. The safety scans enforce this.
//
// The server side (ui/serve.js + ui/liveBackendGate.js) holds the actual SharePoint client,
// git-ignored runtime config, and token — nothing sensitive ever reaches the browser. If the
// server has not been explicitly opted in to the SharePoint TEST backend, connect() throws
// and the UI shows a visible error instead of silently falling back.

import { EscalationStore } from '../store/EscalationStore.js';
import { STORE_METHODS } from './liveBackendGate.js';

async function readJson(res) {
  try { return await res.json(); } catch { return {}; }
}

/** Ask the local server whether the SharePoint test backend is enabled (fail-closed). */
export async function fetchBackendStatus() {
  const res = await fetch('/api/store/status');
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error ?? `backend status unavailable (${res.status})`);
  return data;
}

async function callStore(method, args) {
  const res = await fetch('/api/store/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, args }),
  });
  const data = await readJson(res);
  // Business-rule rejections (e.g. requester-only Complete) arrive as {error} with a 4xx —
  // rethrow with the original message so the UI behaves exactly as it does with MockStore.
  if (!res.ok) throw new Error(data.error ?? `store call ${method} failed (${res.status})`);
  return data.result;
}

export class RemoteStore extends EscalationStore {}
for (const method of STORE_METHODS) {
  RemoteStore.prototype[method] = async function (...args) { return callStore(method, args); };
}

/**
 * Connect to the opt-in SharePoint TEST backend. Throws (fail-closed, visible to the user)
 * when the server-side gate is disabled — the UI must NOT silently fall back to mock data
 * when the user explicitly asked for the test backend.
 */
export async function connectRemoteStore() {
  const status = await fetchBackendStatus();
  if (status.enabled !== true) {
    throw new Error(status.reason ?? 'SharePoint test backend is not enabled on the local UI server.');
  }
  return { store: new RemoteStore(), status };
}
