// Assignment & status-transition rules for Escalation System v2.
//
// These functions mutate the passed ticket in place and RETURN the activity events the
// change produced. The store is responsible for persisting both the ticket and the events.
// Keeping the events as return values makes the rules easy to unit-test in isolation.
//
// Mock-first: no I/O, no network, no production integration. `now` is injectable so tests
// are deterministic.

import {
  STATUS, AUTO_ASSIGN_FROM, ACTIVITY_TYPE, isTransitionAllowed,
} from './constants.js';
import { createActivityEvent } from './models.js';

function stamp(ticket, now) {
  ticket.modifiedAt = now;
}

function event(ticket, type, { actorId = null, from = null, to = null, note = '', timestamp }) {
  return createActivityEvent({ escalationId: ticket.id, type, actorId, from, to, note, timestamp });
}

/**
 * Assign (or change) the department/queue.
 * Auto-status: a brand-new ticket (New) with a department becomes "Not yet assigned".
 * Never advances beyond "Not yet assigned" via this rule.
 * @returns {import('./models.js').ActivityEvent[]}
 */
export function assignToDepartment(ticket, deptId, { actorId = null, now = new Date().toISOString() } = {}) {
  const events = [];
  const prevDept = ticket.assignedDeptId;
  if (prevDept !== deptId) {
    ticket.assignedDeptId = deptId;
    events.push(event(ticket, ACTIVITY_TYPE.ASSIGNMENT_CHANGE, {
      actorId, from: { assignedDeptId: prevDept }, to: { assignedDeptId: deptId },
      note: 'Department assignment changed', timestamp: now,
    }));
    if (ticket.status === STATUS.NEW) {
      events.push(...changeStatus(ticket, STATUS.NOT_YET_ASSIGNED, {
        actorId, now, note: 'Auto: department assigned', auto: true,
      }));
    }
  }
  stamp(ticket, now);
  return events;
}

/**
 * Assign (or change) the person.
 * Auto-status: if status is New or Not yet assigned, auto-move to Assigned.
 * Per spec, NEVER auto-move beyond Assigned (In Progress and later are untouched).
 * @returns {import('./models.js').ActivityEvent[]}
 */
export function assignToPerson(ticket, userId, { actorId = null, now = new Date().toISOString() } = {}) {
  const events = [];
  const prevAssignee = ticket.assigneeId;
  if (prevAssignee !== userId) {
    ticket.assigneeId = userId;
    events.push(event(ticket, ACTIVITY_TYPE.ASSIGNMENT_CHANGE, {
      actorId, from: { assigneeId: prevAssignee }, to: { assigneeId: userId },
      note: 'Person assignment changed', timestamp: now,
    }));
    if (AUTO_ASSIGN_FROM.has(ticket.status)) {
      events.push(...changeStatus(ticket, STATUS.ASSIGNED, {
        actorId, now, note: 'Auto: person assigned', auto: true,
      }));
    }
  }
  stamp(ticket, now);
  return events;
}

/**
 * Clear the person assignment. Symmetric auto-status: if currently "Assigned", revert to
 * "Not yet assigned" (docs/STATUS_WORKFLOW.md §3.1).
 * @returns {import('./models.js').ActivityEvent[]}
 */
export function clearAssignee(ticket, { actorId = null, now = new Date().toISOString() } = {}) {
  const events = [];
  if (ticket.assigneeId != null) {
    const prev = ticket.assigneeId;
    ticket.assigneeId = null;
    events.push(event(ticket, ACTIVITY_TYPE.ASSIGNMENT_CHANGE, {
      actorId, from: { assigneeId: prev }, to: { assigneeId: null },
      note: 'Person assignment cleared', timestamp: now,
    }));
    if (ticket.status === STATUS.ASSIGNED) {
      events.push(...changeStatus(ticket, STATUS.NOT_YET_ASSIGNED, {
        actorId, now, note: 'Auto: assignee cleared', auto: true,
      }));
    }
  }
  stamp(ticket, now);
  return events;
}

/**
 * Change status with transition validation and date side-effects.
 * @throws {Error} if the transition is not allowed.
 * @returns {import('./models.js').ActivityEvent[]}
 */
export function changeStatus(ticket, toStatus, {
  actorId = null, now = new Date().toISOString(), note = '', auto = false,
} = {}) {
  const from = ticket.status;
  if (from === toStatus) return [];
  if (!isTransitionAllowed(from, toStatus)) {
    throw new Error(`Illegal status transition: ${from} -> ${toStatus}`);
  }

  // Date side-effects (docs/STATUS_WORKFLOW.md §3).
  if (toStatus === STATUS.RESOLVED) ticket.resolvedDate = now;
  if (toStatus === STATUS.CLOSED) ticket.closedDate = now;
  if (toStatus === STATUS.REOPENED) { ticket.resolvedDate = null; ticket.closedDate = null; }

  ticket.status = toStatus;
  stamp(ticket, now);

  return [event(ticket, ACTIVITY_TYPE.STATUS_CHANGE, {
    actorId, from, to: toStatus,
    note: note || (auto ? 'Auto status change' : 'Status changed'),
    timestamp: now,
  })];
}

/**
 * Change priority/urgency.
 * @returns {import('./models.js').ActivityEvent[]}
 */
export function changePriority(ticket, toPriority, { actorId = null, now = new Date().toISOString() } = {}) {
  const from = ticket.priority;
  if (from === toPriority) return [];
  ticket.priority = toPriority;
  stamp(ticket, now);
  return [event(ticket, ACTIVITY_TYPE.PRIORITY_CHANGE, {
    actorId, from, to: toPriority, note: 'Priority changed', timestamp: now,
  })];
}

/**
 * Add a tag (idempotent). Tag changes are recorded as `field_change` activity events
 * (the documented catch-all in docs/DATA_MODEL.md §3), with the tag captured in `to`.
 * @returns {import('./models.js').ActivityEvent[]}
 */
export function addTag(ticket, tagId, { actorId = null, now = new Date().toISOString() } = {}) {
  if (ticket.tagIds.includes(tagId)) return [];
  ticket.tagIds = [...ticket.tagIds, tagId];
  stamp(ticket, now);
  return [event(ticket, ACTIVITY_TYPE.FIELD_CHANGE, {
    actorId, to: { addedTag: tagId }, note: `Tag added: ${tagId}`, timestamp: now,
  })];
}

/**
 * Remove a tag (no-op if absent).
 * @returns {import('./models.js').ActivityEvent[]}
 */
export function removeTag(ticket, tagId, { actorId = null, now = new Date().toISOString() } = {}) {
  if (!ticket.tagIds.includes(tagId)) return [];
  ticket.tagIds = ticket.tagIds.filter((t) => t !== tagId);
  stamp(ticket, now);
  return [event(ticket, ACTIVITY_TYPE.FIELD_CHANGE, {
    actorId, to: { removedTag: tagId }, note: `Tag removed: ${tagId}`, timestamp: now,
  })];
}
