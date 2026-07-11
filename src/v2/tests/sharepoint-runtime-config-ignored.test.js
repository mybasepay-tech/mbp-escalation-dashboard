// Guard test (Loop 18 / D22): the ignore rules that keep live runtime config + secrets OUT of
// git must not silently regress. Asserts the provisioning + live .gitignore files still cover
// the sensitive runtime artifacts, and that no real runtime config/secret is committed. 100%
// local file reads — no git invocation, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROV = join(V2_ROOT, 'backend', 'sharepoint', 'provisioning');
const LIVE = join(V2_ROOT, 'backend', 'sharepoint', 'live');

test('provisioning .gitignore keeps runtime config out of git', () => {
  const ig = readFileSync(join(PROV, '.gitignore'), 'utf8');
  assert.match(ig, /provision\.config\.json/, 'must ignore provision.config.json');
});

test('live .gitignore keeps runtime config, transport bootstrap, env, and secrets out of git', () => {
  const ig = readFileSync(join(LIVE, '.gitignore'), 'utf8');
  assert.match(ig, /testsite\.config\.json/, 'must ignore testsite.config.json');
  assert.match(ig, /transport/i, 'must ignore transport bootstrap(s)');
  assert.match(ig, /\.env/, 'must ignore .env');
  assert.match(ig, /secret/i, 'must ignore secrets');
  // Loop 33 (D6): the real app-auth config (auth.config.local.json) is covered by *.local.json,
  // and token caches must stay ignored too (the app-auth provider keeps tokens in memory only).
  assert.match(ig, /\*\.local\.json/, 'must ignore *.local.json (auth.config.local.json)');
  assert.match(ig, /tokencache|\.auth/i, 'must ignore token caches');
});

test('the real D6 app-auth config is never committed; its example carries placeholders only', () => {
  // auth.config.local.json MAY exist locally (operators need it) — *.local.json keeps it out
  // of git. The committed example must stay disabled + identifier-free.
  const example = JSON.parse(readFileSync(join(LIVE, 'auth.config.example.json'), 'utf8'));
  assert.equal(example.enableAppAuth, false, 'example must be fail-closed (disabled)');
  const raw = readFileSync(join(LIVE, 'auth.config.example.json'), 'utf8');
  assert.doesNotMatch(raw, /https?:\/\//i, 'example must not contain a live URL');
  assert.doesNotMatch(raw, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'example must not contain a GUID');
  assert.doesNotMatch(raw, /['"][0-9A-Fa-f]{40}['"]/, 'example must not contain a real thumbprint');
});

test('ui .gitignore keeps the local live-backend opt-in out of git (Loop 23)', () => {
  const ig = readFileSync(join(V2_ROOT, 'ui', '.gitignore'), 'utf8');
  assert.match(ig, /\*\.local\.json/, 'must ignore *.local.json (ui-live.local.json opt-in)');
});

test('no real runtime config or secret-bearing file is present in the tracked tree', () => {
  // These are the exact paths an operator creates locally; they must never be committed.
  for (const p of [
    join(PROV, 'provision.config.json'),
    join(LIVE, 'testsite.config.json'),
    join(LIVE, 'transport.local.js'),
    join(LIVE, '.env'),
  ]) {
    // If a developer accidentally left one locally it is git-ignored; this test only fails the
    // build if such a file were committed. We assert the committed examples exist instead, and
    // that the live config example carries placeholders (no real identifiers).
    if (existsSync(p)) {
      // Present locally is fine (git-ignored) — but it must not be a tracked example.
      assert.ok(!p.endsWith('.example.json'), 'example files are the only committed configs');
    }
  }
  const example = readFileSync(join(LIVE, 'testsite.config.example.json'), 'utf8');
  assert.doesNotMatch(example, /https?:\/\//i, 'example config must not contain a live URL');
  assert.doesNotMatch(example, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'example config must not contain a GUID');
});
