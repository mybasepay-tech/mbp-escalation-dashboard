// Local-first governance/doc-guard tests (Loop 13).
//
// Assert the local-first execution model and the Phase-2 approval package are documented and
// consistent: artifacts are repo-local now, real data lives only in SharePoint v2 lists later,
// OneDrive is not backend storage, and the approval ask explicitly excludes cutover / legacy
// change / writeback / Power Automate / real users. Local file reads only — no network.
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

const LOCAL_FIRST = 'LOCAL_FIRST_EXECUTION_MODEL.md';
const APPROVAL = 'PHASE2_TEST_SITE_APPROVAL_REQUEST.md';
const MESSAGE = 'ROD_PHASE2_APPROVAL_MESSAGE.md';
const NEW_DOCS = [LOCAL_FIRST, APPROVAL, MESSAGE];

test('local-first + approval package docs exist', () => {
  for (const name of NEW_DOCS) assert.ok(existsSync(path(name)), `${name} must exist`);
});

test('docs name C:\\dev\\mbp-escalation-dashboard as the local work root', () => {
  const doc = read(LOCAL_FIRST);
  assert.match(doc, /C:\\dev\\mbp-escalation-dashboard/, 'must name the repo/work root');
  assert.match(doc, /C:\\dev\\mbp-escalation-dashboard\\src\\v2/, 'must name the v2 app root');
});

test('docs state OneDrive / Information Technology is NOT backend storage', () => {
  const doc = read(LOCAL_FIRST);
  assert.match(doc, /OneDrive/i, 'must mention OneDrive');
  assert.match(doc, /Information Technology/i, 'must name the IT path');
  assert.match(doc, /not\b[\s\S]{0,40}backend/i, 'must state it is not backend storage');
});

test('docs state future real storage is dedicated SharePoint v2 lists', () => {
  const doc = read(LOCAL_FIRST);
  assert.match(doc, /Escalations_v2_/, 'must reference the v2 lists');
  assert.match(doc, /test site/i, 'must reference the non-production test site');
  assert.match(doc, /real data lives \*\*only\*\* in|real data lives only in|only in those SharePoint v2 lists/i,
    'must state real data lives only in v2 lists');
});

test('docs state no legacy writeback', () => {
  for (const name of [LOCAL_FIRST, APPROVAL]) {
    const doc = read(name);
    assert.match(doc, /writeback|write-back/i, `${name} must address writeback`);
    assert.match(doc, /\bno\b/i, `${name} must prohibit it`);
  }
});

test('docs state no Power Automate in MVP phase 1', () => {
  const lf = read(LOCAL_FIRST);
  assert.match(lf, /Power Automate/i);
  assert.match(lf, /deferred|no.*Power Automate|none/i);
  const ap = read(APPROVAL);
  assert.match(ap, /No Power Automate|Power Automate.*deferred/i);
});

test('approval docs state no production cutover in Phase 2', () => {
  for (const name of [APPROVAL, MESSAGE]) {
    assert.match(read(name), /no production cutover|no.*cutover/i, `${name} must exclude cutover`);
  }
});

test('approval request lists the D6/D7/test-site/Phase-2 approval items', () => {
  const doc = read(APPROVAL);
  assert.match(doc, /\bD6\b/);
  assert.match(doc, /\bD7\b/);
  assert.match(doc, /test site/i);
  assert.match(doc, /Phase-2 go-ahead|Phase 2 go-ahead/i);
});

test('Loop 13 docs contain no live URLs, tenant/client IDs, secrets, Graph endpoints, or production write instructions', () => {
  const FORBIDDEN = [
    ['Graph host', /graph\.microsoft\.com/i],
    ['live SharePoint host', /\bsharepoint\.com/i],
    ['Azure AD / Functions host', /microsoftonline\.com|azurewebsites\.net/i],
    ['SharePoint/Graph REST path', /_api\/web|\/v1\.0\/sites|\/beta\/sites/i],
    ['GUID (tenant/client id)', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
    ['secret assignment', /(client_secret|clientSecret|api[_-]?key|password|pwd)\s*[:=]/i],
    ['http(s) URL', /https?:\/\/[a-z0-9.-]+/i],
  ];
  for (const name of NEW_DOCS) {
    const doc = read(name);
    for (const [why, re] of FORBIDDEN) assert.doesNotMatch(doc, re, `${name} must not contain ${why}`);
  }
});
