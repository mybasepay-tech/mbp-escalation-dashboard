// Live client + execution-gate governance tests (Loop 17 / D21).
//
// Verify the real SharePoint client wrapper and gated runner exist, are dependency-injected and
// fail-closed, commit no live identifiers/secrets/config, refuse legacy/production, and create no
// Power Automate / legacy-writeback paths. The wrapper is also runtime-tested to fail closed
// without an injected transport. 100% local; nothing live is executed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SharePointLiveClient, LiveNotConfiguredError } from '../backend/sharepoint/live/SharePointLiveClient.js';
import { assertSafe, loadConfig } from '../backend/sharepoint/live/run-testsite-contract.js';

const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LIVE = join(V2_ROOT, 'backend', 'sharepoint', 'live');
const p = (name) => join(LIVE, name);
const read = (name) => readFileSync(p(name), 'utf8');

const WRAPPER = 'SharePointLiveClient.js';
const RUNNER = 'run-testsite-contract.js';
const EXAMPLE = 'testsite.config.example.json';

test('live wrapper, runner, config example, and .gitignore exist', () => {
  for (const f of [WRAPPER, RUNNER, EXAMPLE, 'SharePointLiveErrors.js', 'README.md', '.gitignore']) {
    assert.ok(existsSync(p(f)), `${f} must exist`);
  }
});

test('live .gitignore protects real runtime config + secrets + transport bootstraps', () => {
  const ig = read('.gitignore');
  assert.match(ig, /testsite\.config\.json/, 'must ignore testsite.config.json');
  assert.match(ig, /\.env/, 'must ignore .env');
  assert.match(ig, /secret/i, 'must ignore secrets');
  assert.match(ig, /transport/i, 'must ignore transport bootstraps');
  assert.ok(!existsSync(p('testsite.config.json')), 'no real testsite.config.json may be committed');
});

test('example config has fail-closed defaults and placeholders only', () => {
  const cfg = JSON.parse(read(EXAMPLE));
  assert.equal(cfg.phase2Approved, false);
  assert.equal(cfg.contractRunApproved, false);
  assert.equal(cfg.nonProductionOnly, true);
  assert.equal(cfg.legacyWritebackAllowed, false);
  assert.equal(cfg.powerAutomateAllowed, false);
  assert.equal(cfg.listPrefix, 'Escalations_v2_');
  for (const k of ['environmentLabel', 'siteReferencePlaceholder', 'runNamespace', 'operatorNotes']) {
    assert.ok(k in cfg, `example must include ${k}`);
  }
});

test('committed live files contain no live URLs, tenant/client IDs, secrets, GUIDs, SDK imports, or env reads', () => {
  const FORBIDDEN = [
    ['http(s) URL', /https?:\/\/[a-z0-9.-]+/i],
    ['Graph host', /graph\.microsoft\.com/i],
    ['SharePoint host', /\bsharepoint\.com/i],
    ['Azure/login host', /microsoftonline\.com|azurewebsites\.net/i],
    ['REST path', /_api\/web|\/v1\.0\/sites|\/beta\/sites/i],
    ['GUID', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
    ['secret assignment', /(client_secret|clientSecret|api[_-]?key|password|pwd)\s*[:=]/i],
    ['SDK import', /@microsoft\/|@pnp\/|@azure\//],
    ['fetch()', /\bfetch\s*\(/],
    ['XMLHttpRequest', /XMLHttpRequest/],
    ['env read', /process\.env/],
  ];
  for (const f of readdirSync(LIVE).filter((n) => n.endsWith('.js') || n.endsWith('.json') || n.endsWith('.md'))) {
    const src = readFileSync(join(LIVE, f), 'utf8');
    for (const [why, re] of FORBIDDEN) assert.doesNotMatch(src, re, `${f} must not contain ${why}`);
  }
});

test('runner enforces production/legacy refusal + approval flags (fail-closed)', () => {
  const base = {
    environmentLabel: 'test', siteReferencePlaceholder: 'team-escalations-v2-test',
    phase2Approved: true, nonProductionOnly: true, legacyWritebackAllowed: false,
    powerAutomateAllowed: false, contractRunApproved: true, listPrefix: 'Escalations_v2_',
  };
  // A fully-approved, non-production config passes the gate.
  assert.doesNotThrow(() => assertSafe(base));
  // Each unsafe mutation must be rejected.
  assert.throws(() => assertSafe({ ...base, phase2Approved: false }), /phase2Approved/);
  assert.throws(() => assertSafe({ ...base, contractRunApproved: false }), /contractRunApproved/);
  assert.throws(() => assertSafe({ ...base, legacyWritebackAllowed: true }), /legacyWritebackAllowed/);
  assert.throws(() => assertSafe({ ...base, powerAutomateAllowed: true }), /powerAutomateAllowed/);
  assert.throws(() => assertSafe({ ...base, environmentLabel: 'production' }), /non-production|legacy\/production/i);
  assert.throws(() => assertSafe({ ...base, siteReferencePlaceholder: 'legacy-escalation-tracker' }), /legacy/i);
  assert.throws(() => assertSafe({ ...base, siteReferencePlaceholder: '<TEST_SITE_REFERENCE>' }), /placeholder/i);
  assert.throws(() => assertSafe({ ...base, listPrefix: 'Other_' }), /listPrefix/);
});

test('runner refuses to load a missing config (fail-closed)', () => {
  assert.throws(() => loadConfig(join(LIVE, 'does-not-exist.config.json')), /config not found/i);
});

test('live wrapper fails closed without an injected transport', () => {
  const client = new SharePointLiveClient(); // no transport
  assert.equal(client.designOnly, true);
  assert.throws(() => client.createItem('Escalations_v2_Tickets', {}), LiveNotConfiguredError);
  assert.throws(() => client.query('Escalations_v2_Tickets', {}), LiveNotConfiguredError);
  assert.throws(() => client.findBy('Escalations_v2_Tickets', {}), LiveNotConfiguredError);
});

test('live wrapper delegates to an injected transport and decodes Lookup/Person shapes', () => {
  const calls = [];
  const transport = {
    createItem: (list, fields) => { calls.push(['create', list]); return { id: '1', etag: 'W/"1"', fields }; },
    query: (list, opts) => { calls.push(['query', list]); return { items: [{ id: '1', etag: 'W/"1"', fields: { AssigneeKey: { LookupValue: 'user_sarah' }, OwnerPerson: { Key: 'user_teri' }, Title: 'T' } }], nextSkipToken: null }; },
  };
  const client = new SharePointLiveClient({ transport, siteRef: 'team-escalations-v2-test' });
  assert.equal(client.designOnly, false);
  client.createItem('Escalations_v2_Tickets', { Title: 'T' });
  const rec = client.findBy('Escalations_v2_Tickets', { Title: 'T' });
  assert.equal(rec.fields.AssigneeKey, 'user_sarah', 'Lookup object decoded to plain key');
  assert.equal(rec.fields.OwnerPerson, 'user_teri', 'Person object decoded to plain key');
  assert.equal(rec.fields.Title, 'T', 'scalar passes through');
  assert.ok(calls.some(([op]) => op === 'create') && calls.some(([op]) => op === 'query'));
});

test('no Power Automate creation or legacy-writeback paths in the live wrapper/runner', () => {
  for (const f of [WRAPPER, RUNNER, 'SharePointLiveErrors.js']) {
    const src = read(f);
    // Flow CREATION paths/hosts only — the `powerAutomateAllowed=false` guard flag is allowed.
    assert.doesNotMatch(src, /flow\.microsoft|powerautomate\.com|createFlow|New-Flow|Add-Flow/i, `${f}: no Power Automate creation path`);
    assert.doesNotMatch(src, /writeLegacy|legacy\.(write|update|patch|delete)|writeback\s*\(/i, `${f}: no legacy writeback`);
  }
});
