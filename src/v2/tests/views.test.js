// Tests for department-panel filters and basic reporting (mock data only).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seededStore } from '../mock/seed.js';
import { STATUS } from '../domain/constants.js';
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
  assert.ok(applyDepartmentFilter(tickets, 'in_progress', {}).every((t) => t.status === STATUS.IN_PROGRESS));
  assert.ok(applyDepartmentFilter(tickets, 'pending_review', {}).every((t) => t.status === STATUS.PENDING_REVIEW));
  assert.ok(applyDepartmentFilter(tickets, 'resolved_awaiting_closure', {}).every((t) => t.status === STATUS.RESOLVED));
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

test('department filters: there are exactly the nine required filters', () => {
  const keys = DEPARTMENT_FILTERS.map((f) => f.key);
  assert.deepEqual(keys, [
    'all', 'unassigned', 'assigned_to_me', 'assigned_to_others', 'in_progress',
    'pending_review', 'resolved_awaiting_closure', 'migrated', 'high_priority',
  ]);
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
  assert.equal(report.resolvedAwaitingClosure, all.filter((t) => t.status === STATUS.RESOLVED).length);
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
