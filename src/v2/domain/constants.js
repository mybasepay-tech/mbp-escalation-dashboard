// Domain constants for Escalation System v2.
//
// These mirror docs/STATUS_WORKFLOW.md and docs/DATA_MODEL.md. They contain NO production
// values — no tenant/client IDs, scopes, URLs, or secrets. This is mock-first only.

/** Ticket lifecycle statuses (docs/STATUS_WORKFLOW.md §1). */
export const STATUS = Object.freeze({
  NEW: 'New',
  NOT_YET_ASSIGNED: 'Not yet assigned',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  PENDING_REVIEW: 'Pending Review',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
  REOPENED: 'Reopened',
});

/** Open/active statuses — count toward queues and overdue (Resolved is "awaiting closure"). */
export const OPEN_STATUSES = Object.freeze(new Set([
  STATUS.NEW,
  STATUS.NOT_YET_ASSIGNED,
  STATUS.ASSIGNED,
  STATUS.IN_PROGRESS,
  STATUS.PENDING_REVIEW,
  STATUS.RESOLVED,
  STATUS.REOPENED,
]));

/** Terminal statuses. */
export const TERMINAL_STATUSES = Object.freeze(new Set([STATUS.CLOSED, STATUS.CANCELLED]));

/**
 * Statuses from which adding a person assignment auto-advances to Assigned.
 * Per docs/STATUS_WORKFLOW.md §3.1 and the Loop 3 rule: only the New → Assigned band.
 */
export const AUTO_ASSIGN_FROM = Object.freeze(new Set([STATUS.NEW, STATUS.NOT_YET_ASSIGNED]));

/** Priority / urgency levels (docs/DATA_MODEL.md). */
export const PRIORITY = Object.freeze({
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
});

/** Activity event taxonomy (docs/DATA_MODEL.md §3). */
export const ACTIVITY_TYPE = Object.freeze({
  CREATED: 'created',
  ASSIGNMENT_CHANGE: 'assignment_change',
  STATUS_CHANGE: 'status_change',
  PRIORITY_CHANGE: 'priority_change',
  FIELD_CHANGE: 'field_change',
  COMMENT: 'comment',
  NOTE: 'note',
  MIGRATION_NORMALIZATION: 'migration_normalization',
});

/**
 * Allowed status transitions (docs/STATUS_WORKFLOW.md §2). The transition guard in
 * rules.js enforces these. Auto-status rules only ever move within the New → Assigned band.
 */
export const ALLOWED_TRANSITIONS = Object.freeze({
  [STATUS.NEW]: [STATUS.NOT_YET_ASSIGNED, STATUS.ASSIGNED, STATUS.CANCELLED],
  [STATUS.NOT_YET_ASSIGNED]: [STATUS.ASSIGNED, STATUS.CANCELLED],
  [STATUS.ASSIGNED]: [STATUS.IN_PROGRESS, STATUS.NOT_YET_ASSIGNED, STATUS.CANCELLED],
  [STATUS.IN_PROGRESS]: [STATUS.PENDING_REVIEW, STATUS.RESOLVED, STATUS.ASSIGNED, STATUS.CANCELLED],
  [STATUS.PENDING_REVIEW]: [STATUS.IN_PROGRESS, STATUS.RESOLVED, STATUS.CANCELLED],
  [STATUS.RESOLVED]: [STATUS.CLOSED, STATUS.REOPENED, STATUS.IN_PROGRESS],
  [STATUS.CLOSED]: [STATUS.REOPENED],
  [STATUS.CANCELLED]: [],
  [STATUS.REOPENED]: [STATUS.IN_PROGRESS, STATUS.ASSIGNED, STATUS.CANCELLED],
});

/** True if `to` is a valid transition target from `from` (identity transitions allowed). */
export function isTransitionAllowed(from, to) {
  if (from === to) return true;
  const targets = ALLOWED_TRANSITIONS[from];
  return Array.isArray(targets) && targets.includes(to);
}
