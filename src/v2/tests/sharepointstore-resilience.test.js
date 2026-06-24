// Resilience tests for SharePointStore against the FakeSharePoint simulator (Loop 16 / D20).
// Proves throttling retry/backoff, ETag conflict re-read+retry, idempotent activity append
// (no duplicates) with clear compensation on permanent failure, and tag-link uniqueness under
// a duplicate/race. 100% local: no network, no SDKs, deterministic (injected no-op sleep).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SharePointStore, ActivityAppendError } from '../store/SharePointStore.js';
import { createSeededFakeClient } from '../backend/sharepoint/fake/seed.js';
import { ThrottledError, ConflictError } from '../backend/sharepoint/fake/FakeSharePointErrors.js';
import { LISTS, LINK_COLS } from '../backend/sharepoint/mapping.js';
import { buildSeed } from '../mock/seed.js';
import { STATUS, ACTIVITY_TYPE } from '../domain/constants.js';

const NOW = '2026-06-22T00:00:00.000Z';

function makeStore(extraRetry = {}) {
  const client = createSeededFakeClient(buildSeed());
  const store = new SharePointStore({ client, retry: { sleep: async () => {}, ...extraRetry } });
  return { client, store };
}

test('throttled read retries and then succeeds', async () => {
  let retries = 0;
  const { client, store } = makeStore({ onThrottleRetry: () => { retries += 1; } });
  client.failOn(LISTS.TICKETS, new ThrottledError('slow', 1), { op: 'query', times: 1 });
  const t = await store.getTicket('esc_person');
  assert.equal(t.id, 'esc_person');
  assert.equal(retries, 1, 'exactly one retry occurred');
});

test('throttled operation fails clearly after the retry limit', async () => {
  const { client, store } = makeStore({ maxAttempts: 4 });
  client.failOn(LISTS.TICKETS, new ThrottledError('slow', 1), { op: 'query', times: 99 });
  await assert.rejects(() => store.getTicket('esc_person'), (e) => e.code === 'throttled');
});

test('stale ETag conflict is re-read and retried where safe', async () => {
  let conflicts = 0;
  const { client, store } = makeStore({ onConflictRetry: () => { conflicts += 1; } });
  client.failOn(LISTS.TICKETS, new ConflictError(), { op: 'update', times: 1 });
  await store.setStatus('esc_person', STATUS.IN_PROCESS, { actorId: 'user_sarah', now: NOW });
  assert.equal(conflicts, 1, 'one conflict retry occurred');
  assert.equal((await store.getTicket('esc_person')).status, STATUS.IN_PROCESS);
});

test('unresolvable ETag conflict fails clearly after the retry limit', async () => {
  const { client, store } = makeStore();
  client.failOn(LISTS.TICKETS, new ConflictError(), { op: 'update', times: 99 });
  await assert.rejects(() => store.setStatus('esc_person', STATUS.IN_PROCESS, { actorId: 'user_sarah', now: NOW }),
    (e) => e.code === 'conflict');
});

test('ticket update + activity append: append retries without duplicating the activity row', async () => {
  const { client, store } = makeStore();
  const before = await store.listActivity('esc_person');
  client.failOn(LISTS.ACTIVITY, new ThrottledError('slow', 1), { op: 'create', times: 1 });
  await store.setStatus('esc_person', STATUS.IN_PROCESS, { actorId: 'user_sarah', now: NOW });
  const after = await store.listActivity('esc_person');
  assert.equal(after.length, before.length + 1, 'exactly one activity row appended despite the transient failure');
  const statusEvents = after.filter((e) => e.type === ACTIVITY_TYPE.STATUS_CHANGE && e.to === STATUS.IN_PROCESS);
  assert.equal(statusEvents.length, 1, 'no duplicate status_change activity');
});

test('permanent activity-append failure surfaces a clear compensation error (ticket change persisted)', async () => {
  const { client, store } = makeStore();
  client.failOn(LISTS.ACTIVITY, new ThrottledError('slow', 1), { op: 'create', times: 99 });
  await assert.rejects(
    () => store.setStatus('esc_person', STATUS.IN_PROCESS, { actorId: 'user_sarah', now: NOW }),
    (e) => e instanceof ActivityAppendError && e.compensation.ticketChangePersisted === true && e.compensation.activityRecorded === false,
  );
  // The ticket change DID persist — the error makes the missing activity explicit, never silent.
  assert.equal((await store.getTicket('esc_person')).status, STATUS.IN_PROCESS);
});

test('tag duplicate/race converges to exactly one active TicketTags link', async () => {
  const { client, store } = makeStore();
  // Simulate a racing writer: two ACTIVE links for the same (ticket, tag) slip in.
  for (let i = 0; i < 2; i++) {
    client.createItem(LISTS.TICKET_TAGS, {
      [LINK_COLS.KEY]: `tt_race_${i}`, [LINK_COLS.TICKET]: 'esc_new', [LINK_COLS.TAG]: 'tag_urgent',
      [LINK_COLS.ACTIVE]: true, [LINK_COLS.REMOVED_AT]: null, [LINK_COLS.CREATED_AT]: NOW,
    });
  }
  // addTag must detect the duplicates and reconcile to a single active link (no new dup).
  await store.addTag('esc_new', 'tag_urgent', { actorId: 'user_teri', now: NOW });
  const active = client.queryAll(LISTS.TICKET_TAGS, { [LINK_COLS.TICKET]: 'esc_new', [LINK_COLS.TAG]: 'tag_urgent', [LINK_COLS.ACTIVE]: true });
  assert.equal(active.length, 1, 'exactly one active link after reconciliation');
  const t = await store.getTicket('esc_new');
  assert.deepEqual(t.tagIds, ['tag_urgent'], 'materialized tagIds has no duplicates');
});

test('addTag reactivates a soft-deleted link instead of creating a duplicate', async () => {
  const { client, store } = makeStore();
  await store.addTag('esc_new', 'tag_urgent', { actorId: 'user_teri', now: NOW });
  await store.removeTag('esc_new', 'tag_urgent', { actorId: 'user_teri', now: NOW }); // soft-delete
  await store.addTag('esc_new', 'tag_urgent', { actorId: 'user_teri', now: NOW });     // should reactivate
  const allLinks = client.queryAll(LISTS.TICKET_TAGS, { [LINK_COLS.TICKET]: 'esc_new', [LINK_COLS.TAG]: 'tag_urgent' });
  assert.equal(allLinks.length, 1, 'reactivated the existing row rather than inserting a duplicate');
  assert.equal(allLinks[0].fields[LINK_COLS.ACTIVE], true);
});

test('adapter + simulator + mapping contain no live SDK/network markers', () => {
  const files = [
    join(dirname(dirname(fileURLToPath(import.meta.url))), 'store', 'SharePointStore.js'),
    join(dirname(dirname(fileURLToPath(import.meta.url))), 'backend', 'sharepoint', 'mapping.js'),
  ];
  const fakeDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'backend', 'sharepoint', 'fake');
  for (const f of readdirSync(fakeDir).filter((n) => n.endsWith('.js'))) files.push(join(fakeDir, f));
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /\bfetch\s*\(/, `${f}: no fetch()`);
    assert.doesNotMatch(src, /XMLHttpRequest/, `${f}: no XMLHttpRequest`);
    assert.doesNotMatch(src, /@microsoft\/|@pnp\/|@azure\//, `${f}: no SDK import`);
    assert.doesNotMatch(src, /graph\.microsoft\.com|\bsharepoint\.com/i, `${f}: no live host`);
    assert.doesNotMatch(src, /https?:\/\/[a-z0-9.-]+/i, `${f}: no live URL`);
    assert.doesNotMatch(src, /process\.env/, `${f}: no env vars`);
  }
});
