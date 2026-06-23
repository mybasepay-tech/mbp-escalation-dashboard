// UI smoke tests — validate the shared view-model (what the UI renders) without a browser,
// plus a UI-specific safety scan of the browser-facing files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { seededStore } from '../mock/seed.js';
import { STATUS, ACTIVITY_TYPE } from '../domain/constants.js';
import {
  loadContext, ticketRows, detailView, activityLines, statusOptions, assignmentOptions,
} from '../ui/viewModel.js';

const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test('department-queue rows include person-assigned tickets', async () => {
  const store = seededStore();
  const ctx = await loadContext(store);
  const rows = ticketRows(await store.departmentQueue('dept_benefits'), ctx);
  const ids = rows.map((r) => r.id);
  assert.ok(ids.includes('esc_person'), 'person-assigned ticket must appear in dept queue');
  assert.ok(ids.includes('esc_dept_only'));
  // The person-assigned row carries its assignee name for display.
  const personRow = rows.find((r) => r.id === 'esc_person');
  assert.equal(personRow.assigneeName, 'Sarah');
});

test('My Assigned rows show only the current mock user\'s tickets', async () => {
  const store = seededStore();
  const ctx = await loadContext(store);
  const rows = ticketRows(await store.myAssignedTickets('user_sarah'), ctx);
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.assigneeId === 'user_sarah'));
  assert.ok(!rows.some((r) => r.id === 'esc_in_progress')); // Maggie's
});

test('detailView exposes a legacy block only when legacy metadata is present', async () => {
  const store = seededStore();
  const ctx = await loadContext(store);
  const legacy = detailView(await store.getTicket('esc_legacy_307'), ctx);
  assert.ok(legacy.legacy, 'migrated ticket should expose legacy block');
  assert.equal(legacy.legacy.legacyItemId, '3071');
  assert.match(legacy.legacy.legacyUrl, /example\.invalid/);

  const plain = detailView(await store.getTicket('esc_new'), ctx);
  assert.equal(plain.legacy, null, 'non-migrated ticket must not show a legacy block');
});

test('activityLines renders readable summaries for key event types', async () => {
  const store = seededStore();
  const ctx = await loadContext(store);
  await store.assignPerson('esc_new', 'user_maggie', { actorId: 'user_teri', now: '2026-06-22T00:00:00.000Z' });
  const lines = activityLines(await store.listActivity('esc_new'), ctx);
  assert.ok(lines.some((l) => l.summary === 'Assigned to Maggie'));
  assert.ok(lines.some((l) => l.summary.startsWith('Status:')));
});

test('statusOptions includes the current status plus allowed transition targets', async () => {
  const store = seededStore();
  const t = await store.getTicket('esc_person'); // Assigned
  const opts = statusOptions(t);
  assert.ok(opts.includes(STATUS.ASSIGNED));        // current
  assert.ok(opts.includes(STATUS.IN_PROGRESS));     // allowed target
  assert.ok(!opts.includes(STATUS.CLOSED));         // not a direct target
});

test('controller flow: assigning a person from New auto-advances to Assigned with activity', async () => {
  const store = seededStore();
  // Mirrors what the "Assign person" button does.
  await store.assignPerson('esc_new', 'user_maggie', { actorId: 'user_teri', now: '2026-06-22T00:00:00.000Z' });
  const t = await store.getTicket('esc_new');
  assert.equal(t.status, STATUS.ASSIGNED);
  const types = (await store.listActivity('esc_new')).map((e) => e.type);
  assert.ok(types.includes(ACTIVITY_TYPE.ASSIGNMENT_CHANGE));
  assert.ok(types.includes(ACTIVITY_TYPE.STATUS_CHANGE));
});

test('assignmentOptions lists every seeded person and department', async () => {
  const store = seededStore();
  const ctx = await loadContext(store);
  const opts = assignmentOptions(ctx);
  assert.equal(opts.people.length, 4);
  assert.equal(opts.departments.length, 2);
});

// ----- UI-specific safety scan -----
const PROD_PATTERNS = [
  /graph\.microsoft\.com/i, /\bsharepoint\.com/i, /microsoftonline/i, /azurewebsites\.net/i,
  /_api\/web/i, /powerautomate/i, /\bmsal\b/i, /Sites\.Read/i,
  /c1b03319-1968-46f9-9922-589376ca272d/i, /e1a27c94-fb0c-4728-b71d-3766f21a3acb/i,
];

test('browser-facing UI files make no network calls and reference no production hosts', () => {
  for (const rel of ['ui/app.js', 'ui/viewModel.js', 'ui/index.html', 'ui/styles.css']) {
    const text = readFileSync(join(V2_ROOT, rel), 'utf8');
    assert.doesNotMatch(text, /\bfetch\s*\(/, `${rel} must not call fetch`);
    assert.doesNotMatch(text, /XMLHttpRequest/, `${rel} must not use XMLHttpRequest`);
    for (const re of PROD_PATTERNS) assert.doesNotMatch(text, re, `${rel} contains forbidden marker ${re}`);
  }
});

test('local server binds to loopback and references no production hosts', () => {
  const text = readFileSync(join(V2_ROOT, 'ui/serve.js'), 'utf8');
  assert.match(text, /127\.0\.0\.1/, 'serve.js must bind to loopback');
  for (const re of PROD_PATTERNS) assert.doesNotMatch(text, re, `serve.js contains forbidden marker ${re}`);
});
