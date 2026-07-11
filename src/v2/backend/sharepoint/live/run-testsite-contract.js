// run-testsite-contract.js — GATED runner for the live, NON-PRODUCTION test-site contract run.
//
// This is the controlled entry point for Phase-2 live execution. It is FAIL-CLOSED: it refuses
// to do anything unless an operator-supplied, GIT-IGNORED runtime config explicitly approves it,
// the target is clearly non-production (never legacy), and a runtime transport bootstrap is
// available. It NEVER commits config, NEVER targets legacy, NEVER creates Power Automate flows,
// and NEVER fakes a successful run. If anything required is missing it exits with clear
// instructions (see live/README.md and docs/STORE_CONTRACT_TEST_SITE_PLAN.md).
//
// Usage (operator, at runtime, with a git-ignored config):
//   node run-testsite-contract.js ./testsite.config.json
//
// No environment variables are read; config comes from a CLI path (or the default git-ignored file).

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, isAbsolute, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONFIG_PATH = join(HERE, 'testsite.config.json'); // git-ignored
export const DEFAULT_APP_AUTH_CONFIG_PATH = join(HERE, 'auth.config.local.json'); // git-ignored (D6, Loop 33)

export function loadConfig(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `Live runner refused: config not found at '${path}'. Copy testsite.config.example.json to a ` +
      'GIT-IGNORED testsite.config.json, set the approval flags, and provide a runtime transport. ' +
      'Real config must never be committed.');
  }
  return JSON.parse(raw);
}

const FORBIDDEN_TARGET_TOKENS = ['legacy', 'tracker', 'escalation-tracker', 'prod', 'production', 'onedrive'];
const NONPROD_LABEL = /^(test|sandbox|dev|nonprod|non-prod|qa|staging)/i;

/** Fail-closed gate. Throws unless EVERY safety + approval condition holds. */
export function assertSafe(cfg) {
  const problems = [];
  if (cfg.phase2Approved !== true) problems.push('phase2Approved must be true');
  if (cfg.nonProductionOnly !== true) problems.push('nonProductionOnly must be true');
  if (cfg.legacyWritebackAllowed !== false) problems.push('legacyWritebackAllowed must be false (no writeback to legacy)');
  if (cfg.powerAutomateAllowed !== false) problems.push('powerAutomateAllowed must be false (no Power Automate flows)');
  if (cfg.contractRunApproved !== true) problems.push('contractRunApproved must be true');

  const label = String(cfg.environmentLabel ?? '');
  if (!NONPROD_LABEL.test(label)) problems.push(`environmentLabel '${label}' is not a recognized non-production label`);
  if (/legacy|production/i.test(label)) problems.push(`environmentLabel must not contain legacy/production`);

  if (cfg.listPrefix !== 'Escalations_v2_') problems.push(`listPrefix must be 'Escalations_v2_'`);

  const siteRef = String(cfg.siteReferencePlaceholder ?? '');
  if (!siteRef || siteRef.includes('<') || /PLACEHOLDER/i.test(siteRef)) {
    problems.push('siteReferencePlaceholder is still a placeholder — supply the approved non-production test-site reference');
  }
  for (const tok of FORBIDDEN_TARGET_TOKENS) {
    if (siteRef.toLowerCase().includes(tok)) problems.push(`siteReferencePlaceholder contains forbidden token '${tok}' — refusing legacy/production/OneDrive target`);
  }

  if (problems.length) {
    throw new Error('FAIL-CLOSED: live runner rejected:\n - ' + problems.join('\n - '));
  }
}

/**
 * D6 app-auth opt-in (Loop 33): load the git-ignored auth.config.local.json if present.
 * Returns null when the file is absent (not opted in). A present-but-unparseable file
 * throws — an operator clearly ATTEMPTED to configure app-auth, so failing closed beats
 * silently ignoring it.
 */
export function loadAppAuthConfig(path = DEFAULT_APP_AUTH_CONFIG_PATH) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null; // no app-auth config — callers fall back to the operator transport path
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('FAIL-CLOSED: an app-auth config file exists but is not valid JSON — fix or remove it (git-ignored auth.config.local.json).');
  }
}

/**
 * Resolve the runtime transport. TWO explicit paths, both git-ignored-config gated:
 *   1. D6 APP-AUTH (Loop 33, preferred): auth.config.local.json exists with
 *      enableAppAuth=true and passes the fail-closed D6 validator → committed
 *      appAuthTransport with certificate app-only tokens. No operator token minting.
 *      An enabled-but-INVALID app-auth config throws — never silently skipped.
 *   2. OPERATOR TRANSPORT (pre-D6 path, kept): the git-ignored bootstrap module named by
 *      "transportModule". Used when app-auth is absent or explicitly disabled
 *      (enableAppAuth=false is the documented rollback to this path).
 */
export async function loadTransport(cfg) {
  const authPath = cfg.appAuthConfig
    ? (isAbsolute(cfg.appAuthConfig) ? cfg.appAuthConfig : resolve(HERE, cfg.appAuthConfig))
    : DEFAULT_APP_AUTH_CONFIG_PATH;
  const authCfg = loadAppAuthConfig(authPath);
  if (authCfg && authCfg.enableAppAuth === true) {
    const { validateD6AuthConfig } = await import('./d6AuthConfig.js');
    const res = validateD6AuthConfig(authCfg);
    if (!res.ok) {
      throw new Error('FAIL-CLOSED: app-auth config rejected:\n - ' + res.problems.join('\n - '));
    }
    // The auth config must target EXACTLY the approved test site from the runner config —
    // a mismatch means someone points app-auth at a different site: refuse.
    const norm = (s) => String(s ?? '').replace(/\/+$/, '').toLowerCase();
    if (norm(authCfg.siteScopeRef) !== norm(cfg.siteReferencePlaceholder)) {
      throw new Error('FAIL-CLOSED: app-auth siteScopeRef does not match the approved test-site reference in the runner config — refusing.');
    }
    const { createAppAuthTokenProvider } = await import('./appAuthTokenProvider.js');
    const { createAppAuthTransport } = await import('./appAuthTransport.js');
    const tokenProvider = createAppAuthTokenProvider(authCfg);
    console.log(`[auth] D6 app-auth ENABLED: certificate app-only tokens, ${authCfg.apiMode ?? 'graph'} api mode — no operator token minting, no interactive sign-in.`);
    return createAppAuthTransport({
      tokenProvider,
      siteUrl: String(authCfg.siteScopeRef),
      apiMode: authCfg.apiMode,
      hyperlinkWriteBehavior: authCfg.graphHyperlinkWriteBehavior,
      listPrefix: cfg.listPrefix,
    });
  }
  if (authCfg) {
    console.log('[auth] app-auth config present but enableAppAuth!=true (documented rollback) — using the operator transport path.');
  }
  const modRef = cfg.transportModule ?? cfg.transportModulePlaceholder;
  if (!modRef || String(modRef).includes('<')) {
    throw new Error(
      'Live runner refused: no runtime transport configured. Point "transportModule" at a ' +
      'GIT-IGNORED bootstrap that default-exports `createTransport(config)` returning an ' +
      'authenticated transport (real SDK + interactive auth). The committed code imports no SDK.');
  }
  const modPath = isAbsolute(modRef) ? modRef : resolve(HERE, modRef);
  let mod;
  try {
    mod = await import(pathToFileURL(modPath).href);
  } catch (e) {
    throw new Error(`Live runner refused: could not load transport bootstrap '${modPath}': ${e.message}`);
  }
  const factory = mod.createTransport ?? mod.default;
  if (typeof factory !== 'function') {
    throw new Error(`Transport bootstrap '${modPath}' must export createTransport(config) (or default).`);
  }
  return factory(cfg);
}

export async function main(argv = []) {
  const path = argv[2] ?? DEFAULT_CONFIG_PATH;
  const cfg = loadConfig(path);
  assertSafe(cfg);
  console.log('[gate] Safety + approvals passed (non-production, no legacy writeback, no Power Automate, contract run approved).');

  // Build the live client behind the same surface SharePointStore expects.
  const { SharePointLiveClient } = await import('./SharePointLiveClient.js');
  const { SharePointStore } = await import('../../../store/SharePointStore.js');
  const transport = await loadTransport(cfg); // throws clearly if missing — never faked
  const client = new SharePointLiveClient({ transport, siteRef: cfg.siteReferencePlaceholder });
  const store = new SharePointStore({ client });

  // Read-only connectivity smoke (proves the wrapper + transport are wired; mutates nothing).
  const depts = await store.listDepartments();
  const tags = await store.listTags();
  console.log(`[smoke] Connected to the non-production test site. departments=${depts.length} tags=${tags.length}`);

  // Full acceptance = the store contract run against this live client (D13/D16/D19). The contract
  // is a node:test suite; run it with the live makeStore factory per the documented plan:
  console.log('[next] Run the full store contract against the live client (see ' +
    'docs/STORE_CONTRACT_TEST_SITE_PLAN.md): wire makeStore = (seed) => new SharePointStore({ client }) ' +
    'and execute `node --test` on the live-contract test. The first all-green run is the acceptance gate.');
}

// Only execute when invoked directly — importing this module (e.g. in tests) has no side effects.
const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main(process.argv).catch((e) => { console.error(String(e.message ?? e)); process.exitCode = 1; });
}
