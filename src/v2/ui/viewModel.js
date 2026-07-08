// View-model layer for the v2 mock UI.
//
// Pure functions only — NO DOM, NO network, NO production integration. These turn store
// data (Tickets, ActivityEvents, Users, Departments) into plain render-ready structures.
// Both ui/app.js (browser) and tests/ui-smoke.test.js (node) import this, so the UI and
// its tests share one source of truth.

import { STATUS, PRIORITY, ALLOWED_TRANSITIONS, ACTIVITY_TYPE, PENDING_STATUSES, OPEN_STATUSES } from '../domain/constants.js';
import { daysOpen } from '../domain/models.js';
import { canComplete, reminderCandidate } from '../domain/rules.js';

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
  const reminder = reminderCandidate(ticket, now);
  return {
    reminder, // { isCandidate, daysSinceMovement, thresholdDays } — local no-movement indicator only
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
    submitterId: ticket.submitterId,
    submitterName: userName(ctx, ticket.submitterId),
    escalationDate: ticket.escalationDate,
    expectedResolutionDate: ticket.expectedResolutionDate,
    completedDate: ticket.completedDate,
    finalClosureNote: ticket.finalClosureNote ?? null,
    lastActivityAt: ticket.lastActivityAt ?? null,
    amountInvolved: ticket.amountInvolved ?? null,
    amountCurrency: ticket.amountCurrency ?? 'USD',
    reminder: reminderCandidate(ticket, now),
    daysOpen: daysOpen(ticket, now),
    tags: ticket.tagIds.map((id) => ({ id, label: tagLabel(ctx, id) })),
    legacy,
  };
}

/** Format attachment metadata for display (metadata-first — no real file behind fileUrl). */
export function attachmentView(attachment, ctx) {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    fileUrl: attachment.fileUrl ?? null,
    mimeType: attachment.mimeType ?? null,
    sizeBytes: attachment.sizeBytes ?? null,
    uploadedBy: userName(ctx, attachment.uploadedBy),
    uploadedAt: attachment.uploadedAt,
    source: attachment.source,
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
    case ACTIVITY_TYPE.ATTACHMENT:
      summary = event.note || 'Attachment changed';
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
 * Complete is requester-only (Loop 21), so it is offered ONLY when the current user is the
 * ticket's submitter (mirrors the rules.canComplete guard the store enforces). Pass
 * `{ currentUserId }` so the control never shows an option the action would reject.
 */
export function statusOptions(ticket, { currentUserId = null } = {}) {
  const targets = ALLOWED_TRANSITIONS[ticket.status] ?? [];
  const visible = targets.filter(
    (s) => s !== STATUS.COMPLETE || canComplete(ticket, currentUserId),
  );
  return [...new Set([ticket.status, ...visible])];
}

/** True if the given (mock) user may move this ticket to Complete (requester-only). */
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
  // No-movement reminder candidates (local calculation only — nothing is sent).
  { key: 'reminder_candidates', label: 'Needs attention (no movement)', predicate: (t, { now } = {}) => reminderCandidate(t, now ?? new Date()).isCandidate },
];

const FILTERS_BY_KEY = new Map(DEPARTMENT_FILTERS.map((f) => [f.key, f]));

/** Apply a department filter by key. Unknown keys fall back to "all". */
export function applyDepartmentFilter(tickets, key, { currentUserId, now } = {}) {
  const filter = FILTERS_BY_KEY.get(key) ?? FILTERS_BY_KEY.get('all');
  return tickets.filter((t) => filter.predicate(t, { currentUserId, now }));
}

// ----- Structured filter toolbar (Loop 26) -----
// The UI replaced the wall of filter chips with labeled dropdowns + a search field + a
// "needs attention" toggle. Pure and composable: every dimension is independent and unknown
// keys behave as "all" (the safe, show-everything direction). DEPARTMENT_FILTERS above stays
// as the underlying single-dimension predicates (and for compatibility/tests).

export const SCOPE_OPTIONS = Object.freeze([
  { key: 'all', label: 'All tickets' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'assigned_to_me', label: 'Assigned to me' },
  { key: 'assigned_to_others', label: 'Assigned to others' },
  { key: 'migrated', label: 'Migrated / legacy' },
]);

export const STATUS_FILTER_OPTIONS = Object.freeze([
  { key: 'all', label: 'Any status' },
  { key: 'open', label: 'Open (active)' },
  { key: 'in_process', label: 'In Process' },
  { key: 'pending', label: 'Pending (any)' },
  { key: 'completed', label: 'Completed' },
  { key: 'reopened', label: 'Reopened' },
  { key: 'cancelled', label: 'Cancelled' },
]);

export const PRIORITY_FILTER_OPTIONS = Object.freeze([
  { key: 'all', label: 'Any priority' },
  { key: 'high_critical', label: 'High + Critical' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
]);

export const DEFAULT_TICKET_FILTERS = Object.freeze({
  scope: 'all', status: 'all', priority: 'all', needsAttention: false, search: '',
});

const SCOPE_PREDICATES = {
  all: () => true,
  unassigned: (t) => !t.assigneeId,
  assigned_to_me: (t, { currentUserId }) => t.assigneeId === currentUserId,
  assigned_to_others: (t, { currentUserId }) => Boolean(t.assigneeId) && t.assigneeId !== currentUserId,
  migrated: (t) => hasLegacy(t),
};

const STATUS_PREDICATES = {
  all: () => true,
  open: (t) => OPEN_STATUSES.has(t.status),
  in_process: (t) => t.status === STATUS.IN_PROCESS,
  pending: (t) => PENDING_STATUSES.has(t.status),
  completed: (t) => t.status === STATUS.COMPLETE,
  reopened: (t) => t.status === STATUS.REOPENED,
  cancelled: (t) => t.status === STATUS.CANCELLED,
};

const PRIORITY_PREDICATES = {
  all: () => true,
  high_critical: (t) => HIGH_PRIORITIES.has(t.priority),
  critical: (t) => t.priority === PRIORITY.CRITICAL,
  high: (t) => t.priority === PRIORITY.HIGH,
  medium: (t) => t.priority === PRIORITY.MEDIUM,
  low: (t) => t.priority === PRIORITY.LOW,
};

/**
 * Apply the structured filter criteria (all dimensions AND-ed). Unknown dimension keys act
 * as "all"; search matches title or id, case-insensitively; needsAttention uses the local
 * reminder-candidate calculation (indicator only — nothing is ever sent).
 */
export function applyTicketFilters(tickets, criteria = {}, { currentUserId, now } = {}) {
  const c = { ...DEFAULT_TICKET_FILTERS, ...criteria };
  const scope = SCOPE_PREDICATES[c.scope] ?? SCOPE_PREDICATES.all;
  const status = STATUS_PREDICATES[c.status] ?? STATUS_PREDICATES.all;
  const priority = PRIORITY_PREDICATES[c.priority] ?? PRIORITY_PREDICATES.all;
  const needle = String(c.search ?? '').trim().toLowerCase();
  return tickets.filter((t) =>
    scope(t, { currentUserId })
    && status(t)
    && priority(t)
    && (!c.needsAttention || reminderCandidate(t, now ?? new Date()).isCandidate)
    && (!needle || t.title.toLowerCase().includes(needle) || t.id.toLowerCase().includes(needle)));
}

/**
 * Basic reporting over a set of tickets (mock data only). Pass the full ticket list and
 * the current user id. `ctx` is used to resolve department names.
 */
export function buildReport(tickets, ctx, { currentUserId, now } = {}) {
  const byStatus = {};
  const byDepartment = {};
  const byPriority = {};
  let unassignedCount = 0;
  let assignedToCurrentUser = 0;
  let completedCount = 0;
  let legacyCount = 0;
  let reminderCandidateCount = 0;

  for (const t of tickets) {
    if (reminderCandidate(t, now ?? new Date()).isCandidate) reminderCandidateCount += 1;
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
    reminderCandidateCount,
  };
}
