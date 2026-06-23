// Domain constants for Escalation System v2.
//
// These mirror docs/STATUS_WORKFLOW.md and docs/DATA_MODEL.md. They contain NO production
// values — no tenant/client IDs, scopes, URLs, or secrets. This is mock-first only.
//
// Loop 7: the status vocabulary now aligns with the real, familiar legacy statuses
// (In Process, the three Pending-* states, Complete) instead of the earlier mock-only
// stand-ins (In Progress / Pending Review / Resolved / Closed). Complete is the single
// final official closure state and is owner-only (see domain/rules.js).

/** Ticket lifecycle statuses (docs/STATUS_WORKFLOW.md §1). */
export const STATUS = Object.freeze({
  NEW: 'New',
  NOT_YET_ASSIGNED: 'Not yet assigned',
  ASSIGNED: 'Assigned',
  IN_PROCESS: 'In Process',
  PENDING_RESEARCH: 'Pending Research',
  PENDING_MEMBER: 'Pending Member',
  PENDING_CUSTOMER: 'Pending Customer',
  COMPLETE: 'Complete',
  CANCELLED: 'Cancelled',
  REOPENED: 'Reopened',
});

/** The three "pending" sub-states a working ticket can sit in while it waits on someone. */
export const PENDING_STATUSES = Object.freeze(new Set([
  STATUS.PENDING_RESEARCH,
  STATUS.PENDING_MEMBER,
  STATUS.PENDING_CUSTOMER,
]));

/**
 * Normal working statuses a user may manually move between (docs/STATUS_WORKFLOW.md §3).
 * Moving to Complete is NOT here — Complete is owner-only and handled separately.
 */
export const WORKING_STATUSES = Object.freeze(new Set([
  STATUS.ASSIGNED,
  STATUS.IN_PROCESS,
  STATUS.PENDING_RESEARCH,
  STATUS.PENDING_MEMBER,
  STATUS.PENDING_CUSTOMER,
]));

/** Open/active statuses — count toward queues and overdue. */
export const OPEN_STATUSES = Object.freeze(new Set([
  STATUS.NEW,
  STATUS.NOT_YET_ASSIGNED,
  STATUS.ASSIGNED,
  STATUS.IN_PROCESS,
  STATUS.PENDING_RESEARCH,
  STATUS.PENDING_MEMBER,
  STATUS.PENDING_CUSTOMER,
  STATUS.REOPENED,
]));

/** Terminal statuses. Complete is the final official closure state. */
export const TERMINAL_STATUSES = Object.freeze(new Set([STATUS.COMPLETE, STATUS.CANCELLED]));

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

// Shared list of working/pending targets reachable from any active working state.
const WORKING_TARGETS = [
  STATUS.IN_PROCESS,
  STATUS.PENDING_RESEARCH,
  STATUS.PENDING_MEMBER,
  STATUS.PENDING_CUSTOMER,
];

/**
 * Allowed status transitions (docs/STATUS_WORKFLOW.md §2). The transition guard in
 * rules.js enforces these. Auto-status rules only ever move within the New → Assigned band.
 * Reaching Complete is additionally gated to the ticket owner (see rules.canComplete).
 */
export const ALLOWED_TRANSITIONS = Object.freeze({
  [STATUS.NEW]: [STATUS.NOT_YET_ASSIGNED, STATUS.ASSIGNED, STATUS.CANCELLED],
  [STATUS.NOT_YET_ASSIGNED]: [STATUS.ASSIGNED, STATUS.CANCELLED],
  [STATUS.ASSIGNED]: [...WORKING_TARGETS, STATUS.NOT_YET_ASSIGNED, STATUS.COMPLETE, STATUS.CANCELLED],
  [STATUS.IN_PROCESS]: [STATUS.ASSIGNED, ...WORKING_TARGETS.filter((s) => s !== STATUS.IN_PROCESS), STATUS.COMPLETE, STATUS.CANCELLED],
  [STATUS.PENDING_RESEARCH]: [STATUS.ASSIGNED, STATUS.IN_PROCESS, STATUS.PENDING_MEMBER, STATUS.PENDING_CUSTOMER, STATUS.COMPLETE, STATUS.CANCELLED],
  [STATUS.PENDING_MEMBER]: [STATUS.ASSIGNED, STATUS.IN_PROCESS, STATUS.PENDING_RESEARCH, STATUS.PENDING_CUSTOMER, STATUS.COMPLETE, STATUS.CANCELLED],
  [STATUS.PENDING_CUSTOMER]: [STATUS.ASSIGNED, STATUS.IN_PROCESS, STATUS.PENDING_RESEARCH, STATUS.PENDING_MEMBER, STATUS.COMPLETE, STATUS.CANCELLED],
  [STATUS.COMPLETE]: [STATUS.REOPENED],
  [STATUS.CANCELLED]: [],
  [STATUS.REOPENED]: [STATUS.ASSIGNED, ...WORKING_TARGETS, STATUS.COMPLETE, STATUS.CANCELLED],
});

/** True if `to` is a valid transition target from `from` (identity transitions allowed). */
export function isTransitionAllowed(from, to) {
  if (from === to) return true;
  const targets = ALLOWED_TRANSITIONS[from];
  return Array.isArray(targets) && targets.includes(to);
}
