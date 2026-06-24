// Phase-2 governance/doc-guard tests (Loop 12).
//
// Assert the Phase-2 test-site build is documented, approval-gated, and design-only: the build
// runbook, the SharePointStore implementation plan, and the contract test-site execution plan
// all exist, name the required approvals (D6/D7/Rod/test-site), state no production / no legacy
// / no Power Automate, and contain no live markers. Local file reads only — no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = dirname(dirname(V2_ROOT));
const DOCS = join(REPO_ROOT, 'docs');
const path = (name) => join(DOCS, name);
const read = (name) => readFileSync(path(name), 'utf8');

const RUNBOOK = 'SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md';
const IMPL_PLAN = 'SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md';
const TEST_SITE_PLAN = 'STORE_CONTRACT_TEST_SITE_PLAN.md';
const PHASE2_DOCS = [RUNBOOK, IMPL_PLAN, TEST_SITE_PLAN];

test('Phase-2 test-site build runbook exists', () => {
  assert.ok(existsSync(path(RUNBOOK)), `${RUNBOOK} must exist`);
});

test('SharePointStore implementation plan exists', () => {
  assert.ok(existsSync(path(IMPL_PLAN)), `${IMPL_PLAN} must exist`);
});

test('contract test-site execution plan exists', () => {
  assert.ok(existsSync(path(TEST_SITE_PLAN)), `${TEST_SITE_PLAN} must exist`);
});

test('runbook documents the required approval gates (D6/D7/Rod/test-site)', () => {
  const doc = read(RUNBOOK);
  assert.match(doc, /\bD6\b/, 'must require D6 (Entra app)');
  assert.match(doc, /\bD7\b/, 'must require D7 (legacy read/export)');
  assert.match(doc, /Rod approval/i, 'must require Rod approval');
  assert.match(doc, /test site/i, 'must require a company-owned test site');
  assert.match(doc, /approval/i);
});

test('Phase-2 docs say no production / no legacy / no Power Automate', () => {
  for (const name of PHASE2_DOCS) {
    const doc = read(name);
    assert.match(doc, /legacy/i, `${name} must address legacy non-interference`);
    assert.match(doc, /\bno\b/i, `${name} must contain prohibitions`);
  }
  // The runbook is the build action plan — assert its explicit guardrails.
  const runbook = read(RUNBOOK);
  assert.match(runbook, /do not run against production|not.*production/i, 'runbook must warn against production');
  assert.match(runbook, /Power Automate (remains )?deferred|no.*Power Automate|creates? no.*flows/i, 'runbook must keep Power Automate deferred');
  assert.match(runbook, /writeback|write-back/i, 'runbook must address no legacy writeback');
});

test('impl plan + test-site plan reference the store contract as the acceptance gate', () => {
  const impl = read(IMPL_PLAN);
  assert.match(impl, /store contract/i);
  assert.match(impl, /test[- ]site/i);
  assert.match(impl, /no.*writeback|D15/i, 'impl plan must keep the no-writeback guard');
  const plan = read(TEST_SITE_PLAN);
  assert.match(plan, /makeStore/i, 'must describe the makeStore factory');
  assert.match(plan, /first green/i, 'must define the first green contract run');
});

test('decision log records D16 (runbook-driven, contract-validated Phase-2 build)', () => {
  const log = readFileSync(join(REPO_ROOT, 'docs', 'DECISION_LOG.md'), 'utf8');
  assert.match(log, /### D16 —/, 'D16 must exist');
  assert.match(log, /D16[\s\S]*?contract/i, 'D16 must reference the store contract gate');
});

test('Phase-2 docs contain no live URLs, tenant/client IDs, secrets, Graph endpoints, or write-to-production instructions', () => {
  const FORBIDDEN = [
    ['Graph host', /graph\.microsoft\.com/i],
    ['live SharePoint host', /\bsharepoint\.com/i],
    ['Azure AD / Functions host', /microsoftonline\.com|azurewebsites\.net/i],
    ['SharePoint REST path', /_api\/web/i],
    ['Graph REST path', /\/v1\.0\/sites|\/beta\/sites/i],
    ['GUID (tenant/client id)', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
    ['secret assignment', /(client_secret|clientSecret|api[_-]?key|password|pwd)\s*[:=]/i],
    ['http(s) URL', /https?:\/\/[a-z0-9.-]+/i],
  ];
  for (const name of PHASE2_DOCS) {
    const doc = read(name);
    for (const [why, re] of FORBIDDEN) {
      assert.doesNotMatch(doc, re, `${name} must not contain ${why}`);
    }
  }
});
