// Rules tests: auto-status behavior, the owner-only Complete rule, and activity-event generation.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STATUS, ACTIVITY_TYPE } from '../domain/constants.js';
import { createTicket } from '../domain/models.js';
import {
  assignToPerson, assignToDepartment, clearAssignee, changeStatus, canComplete,
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

test('assigning a person does NOT auto-move beyond Assigned (In Process stays)', () => {
  const t = createTicket({ title: 'x', status: STATUS.IN_PROCESS, assignedDeptId: 'dept_benefits' });
  const events = assignToPerson(t, 'user_b', { now: NOW });
  assert.equal(t.status, STATUS.IN_PROCESS, 'status must not auto-advance past Assigned');
  // Only an assignment_change event, no status_change.
  assert.deepEqual(events.map((e) => e.type), [ACTIVITY_TYPE.ASSIGNMENT_CHANGE]);
});

test('assigning a person does NOT auto-move any Pending-* status', () => {
  for (const status of [STATUS.PENDING_RESEARCH, STATUS.PENDING_MEMBER, STATUS.PENDING_CUSTOMER]) {
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
  // New may only go to Not yet assigned / Assigned / Cancelled — Pending Research is illegal.
  assert.throws(() => changeStatus(t, STATUS.PENDING_RESEARCH, { now: NOW }), /Illegal status transition/);
});

// ----- Owner-only Complete (Loop 7) -----

test('canComplete is true only for the ticket owner', () => {
  const t = createTicket({ title: 'x', status: STATUS.ASSIGNED, ticketOwner: 'user_owner', assigneeId: 'user_worker' });
  assert.equal(canComplete(t, 'user_owner'), true);
  assert.equal(canComplete(t, 'user_worker'), false, 'the worker/assignee does not gain closure authority');
  assert.equal(canComplete(t, null), false);
  // No owner at all => nobody can complete.
  const noOwner = createTicket({ title: 'y', status: STATUS.ASSIGNED });
  assert.equal(canComplete(noOwner, 'anyone'), false);
});

test('the ticket owner can move a ticket to Complete; completedDate + activity event are set', () => {
  const t = createTicket({ title: 'x', status: STATUS.IN_PROCESS, assignedDeptId: 'd', assigneeId: 'user_worker', ticketOwner: 'user_owner' });
  const events = changeStatus(t, STATUS.COMPLETE, { actorId: 'user_owner', now: NOW });
  assert.equal(t.status, STATUS.COMPLETE);
  assert.equal(t.completedDate, NOW, 'completedDate is stamped on Complete');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, ACTIVITY_TYPE.STATUS_CHANGE);
  assert.equal(events[0].to, STATUS.COMPLETE);
});

test('a non-owner cannot move a ticket to Complete', () => {
  const t = createTicket({ title: 'x', status: STATUS.IN_PROCESS, assignedDeptId: 'd', assigneeId: 'user_worker', ticketOwner: 'user_owner' });
  assert.throws(
    () => changeStatus(t, STATUS.COMPLETE, { actorId: 'user_worker', now: NOW }),
    /Only the ticket owner can move a ticket to Complete/,
  );
  assert.equal(t.status, STATUS.IN_PROCESS, 'status unchanged after a rejected Complete');
  assert.equal(t.completedDate, null, 'completedDate not set after a rejected Complete');
});

test('Reopened flow: a completed ticket can be reopened, clearing completedDate', () => {
  const t = createTicket({ title: 'x', status: STATUS.IN_PROCESS, assignedDeptId: 'd', assigneeId: 'u', ticketOwner: 'user_owner' });
  changeStatus(t, STATUS.COMPLETE, { actorId: 'user_owner', now: NOW });
  assert.equal(t.completedDate, NOW);
  const events = changeStatus(t, STATUS.REOPENED, { actorId: 'user_owner', now: NOW });
  assert.equal(t.status, STATUS.REOPENED);
  assert.equal(t.completedDate, null, 'reopening clears the completed date');
  assert.equal(events[0].type, ACTIVITY_TYPE.STATUS_CHANGE);
});

test('Cancelled flow: a ticket can be cancelled and is then terminal', () => {
  const t = createTicket({ title: 'x', status: STATUS.ASSIGNED, assignedDeptId: 'd', assigneeId: 'u', ticketOwner: 'user_owner' });
  const events = changeStatus(t, STATUS.CANCELLED, { actorId: 'u', now: NOW });
  assert.equal(t.status, STATUS.CANCELLED);
  assert.equal(events[0].type, ACTIVITY_TYPE.STATUS_CHANGE);
  // Cancelled is terminal — no transitions out.
  assert.throws(() => changeStatus(t, STATUS.ASSIGNED, { now: NOW }), /Illegal status transition/);
});

test('every status change produces exactly one status_change event', () => {
  const t = createTicket({ title: 'x', status: STATUS.ASSIGNED, assignedDeptId: 'd', assigneeId: 'u' });
  const events = changeStatus(t, STATUS.IN_PROCESS, { actorId: 'u', now: NOW });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, ACTIVITY_TYPE.STATUS_CHANGE);
  assert.equal(events[0].from, STATUS.ASSIGNED);
  assert.equal(events[0].to, STATUS.IN_PROCESS);
});
