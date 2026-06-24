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

// ----- run -----
console.log('Escalation v2 — local readiness validation (mock/local only)\n');
runTests();
scanProduction();
scanNetwork();
scanLegacyDomain();
scanLegacyWriteBack();
scanServerLoopback();
checkSharePointSchema();

let allOk = true;
for (const r of results) {
  const mark = r.ok ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${r.label}${r.detail ? `  — ${r.detail}` : ''}`);
  if (!r.ok) allOk = false;
}
console.log(`\n${allOk ? 'READY: all checks passed (mock/local only).' : 'NOT READY: see failures above.'}`);
process.exit(allOk ? 0 : 1);
