// Live-backend gate for the v2 UI server (Loop 23) — FAIL-CLOSED, dependency-injected.
//
// Decides whether serve.js may enable the OPT-IN SharePoint TEST backend behind its
// loopback-only /api/store endpoints. MockStore is the default; this gate only ever ENABLES
// anything when EVERY step passes:
//   1. the operator's git-ignored ui-live.local.json exists and parses;
//   2. it sets `enableSharePointTestBackend: true` (an explicit local opt-in — the presence
//      of other runtime files, e.g. testsite.config.json, is deliberately NOT enough);
//   3. the referenced git-ignored testsite config loads and PASSES the same fail-closed
//      safety gate the live contract runner uses (assertSafe: approvals, non-production
//      label, Escalations_v2_ list prefix, legacy/production target refusal);
//   4. the runtime transport loads and the store constructs.
// Any failure returns { enabled: false, reason } — it never throws, never half-enables, and
// NO live module is imported unless steps 1–2 pass (verified by tests via injected deps).
//
// This file is committed and contains NO site URL, client/tenant ID, secret, or SDK import.

/**
 * The EscalationStore surface exposed over the loopback /api/store/call endpoint (and
 * mirrored by ui/remoteStore.js). A strict whitelist: anything not listed is rejected.
 */
export const STORE_METHODS = Object.freeze([
  'getTicket', 'listTickets', 'createTicket',
  'assignDepartment', 'assignPerson', 'clearAssignee',
  'setStatus', 'setPriority', 'setAmount', 'addTag', 'removeTag',
  'listActivity', 'listComments', 'listNotes', 'addComment', 'addNote',
  'listAttachments', 'addAttachment', 'removeAttachment',
  'departmentQueue', 'myAssignedTickets',
  'listDepartments', 'listUsers', 'listTags',
]);

/** Default basename of the operator's git-ignored UI opt-in file (lives next to serve.js). */
export const UI_LIVE_CONFIG_BASENAME = 'ui-live.local.json';

/**
 * Sanitize an error message before it can reach the browser (Loop 26 demo hardening).
 * Gate/transport failures can embed local file paths, site URLs, GUID-shaped ids, or even
 * token material from underlying libraries — none of that belongs in UI copy. The message
 * stays actionable (the error CLASS is preserved); the specifics are redacted.
 */
export function sanitizeErrorMessage(message) {
  return String(message ?? '')
    .replace(/eyJ[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]+)*/g, '[redacted-token]')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[redacted-id]')
    .replace(/[A-Za-z]:[\\/][^\s'"`)]+/g, '[local-path]')
    .replace(/(^|[\s'"`(])(?:\/|\.\.?\/)[^\s'"`)]*(?:\/[^\s'"`)]*)+/g, '$1[local-path]');
}

/**
 * Evaluate the gate. All I/O and live-module access comes through `deps`, so tests can prove
 * fail-closed ordering (e.g. the transport is never loaded when the opt-in flag is absent).
 *
 * @param {object} deps
 * @param {() => string} deps.readUiLiveConfig  - returns the raw ui-live.local.json text; throw if absent.
 * @param {(relPath: string) => string} deps.resolveConfigPath - resolves the testsite config reference.
 * @param {() => Promise<{loadConfig: Function, assertSafe: Function, loadTransport: Function}>} deps.importRunner
 * @param {() => Promise<{SharePointLiveClient: Function}>} deps.importClient
 * @param {() => Promise<{SharePointStore: Function}>} deps.importStore
 * @returns {Promise<{enabled: boolean, reason?: string, store?: object, environmentLabel?: string, runNamespace?: string}>}
 */
export async function resolveLiveBackend(deps) {
  // Every reason string may end up in the browser banner — sanitize unconditionally.
  const disabled = (reason) => ({ enabled: false, reason: sanitizeErrorMessage(reason) });

  // 1. Opt-in file must exist and parse (git-ignored; never committed).
  let uiCfg;
  try {
    uiCfg = JSON.parse(deps.readUiLiveConfig());
  } catch (e) {
    return disabled(
      `SharePoint test backend disabled (default): no readable ${UI_LIVE_CONFIG_BASENAME} opt-in (${e.message ?? e}). MockStore remains the backend.`,
    );
  }

  // 2. Explicit opt-in flag — presence of runtime files alone must NOT enable live mode.
  if (uiCfg.enableSharePointTestBackend !== true) {
    return disabled(
      `SharePoint test backend disabled: ${UI_LIVE_CONFIG_BASENAME} does not set enableSharePointTestBackend=true. MockStore remains the backend.`,
    );
  }
  const testsiteRef = uiCfg.testsiteConfig;
  if (!testsiteRef || String(testsiteRef).includes('<')) {
    return disabled(
      `SharePoint test backend disabled: ${UI_LIVE_CONFIG_BASENAME} must point "testsiteConfig" at the git-ignored testsite config.`,
    );
  }

  // 3. Load the testsite config and run the SAME fail-closed safety gate as the live
  //    contract runner (approvals, non-production label, list prefix, legacy refusal).
  let runner;
  let cfg;
  try {
    runner = await deps.importRunner();
    cfg = runner.loadConfig(deps.resolveConfigPath(String(testsiteRef)));
    runner.assertSafe(cfg);
  } catch (e) {
    return disabled(`SharePoint test backend REFUSED (fail-closed safety gate): ${e.message ?? e}`);
  }

  // 4. Runtime transport + store. Any failure stays fail-closed.
  try {
    const transport = await runner.loadTransport(cfg);
    const { SharePointLiveClient } = await deps.importClient();
    const { SharePointStore } = await deps.importStore();
    const client = new SharePointLiveClient({ transport, siteRef: cfg.siteReferencePlaceholder });
    const store = new SharePointStore({
      client,
      retry: { maxAttempts: 5, baseDelayMs: 500, sleep: (ms) => new Promise((r) => setTimeout(r, ms || 500)) },
    });
    // Auth-mode LABEL only (Loop 33): 'app-auth-certificate' when loadTransport resolved the
    // D6 app-auth path (its transport self-describes), else the pre-D6 operator path.
    const authMode = (typeof transport.describe === 'function'
      && transport.describe()?.authMode === 'app-certificate')
      ? 'app-auth-certificate' : 'operator-token';
    // Status metadata only — NEVER the site reference, tenant/client id, thumbprint, or token.
    return {
      enabled: true,
      store,
      authMode,
      environmentLabel: String(cfg.environmentLabel ?? ''),
      runNamespace: String(cfg.runNamespace ?? ''),
    };
  } catch (e) {
    return disabled(`SharePoint test backend unavailable (transport/store init failed): ${e.message ?? e}`);
  }
}
