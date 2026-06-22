// Store/view tests against the seeded MockStore.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seededStore } from '../mock/seed.js';
import { STATUS, ACTIVITY_TYPE } from '../domain/constants.js';

test('department queue includes person-assigned tickets', async () => {
  const store = seededStore();
  const queue = await store.departmentQueue('dept_benefits');
  const ids = queue.map((t) => t.id);
  // esc_person and esc_in_progress are person-assigned but in Benefits — must appear.
  assert.ok(ids.includes('esc_person'), 'person-assigned ticket must stay in dept queue');
  assert.ok(ids.includes('esc_in_progress'));
  // esc_dept_only (no person) must also appear.
  assert.ok(ids.includes('esc_dept_only'));
  // Every queue item really belongs to the department.
  assert.ok(queue.every((t) => t.assignedDeptId === 'dept_benefits'));
});

test('My Assigned Tickets shows only the current user\'s assigned tickets', async () => {
  const store = seededStore();
  const mine = await store.myAssignedTickets('user_sarah');
  assert.ok(mine.every((t) => t.assigneeId === 'user_sarah'));
  const ids = mine.map((t) => t.id).sort();
  assert.deepEqual(ids, ['esc_person', 'esc_resolved']);
  // Tickets assigned to others must not leak in.
  assert.ok(!ids.includes('esc_in_progress')); // assigned to Maggie
});

test('a person-assigned ticket appears in BOTH the dept queue and My Assigned Tickets', async () => {
  const store = seededStore();
  const inQueue = (await store.departmentQueue('dept_benefits')).some((t) => t.id === 'esc_person');
  const inMine = (await store.myAssignedTickets('user_sarah')).some((t) => t.id === 'esc_person');
  assert.ok(inQueue && inMine);
});

test('assignment via the store records activity and applies auto-status', async () => {
  const store = seededStore();
  await store.assignPerson('esc_new', 'user_maggie', { actorId: 'user_teri', now: '2026-06-22T00:00:00.000Z' });
  const t = await store.getTicket('esc_new');
  assert.equal(t.status, STATUS.ASSIGNED);
  const activity = await store.listActivity('esc_new');
  const types = activity.map((e) => e.type);
  assert.ok(types.includes(ACTIVITY_TYPE.ASSIGNMENT_CHANGE));
  assert.ok(types.includes(ACTIVITY_TYPE.STATUS_CHANGE));
});

test('status change via the store records a status_change activity event', async () => {
  const store = seededStore();
  await store.setStatus('esc_person', STATUS.IN_PROGRESS, { actorId: 'user_sarah', now: '2026-06-22T00:00:00.000Z' });
  const activity = await store.listActivity('esc_person');
  assert.ok(activity.some((e) => e.type === ACTIVITY_TYPE.STATUS_CHANGE && e.to === STATUS.IN_PROGRESS));
});

test('seed includes the legacy-migrated ticket with preserved fake legacy id + url', async () => {
  const store = seededStore();
  const t = await store.getTicket('esc_legacy_307');
  assert.equal(t.legacyItemId, '3071');
  assert.match(t.legacyUrl, /example\.invalid/);
  assert.ok(t.migrationNotes.length > 0);
  const activity = await store.listActivity('esc_legacy_307');
  assert.ok(activity.some((e) => e.type === ACTIVITY_TYPE.MIGRATION_NORMALIZATION));
});

test('all eight required scenarios are present in the seed', async () => {
  const store = seededStore();
  const all = await store.listTickets();
  const statuses = new Set(all.map((t) => t.status));
  for (const s of [STATUS.NEW, STATUS.NOT_YET_ASSIGNED, STATUS.ASSIGNED, STATUS.IN_PROGRESS,
    STATUS.PENDING_REVIEW, STATUS.RESOLVED, STATUS.REOPENED]) {
    assert.ok(statuses.has(s), `seed missing a ${s} ticket`);
  }
  assert.ok(all.some((t) => t.assignedDeptId && !t.assigneeId), 'missing department-only ticket');
  assert.ok(all.some((t) => t.assigneeId), 'missing person-assigned ticket');
  assert.ok(all.some((t) => t.legacyItemId), 'missing legacy-migrated ticket');
});
