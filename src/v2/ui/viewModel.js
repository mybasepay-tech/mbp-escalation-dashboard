// View-model layer for the v2 mock UI.
//
// Pure functions only — NO DOM, NO network, NO production integration. These turn store
// data (Tickets, ActivityEvents, Users, Departments) into plain render-ready structures.
// Both ui/app.js (browser) and tests/ui-smoke.test.js (node) import this, so the UI and
// its tests share one source of truth.

import { STATUS, PRIORITY, ALLOWED_TRANSITIONS, ACTIVITY_TYPE } from '../domain/constants.js';
import { daysOpen } from '../domain/models.js';

/** Build id->object lookups from the store's reference data. */
export async function loadContext(store) {
  const users = await store.listUsers();
  const departments = await store.listDepartments();
  return {
    usersById: new Map(users.map((u) => [u.id, u])),
    deptsById: new Map(departments.map((d) => [d.id, d])),
    users,
    departments,
  };
}

export function userName(ctx, id) {
  if (!id) return '—';
  return ctx.usersById.get(id)?.displayName ?? id;
}

export function deptName(ctx, id) {
  if (!id) return '—';
  return ctx.deptsById.get(id)?.name ?? id;
}

/** One row for a ticket list / queue. */
export function ticketRow(ticket, ctx, now = new Date()) {
  return {
    id: ticket.id,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    assigneeId: ticket.assigneeId,
    assigneeName: userName(ctx, ticket.assigneeId),
    deptId: ticket.assignedDeptId,
    deptName: deptName(ctx, ticket.assignedDeptId),
    daysOpen: daysOpen(ticket, now),
    hasLegacy: Boolean(ticket.legacyItemId || ticket.legacyUrl),
    isUnassignedPerson: !ticket.assigneeId,
  };
}

export function ticketRows(tickets, ctx, now = new Date()) {
  return tickets.map((t) => ticketRow(t, ctx, now));
}

/** Detail view-model, including a legacy-metadata block ONLY when present. */
export function detailView(ticket, ctx, now = new Date()) {
  const legacy = (ticket.legacyItemId || ticket.legacyUrl)
    ? {
      legacyItemId: ticket.legacyItemId ?? null,
      legacyUrl: ticket.legacyUrl ?? null,
      migrationNotes: ticket.migrationNotes ?? '',
    }
    : null;

  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    issueCategory: ticket.issueCategory,
    issueType: ticket.issueType,
    requestingDept: ticket.requestingDept,
    assigneeId: ticket.assigneeId,
    assigneeName: userName(ctx, ticket.assigneeId),
    deptId: ticket.assignedDeptId,
    deptName: deptName(ctx, ticket.assignedDeptId),
    submitterName: userName(ctx, ticket.submitterId),
    escalationDate: ticket.escalationDate,
    expectedResolutionDate: ticket.expectedResolutionDate,
    resolvedDate: ticket.resolvedDate,
    closedDate: ticket.closedDate,
    daysOpen: daysOpen(ticket, now),
    legacy,
  };
}

/** Human-readable summary for a single activity event. */
export function activityLine(event, ctx) {
  const actor = event.actorId ? userName(ctx, event.actorId) : 'system';
  let summary;
  switch (event.type) {
    case ACTIVITY_TYPE.CREATED:
      summary = 'Ticket created';
      break;
    case ACTIVITY_TYPE.ASSIGNMENT_CHANGE:
      if (event.to && 'assigneeId' in event.to) {
        summary = event.to.assigneeId
          ? `Assigned to ${userName(ctx, event.to.assigneeId)}`
          : 'Person assignment cleared';
      } else if (event.to && 'assignedDeptId' in event.to) {
        summary = `Routed to ${deptName(ctx, event.to.assignedDeptId)}`;
      } else {
        summary = 'Assignment changed';
      }
      break;
    case ACTIVITY_TYPE.STATUS_CHANGE:
      summary = `Status: ${event.from ?? '—'} → ${event.to ?? '—'}`;
      break;
    case ACTIVITY_TYPE.PRIORITY_CHANGE:
      summary = `Priority: ${event.from ?? '—'} → ${event.to ?? '—'}`;
      break;
    case ACTIVITY_TYPE.COMMENT:
      summary = 'Comment added';
      break;
    case ACTIVITY_TYPE.NOTE:
      summary = 'Internal note added';
      break;
    case ACTIVITY_TYPE.MIGRATION_NORMALIZATION:
      summary = `Migration normalization${event.note ? `: ${event.note}` : ''}`;
      break;
    default:
      summary = event.type;
  }
  return { type: event.type, actor, timestamp: event.timestamp, summary };
}

export function activityLines(events, ctx) {
  return events.map((e) => activityLine(e, ctx));
}

/** Status options for the status control: current status + its allowed transition targets. */
export function statusOptions(ticket) {
  const targets = ALLOWED_TRANSITIONS[ticket.status] ?? [];
  return [...new Set([ticket.status, ...targets])];
}

/** All assignable people and departments (for the assignment controls). */
export function assignmentOptions(ctx) {
  return {
    people: ctx.users.map((u) => ({ id: u.id, label: u.displayName })),
    departments: ctx.departments.map((d) => ({ id: d.id, label: d.name })),
  };
}

export const PRIORITY_OPTIONS = Object.values(PRIORITY);
export const ALL_STATUSES = Object.values(STATUS);
