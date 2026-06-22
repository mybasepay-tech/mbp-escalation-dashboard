// Rules tests: auto-status behavior and activity-event generation.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STATUS, ACTIVITY_TYPE } from '../domain/constants.js';
import { createTicket } from '../domain/models.js';
import {
  assignToPerson, assignToDepartment, clearAssignee, changeStatus,
} from '../domain/rules.js';

const NOW = '2026-06-22T00:00:00.000Z';

test('assigning a person to a New ticket auto-moves status to Assigned', () => {
  const t = createTicket({ title: 'x', status: STATUS.NEW });
  const events = assignToPerson(t, 'user_a', { actorId: 'lead', now: NOW });
  assert.equal(t.status, STATUS.ASSIGNED);
  assert.equal(t.assigneeId, 'user_a');
  const types = events.map((e) => e.type);
  assert.deepEqual(types, [ACTIVITY_TYPE.ASSIGNMENT_CHANGE, ACTIVITY_TYPE.STATUS_CHANGE]);
});

test('assigning a person to a Not yet assigned ticket auto-moves to Assigned', () => {
  const t = createTicket({ title: 'x', status: STATUS.NOT_YET_ASSIGNED, assignedDeptId: 'dept_benefits' });
  assignToPerson(t, 'user_a', { now: NOW });
  assert.equal(t.status, STATUS.ASSIGNED);
});

test('assigning a person does NOT auto-move beyond Assigned (In Progress stays)', () => {
  const t = createTicket({ title: 'x', status: STATUS.IN_PROGRESS, assignedDeptId: 'dept_benefits' });
  const events = assignToPerson(t, 'user_b', { now: NOW });
  assert.equal(t.status, STATUS.IN_PROGRESS, 'status must not auto-advance past Assigned');
  // Only an assignment_change event, no status_change.
  assert.deepEqual(events.map((e) => e.type), [ACTIVITY_TYPE.ASSIGNMENT_CHANGE]);
});

test('assigning a person does NOT auto-move Pending Review / Resolved', () => {
  for (const status of [STATUS.PENDING_REVIEW, STATUS.RESOLVED]) {
    const t = createTicket({ title: 'x', status, assignedDeptId: 'dept_benefits' });
    assignToPerson(t, 'user_c', { now: NOW });
    assert.equal(t.status, status);
  }
});

test('assigning a department to a New ticket auto-moves to Not yet assigned only', () => {
  const t = createTicket({ title: 'x', status: STATUS.NEW });
  assignToDepartment(t, 'dept_benefits', { now: NOW });
  assert.equal(t.status, STATUS.NOT_YET_ASSIGNED);
});

test('clearing the assignee on an Assigned ticket reverts to Not yet assigned', () => {
  const t = createTicket({ title: 'x', status: STATUS.ASSIGNED, assignedDeptId: 'dept_benefits', assigneeId: 'user_a' });
  clearAssignee(t, { now: NOW });
  assert.equal(t.assigneeId, null);
  assert.equal(t.status, STATUS.NOT_YET_ASSIGNED);
});

test('changeStatus rejects illegal transitions', () => {
  const t = createTicket({ title: 'x', status: STATUS.NEW });
  assert.throws(() => changeStatus(t, STATUS.CLOSED, { now: NOW }), /Illegal status transition/);
});

test('resolving sets resolvedDate; reopening clears resolved/closed dates', () => {
  const t = createTicket({ title: 'x', status: STATUS.IN_PROGRESS, assignedDeptId: 'd', assigneeId: 'u' });
  changeStatus(t, STATUS.RESOLVED, { now: NOW });
  assert.equal(t.resolvedDate, NOW);
  changeStatus(t, STATUS.REOPENED, { now: NOW });
  assert.equal(t.resolvedDate, null);
  assert.equal(t.closedDate, null);
});

test('every status change produces exactly one status_change event', () => {
  const t = createTicket({ title: 'x', status: STATUS.ASSIGNED, assignedDeptId: 'd', assigneeId: 'u' });
  const events = changeStatus(t, STATUS.IN_PROGRESS, { actorId: 'u', now: NOW });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, ACTIVITY_TYPE.STATUS_CHANGE);
  assert.equal(events[0].from, STATUS.ASSIGNED);
  assert.equal(events[0].to, STATUS.IN_PROGRESS);
});
