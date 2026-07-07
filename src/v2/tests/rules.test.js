// Rules tests: auto-status behavior, the owner-only Complete rule, and activity-event generation.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STATUS, PRIORITY, ACTIVITY_TYPE, REMINDER_THRESHOLD_DAYS } from '../domain/constants.js';
import { createTicket } from '../domain/models.js';
import {
  assignToPerson, assignToDepartment, clearAssignee, changeStatus, canComplete,
  setAmountInvolved, reminderCandidate,
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

// ----- Requester-only Complete + required closing comment (Loop 21) -----

test('canComplete is true only for the requester/submitter', () => {
  const t = createTicket({
    title: 'x', status: STATUS.ASSIGNED, submitterId: 'user_requester',
    ticketOwner: 'user_owner', assigneeId: 'user_worker',
  });
  assert.equal(canComplete(t, 'user_requester'), true);
  assert.equal(canComplete(t, 'user_worker'), false, 'the worker/assignee does not gain closure authority');
  assert.equal(canComplete(t, 'user_owner'), false, 'the ticket owner does not gain closure authority');
  assert.equal(canComplete(t, null), false);
  // No requester on record => nobody can complete.
  const noRequester = createTicket({ title: 'y', status: STATUS.ASSIGNED, ticketOwner: 'user_owner' });
  assert.equal(canComplete(noRequester, 'anyone'), false);
  assert.equal(canComplete(noRequester, 'user_owner'), false);
});

test('the requester can Complete with a final closing comment; completedDate + note + activity are set', () => {
  const t = createTicket({ title: 'x', status: STATUS.IN_PROCESS, assignedDeptId: 'd', assigneeId: 'user_worker', ticketOwner: 'user_owner', submitterId: 'user_requester' });
  const events = changeStatus(t, STATUS.COMPLETE, { actorId: 'user_requester', now: NOW, closureNote: 'Resolved with vendor; member confirmed.' });
  assert.equal(t.status, STATUS.COMPLETE);
  assert.equal(t.completedDate, NOW, 'completedDate is stamped on Complete');
  assert.equal(t.finalClosureNote, 'Resolved with vendor; member confirmed.', 'closing comment stored on the ticket');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, ACTIVITY_TYPE.STATUS_CHANGE);
  assert.equal(events[0].to, STATUS.COMPLETE);
  assert.match(events[0].note, /Resolved with vendor; member confirmed\./, 'activity event carries the closing comment');
});

test('the requester cannot Complete without a final closing comment', () => {
  const t = createTicket({ title: 'x', status: STATUS.IN_PROCESS, assignedDeptId: 'd', submitterId: 'user_requester' });
  for (const closureNote of [undefined, '', '   ']) {
    assert.throws(
      () => changeStatus(t, STATUS.COMPLETE, { actorId: 'user_requester', now: NOW, closureNote }),
      /requires a final closing comment/,
    );
  }
  assert.equal(t.status, STATUS.IN_PROCESS, 'status unchanged after a rejected Complete');
  assert.equal(t.completedDate, null);
  assert.equal(t.finalClosureNote, null);
});

test('a non-requester cannot Complete, even the assignee or the ticket owner', () => {
  const t = createTicket({ title: 'x', status: STATUS.IN_PROCESS, assignedDeptId: 'd', assigneeId: 'user_worker', ticketOwner: 'user_owner', submitterId: 'user_requester' });
  for (const actorId of ['user_worker', 'user_owner', 'someone_else']) {
    assert.throws(
      () => changeStatus(t, STATUS.COMPLETE, { actorId, now: NOW, closureNote: 'trying anyway' }),
      /Only the requester who submitted the ticket/,
    );
  }
  assert.equal(t.status, STATUS.IN_PROCESS, 'status unchanged after a rejected Complete');
  assert.equal(t.completedDate, null, 'completedDate not set after a rejected Complete');
});

test('Reopened flow: reopening clears completedDate + finalClosureNote; closure history stays in activity', () => {
  const t = createTicket({ title: 'x', status: STATUS.IN_PROCESS, assignedDeptId: 'd', assigneeId: 'u', submitterId: 'user_requester' });
  const closeEvents = changeStatus(t, STATUS.COMPLETE, { actorId: 'user_requester', now: NOW, closureNote: 'done and verified' });
  assert.equal(t.completedDate, NOW);
  assert.equal(t.finalClosureNote, 'done and verified');
  const events = changeStatus(t, STATUS.REOPENED, { actorId: 'user_requester', now: NOW });
  assert.equal(t.status, STATUS.REOPENED);
  assert.equal(t.completedDate, null, 'reopening clears the completed date');
  assert.equal(t.finalClosureNote, null, 'reopening clears the stored closure note');
  assert.match(closeEvents[0].note, /done and verified/, 'the closure comment survives in the activity event');
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

// ----- Optional amount involved (Loop 21) -----

test('amount involved is optional: defaults to null with USD currency', () => {
  const t = createTicket({ title: 'x' });
  assert.equal(t.amountInvolved, null);
  assert.equal(t.amountCurrency, 'USD');
});

test('setAmountInvolved sets/clears the amount and records a field_change event', () => {
  const t = createTicket({ title: 'x', status: STATUS.ASSIGNED });
  const events = setAmountInvolved(t, 1250.75, { actorId: 'u', now: NOW });
  assert.equal(t.amountInvolved, 1250.75);
  assert.equal(t.amountCurrency, 'USD');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, ACTIVITY_TYPE.FIELD_CHANGE);
  assert.deepEqual(events[0].to, { amountInvolved: 1250.75, amountCurrency: 'USD' });
  // Clearing back to null works and is recorded too.
  const cleared = setAmountInvolved(t, null, { actorId: 'u', now: NOW });
  assert.equal(t.amountInvolved, null);
  assert.equal(cleared.length, 1);
  // Idempotent no-op.
  assert.deepEqual(setAmountInvolved(t, null, { now: NOW }), []);
});

test('setAmountInvolved rejects negative and non-numeric amounts', () => {
  const t = createTicket({ title: 'x' });
  assert.throws(() => setAmountInvolved(t, -5, { now: NOW }), /non-negative/);
  assert.throws(() => setAmountInvolved(t, 'lots', { now: NOW }), /non-negative/);
  assert.throws(() => setAmountInvolved(t, Number.NaN, { now: NOW }), /non-negative/);
});

// ----- lastActivityAt movement stamp + reminder candidacy (Loop 21) -----

test('lastActivityAt defaults to createdAt and updates on every real movement', () => {
  const t = createTicket({ title: 'x', status: STATUS.NEW, createdAt: NOW, modifiedAt: NOW });
  assert.equal(t.lastActivityAt, NOW);
  const later = '2026-06-25T00:00:00.000Z';
  assignToPerson(t, 'user_a', { now: later });
  assert.equal(t.lastActivityAt, later, 'assignment is movement');
  const evenLater = '2026-06-26T00:00:00.000Z';
  changeStatus(t, STATUS.IN_PROCESS, { actorId: 'user_a', now: evenLater });
  assert.equal(t.lastActivityAt, evenLater, 'status change is movement');
  // A no-op assignment does NOT count as movement.
  assignToPerson(t, 'user_a', { now: '2026-06-27T00:00:00.000Z' });
  assert.equal(t.lastActivityAt, evenLater, 'no-op re-assignment is not movement');
});

test('reminder thresholds are priority-based (Critical 2, High 3, Medium 7, Low 14 days)', () => {
  assert.equal(REMINDER_THRESHOLD_DAYS[PRIORITY.CRITICAL], 2);
  assert.equal(REMINDER_THRESHOLD_DAYS[PRIORITY.HIGH], 3);
  assert.equal(REMINDER_THRESHOLD_DAYS[PRIORITY.MEDIUM], 7);
  assert.equal(REMINDER_THRESHOLD_DAYS[PRIORITY.LOW], 14);
});

test('reminderCandidate flags open tickets with no movement past the priority threshold', () => {
  const base = '2026-06-01T00:00:00.000Z';
  const mk = (priority) => createTicket({
    title: 'x', status: STATUS.IN_PROCESS, priority, createdAt: base, modifiedAt: base,
  });
  // Medium/normal: 7 days — day 6 is not a candidate, day 7 is.
  const medium = mk(PRIORITY.MEDIUM);
  assert.equal(reminderCandidate(medium, '2026-06-07T23:00:00.000Z').isCandidate, false);
  const flagged = reminderCandidate(medium, '2026-06-08T00:00:00.000Z');
  assert.equal(flagged.isCandidate, true);
  assert.equal(flagged.thresholdDays, 7);
  assert.equal(flagged.daysSinceMovement, 7);
  // Critical flags after 2 days; Low not until 14.
  assert.equal(reminderCandidate(mk(PRIORITY.CRITICAL), '2026-06-03T00:00:00.000Z').isCandidate, true);
  assert.equal(reminderCandidate(mk(PRIORITY.LOW), '2026-06-08T00:00:00.000Z').isCandidate, false);
  assert.equal(reminderCandidate(mk(PRIORITY.LOW), '2026-06-15T00:00:00.000Z').isCandidate, true);
});

test('reminderCandidate resets when movement happens and never flags closed tickets', () => {
  const base = '2026-06-01T00:00:00.000Z';
  const t = createTicket({
    title: 'x', status: STATUS.IN_PROCESS, priority: PRIORITY.MEDIUM,
    submitterId: 'user_requester', createdAt: base, modifiedAt: base,
  });
  assert.equal(reminderCandidate(t, '2026-06-10T00:00:00.000Z').isCandidate, true);
  // Movement (priority change) resets the clock.
  changeStatus(t, STATUS.PENDING_RESEARCH, { actorId: 'u', now: '2026-06-09T00:00:00.000Z' });
  assert.equal(reminderCandidate(t, '2026-06-10T00:00:00.000Z').isCandidate, false);
  // Completed tickets are never candidates, no matter how stale.
  changeStatus(t, STATUS.COMPLETE, { actorId: 'user_requester', now: '2026-06-10T00:00:00.000Z', closureNote: 'done' });
  assert.equal(reminderCandidate(t, '2026-12-01T00:00:00.000Z').isCandidate, false);
});
