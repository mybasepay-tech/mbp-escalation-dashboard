// Safety tests — enforce Loop 3 hard rules by scanning the foundation source.
//
// Asserts that the v2 foundation contains NO production/live-integration strings and NO
// outbound network calls. The legacy single-file dashboard is out of scope and untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // .../src/v2

// Scan operational source only (exclude this tests/ dir, which legitimately names the
// forbidden patterns it is checking for).
const SCAN_DIRS = ['domain', 'store', 'mock'];
const SCAN_ROOT_FILES = ['README.md', 'package.json'];

function collectFiles() {
  const files = [];
  const walk = (abs) => {
    for (const entry of readdirSync(abs)) {
      const p = join(abs, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js') || p.endsWith('.json') || p.endsWith('.md')) files.push(p);
    }
  };
  for (const d of SCAN_DIRS) walk(join(V2_ROOT, d));
  for (const f of SCAN_ROOT_FILES) files.push(join(V2_ROOT, f));
  return files;
}

// Production / live-integration indicators that must never appear in the foundation.
const FORBIDDEN = [
  { name: 'Microsoft Graph host', re: /graph\.microsoft\.com/i },
  { name: 'SharePoint host', re: /\bsharepoint\.com/i },
  { name: 'Azure AD login host', re: /login\.microsoftonline|microsoftonline\.com/i },
  { name: 'Azure Functions host', re: /azurewebsites\.net/i },
  { name: 'SharePoint REST path', re: /_api\/web/i },
  { name: 'Power Automate', re: /powerautomate|flow\.microsoft/i },
  { name: 'MSAL usage', re: /\bmsal\b|PublicClientApplication/i },
  { name: 'Bearer token', re: /Bearer\s+\$\{|Authorization['"]?\s*:/i },
  { name: 'legacy client id', re: /c1b03319-1968-46f9-9922-589376ca272d/i },
  { name: 'legacy tenant id', re: /e1a27c94-fb0c-4728-b71d-3766f21a3acb/i },
  { name: 'OAuth scopes', re: /Sites\.ReadWrite\.All|Sites\.Read\.All/i },
  { name: 'outbound fetch', re: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', re: /XMLHttpRequest/ },
  { name: 'node http(s) import', re: /from\s+['"](node:)?https?['"]/ },
];

test('foundation source contains no production/live-integration strings or network calls', () => {
  const violations = [];
  for (const file of collectFiles()) {
    const text = readFileSync(file, 'utf8');
    for (const { name, re } of FORBIDDEN) {
      if (re.test(text)) violations.push(`${relative(V2_ROOT, file)} :: ${name}`);
    }
  }
  assert.deepEqual(violations, [], `Forbidden integration markers found:\n${violations.join('\n')}`);
});

test('mock legacy references use a clearly-fake .invalid domain (not a real host)', () => {
  const seed = readFileSync(join(V2_ROOT, 'mock', 'seed.js'), 'utf8');
  assert.match(seed, /legacy\.example\.invalid/, 'fake legacy url should use .invalid');
  assert.doesNotMatch(seed, /sharepoint\.com|graph\.microsoft/i, 'mock must not reference real hosts');
});
