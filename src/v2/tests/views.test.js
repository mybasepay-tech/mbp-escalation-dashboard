// Tests for department-panel filters and basic reporting (mock data only).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seededStore } from '../mock/seed.js';
import { STATUS, PENDING_STATUSES } from '../domain/constants.js';
import {
  loadContext, applyDepartmentFilter, DEPARTMENT_FILTERS, buildReport,
} from '../ui/viewModel.js';

async function benefitsTickets(store) {
  return store.departmentQueue('dept_benefits');
}

test('department filters: "all" returns the whole department queue', async () => {
  const store = seededStore();
  const tickets = await benefitsTickets(store);
  const all = applyDepartmentFilter(tickets, 'all', { currentUserId: 'user_sarah' });
  assert.equal(all.length, tickets.length);
});

test('department filters: unassigned / assigned-to-me / assigned-to-others partition correctly', async () => {
  const store = seededStore();
  const tickets = await benefitsTickets(store);
  const me = 'user_sarah';

  const unassigned = applyDepartmentFilter(tickets, 'unassigned', { currentUserId: me });
  const mine = applyDepartmentFilter(tickets, 'assigned_to_me', { currentUserId: me });
  const others = applyDepartmentFilter(tickets, 'assigned_to_others', { currentUserId: me });

  assert.ok(unassigned.every((t) => !t.assigneeId));
  assert.ok(mine.every((t) => t.assigneeId === me));
  assert.ok(others.every((t) => t.assigneeId && t.assigneeId !== me));

  // The three buckets are disjoint and cover every ticket exactly once.
  assert.equal(unassigned.length + mine.length + others.length, tickets.length);
});

test('department filters: status-based filters select the right tickets', async () => {
  const store = seededStore();
  const tickets = await benefitsTickets(store);
  assert.ok(applyDepartmentFilter(tickets, 'in_process', {}).every((t) => t.status === STATUS.IN_PROCESS));
  const pending = applyDepartmentFilter(tickets, 'pending', {});
  assert.ok(pending.length >= 1);
  assert.ok(pending.every((t) => PENDING_STATUSES.has(t.status)));
  assert.ok(applyDepartmentFilter(tickets, 'completed', {}).every((t) => t.status === STATUS.COMPLETE));
});

test('department filters: migrated and high-priority', async () => {
  const store = seededStore();
  const tickets = await benefitsTickets(store);
  const migrated = applyDepartmentFilter(tickets, 'migrated', {});
  assert.ok(migrated.length >= 1);
  assert.ok(migrated.every((t) => t.legacyItemId || t.legacyUrl));

  const high = applyDepartmentFilter(tickets, 'high_priority', {});
  assert.ok(high.every((t) => t.priority === 'High' || t.priority === 'Critical'));
});

test('department filters: there are exactly the ten required filters', () => {
  const keys = DEPARTMENT_FILTERS.map((f) => f.key);
  assert.deepEqual(keys, [
    'all', 'unassigned', 'assigned_to_me', 'assigned_to_others', 'in_process',
    'pending', 'completed', 'migrated', 'high_priority', 'reminder_candidates',
  ]);
});

test('reminder_candidates filter flags only stale open tickets (deterministic now)', async () => {
  const store = seededStore();
  const tickets = await store.listTickets();
  // Seed base timestamp is 2026-06-01; at 2026-06-02 only the legacy-migrated ticket
  // (created 2025-11-15 with no movement since) is stale enough to be a candidate.
  const early = applyDepartmentFilter(tickets, 'reminder_candidates', { now: '2026-06-02T00:00:00.000Z' });
  assert.deepEqual(early.map((t) => t.id), ['esc_legacy_307']);
  // Far in the future every OPEN ticket is a candidate; Complete/Cancelled never are.
  const stale = applyDepartmentFilter(tickets, 'reminder_candidates', { now: '2026-12-01T00:00:00.000Z' });
  assert.ok(stale.length > 0);
  assert.ok(stale.every((t) => t.status !== STATUS.COMPLETE && t.status !== 'Cancelled'));
});

test('reporting: counts over all mock tickets are correct', async () => {
  const store = seededStore();
  const ctx = await loadContext(store);
  const all = await store.listTickets();
  const report = buildReport(all, ctx, { currentUserId: 'user_sarah' });

  assert.equal(report.total, all.length);

  // by-status totals sum to the grand total.
  const statusSum = Object.values(report.byStatus).reduce((a, b) => a + b, 0);
  assert.equal(statusSum, report.total);

  // by-priority and by-department also sum to the total.
  assert.equal(Object.values(report.byPriority).reduce((a, b) => a + b, 0), report.total);
  assert.equal(Object.values(report.byDepartment).reduce((a, b) => a + b, 0), report.total);

  // Cross-check specific counts against the seed.
  assert.equal(report.completedCount, all.filter((t) => t.status === STATUS.COMPLETE).length);
  assert.equal(report.legacyCount, all.filter((t) => t.legacyItemId || t.legacyUrl).length);
  assert.equal(report.unassignedCount, all.filter((t) => !t.assigneeId).length);
  assert.equal(report.assignedToCurrentUser, all.filter((t) => t.assigneeId === 'user_sarah').length);
});

test('reporting: assignedToCurrentUser tracks the chosen user', async () => {
  const store = seededStore();
  const ctx = await loadContext(store);
  const all = await store.listTickets();
  const forJennifer = buildReport(all, ctx, { currentUserId: 'user_jennifer' });
  assert.equal(forJennifer.assignedToCurrentUser, all.filter((t) => t.assigneeId === 'user_jennifer').length);
});
