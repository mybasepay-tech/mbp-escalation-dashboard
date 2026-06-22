// Domain models for Escalation System v2 (mock-first).
//
// Plain factory functions + JSDoc typedefs — no framework, no persistence, no live
// integration. Backend-agnostic: these objects are what the EscalationStore reads/writes
// regardless of whether the backend is MockStore (now) or an adapter later.

import { STATUS, PRIORITY } from './constants.js';

/** Generate a local id. Uses the built-in crypto; no external dependency. */
export function newId(prefix = 'id') {
  const uuid = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2);
  return `${prefix}_${uuid}`;
}

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} displayName
 * @property {string} [email]            // mock-only; never a real directory lookup
 * @property {string[]} departmentIds    // departments this user belongs to
 */

/** @returns {User} */
export function createUser({ id = newId('user'), displayName, email = '', departmentIds = [] }) {
  return { id, displayName, email, departmentIds };
}

/**
 * @typedef {Object} Department
 * @property {string} id
 * @property {string} name
 * @property {string[]} leadIds
 * @property {string[]} memberIds
 */

/** @returns {Department} */
export function createDepartment({ id = newId('dept'), name, leadIds = [], memberIds = [] }) {
  return { id, name, leadIds, memberIds };
}

/**
 * @typedef {Object} Tag
 * @property {string} id
 * @property {string} label
 */

/** @returns {Tag} */
export function createTag({ id = newId('tag'), label }) {
  return { id, label };
}

/**
 * @typedef {Object} Comment
 * @property {string} id
 * @property {string} escalationId
 * @property {string} authorId
 * @property {string} body
 * @property {string[]} mentions
 * @property {string} createdAt
 * @property {?string} editedAt
 */

/** @returns {Comment} */
export function createComment({
  id = newId('cmt'), escalationId, authorId, body, mentions = [],
  createdAt = new Date().toISOString(), editedAt = null,
}) {
  return { id, escalationId, authorId, body, mentions, createdAt, editedAt };
}

/**
 * @typedef {Object} Note
 * @property {string} id
 * @property {string} escalationId
 * @property {string} authorId
 * @property {string} body            // internal note (not member-facing)
 * @property {string} createdAt
 */

/** @returns {Note} */
export function createNote({
  id = newId('note'), escalationId, authorId, body, createdAt = new Date().toISOString(),
}) {
  return { id, escalationId, authorId, body, createdAt };
}

/**
 * @typedef {Object} ActivityEvent
 * @property {string} id
 * @property {string} escalationId
 * @property {string} type            // one of ACTIVITY_TYPE
 * @property {?string} actorId        // null/system for migration_normalization
 * @property {*} from
 * @property {*} to
 * @property {string} note
 * @property {string} timestamp
 */

/** @returns {ActivityEvent} */
export function createActivityEvent({
  id = newId('act'), escalationId, type, actorId = null,
  from = null, to = null, note = '', timestamp = new Date().toISOString(),
}) {
  return { id, escalationId, type, actorId, from, to, note, timestamp };
}

/**
 * @typedef {Object} Ticket
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} status
 * @property {string} priority
 * @property {string} issueCategory
 * @property {string} issueType
 * @property {?string} assignedDeptId   // department/queue assignment
 * @property {?string} assigneeId       // person assignment
 * @property {?string} submitterId
 * @property {string} requestingDept
 * @property {?string} escalationDate
 * @property {?string} expectedResolutionDate
 * @property {?string} resolvedDate
 * @property {?string} closedDate
 * @property {string[]} tagIds
 * @property {?string} legacyItemId      // preserved on migration; fake in mock data
 * @property {?string} legacyUrl         // preserved on migration; fake in mock data
 * @property {string} migrationNotes
 * @property {string} createdAt
 * @property {string} modifiedAt
 */

/** @returns {Ticket} */
export function createTicket({
  id = newId('esc'),
  title,
  description = '',
  status = STATUS.NEW,
  priority = PRIORITY.MEDIUM,
  issueCategory = '',
  issueType = '',
  assignedDeptId = null,
  assigneeId = null,
  submitterId = null,
  requestingDept = '',
  escalationDate = new Date().toISOString(),
  expectedResolutionDate = null,
  resolvedDate = null,
  closedDate = null,
  tagIds = [],
  legacyItemId = null,
  legacyUrl = null,
  migrationNotes = '',
  createdAt = new Date().toISOString(),
  modifiedAt = new Date().toISOString(),
}) {
  return {
    id, title, description, status, priority, issueCategory, issueType,
    assignedDeptId, assigneeId, submitterId, requestingDept,
    escalationDate, expectedResolutionDate, resolvedDate, closedDate,
    tagIds, legacyItemId, legacyUrl, migrationNotes, createdAt, modifiedAt,
  };
}

/**
 * Computed days-open (docs/DATA_MODEL.md: always computed, never trusted from storage,
 * clamped to >= 0). `now` is injectable for deterministic tests.
 */
export function daysOpen(ticket, now = new Date()) {
  const start = new Date(ticket.escalationDate ?? ticket.createdAt);
  const end = ticket.resolvedDate ? new Date(ticket.resolvedDate) : now;
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
