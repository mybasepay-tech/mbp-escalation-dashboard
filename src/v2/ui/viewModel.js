// View-model layer for the v2 mock UI.
//
// Pure functions only — NO DOM, NO network, NO production integration. These turn store
// data (Tickets, ActivityEvents, Users, Departments) into plain render-ready structures.
// Both ui/app.js (browser) and tests/ui-smoke.test.js (node) import this, so the UI and
// its tests share one source of truth.

import { STATUS, PRIORITY, ALLOWED_TRANSITIONS, ACTIVITY_TYPE, PENDING_STATUSES } from '../domain/constants.js';
import { daysOpen } from '../domain/models.js';
import { canComplete } from '../domain/rules.js';

/** Build id->object lookups from the store's reference data. */
export async function loadContext(store) {
  const users = await store.listUsers();
  const departments = await store.listDepartments();
  const tags = await store.listTags();
  return {
    usersById: new Map(users.map((u) => [u.id, u])),
    deptsById: new Map(departments.map((d) => [d.id, d])),
    tagsById: new Map(tags.map((t) => [t.id, t])),
    users,
    departments,
    tags,
  };
}

export function tagLabel(ctx, tagId) {
  return ctx.tagsById?.get(tagId)?.label ?? tagId;
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
    ownerId: ticket.ticketOwner,
    ownerName: userName(ctx, ticket.ticketOwner),
    deptId: ticket.assignedDeptId,
    deptName: deptName(ctx, ticket.assignedDeptId),
    daysOpen: daysOpen(ticket, now),
    hasLegacy: Boolean(ticket.legacyItemId || ticket.legacyUrl),
    isUnassignedPerson: !ticket.assigneeId,
    tags: ticket.tagIds.map((id) => ({ id, label: tagLabel(ctx, id) })),
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
    ownerId: ticket.ticketOwner,
    ownerName: userName(ctx, ticket.ticketOwner),
    deptId: ticket.assignedDeptId,
    deptName: deptName(ctx, ticket.assignedDeptId),
    submitterName: userName(ctx, ticket.submitterId),
    escalationDate: ticket.escalationDate,
    expectedResolutionDate: ticket.expectedResolutionDate,
    completedDate: ticket.completedDate,
    daysOpen: daysOpen(ticket, now),
    tags: ticket.tagIds.map((id) => ({ id, label: tagLabel(ctx, id) })),
    legacy,
  };
}

/** Format public comments / internal notes for display. */
export function commentView(comment, ctx) {
  return {
    id: comment.id,
    author: userName(ctx, comment.authorId),
    body: comment.body,
    visibility: comment.visibility ?? 'public',
    createdAt: comment.createdAt,
  };
}

export function noteView(note, ctx) {
  return {
    id: note.id,
    author: userName(ctx, note.authorId),
    body: note.body,
    visibility: note.visibility ?? 'internal',
    createdAt: note.createdAt,
  };
}

/** Tags available to add to a ticket (catalog minus tags already on it). */
export function availableTags(ticket, ctx) {
  const current = new Set(ticket.tagIds);
  return ctx.tags.filter((t) => !current.has(t.id)).map((t) => ({ id: t.id, label: t.label }));
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

/**
 * Status options for the status control: current status + its allowed transition targets.
 * Complete is owner-only, so it is offered ONLY when the current user is the ticket owner
 * (mirrors the rules.canComplete guard the store enforces). Pass `{ currentUserId }` so the
 * control never shows an option the action would reject.
 */
export function statusOptions(ticket, { currentUserId = null } = {}) {
  const targets = ALLOWED_TRANSITIONS[ticket.status] ?? [];
  const visible = targets.filter(
    (s) => s !== STATUS.COMPLETE || canComplete(ticket, currentUserId),
  );
  return [...new Set([ticket.status, ...visible])];
}

/** True if the given (mock) user may move this ticket to Complete. Thin re-export for the UI. */
export function actorCanComplete(ticket, currentUserId) {
  return canComplete(ticket, currentUserId);
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

const HIGH_PRIORITIES = new Set([PRIORITY.HIGH, PRIORITY.CRITICAL]);

function hasLegacy(t) { return Boolean(t.legacyItemId || t.legacyUrl); }

/**
 * Department-panel filters. Each predicate runs over tickets ALREADY scoped to the
 * department (so e.g. "assigned to me" means within this department). `ctx` carries the
 * current user id.
 */
export const DEPARTMENT_FILTERS = [
  { key: 'all', label: 'All department tickets', predicate: () => true },
  { key: 'unassigned', label: 'Unassigned in department', predicate: (t) => !t.assigneeId },
  { key: 'assigned_to_me', label: 'Assigned to me', predicate: (t, { currentUserId }) => t.assigneeId === currentUserId },
  { key: 'assigned_to_others', label: 'Assigned to others', predicate: (t, { currentUserId }) => t.assigneeId && t.assigneeId !== currentUserId },
  { key: 'in_process', label: 'In process', predicate: (t) => t.status === STATUS.IN_PROCESS },
  { key: 'pending', label: 'Pending (any)', predicate: (t) => PENDING_STATUSES.has(t.status) },
  { key: 'completed', label: 'Completed', predicate: (t) => t.status === STATUS.COMPLETE },
  { key: 'migrated', label: 'Migrated / legacy', predicate: (t) => hasLegacy(t) },
  { key: 'high_priority', label: 'High priority', predicate: (t) => HIGH_PRIORITIES.has(t.priority) },
];

const FILTERS_BY_KEY = new Map(DEPARTMENT_FILTERS.map((f) => [f.key, f]));

/** Apply a department filter by key. Unknown keys fall back to "all". */
export function applyDepartmentFilter(tickets, key, { currentUserId } = {}) {
  const filter = FILTERS_BY_KEY.get(key) ?? FILTERS_BY_KEY.get('all');
  return tickets.filter((t) => filter.predicate(t, { currentUserId }));
}

/**
 * Basic reporting over a set of tickets (mock data only). Pass the full ticket list and
 * the current user id. `ctx` is used to resolve department names.
 */
export function buildReport(tickets, ctx, { currentUserId } = {}) {
  const byStatus = {};
  const byDepartment = {};
  const byPriority = {};
  let unassignedCount = 0;
  let assignedToCurrentUser = 0;
  let completedCount = 0;
  let legacyCount = 0;

  for (const t of tickets) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    const dName = t.assignedDeptId ? deptName(ctx, t.assignedDeptId) : 'Unassigned department';
    byDepartment[dName] = (byDepartment[dName] ?? 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
    if (!t.assigneeId) unassignedCount += 1;
    if (currentUserId && t.assigneeId === currentUserId) assignedToCurrentUser += 1;
    if (t.status === STATUS.COMPLETE) completedCount += 1;
    if (hasLegacy(t)) legacyCount += 1;
  }

  return {
    total: tickets.length,
    byStatus,
    byDepartment,
    byPriority,
    unassignedCount,
    assignedToCurrentUser,
    completedCount,
    legacyCount,
  };
}
