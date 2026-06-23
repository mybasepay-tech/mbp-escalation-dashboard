// Mock seed data for Escalation System v2.
//
// 100% fabricated, local-only data. The "legacy" ids/urls below are FAKE and point at a
// reserved, non-routable .invalid domain — they are NOT real SharePoint/Graph references.
// Fixed ids and timestamps keep tests deterministic.

import { STATUS, PRIORITY } from '../domain/constants.js';
import {
  createTicket, createDepartment, createUser, createTag, createActivityEvent,
  createComment, createNote,
} from '../domain/models.js';
import { MockStore } from '../store/MockStore.js';

// ----- Reference data -----
export const DEPARTMENTS = [
  createDepartment({ id: 'dept_benefits', name: 'Benefits Ops', leadIds: ['user_teri'], memberIds: ['user_maggie', 'user_sarah'] }),
  createDepartment({ id: 'dept_payroll', name: 'Payroll', leadIds: ['user_jennifer'], memberIds: ['user_jennifer'] }),
];

export const USERS = [
  createUser({ id: 'user_maggie', displayName: 'Maggie', email: 'maggie@example.invalid', departmentIds: ['dept_benefits'] }),
  createUser({ id: 'user_sarah', displayName: 'Sarah', email: 'sarah@example.invalid', departmentIds: ['dept_benefits'] }),
  createUser({ id: 'user_jennifer', displayName: 'Jennifer', email: 'jennifer@example.invalid', departmentIds: ['dept_payroll'] }),
  createUser({ id: 'user_teri', displayName: 'Teri', email: 'teri@example.invalid', departmentIds: ['dept_benefits'] }),
];

export const TAGS = [
  createTag({ id: 'tag_financial', label: 'financial' }),
  createTag({ id: 'tag_urgent', label: 'urgent' }),
  createTag({ id: 'tag_member_impact', label: 'member-impact' }),
  createTag({ id: 'tag_doc_needed', label: 'doc-needed' }),
];

const T = '2026-06-01T09:00:00.000Z'; // fixed base timestamp for seed determinism

// ----- Tickets: one per required scenario -----
export const TICKETS = [
  // 1. New ticket — no department, no person.
  createTicket({
    id: 'esc_new', title: 'New escalation, untriaged', status: STATUS.NEW,
    priority: PRIORITY.MEDIUM, requestingDept: 'Member Services', submitterId: 'user_maggie',
    issueCategory: 'Eligibility', createdAt: T, escalationDate: T, modifiedAt: T,
  }),
  // 2. Department-only ticket — assigned to a queue, no person.
  createTicket({
    id: 'esc_dept_only', title: 'Routed to Benefits, awaiting pickup', status: STATUS.NOT_YET_ASSIGNED,
    priority: PRIORITY.HIGH, assignedDeptId: 'dept_benefits', requestingDept: 'Member Services',
    submitterId: 'user_maggie', issueCategory: 'Claims', tagIds: ['tag_urgent'],
    createdAt: T, escalationDate: T, modifiedAt: T,
  }),
  // 3. Person-assigned ticket — assigned to a queue AND a person (stays visible in queue).
  createTicket({
    id: 'esc_person', title: 'Assigned to Sarah in Benefits', status: STATUS.ASSIGNED,
    priority: PRIORITY.MEDIUM, assignedDeptId: 'dept_benefits', assigneeId: 'user_sarah',
    requestingDept: 'Member Services', submitterId: 'user_maggie', issueCategory: 'Claims',
    issueType: 'Claim reprocessing', createdAt: T, escalationDate: T, modifiedAt: T,
  }),
  // 4. In Progress ticket.
  createTicket({
    id: 'esc_in_progress', title: 'Investigation under way', status: STATUS.IN_PROGRESS,
    priority: PRIORITY.HIGH, assignedDeptId: 'dept_benefits', assigneeId: 'user_maggie',
    requestingDept: 'Operations', submitterId: 'user_sarah', issueCategory: 'Billing',
    issueType: 'Overbilling', tagIds: ['tag_financial', 'tag_member_impact'],
    createdAt: T, escalationDate: T, modifiedAt: T,
  }),
  // 5. Pending Review ticket.
  createTicket({
    id: 'esc_pending_review', title: 'Work done, awaiting lead review', status: STATUS.PENDING_REVIEW,
    priority: PRIORITY.MEDIUM, assignedDeptId: 'dept_payroll', assigneeId: 'user_jennifer',
    requestingDept: 'Operations', submitterId: 'user_teri', issueCategory: 'Payroll',
    createdAt: T, escalationDate: T, modifiedAt: T,
  }),
  // 6. Resolved, awaiting closure.
  createTicket({
    id: 'esc_resolved', title: 'Resolved, awaiting closure confirmation', status: STATUS.RESOLVED,
    priority: PRIORITY.LOW, assignedDeptId: 'dept_benefits', assigneeId: 'user_sarah',
    requestingDept: 'Member Services', submitterId: 'user_maggie', issueCategory: 'Eligibility',
    resolvedDate: '2026-06-10T12:00:00.000Z', createdAt: T, escalationDate: T, modifiedAt: '2026-06-10T12:00:00.000Z',
  }),
  // 7. Reopened ticket.
  createTicket({
    id: 'esc_reopened', title: 'Reopened after member follow-up', status: STATUS.REOPENED,
    priority: PRIORITY.HIGH, assignedDeptId: 'dept_payroll', assigneeId: 'user_jennifer',
    requestingDept: 'Operations', submitterId: 'user_teri', issueCategory: 'Payroll',
    createdAt: T, escalationDate: T, modifiedAt: T,
  }),
  // 8. Legacy migrated ticket — FAKE legacy id + FAKE legacy url + migration note.
  createTicket({
    id: 'esc_legacy_307', title: 'Migrated from legacy tracker', status: STATUS.ASSIGNED,
    priority: PRIORITY.MEDIUM, assignedDeptId: 'dept_benefits', assigneeId: 'user_maggie',
    requestingDept: 'Member Services', submitterId: 'user_teri', issueCategory: 'Claims',
    legacyItemId: '3071',
    legacyUrl: 'https://legacy.example.invalid/lists/escalations/items/3071',
    migrationNotes: "Legacy status was 'Not yet assigned' with an assignee; normalized to 'Assigned' on migration.",
    createdAt: '2025-11-15T08:00:00.000Z', escalationDate: '2025-11-15T08:00:00.000Z', modifiedAt: T,
  }),
];

// Baseline activity: a `created` event per ticket, plus a migration_normalization entry for
// the migrated record so the activity stream is non-empty in the foundation.
export const ACTIVITY = [
  ...TICKETS.map((t) => createActivityEvent({
    id: `act_created_${t.id}`, escalationId: t.id, type: 'created',
    actorId: t.submitterId, to: { status: t.status }, note: 'Ticket created (seed)',
    timestamp: t.createdAt,
  })),
  createActivityEvent({
    id: 'act_migr_esc_legacy_307', escalationId: 'esc_legacy_307',
    type: 'migration_normalization', actorId: null,
    from: { status: 'Not yet assigned' }, to: { status: 'Assigned' },
    note: "Normalized legacy status drift (assignee present); see migrationNotes.",
    timestamp: '2026-06-01T08:30:00.000Z',
  }),
  // Activity entries that accompany the seeded comment/note below.
  createActivityEvent({
    id: 'act_cmt_esc_in_progress', escalationId: 'esc_in_progress', type: 'comment',
    actorId: 'user_maggie', note: 'Comment posted', timestamp: '2026-06-02T10:00:00.000Z',
  }),
  createActivityEvent({
    id: 'act_note_esc_in_progress', escalationId: 'esc_in_progress', type: 'note',
    actorId: 'user_maggie', note: 'Internal note added', timestamp: '2026-06-02T10:05:00.000Z',
  }),
];

// Public comments (member/requester-facing) — a separate stream from activity.
export const COMMENTS = [
  createComment({
    id: 'cmt_seed_1', escalationId: 'esc_in_progress', authorId: 'user_maggie',
    body: 'Reached out to the billing vendor; awaiting their confirmation.',
    createdAt: '2026-06-02T10:00:00.000Z',
  }),
];

// Internal notes — separate from comments; carry visibility metadata.
export const NOTES = [
  createNote({
    id: 'note_seed_1', escalationId: 'esc_in_progress', authorId: 'user_maggie',
    body: 'Internal: vendor SLA is 3 business days — escalate to lead if no reply by Thursday.',
    createdAt: '2026-06-02T10:05:00.000Z',
  }),
];

/** Build a fresh dataset object. */
export function buildSeed() {
  return {
    departments: DEPARTMENTS,
    users: USERS,
    tags: TAGS,
    tickets: TICKETS.map((t) => ({ ...t, tagIds: [...t.tagIds] })), // clone so callers can mutate freely
    activity: ACTIVITY.map((a) => ({ ...a })),
    comments: COMMENTS.map((c) => ({ ...c })),
    notes: NOTES.map((n) => ({ ...n })),
  };
}

/** Convenience: a MockStore pre-loaded with the seed. */
export function seededStore() {
  return new MockStore().load(buildSeed());
}
