// Store contract harness entry point.
//
// 1. Runs the reusable EscalationStore contract against the current backend, MockStore.
// 2. Verifies the future SharePointStore is a DESIGN-ONLY stub: it exists, mirrors the
//    interface, throws a clear design-only error on every operation, and contains no live
//    integration markers (no SDK imports, no fetch/XHR, no live URLs/tenant IDs/secrets).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { MockStore } from '../store/MockStore.js';
import { EscalationStore } from '../store/EscalationStore.js';
import { SharePointStore, DESIGN_ONLY_MESSAGE } from '../store/SharePointStore.js';
import { runStoreContract } from './store-contract/contract.js';

// ----- 1. The contract must pass against MockStore (the active backend) -----
runStoreContract('MockStore', (seed) => new MockStore().load(seed));

// ----- 2. SharePointStore is design-only -----
const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SP_SRC = readFileSync(join(V2_ROOT, 'store', 'SharePointStore.js'), 'utf8');

// Every EscalationStore operation, with representative args, that must throw design-only.
const DESIGN_ONLY_CALLS = [
  (s) => s.getTicket('x'),
  (s) => s.listTickets({}),
  (s) => s.createTicket({ title: 'x' }),
  (s) => s.assignDepartment('x', 'd', {}),
  (s) => s.assignPerson('x', 'u', {}),
  (s) => s.clearAssignee('x', {}),
  (s) => s.setStatus('x', 'In Process', {}),
  (s) => s.setPriority('x', 'High', {}),
  (s) => s.addTag('x', 't', {}),
  (s) => s.removeTag('x', 't', {}),
  (s) => s.listActivity('x'),
  (s) => s.listComments('x'),
  (s) => s.listNotes('x'),
  (s) => s.addComment('x', {}),
  (s) => s.addNote('x', {}),
  (s) => s.departmentQueue('d', {}),
  (s) => s.myAssignedTickets('u', {}),
  (s) => s.listDepartments(),
  (s) => s.listUsers(),
  (s) => s.listTags(),
];

test('SharePointStore exists, mirrors the EscalationStore interface, and is marked design-only', () => {
  const sp = new SharePointStore();
  assert.ok(sp instanceof EscalationStore, 'must extend EscalationStore');
  assert.equal(sp.designOnly, true);
  // It implements every method of the abstract EscalationStore contract.
  const required = Object.getOwnPropertyNames(EscalationStore.prototype).filter((m) => m !== 'constructor');
  for (const m of required) {
    assert.equal(typeof sp[m], 'function', `SharePointStore must implement ${m}()`);
  }
});

test('every SharePointStore operation throws a clear design-only error', async () => {
  const sp = new SharePointStore();
  for (const call of DESIGN_ONLY_CALLS) {
    await assert.rejects(async () => call(sp), (err) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /design-only and not connected/i);
      assert.ok(err.message.includes(DESIGN_ONLY_MESSAGE.split(' (')[0]), 'uses the standard design-only message');
      return true;
    });
  }
});

test('SharePointStore source imports no live SDK / client', () => {
  const FORBIDDEN_IMPORTS = [
    /@microsoft\/microsoft-graph-client/i,
    /@pnp\/sp/i,
    /@azure\//i,
    /@microsoft\/sp-/i,
    /\bgraph-sdk\b/i,
    /isomorphic-fetch|node-fetch|cross-fetch/i,
  ];
  for (const re of FORBIDDEN_IMPORTS) {
    assert.doesNotMatch(SP_SRC, re, `SharePointStore must not import ${re}`);
  }
});

test('SharePointStore source contains no network calls or live integration markers', () => {
  assert.doesNotMatch(SP_SRC, /\bfetch\s*\(/, 'no fetch() call');
  assert.doesNotMatch(SP_SRC, /XMLHttpRequest/, 'no XMLHttpRequest');
  assert.doesNotMatch(SP_SRC, /graph\.microsoft\.com/i, 'no Graph host');
  assert.doesNotMatch(SP_SRC, /\bsharepoint\.com/i, 'no live SharePoint host');
  assert.doesNotMatch(SP_SRC, /microsoftonline\.com|azurewebsites\.net/i, 'no Azure/login hosts');
  assert.doesNotMatch(SP_SRC, /_api\/web|\/v1\.0\/sites|\/beta\/sites/i, 'no REST endpoints');
  assert.doesNotMatch(SP_SRC, /\bmsal\b|PublicClientApplication/i, 'no MSAL');
  assert.doesNotMatch(SP_SRC, /Sites\.ReadWrite\.All|Sites\.Read\.All/i, 'no OAuth scopes');
  assert.doesNotMatch(SP_SRC, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'no GUIDs');
  assert.doesNotMatch(SP_SRC, /(client_secret|clientSecret|api[_-]?key|password|pwd)\s*[:=]/i, 'no secrets');
  assert.doesNotMatch(SP_SRC, /process\.env/, 'no environment variables');
});
