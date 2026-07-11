// D6 app-auth config validation (Loop 26) — FAIL-CLOSED, committed, pure.
//
// The future D6 auth model replaces operator token minting with a dedicated Entra app
// registration using CERTIFICATE-based app-only auth and Sites.Selected least-privilege
// scoping (see docs/D6_AUTH_APP_REGISTRATION_PLAN.md). The registration itself is a manual
// admin step; what CAN be committed safely is the validation contract for the operator's
// future git-ignored auth config — so when the admin work lands, the runtime refuses
// anything unsafe by construction.
//
// This module holds NO identifiers and performs NO auth. Rules:
//   * disabled (`enableAppAuth` !== true) is VALID and the default — nothing to validate;
//   * enabling requires certificate mode, a non-production label, and non-placeholder
//     REFERENCES (tenant/client/cert are referenced by id/path, never by secret value);
//   * secret-bearing keys and inline key material are always refused — even when disabled;
//   * production/legacy-looking values are always refused.

const PLACEHOLDER = /<[^>]*>|PLACEHOLDER/i;
const NONPROD_LABEL = /^(test|sandbox|dev|nonprod|non-prod|qa|staging)/i;
const FORBIDDEN_TARGET_TOKENS = ['legacy', 'tracker', 'escalation-tracker', 'prod', 'production', 'onedrive'];
// Secret-style keys are refused outright: D6 is certificate-based BY DESIGN (no client
// secrets), and no config may ever carry credential material inline.
const FORBIDDEN_KEYS = ['clientSecret', 'client_secret', 'secret', 'password', 'pwd', 'apiKey', 'api_key', 'accessToken', 'refreshToken'];
const INLINE_KEY_MATERIAL = /(BEGIN [A-Z ]*PRIVATE KEY|eyJ[A-Za-z0-9_-]{10,})/;

export const D6_AUTH_MODES = Object.freeze(['app-certificate']);

// Certificate-store reference: `store:CurrentUser/My/<40-hex-thumbprint>` (Loop 33).
// CurrentUser/My ONLY — the private key stays in the operator's Windows certificate store and
// is never exported to disk. LocalMachine (machine-wide) refs are refused by the shape check.
const CERT_STORE_REF = /^store:CurrentUser[\\/]My[\\/]([0-9A-Fa-f]{40})$/;

/**
 * Parse a `store:` certificate reference. Returns `{ storeLocation, storeName, thumbprint }`
 * or null when the ref is not a store reference at all. A malformed store ref (wrong store,
 * missing/short thumbprint) also returns null — validateD6AuthConfig reports the problem.
 */
export function parseCertificateStoreRef(ref) {
  const m = CERT_STORE_REF.exec(String(ref ?? ''));
  if (!m) return null;
  return { storeLocation: 'CurrentUser', storeName: 'My', thumbprint: m[1].toUpperCase() };
}

/**
 * Validate a (future) D6 auth config object. Never throws.
 * @returns {{ ok: boolean, enabled: boolean, problems: string[] }}
 */
export function validateD6AuthConfig(cfg) {
  const problems = [];
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return { ok: false, enabled: false, problems: ['config must be a JSON object'] };
  }

  // Universal refusals — apply even to a disabled config.
  for (const key of Object.keys(cfg)) {
    if (FORBIDDEN_KEYS.some((f) => key.toLowerCase() === f.toLowerCase())) {
      problems.push(`forbidden key '${key}' — D6 is certificate-based; secret-style credentials are never accepted`);
    }
  }
  const raw = JSON.stringify(cfg);
  if (INLINE_KEY_MATERIAL.test(raw)) {
    problems.push('inline key/token material detected — certificates are referenced by local path, never embedded');
  }

  const enabled = cfg.enableAppAuth === true;
  if (!enabled) {
    // Disabled is the safe default; a disabled config is valid unless it carries secrets.
    return { ok: problems.length === 0, enabled: false, problems };
  }

  // ----- enabling requires everything below -----
  if (!D6_AUTH_MODES.includes(cfg.authMode)) {
    problems.push(`authMode must be one of: ${D6_AUTH_MODES.join(', ')}`);
  }
  const label = String(cfg.environmentLabel ?? '');
  if (!NONPROD_LABEL.test(label)) problems.push(`environmentLabel '${label}' is not a recognized non-production label`);
  if (/legacy|production/i.test(label)) problems.push('environmentLabel must not contain legacy/production');

  for (const ref of ['tenantIdRef', 'clientIdRef', 'certificateRef', 'siteScopeRef']) {
    const v = String(cfg[ref] ?? '');
    if (!v) problems.push(`${ref} is required to enable app auth`);
    else if (PLACEHOLDER.test(v)) problems.push(`${ref} is still a placeholder — fill in the real reference at runtime (git-ignored) before enabling`);
  }
  // Certificate-store refs (Loop 33): if certificateRef opts into the `store:` scheme it must
  // be exactly CurrentUser/My + a full 40-hex thumbprint. Anything store-like that fails the
  // shape (LocalMachine, missing/short thumbprint, extra segments) is refused — never guessed.
  const certRef = String(cfg.certificateRef ?? '');
  if (/^store:/i.test(certRef) && !parseCertificateStoreRef(certRef)) {
    problems.push("certificateRef store reference must be exactly 'store:CurrentUser/My/<40-hex-thumbprint>' — CurrentUser/My only, full SHA-1 thumbprint required");
  }

  const scope = String(cfg.siteScopeRef ?? '').toLowerCase();
  for (const tok of FORBIDDEN_TARGET_TOKENS) {
    if (scope.includes(tok)) problems.push(`siteScopeRef contains forbidden token '${tok}' — legacy/production targets are refused`);
  }
  if (cfg.permissionModel !== 'Sites.Selected') {
    problems.push("permissionModel must be 'Sites.Selected' (least privilege; admin grants access to the single test site only)");
  }

  // Optional runtime-mode fields (Loop 33) — validated strictly when present. `apiMode`
  // selects the API surface ('graph' default; 'sharepoint-rest' needs the SharePoint-resource
  // Sites.Selected consent). `graphHyperlinkWriteBehavior` defaults to fail-closed 'refuse';
  // 'omit-and-report' is an explicit validation-run opt-in (omissions are counted + reported).
  if (cfg.apiMode !== undefined && !['graph', 'sharepoint-rest'].includes(cfg.apiMode)) {
    problems.push("apiMode, when set, must be 'graph' or 'sharepoint-rest'");
  }
  if (cfg.graphHyperlinkWriteBehavior !== undefined
    && !['refuse', 'omit-and-report'].includes(cfg.graphHyperlinkWriteBehavior)) {
    problems.push("graphHyperlinkWriteBehavior, when set, must be 'refuse' or 'omit-and-report'");
  }

  return { ok: problems.length === 0, enabled, problems };
}
