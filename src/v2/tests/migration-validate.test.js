// Migration foundation — validation + safety-guard tests (Loop 32). Offline only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateLegacyExport } from '../tools/migration/validateLegacyExport.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const V2_ROOT = dirname(HERE);
const FIXTURE = join(HERE, 'fixtures', 'legacy-export.sample.json');
const raw = readFileSync(FIXTURE, 'utf8');

test('the fake sample export validates with informative warnings', () => {
  const res = validateLegacyExport(raw);
  assert.equal(res.ok, true, res.problems.join('; '));
  assert.equal(res.summary.itemCount, 6);
  assert.ok(res.warnings.some((w) => /unexpected status 'On Hold \(Legacy\)'/.test(w)));
  assert.ok(res.warnings.some((w) => /blank status/.test(w)));
  assert.ok(res.warnings.some((w) => /LegacyOddColumn/.test(w)), 'unknown fields surfaced for mapping rows');
});

test('REFUSES input containing JWT-like token material', () => {
  const dirty = raw.replace('"exportedAt"', '"stray": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJmYWtlIjoxfQ", "exportedAt"');
  const res = validateLegacyExport(dirty);
  assert.equal(res.ok, false);
  assert.ok(res.problems.some((p) => /JWT-like token/.test(p)));
});

test('REFUSES input containing private key material', () => {
  const res = validateLegacyExport('{"items":[],"x":"-----BEGIN RSA PRIVATE KEY----- fake"}');
  assert.equal(res.ok, false);
  assert.ok(res.problems.some((p) => /private key/.test(p)));
});

test('REFUSES input containing secret-style keys', () => {
  const res = validateLegacyExport('{"items":[],"clientSecret":"nope"}');
  assert.equal(res.ok, false);
  assert.ok(res.problems.some((p) => /secret-style key/.test(p)));
});

test('REFUSES any non-.invalid URL (foundation accepts clearly-fake data only)', () => {
  const dirty = raw.replace('https://legacy.example.invalid/lists/escalations/items/101', 'https://real-looking.example.com/items/101');
  const res = validateLegacyExport(dirty);
  assert.equal(res.ok, false);
  assert.ok(res.problems.some((p) => /non-\.invalid URL/.test(p)));
});

test('rejects malformed containers, duplicate ids, and items without fields', () => {
  assert.equal(validateLegacyExport('not json').ok, false);
  assert.equal(validateLegacyExport('{"noItems":true}').ok, false);
  const dup = JSON.parse(raw);
  dup.items = [dup.items[0], { ...dup.items[1], id: dup.items[0].id }];
  const res = validateLegacyExport(JSON.stringify(dup));
  assert.equal(res.ok, false);
  assert.ok(res.problems.some((p) => /duplicate id/.test(p)));
  const noFields = validateLegacyExport('{"items":[{"id":"1"}]}');
  assert.equal(noFields.ok, false);
});

test('the sample fixture is obviously fake: .invalid hosts/emails only, no GUIDs', () => {
  const urls = raw.match(/https?:\/\/[^\s"']+/g) ?? [];
  assert.ok(urls.length > 0);
  for (const u of urls) assert.match(u, /\.invalid/, `URL must be .invalid: ${u}`);
  const emails = raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g) ?? [];
  for (const e of emails) assert.match(e, /@[A-Za-z0-9.-]*example\.invalid$/, `email must be example.invalid: ${e}`);
  assert.doesNotMatch(raw, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'no GUIDs');
  assert.doesNotMatch(raw, /eyJ[A-Za-z0-9_-]{15,}/, 'no token material');
});

test('migration tools are offline by construction: no network/SharePoint/import code paths', () => {
  const dir = join(V2_ROOT, 'tools', 'migration');
  // Loop 36: the READ-ONLY legacy exporter pair is the ONLY exception — it may speak
  // HTTP GET to the (config-supplied) legacy list. It gets its own tailored scan below.
  const READONLY_EXPORTER_FILES = new Set(['exportLegacyListReadonly.js', 'run-legacy-readonly-export.js']);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    if (READONLY_EXPORTER_FILES.has(f)) continue;
    const src = readFileSync(join(dir, f), 'utf8');
    assert.doesNotMatch(src, /\bfetch\s*\(/, `${f}: no fetch`);
    assert.doesNotMatch(src, /XMLHttpRequest/, `${f}: no XHR`);
    assert.doesNotMatch(src, /from\s+['"](node:)?https?['"]/, `${f}: no http(s) module import`);
    assert.doesNotMatch(src, /graph\.microsoft\.com|\bsharepoint\.com|_api\/web/i, `${f}: no live endpoints`);
    assert.doesNotMatch(src, /SharePointStore|SharePointLiveClient|createTransport/, `${f}: no live-store wiring in the foundation`);
    assert.doesNotMatch(src, /process\.env/, `${f}: no env reads`);
  }
});

test('the read-only legacy exporter is GET-only by construction and identifier-free (Loop 36)', () => {
  const dir = join(V2_ROOT, 'tools', 'migration');
  for (const f of ['exportLegacyListReadonly.js', 'run-legacy-readonly-export.js']) {
    const src = readFileSync(join(dir, f), 'utf8');
    // No write capability of any kind toward SharePoint:
    assert.doesNotMatch(src, /method:\s*['"](POST|PATCH|PUT|DELETE|MERGE)/i, `${f}: no write verbs`);
    assert.doesNotMatch(src, /X-HTTP-Method/i, `${f}: no verb override`);
    // `__metadata` may appear in the READ-side noise-strip list; only forbid CONSTRUCTING
    // a verbose write payload (assignment/property form).
    assert.doesNotMatch(src, /__metadata\s*[:=]\s*\{/, `${f}: no write payload construction`);
    assert.doesNotMatch(src, /\$batch/i, `${f}: no batch (could smuggle writes)`);
    // No identifying values committed:
    assert.doesNotMatch(src, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, `${f}: no GUIDs`);
    assert.doesNotMatch(src, /\bsharepoint\.com|graph\.microsoft\.com|microsoftonline\.com/i, `${f}: no tenant/public hosts`);
    assert.doesNotMatch(src, /personal\/[a-z]/i, `${f}: no personal-site path literals`);
    assert.doesNotMatch(src, /process\.env/, `${f}: no env reads`);
    assert.doesNotMatch(src, /eyJ[A-Za-z0-9_-]{15,}/, `${f}: no token literals`);
  }
  // The exporter module's ONLY http verb is GET, and it never touches the filesystem.
  const mod = readFileSync(join(dir, 'exportLegacyListReadonly.js'), 'utf8');
  assert.match(mod, /method:\s*'GET'/, 'exporter declares GET explicitly');
  assert.doesNotMatch(mod, /writeFile|createWriteStream|appendFile/, 'exporter module performs no disk writes');
  assert.doesNotMatch(mod, /openAsBlob|arrayBuffer|\.body\b/, 'exporter never streams attachment binaries');
  // The runner writes ONLY into the git-ignored exports/ dir.
  const runner = readFileSync(join(dir, 'run-legacy-readonly-export.js'), 'utf8');
  assert.match(runner, /EXPORTS_DIR = join\(HERE, 'exports'\)/, 'runner output is pinned to exports/');
  assert.match(runner, /readOnlyApproved/, 'runner requires explicit read-only approval flag');
  for (const flag of ['--import', '--write', '--push', '--apply', '--execute', '--live', '--download']) {
    assert.ok(runner.includes(`'${flag}'`), `runner refusal list must include ${flag}`);
  }
  // Example config stays placeholder-only.
  const example = readFileSync(join(dir, 'legacy-export.config.example.json'), 'utf8');
  assert.equal(JSON.parse(example).readOnlyApproved, false, 'example must be fail-closed');
  assert.doesNotMatch(example, /https:\/\/[a-z0-9]/i, 'example carries no real URL');
});

test('the dry-run CLI refuses import-style flags by name', () => {
  const src = readFileSync(join(V2_ROOT, 'tools', 'migration', 'run-migration-dry-run.js'), 'utf8');
  for (const flag of ['--import', '--write', '--push', '--apply', '--execute', '--live']) {
    assert.ok(src.includes(`'${flag}'`), `refusal list must include ${flag}`);
  }
  assert.match(src, /REFUSED/, 'refusal path present');
});
