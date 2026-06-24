// Local readiness validator — `npm run validate`.
//
// Zero dependencies, local/mock only. Runs the full test suite AND an aggregate, tree-wide
// safety/readiness scan, then prints a readiness checklist. Exits non-zero on any failure.
// This makes no network/production calls — it only runs `node --test` and reads local files.

import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { validateSharePointSchema } from './validateSharePointSchema.js';

const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // .../src/v2
const SKIP_DIRS = new Set(['tests', 'scripts', 'node_modules', '.git']);
const SCAN_EXT = new Set(['.js', '.html', '.css', '.json']);

const results = []; // { ok, label, detail }
const record = (ok, label, detail = '') => results.push({ ok, label, detail });

// ----- 1. Run the test suite -----
function runTests() {
  const r = spawnSync(process.execPath, ['--test'], { cwd: V2_ROOT, encoding: 'utf8' });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const pass = (out.match(/ℹ pass (\d+)/) || [])[1] ?? '?';
  const fail = (out.match(/ℹ fail (\d+)/) || [])[1] ?? '?';
  const ok = r.status === 0;
  record(ok, `Test suite (node --test)`, `pass=${pass} fail=${fail}`);
  if (!ok) console.error(out.split('\n').filter((l) => /✖|not ok|Error/.test(l)).slice(0, 20).join('\n'));
}

// ----- file collection -----
function collectFiles(dirName) {
  const files = [];
  const walk = (abs) => {
    for (const entry of readdirSync(abs)) {
      if (SKIP_DIRS.has(entry)) continue;
      const p = join(abs, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (SCAN_EXT.has(p.slice(p.lastIndexOf('.')))) files.push(p);
    }
  };
  walk(join(V2_ROOT, dirName));
  return files;
}
function allSource() {
  // domain/store/mock/ui only — tests & scripts are excluded (they hold the patterns).
  return ['domain', 'store', 'mock', 'ui'].flatMap((d) => collectFiles(d));
}

// ----- 2. Production-integration scan -----
const PROD = [
  ['Microsoft Graph host', /graph\.microsoft\.com/i],
  ['SharePoint host', /\bsharepoint\.com/i],
  ['Azure AD login host', /login\.microsoftonline|microsoftonline\.com/i],
  ['Azure Functions host', /azurewebsites\.net/i],
  ['SharePoint REST path', /_api\/web/i],
  ['Power Automate', /powerautomate|flow\.microsoft/i],
  ['MSAL usage', /\bmsal\b|PublicClientApplication/i],
  ['OAuth scopes', /Sites\.ReadWrite\.All|Sites\.Read\.All/i],
  ['legacy client id', /c1b03319-1968-46f9-9922-589376ca272d/i],
  ['legacy tenant id', /e1a27c94-fb0c-4728-b71d-3766f21a3acb/i],
  ['auth header / bearer', /Authorization['"]?\s*:|Bearer\s+\$\{/],
];
function scanProduction() {
  const hits = [];
  for (const f of allSource()) {
    const text = readFileSync(f, 'utf8');
    for (const [name, re] of PROD) if (re.test(text)) hits.push(`${relative(V2_ROOT, f)} :: ${name}`);
  }
  record(hits.length === 0, 'No production-integration strings in mock code', hits.join('; '));
}

// ----- 3. No browser/network calls -----
function scanNetwork() {
  const hits = [];
  for (const f of allSource()) {
    const text = readFileSync(f, 'utf8');
    if (/\bfetch\s*\(/.test(text)) hits.push(`${relative(V2_ROOT, f)} :: fetch()`);
    if (/XMLHttpRequest/.test(text)) hits.push(`${relative(V2_ROOT, f)} :: XMLHttpRequest`);
  }
  record(hits.length === 0, 'No fetch/XMLHttpRequest network calls', hits.join('; '));
}

// ----- 4. Fake legacy domain only -----
function scanLegacyDomain() {
  const seed = readFileSync(join(V2_ROOT, 'mock', 'seed.js'), 'utf8');
  const usesInvalid = /\.invalid/.test(seed);
  const usesReal = /sharepoint\.com|graph\.microsoft/i.test(seed);
  record(usesInvalid && !usesReal, 'Mock legacy refs use a fake .invalid domain', usesInvalid ? '' : 'no .invalid found');
}

// ----- 5. No legacy write-back represented -----
function scanLegacyWriteBack() {
  const hits = [];
  const re = [/legacy\w*\.(write|update|patch|create|delete|save)/i, /writeBack|write_back/i, /(write|update|patch|delete)Legacy/i];
  for (const f of allSource()) {
    const text = readFileSync(f, 'utf8');
    for (const r of re) if (r.test(text)) hits.push(`${relative(V2_ROOT, f)} :: ${r}`);
  }
  record(hits.length === 0, 'No legacy write-back code represented', hits.join('; '));
}

// ----- 6. Local server stays loopback -----
function scanServerLoopback() {
  const serve = readFileSync(join(V2_ROOT, 'ui', 'serve.js'), 'utf8');
  record(/127\.0\.0\.1/.test(serve), 'Local UI server binds to loopback (127.0.0.1)');
}

// ----- 7. Design-only SharePoint v2 schema (local JSON; no network) -----
function checkSharePointSchema() {
  const { ok, problems, summary } = validateSharePointSchema();
  const detail = ok
    ? `lists=${summary.lists} requiredListsPresent=${summary.requiredListsPresent} ticketMappingsCovered=${summary.ticketMappingsCovered}`
    : problems.join('; ');
  record(ok, 'SharePoint v2 schema valid + design-only (no live markers)', detail);
}

// ----- 8. Future adapter stub stays design-only (no SDKs, no network, throws) -----
function checkAdapterStub() {
  const path = join(V2_ROOT, 'store', 'SharePointStore.js');
  const src = readFileSync(path, 'utf8');
  const problems = [];
  if (!/design-only and not connected/i.test(src)) problems.push('missing the design-only error message');
  const SDK = [
    /@microsoft\/microsoft-graph-client/i, /@pnp\/sp/i, /@azure\//i, /@microsoft\/sp-/i,
    /isomorphic-fetch|node-fetch|cross-fetch/i,
  ];
  for (const re of SDK) if (re.test(src)) problems.push(`live SDK import (${re})`);
  if (/\bfetch\s*\(/.test(src)) problems.push('fetch() call');
  if (/XMLHttpRequest/.test(src)) problems.push('XMLHttpRequest');
  if (/process\.env/.test(src)) problems.push('environment variable use');
  record(problems.length === 0, 'SharePointStore adapter is design-only (no SDK/network/secrets)', problems.join('; '));
}

// ----- 9. Transition governance docs (decision, parallel-run, guardrails, no-writeback) -----
function checkTransitionDocs() {
  const REPO_ROOT = dirname(dirname(V2_ROOT)); // .../mbp-escalation-dashboard
  const docs = join(REPO_ROOT, 'docs');
  const problems = [];
  const want = (rel, res) => {
    const p = join(docs, rel);
    let text;
    try { text = readFileSync(p, 'utf8'); } catch { problems.push(`${rel} missing`); return; }
    for (const [why, re] of res) if (!re.test(text)) problems.push(`${rel}: ${why}`);
  };
  want('DECISION_LOG.md', [
    ['D3 accepted as SharePoint v2', /SharePoint List v2 \/ Microsoft List v2/],
    ['D3 marked DECIDED', /### D3 —[\s\S]*?DECIDED/i],
    ['D14 parallel-run present', /### D14 —/],
    ['D15 writeback policy present', /### D15 —/],
  ]);
  want('PARALLEL_RUN_AND_CUTOVER_PLAN.md', [
    ['mentions parallel-run', /parallel[- ]run/i],
    ['mentions cutover', /cutover/i],
    ['mentions rollback', /rollback/i],
    ['prohibits legacy writeback', /\bno\b[\s\S]{0,40}writeback|writeback[\s\S]{0,40}\bno\b|no legacy writeback/i],
  ]);
  want('LEGACY_TO_V2_MAPPING_PLAN.md', [
    ['legacy read-only', /read-only/i],
    ['no writeback', /\bno\b[\s\S]{0,30}writeback/i],
  ]);
  want('AI_AUTONOMY_GUARDRAILS.md', [
    ['autonomous actions', /without approval|autonomous/i],
    ['approval-gated actions', /approval/i],
  ]);
  record(problems.length === 0, 'Transition governance docs present + consistent (D3/D14/D15, no legacy writeback)', problems.join('; '));
}

// ----- 10. Phase-2 readiness docs (runbook, adapter plan, contract test-site plan) -----
function checkPhase2Docs() {
  const REPO_ROOT = dirname(dirname(V2_ROOT));
  const docs = join(REPO_ROOT, 'docs');
  const problems = [];
  const want = (rel, res) => {
    const p = join(docs, rel);
    let text;
    try { text = readFileSync(p, 'utf8'); } catch { problems.push(`${rel} missing`); return; }
    for (const [why, re] of res) if (!re.test(text)) problems.push(`${rel}: ${why}`);
    // No live markers may appear in the Phase-2 docs.
    const LIVE = [
      ['Graph host', /graph\.microsoft\.com/i], ['SharePoint host', /\bsharepoint\.com/i],
      ['Azure host', /microsoftonline\.com|azurewebsites\.net/i], ['REST path', /_api\/web|\/v1\.0\/sites/i],
      ['GUID', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
      ['secret', /(client_secret|clientSecret|api[_-]?key)\s*[:=]/i], ['http URL', /https?:\/\/[a-z0-9.-]+/i],
    ];
    for (const [why, re] of LIVE) if (re.test(text)) problems.push(`${rel}: live marker (${why})`);
  };
  want('SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md', [
    ['requires D6', /\bD6\b/], ['requires D7', /\bD7\b/], ['requires Rod approval', /Rod approval/i],
    ['warns vs production', /do not run against production|not.*production/i],
    ['Power Automate deferred', /Power Automate (remains )?deferred|creates? no.*flows|no.*Power Automate/i],
  ]);
  want('SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md', [
    ['store contract gate', /store contract/i], ['no legacy writeback', /no.*writeback|D15/i],
  ]);
  want('STORE_CONTRACT_TEST_SITE_PLAN.md', [
    ['makeStore factory', /makeStore/i], ['first green run', /first green/i],
  ]);
  record(problems.length === 0, 'Phase-2 readiness docs present + design-only (D16 runbook/adapter/contract plans)', problems.join('; '));
}

// ----- 11. Local-first model + Phase-2 approval package (D17) -----
function checkLocalFirstDocs() {
  const REPO_ROOT = dirname(dirname(V2_ROOT));
  const docs = join(REPO_ROOT, 'docs');
  const problems = [];
  const want = (rel, res) => {
    const p = join(docs, rel);
    let text;
    try { text = readFileSync(p, 'utf8'); } catch { problems.push(`${rel} missing`); return; }
    for (const [why, re] of res) if (!re.test(text)) problems.push(`${rel}: ${why}`);
    const LIVE = [
      ['Graph host', /graph\.microsoft\.com/i], ['SharePoint host', /\bsharepoint\.com/i],
      ['Azure host', /microsoftonline\.com|azurewebsites\.net/i], ['REST path', /_api\/web|\/v1\.0\/sites/i],
      ['GUID', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
      ['secret', /(client_secret|clientSecret|api[_-]?key)\s*[:=]/i], ['http URL', /https?:\/\/[a-z0-9.-]+/i],
    ];
    for (const [why, re] of LIVE) if (re.test(text)) problems.push(`${rel}: live marker (${why})`);
  };
  want('LOCAL_FIRST_EXECUTION_MODEL.md', [
    ['names local work root', /C:\\dev\\mbp-escalation-dashboard/],
    ['OneDrive not backend', /OneDrive[\s\S]*?not\b[\s\S]{0,40}backend/i],
    ['future storage = v2 lists', /Escalations_v2_/],
    ['no legacy writeback', /no.*writeback|D15/i],
  ]);
  want('PHASE2_TEST_SITE_APPROVAL_REQUEST.md', [
    ['no production cutover', /no production cutover|no.*cutover/i],
    ['no Power Automate', /No Power Automate|Power Automate.*deferred/i],
    ['lists D6', /\bD6\b/], ['lists D7', /\bD7\b/],
  ]);
  want('ROD_PHASE2_APPROVAL_MESSAGE.md', [
    ['mentions test site', /test site/i], ['legacy untouched', /legacy[\s\S]{0,40}(untouched|as-is)/i],
  ]);
  record(problems.length === 0, 'Local-first model + Phase-2 approval package present (D17, OneDrive not backend)', problems.join('; '));
}

// ----- 12. SharePoint v2 provisioning package (config-driven, fail-closed, non-production) -----
function checkProvisioningPackage() {
  const dir = join(V2_ROOT, 'backend', 'sharepoint', 'provisioning');
  const problems = [];
  const files = [
    'provision-sharepoint-v2.ps1', 'validate-sharepoint-v2.ps1',
    'cleanup-sharepoint-v2-testsite.ps1', 'provisioning.common.ps1',
    'provision.config.example.json', 'README.md', 'provisioning-manifest.json', '.gitignore',
  ];
  const texts = {};
  for (const f of files) {
    const fp = join(dir, f);
    try { texts[f] = readFileSync(fp, 'utf8'); } catch { problems.push(`${f} missing`); }
  }
  // Real runtime config must never be committed.
  try { statSync(join(dir, 'provision.config.json')); problems.push('provision.config.json must NOT be committed'); } catch { /* good */ }

  const common = texts['provisioning.common.ps1'] || '';
  for (const [why, re] of [
    ['fail-closed gate', /Assert-SafeConfig/], ['phase2Approved gate', /phase2Approved/],
    ['nonProductionOnly gate', /nonProductionOnly/], ['no legacy writeback gate', /legacyWritebackAllowed/],
    ['no Power Automate gate', /powerAutomateAllowed/], ['references schema', /schema\.sharepoint-v2\.json/],
  ]) if (!re.test(common)) problems.push(`common helper: missing ${why}`);

  // Example config safe defaults.
  if (texts['provision.config.example.json']) {
    let cfg;
    try { cfg = JSON.parse(texts['provision.config.example.json']); } catch { problems.push('example config not valid JSON'); }
    if (cfg) {
      if (cfg.phase2Approved !== false) problems.push('example phase2Approved must be false');
      if (cfg.nonProductionOnly !== true) problems.push('example nonProductionOnly must be true');
      if (cfg.legacyWritebackAllowed !== false) problems.push('example legacyWritebackAllowed must be false');
      if (cfg.powerAutomateAllowed !== false) problems.push('example powerAutomateAllowed must be false');
      if (cfg.allowCleanup !== false) problems.push('example allowCleanup must be false');
    }
  }

  // No live markers in any tracked package file.
  const LIVE = [
    ['Graph host', /graph\.microsoft\.com/i], ['SharePoint host', /\bsharepoint\.com/i],
    ['Azure host', /microsoftonline\.com|azurewebsites\.net/i], ['REST path', /_api\/web|\/v1\.0\/sites/i],
    ['GUID', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
    ['secret', /(client_secret|clientSecret|api[_-]?key)\s*[:=]/i], ['http URL', /https?:\/\/[a-z0-9.-]+/i],
  ];
  for (const [f, text] of Object.entries(texts)) {
    for (const [why, re] of LIVE) if (re.test(text)) problems.push(`${f}: live marker (${why})`);
  }
  record(problems.length === 0, 'SharePoint v2 provisioning package config-driven + fail-closed (D18, no live markers)', problems.join('; '));
}

// ----- run -----
console.log('Escalation v2 — local readiness validation (mock/local only)\n');
runTests();
scanProduction();
scanNetwork();
scanLegacyDomain();
scanLegacyWriteBack();
scanServerLoopback();
checkSharePointSchema();
checkAdapterStub();
checkTransitionDocs();
checkPhase2Docs();
checkLocalFirstDocs();
checkProvisioningPackage();

let allOk = true;
for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${r.label}${r.detail ? `  — ${r.detail}` : ''}`);
  if (!r.ok) allOk = false;
}
console.log(`\n${allOk ? 'READY: all checks passed (mock/local only).' : 'NOT READY: see failures above.'}`);
process.exit(allOk ? 0 : 1);
