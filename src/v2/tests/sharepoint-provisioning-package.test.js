// Provisioning-package governance tests (Loop 14).
//
// Assert the SharePoint v2 provisioning package exists, is config-driven + fail-closed, targets
// only a non-production test site, never targets/writes legacy, creates no Power Automate flows,
// and contains no live URLs/tenant IDs/client IDs/secrets/Graph endpoints in git. Local file
// reads only — no network, nothing executed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROV = join(V2_ROOT, 'backend', 'sharepoint', 'provisioning');
const p = (name) => join(PROV, name);
const read = (name) => readFileSync(p(name), 'utf8');

const PROVISION = 'provision-sharepoint-v2.ps1';
const VALIDATE = 'validate-sharepoint-v2.ps1';
const CLEANUP = 'cleanup-sharepoint-v2-testsite.ps1';
const COMMON = 'provisioning.common.ps1';
const EXAMPLE = 'provision.config.example.json';
const SCRIPTS = [PROVISION, VALIDATE, CLEANUP, COMMON];

test('provisioning directory + required files exist', () => {
  assert.ok(existsSync(PROV), 'provisioning directory must exist');
  for (const f of [PROVISION, VALIDATE, CLEANUP, COMMON, EXAMPLE, 'README.md', 'provisioning-manifest.json', '.gitignore']) {
    assert.ok(existsSync(p(f)), `${f} must exist`);
  }
});

test('scripts contain the required safety terms', () => {
  const blob = SCRIPTS.map(read).join('\n');
  for (const term of [/non-production/i, /phase2Approved/, /fail[- ]closed/i, /Power Automate/i, /writeback/i, /legacy/i]) {
    assert.match(blob, term, `provisioning scripts must reference ${term}`);
  }
  // Each mutating/validating script names the non-production + legacy guards itself.
  for (const f of [PROVISION, VALIDATE, CLEANUP]) {
    const doc = read(f);
    assert.match(doc, /non-production/i, `${f} must say non-production`);
    assert.match(doc, /legacy/i, `${f} must reference legacy non-interference`);
  }
});

test('scripts are config-driven, fail-closed, and reference the schema', () => {
  const common = read(COMMON);
  assert.match(common, /Assert-SafeConfig/, 'central safety gate must exist');
  assert.match(common, /phase2Approved/, 'gate checks phase2Approved');
  assert.match(common, /nonProductionOnly/, 'gate checks nonProductionOnly');
  assert.match(common, /legacyWritebackAllowed/, 'gate checks legacyWritebackAllowed');
  assert.match(common, /powerAutomateAllowed/, 'gate checks powerAutomateAllowed');
  assert.match(common, /schema\.sharepoint-v2\.json/, 'package must reference the schema file');
  // provision + validate + cleanup all load config and run the gate.
  for (const f of [PROVISION, VALIDATE, CLEANUP]) {
    const doc = read(f);
    assert.match(doc, /Import-ProvisionConfig/, `${f} must load config`);
    assert.match(doc, /Assert-SafeConfig/, `${f} must run the fail-closed gate`);
  }
});

test('scripts mention no Power Automate and no legacy writeback', () => {
  for (const f of SCRIPTS) {
    const doc = read(f);
    assert.match(doc, /Power Automate|powerAutomate/i, `${f} must address Power Automate`);
  }
  // The gate enforces both flags false.
  const common = read(COMMON);
  assert.match(common, /powerAutomateAllowed.*false|false.*powerAutomateAllowed/is);
  assert.match(common, /legacyWritebackAllowed.*false|false.*legacyWritebackAllowed/is);
});

test('cleanup requires an explicit allowCleanup gate', () => {
  const doc = read(CLEANUP);
  assert.match(doc, /allowCleanup/, 'cleanup must check allowCleanup');
  assert.match(doc, /Escalations_v2_/, 'cleanup only targets the approved prefix');
});

test('example config has safe, fail-closed defaults', () => {
  const cfg = JSON.parse(read(EXAMPLE));
  assert.equal(cfg.phase2Approved, false, 'example must default phase2Approved=false');
  assert.equal(cfg.nonProductionOnly, true);
  assert.equal(cfg.legacyWritebackAllowed, false);
  assert.equal(cfg.powerAutomateAllowed, false);
  assert.equal(cfg.allowCleanup, false);
  assert.equal(cfg.listPrefix, 'Escalations_v2_');
  // Required placeholder keys present.
  for (const k of ['environmentLabel', 'siteReferencePlaceholder', 'runNamespace', 'operatorNotes']) {
    assert.ok(k in cfg, `example config must include ${k}`);
  }
  // No real identifiers in the example.
  const raw = read(EXAMPLE);
  assert.doesNotMatch(raw, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'no GUID');
  assert.doesNotMatch(raw, /https?:\/\//i, 'no live URL');
});

test('the real runtime config is git-ignored (never committed)', () => {
  const ignore = read('.gitignore');
  assert.match(ignore, /provision\.config\.json/, 'real config must be git-ignored');
  // The real config MAY exist locally on an operator machine (it is required to run the
  // provisioning scripts); the .gitignore rule above is what keeps it out of git. Guard the
  // committed EXAMPLE instead: it must carry no live identifiers.
  const raw = read(EXAMPLE);
  assert.doesNotMatch(raw, /https?:\/\//i, 'example config must not contain a live URL');
  assert.doesNotMatch(raw, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'example config must not contain a GUID');
});

test('package files contain no live URLs, tenant/client IDs, secrets, Graph endpoints, or legacy host targets', () => {
  const FORBIDDEN = [
    ['Graph host', /graph\.microsoft\.com/i],
    ['live SharePoint host', /\bsharepoint\.com/i],
    ['Azure AD / Functions host', /microsoftonline\.com|azurewebsites\.net/i],
    ['SharePoint/Graph REST path', /_api\/web|\/v1\.0\/sites|\/beta\/sites/i],
    ['GUID (tenant/client id)', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
    ['secret assignment', /(client_secret|clientSecret|api[_-]?key|password|pwd)\s*[:=]/i],
    ['http(s) URL', /https?:\/\/[a-z0-9.-]+/i],
  ];
  for (const f of [...SCRIPTS, EXAMPLE, 'README.md', 'provisioning-manifest.json']) {
    const doc = read(f);
    for (const [why, re] of FORBIDDEN) assert.doesNotMatch(doc, re, `${f} must not contain ${why}`);
  }
});
