// run-legacy-readonly-export — GATED CLI for the READ-ONLY full legacy export (Loop 36).
//
// Everything identifying lives in a GIT-IGNORED local config; this file is committed and
// carries no site URL, tenant id, token, or path. Output goes ONLY to the git-ignored
// exports/ folder as *.local.json files. GET-only by construction (see
// exportLegacyListReadonly.js). No import capability exists here.
//
//   cd src/v2
//   node tools/migration/run-legacy-readonly-export.js
//
// Config (git-ignored): tools/migration/legacy-export.config.local.json — copy
// legacy-export.config.example.json and fill the real values locally.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, isAbsolute, resolve } from 'node:path';

import { createReadonlyLegacyExporter } from './exportLegacyListReadonly.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(HERE, 'legacy-export.config.local.json'); // git-ignored (*.local.*)
const EXPORTS_DIR = join(HERE, 'exports'); // git-ignored (exports/)

// No import/write capability exists; refuse the flags BY NAME (house convention).
const REFUSED_FLAGS = ['--import', '--write', '--push', '--apply', '--execute', '--live', '--download'];

export function loadRunnerConfig(path = CONFIG_PATH) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      'REFUSED: no git-ignored legacy-export.config.local.json found. Copy '
      + 'legacy-export.config.example.json, fill the real site/list/auth values LOCALLY, '
      + 'and set readOnlyApproved=true. Nothing identifying is ever committed.');
  }
  const cfg = JSON.parse(raw);
  const problems = [];
  if (cfg.readOnlyApproved !== true) problems.push('readOnlyApproved must be true (explicit read-only run approval)');
  const site = String(cfg.siteUrl ?? '');
  if (!/^https:\/\//.test(site) || /</.test(site)) problems.push('siteUrl must be the real https legacy site url (local config only)');
  if (!cfg.listTitle || /</.test(String(cfg.listTitle))) problems.push('listTitle is required');
  const mode = cfg.auth?.mode;
  if (!['app-certificate', 'token-file'].includes(mode)) problems.push("auth.mode must be 'app-certificate' or 'token-file'");
  if (problems.length) throw new Error('REFUSED (fail-closed):\n - ' + problems.join('\n - '));
  return cfg;
}

/** Build a getToken() for the configured auth mode. Tokens are never logged. */
export async function buildTokenProvider(cfg) {
  if (cfg.auth.mode === 'app-certificate') {
    const ref = cfg.auth.appAuthConfig ?? '../../backend/sharepoint/live/auth.config.local.json';
    const path = isAbsolute(ref) ? ref : resolve(HERE, ref);
    const authCfg = JSON.parse(readFileSync(path, 'utf8'));
    const { createAppAuthTokenProvider } = await import('../../backend/sharepoint/live/appAuthTokenProvider.js');
    // Point the provider's SharePoint audience at the LEGACY site host (read-only export
    // target). Access still requires an admin-granted Sites.Selected permission on that
    // site — without it, SharePoint refuses with 403 and this runner reports it.
    const provider = createAppAuthTokenProvider({ ...authCfg, siteScopeRef: cfg.siteUrl });
    return (opts) => provider.getToken('sharepoint', opts);
  }
  // token-file: an operator pre-mints a delegated token into a git-ignored file.
  const tokenPath = isAbsolute(cfg.auth.tokenFile ?? '') ? cfg.auth.tokenFile : resolve(HERE, cfg.auth.tokenFile ?? './exports/legacy-token.local.txt');
  return () => {
    const t = readFileSync(tokenPath, 'utf8').trim();
    if (!/^eyJ/.test(t)) throw new Error('token-file does not contain a bearer token');
    const payload = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8'));
    const host = new URL(cfg.siteUrl).host;
    if (!String(payload.aud ?? '').includes(host) && !String(payload.aud ?? '').includes('0ff1-ce00')) {
      throw new Error('token-file audience does not match the legacy site host — mint it against the LEGACY site');
    }
    if ((payload.exp ?? 0) * 1000 < Date.now() + 120000) throw new Error('token-file is expired (or expires in <2min) — re-mint it');
    return t;
  };
}

export async function main(argv = process.argv) {
  for (const a of argv.slice(2)) {
    if (REFUSED_FLAGS.includes(a)) throw new Error(`REFUSED: '${a}' — this tool is READ-ONLY export; it has no write/import/download capability.`);
    if (/^https?:\/\//i.test(a)) throw new Error('REFUSED: URL arguments are not accepted — configuration lives in the git-ignored local config.');
  }
  const cfg = loadRunnerConfig();
  console.log('[mode] READ-ONLY legacy export — GET requests only; attachment METADATA only (no binaries); raw output stays in the git-ignored exports/ folder.');

  const getToken = await buildTokenProvider(cfg);
  const exporter = createReadonlyLegacyExporter({
    siteUrl: cfg.siteUrl, listTitle: cfg.listTitle, getToken, log: (m) => console.log(m),
  });
  const result = await exporter.exportAll({ fetchAttachmentSizes: cfg.fetchAttachmentSizes === true });

  mkdirSync(EXPORTS_DIR, { recursive: true });
  const out = (name, data) => {
    const p = join(EXPORTS_DIR, name);
    writeFileSync(p, JSON.stringify(data, null, 2));
    console.log(`[out] ${name} written LOCALLY (git-ignored; never commit)`);
  };
  // Analyzer-compatible container shape ({ items: [{ id, fields, ... }] }).
  out('legacy-full-export.local.json', { exportedAt: result.summary.exportedAt, source: { siteUrl: cfg.siteUrl, listTitle: cfg.listTitle }, items: result.items, users: result.users });
  out('legacy-attachment-inventory.local.json', result.attachmentInventory);
  out('legacy-schema-snapshot.local.json', result.schema);
  out('legacy-export-summary.local.json', result.summary);

  console.log(`[done] items=${result.summary.itemCount} ids=${result.summary.idMin}..${result.summary.idMax} `
    + `itemsWithAttachments=${result.summary.itemsWithAttachments} attachmentFiles=${result.summary.attachmentFileCount} `
    + `schemaFields=${result.summary.schemaFieldCount} writesPerformed=${result.summary.writesPerformed}`);
  return result.summary;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main().catch((e) => { console.error(String(e.message ?? e)); process.exitCode = 1; });
}
