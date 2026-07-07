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
  OPEN_STATUSES, REMINDER_THRESHOLD_DAYS, DEFAULT_REMINDER_THRESHOLD_DAYS,
} from './constants.js';
import { createActivityEvent } from './models.js';

// Movement stamp: every real change updates both modifiedAt and lastActivityAt.
// lastActivityAt drives no-movement reminder candidacy (see reminderCandidate below).
function stamp(ticket, now) {
  ticket.modifiedAt = now;
  ticket.lastActivityAt = now;
}

/**
 * Requester-only Complete (Loop 21 stakeholder rule, docs/STATUS_WORKFLOW.md §3.2):
 * ONLY the person who submitted/created the ticket (`submitterId`) may move it to
 * Complete. Neither the assignee, nor the ticket owner, nor a department lead gains
 * closure authority — unless they are also the requester. Returns false when there is
 * no requester on record or the actor is not the requester.
 */
export function canComplete(ticket, actorId) {
  return Boolean(ticket.submitterId && actorId && actorId === ticket.submitterId);
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
    stamp(ticket, now);
  }
  return events;
}

/**
 * Assign (or change) the person.
 * Auto-status: if status is New or Not yet assigned, auto-move to Assigned.
 * Per spec, NEVER auto-move beyond Assigned (In Process and later are untouched).
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
    stamp(ticket, now);
  }
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
    stamp(ticket, now);
  }
  return events;
}

/**
 * Change status with transition validation and date side-effects.
 * Complete (Loop 21): requester-only AND requires a non-empty `closureNote` (the final
 * closing comment). The note is stored on the ticket (`finalClosureNote`) and carried in
 * the status_change activity event, so closure history survives a later Reopen.
 * @throws {Error} if the transition is not allowed, the actor is not the requester, or
 *                 Complete is attempted without a closing comment.
 * @returns {import('./models.js').ActivityEvent[]}
 */
export function changeStatus(ticket, toStatus, {
  actorId = null, now = new Date().toISOString(), note = '', auto = false, closureNote = '',
} = {}) {
  const from = ticket.status;
  if (from === toStatus) return [];
  if (!isTransitionAllowed(from, toStatus)) {
    throw new Error(`Illegal status transition: ${from} -> ${toStatus}`);
  }

  // Requester-only Complete (docs/STATUS_WORKFLOW.md §3.2). Auto-status never targets
  // Complete, so this gate only affects explicit user actions.
  if (toStatus === STATUS.COMPLETE) {
    if (!canComplete(ticket, actorId)) {
      throw new Error('Only the requester who submitted the ticket can move it to Complete');
    }
    const closing = String(closureNote ?? '').trim();
    if (!closing) {
      throw new Error('Completing a ticket requires a final closing comment');
    }
    ticket.completedDate = now;
    ticket.finalClosureNote = closing;
  }
  // Reopen returns the ticket to active work: completedDate/finalClosureNote are cleared on
  // the ticket, but the closure history is preserved in the activity stream.
  if (toStatus === STATUS.REOPENED) {
    ticket.completedDate = null;
    ticket.finalClosureNote = null;
  }

  ticket.status = toStatus;
  stamp(ticket, now);

  return [event(ticket, ACTIVITY_TYPE.STATUS_CHANGE, {
    actorId, from, to: toStatus,
    note: toStatus === STATUS.COMPLETE
      ? `Closed by requester with final comment: ${ticket.finalClosureNote}`
      : (note || (auto ? 'Auto status change' : 'Status changed')),
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

/**
 * Set (or clear, with null) the optional amount of money involved (Loop 21).
 * `amount` must be null or a non-negative finite number. Currency defaults to USD.
 * @returns {import('./models.js').ActivityEvent[]}
 */
export function setAmountInvolved(ticket, amount, {
  currency = 'USD', actorId = null, now = new Date().toISOString(),
} = {}) {
  if (amount != null && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0)) {
    throw new Error('amountInvolved must be null or a non-negative number');
  }
  const fromAmount = ticket.amountInvolved;
  const fromCurrency = ticket.amountCurrency;
  if (fromAmount === amount && fromCurrency === currency) return [];
  ticket.amountInvolved = amount;
  ticket.amountCurrency = currency;
  stamp(ticket, now);
  return [event(ticket, ACTIVITY_TYPE.FIELD_CHANGE, {
    actorId,
    from: { amountInvolved: fromAmount, amountCurrency: fromCurrency },
    to: { amountInvolved: amount, amountCurrency: currency },
    note: amount == null ? 'Amount involved cleared' : `Amount involved set: ${amount} ${currency}`,
    timestamp: now,
  })];
}

/**
 * No-movement reminder candidacy (Loop 21) — LOCAL calculation only. No notification is
 * sent, no Power Automate flow exists; this only flags tickets whose last movement
 * (`lastActivityAt`: any status/assignment/priority/tag change, comment, note, or
 * attachment) is older than the priority-based threshold. Closed/cancelled tickets are
 * never candidates. `now` is injectable for deterministic tests.
 * @returns {{ isCandidate: boolean, daysSinceMovement: number, thresholdDays: number, lastActivityAt: string }}
 */
export function reminderCandidate(ticket, now = new Date()) {
  const thresholdDays = REMINDER_THRESHOLD_DAYS[ticket.priority] ?? DEFAULT_REMINDER_THRESHOLD_DAYS;
  const last = ticket.lastActivityAt ?? ticket.modifiedAt ?? ticket.createdAt;
  const ms = new Date(now).getTime() - new Date(last).getTime();
  const daysSinceMovement = Math.max(0, Math.floor(ms / 86_400_000));
  const isCandidate = OPEN_STATUSES.has(ticket.status) && daysSinceMovement >= thresholdDays;
  return { isCandidate, daysSinceMovement, thresholdDays, lastActivityAt: last };
}
