// MockStore — in-memory implementation of EscalationStore.
//
// 100% local. No network, no Microsoft Graph, no SharePoint, no credentials. This is the
// only backend in the Loop 3 foundation. Data lives in memory for the life of the process;
// seed it with mock/seed.js.

import { EscalationStore } from './EscalationStore.js';
import {
  createTicket, createComment, createNote, createActivityEvent,
} from '../domain/models.js';
import { ACTIVITY_TYPE, OPEN_STATUSES } from '../domain/constants.js';
import {
  assignToDepartment, assignToPerson, clearAssignee, changeStatus, changePriority,
  addTag, removeTag,
} from '../domain/rules.js';

export class MockStore extends EscalationStore {
  constructor() {
    super();
    /** @type {Map<string, import('../domain/models.js').Ticket>} */
    this.tickets = new Map();
    /** @type {import('../domain/models.js').ActivityEvent[]} */
    this.activity = [];
    /** @type {import('../domain/models.js').Comment[]} */
    this.comments = [];
    /** @type {import('../domain/models.js').Note[]} */
    this.notes = [];
    this.departments = new Map();
    this.users = new Map();
    this.tags = new Map();
  }

  /** Load a fully-built dataset (see mock/seed.js). Replaces current contents. */
  load({ tickets = [], activity = [], departments = [], users = [], tags = [], comments = [], notes = [] } = {}) {
    this.tickets = new Map(tickets.map((t) => [t.id, t]));
    this.activity = [...activity];
    this.comments = [...comments];
    this.notes = [...notes];
    this.departments = new Map(departments.map((d) => [d.id, d]));
    this.users = new Map(users.map((u) => [u.id, u]));
    this.tags = new Map(tags.map((t) => [t.id, t]));
    return this;
  }

  #require(id) {
    const t = this.tickets.get(id);
    if (!t) throw new Error(`Unknown ticket: ${id}`);
    return t;
  }

  #record(events) {
    for (const e of events) this.activity.push(e);
    return events;
  }

  // ----- Tickets -----
  async getTicket(id) { return this.tickets.get(id) ?? null; }

  async listTickets(filter = {}) {
    let out = [...this.tickets.values()];
    if (filter.deptId) out = out.filter((t) => t.assignedDeptId === filter.deptId);
    if (filter.assigneeId) out = out.filter((t) => t.assigneeId === filter.assigneeId);
    if (filter.status) out = out.filter((t) => t.status === filter.status);
    if (filter.openOnly) out = out.filter((t) => OPEN_STATUSES.has(t.status));
    return out;
  }

  async createTicket(input) {
    const ticket = createTicket(input);
    this.tickets.set(ticket.id, ticket);
    this.#record([createActivityEvent({
      escalationId: ticket.id, type: ACTIVITY_TYPE.CREATED,
      actorId: input.submitterId ?? null, to: { status: ticket.status },
      note: 'Ticket created', timestamp: ticket.createdAt,
    })]);
    return ticket;
  }

  // ----- Assignment & lifecycle -----
  async assignDepartment(id, deptId, opts = {}) {
    const t = this.#require(id);
    this.#record(assignToDepartment(t, deptId, opts));
    return t;
  }

  async assignPerson(id, userId, opts = {}) {
    const t = this.#require(id);
    this.#record(assignToPerson(t, userId, opts));
    return t;
  }

  async clearAssignee(id, opts = {}) {
    const t = this.#require(id);
    this.#record(clearAssignee(t, opts));
    return t;
  }

  async setStatus(id, status, opts = {}) {
    const t = this.#require(id);
    this.#record(changeStatus(t, status, opts));
    return t;
  }

  async setPriority(id, priority, opts = {}) {
    const t = this.#require(id);
    this.#record(changePriority(t, priority, opts));
    return t;
  }

  async addTag(id, tagId, opts = {}) {
    const t = this.#require(id);
    this.#record(addTag(t, tagId, opts));
    return t;
  }

  async removeTag(id, tagId, opts = {}) {
    const t = this.#require(id);
    this.#record(removeTag(t, tagId, opts));
    return t;
  }

  // ----- Activity, comments, notes -----
  async listActivity(id) {
    return this.activity
      .filter((e) => e.escalationId === id)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /** Public comments for a ticket (separate stream from activity). */
  async listComments(id) {
    return this.comments
      .filter((c) => c.escalationId === id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Internal notes for a ticket (separate stream from comments and activity). */
  async listNotes(id) {
    return this.notes
      .filter((n) => n.escalationId === id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addComment(id, input) {
    this.#require(id);
    const comment = createComment({ ...input, escalationId: id });
    this.comments.push(comment);
    this.#record([createActivityEvent({
      escalationId: id, type: ACTIVITY_TYPE.COMMENT, actorId: comment.authorId,
      note: 'Comment posted', timestamp: comment.createdAt,
    })]);
    return comment;
  }

  async addNote(id, input) {
    this.#require(id);
    const note = createNote({ ...input, escalationId: id });
    this.notes.push(note);
    this.#record([createActivityEvent({
      escalationId: id, type: ACTIVITY_TYPE.NOTE, actorId: note.authorId,
      note: 'Internal note added', timestamp: note.createdAt,
    })]);
    return note;
  }

  // ----- Views -----
  /**
   * Department queue = every ticket whose assignedDeptId matches, REGARDLESS of whether a
   * person is also assigned. This guarantees person-assigned tickets stay visible in the
   * department queue (product req #6).
   */
  async departmentQueue(deptId, { openOnly = false } = {}) {
    return [...this.tickets.values()].filter(
      (t) => t.assignedDeptId === deptId && (!openOnly || OPEN_STATUSES.has(t.status)),
    );
  }

  /** My Assigned Tickets = tickets assigned to this person only. */
  async myAssignedTickets(userId, { openOnly = false } = {}) {
    return [...this.tickets.values()].filter(
      (t) => t.assigneeId === userId && (!openOnly || OPEN_STATUSES.has(t.status)),
    );
  }

  // ----- Reference data -----
  async listDepartments() { return [...this.departments.values()]; }
  async listUsers() { return [...this.users.values()]; }
  async listTags() { return [...this.tags.values()]; }
}
