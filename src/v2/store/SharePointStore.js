// SharePointStore — EscalationStore adapter for SharePoint List v2.
//
// Two modes:
//   * DESIGN-ONLY (default, no client): every operation throws a clear design-only error.
//     This is the safe default and what ships until a live build is approved.
//   * LOCAL/SIMULATED (constructed with an injected client): operates against an injected
//     SharePoint-like client. In this repo the only such client is the in-memory
//     FakeSharePointClient (backend/sharepoint/fake/) — NO network, NO Graph/PnP/Azure SDK, NO
//     auth, NO URLs. Swapping in a real client later is an implementation detail behind the
//     same method surface; the store contract does not change.
//
// HARD RULES (enforced by tests/safety.test.js, scripts/validate.js, and the contract tests):
//   * No network calls — this file performs no HTTP I/O and uses no browser request APIs.
//   * No SDK imports — no Microsoft Graph client, no SharePoint client, no Azure client.
//   * No credentials, environment variables, tenant/client IDs, secrets, or live URLs.
//   * Business rules live in domain/rules.js; this adapter orchestrates persistence only.
//   * Never writes to legacy. Tags use the Escalations_v2_TicketTags link list (D12).

import { EscalationStore } from './EscalationStore.js';
import { createTicket, createComment, createNote, createActivityEvent, newId } from '../domain/models.js';
import { ACTIVITY_TYPE, OPEN_STATUSES } from '../domain/constants.js';
import {
  assignToDepartment, assignToPerson, clearAssignee, changeStatus, changePriority,
} from '../domain/rules.js';
import {
  LISTS, LINK_COLS,
  ticketToFields, fieldsToTicket, activityToFields, fieldsToActivity,
  commentToFields, fieldsToComment, noteToFields, fieldsToNote,
  fieldsToDept, fieldsToUser, fieldsToTag,
} from '../backend/sharepoint/mapping.js';

/** The single message every design-only (no-client) operation throws. Exported for tests. */
export const DESIGN_ONLY_MESSAGE =
  'SharePointStore is design-only and not connected. Use MockStore for local MVP.';

export class SharePointStore extends EscalationStore {
  /**
   * @param {object} [opts]
   * @param {object} [opts.client] - an injected SharePoint-like client (e.g. FakeSharePointClient).
   *   Omit for the fail-closed design-only stub.
   */
  constructor(opts = {}) {
    super();
    this._client = opts.client ?? null;
    /** True when no client is injected: every operation fails closed. */
    this.designOnly = !this._client;
  }

  #client() {
    if (!this._client) throw new Error(DESIGN_ONLY_MESSAGE);
    return this._client;
  }

  // ----- internal helpers (LOCAL/SIMULATED mode) -----
  #ticketRecord(ticketKey) {
    const { items } = this.#client().query(LISTS.TICKETS, { filter: { TicketKey: ticketKey }, top: 1 });
    return items[0] ?? null;
  }

  #requireTicketRecord(ticketKey) {
    const rec = this.#ticketRecord(ticketKey);
    if (!rec) throw new Error(`Unknown ticket: ${ticketKey}`);
    return rec;
  }

  #activeLinks(ticketKey) {
    return this.#client().queryAll(LISTS.TICKET_TAGS, { [LINK_COLS.TICKET]: ticketKey, [LINK_COLS.ACTIVE]: true });
  }

  #tagIdsFor(ticketKey) {
    return this.#activeLinks(ticketKey).map((r) => r.fields[LINK_COLS.TAG]);
  }

  #findLink(ticketKey, tagKey, activeOnly) {
    const filter = { [LINK_COLS.TICKET]: ticketKey, [LINK_COLS.TAG]: tagKey };
    if (activeOnly) filter[LINK_COLS.ACTIVE] = true;
    return this.#client().query(LISTS.TICKET_TAGS, { filter, top: 1 }).items[0] ?? null;
  }

  #materialize(rec) {
    return fieldsToTicket(rec.fields, this.#tagIdsFor(rec.fields.TicketKey));
  }

  #allTickets() {
    return this.#client().queryAll(LISTS.TICKETS).map((rec) => this.#materialize(rec));
  }

  #appendActivity(event) {
    this.#client().createItem(LISTS.ACTIVITY, activityToFields(event));
  }

  // Read the ticket, apply a domain rule (which mutates it + returns events), persist both.
  // The rule throws BEFORE mutating on an illegal transition / owner gate, so nothing persists.
  #mutateWithRule(ticketKey, ruleFn) {
    const rec = this.#requireTicketRecord(ticketKey);
    const ticket = this.#materialize(rec);
    const events = ruleFn(ticket);
    this.#client().updateItem(LISTS.TICKETS, rec.id, ticketToFields(ticket), { ifMatch: rec.etag });
    for (const e of events) this.#appendActivity(e);
    return ticket;
  }

  #tagLabel(tagKey) {
    const rec = this.#client().query(LISTS.TAGS, { filter: { TagKey: tagKey }, top: 1 }).items[0];
    return rec ? rec.fields.Label : null;
  }

  // ----- Tickets -----
  async getTicket(id) {
    const rec = this.#ticketRecord(id);
    return rec ? this.#materialize(rec) : null;
  }

  async listTickets(filter = {}) {
    let out = this.#allTickets();
    if (filter.deptId) out = out.filter((t) => t.assignedDeptId === filter.deptId);
    if (filter.assigneeId) out = out.filter((t) => t.assigneeId === filter.assigneeId);
    if (filter.status) out = out.filter((t) => t.status === filter.status);
    if (filter.openOnly) out = out.filter((t) => OPEN_STATUSES.has(t.status));
    return out;
  }

  async createTicket(input) {
    this.#client();
    const ticket = createTicket(input);
    this.#client().createItem(LISTS.TICKETS, ticketToFields(ticket));
    for (const tagId of ticket.tagIds) this.#createLink(ticket.id, tagId, { now: ticket.createdAt, actorId: input.submitterId ?? null, source: 'manual' });
    this.#appendActivity(createActivityEvent({
      escalationId: ticket.id, type: ACTIVITY_TYPE.CREATED,
      actorId: input.submitterId ?? null, to: { status: ticket.status },
      note: 'Ticket created', timestamp: ticket.createdAt,
    }));
    return ticket;
  }

  // ----- Assignment & lifecycle (each records activity via domain rules) -----
  async assignDepartment(id, deptId, opts = {}) { return this.#mutateWithRule(id, (t) => assignToDepartment(t, deptId, opts)); }
  async assignPerson(id, userId, opts = {}) { return this.#mutateWithRule(id, (t) => assignToPerson(t, userId, opts)); }
  async clearAssignee(id, opts = {}) { return this.#mutateWithRule(id, (t) => clearAssignee(t, opts)); }
  async setStatus(id, status, opts = {}) { return this.#mutateWithRule(id, (t) => changeStatus(t, status, opts)); }
  async setPriority(id, priority, opts = {}) { return this.#mutateWithRule(id, (t) => changePriority(t, priority, opts)); }

  // ----- Tags (Escalations_v2_TicketTags link list, soft-delete, D12) -----
  #createLink(ticketKey, tagKey, { now, actorId = null, source = 'manual' }) {
    this.#client().createItem(LISTS.TICKET_TAGS, {
      [LINK_COLS.KEY]: newId('tt'),
      [LINK_COLS.TICKET]: ticketKey,
      [LINK_COLS.TAG]: tagKey,
      [LINK_COLS.ACTIVE]: true,
      [LINK_COLS.REMOVED_AT]: null,
      [LINK_COLS.LABEL_SNAPSHOT]: this.#tagLabel(tagKey),
      [LINK_COLS.SOURCE]: source,
      [LINK_COLS.CREATED_AT]: now,
      [LINK_COLS.CREATED_BY]: actorId,
    });
  }

  async addTag(id, tagId, opts = {}) {
    const rec = this.#requireTicketRecord(id);
    const now = opts.now ?? new Date().toISOString();
    if (this.#findLink(id, tagId, true)) return this.#materialize(rec); // idempotent: active link exists
    const inactive = this.#findLink(id, tagId, false);
    if (inactive) {
      this.#client().updateItem(LISTS.TICKET_TAGS, inactive.id,
        { [LINK_COLS.ACTIVE]: true, [LINK_COLS.REMOVED_AT]: null }, { ifMatch: inactive.etag });
    } else {
      this.#createLink(id, tagId, { now, actorId: opts.actorId ?? null, source: 'manual' });
    }
    this.#appendActivity(createActivityEvent({
      escalationId: id, type: ACTIVITY_TYPE.FIELD_CHANGE, actorId: opts.actorId ?? null,
      to: { addedTag: tagId }, note: `Tag added: ${tagId}`, timestamp: now,
    }));
    return this.#materialize(this.#requireTicketRecord(id));
  }

  async removeTag(id, tagId, opts = {}) {
    const rec = this.#requireTicketRecord(id);
    const now = opts.now ?? new Date().toISOString();
    const active = this.#findLink(id, tagId, true);
    if (!active) return this.#materialize(rec); // no-op when absent
    this.#client().updateItem(LISTS.TICKET_TAGS, active.id,
      { [LINK_COLS.ACTIVE]: false, [LINK_COLS.REMOVED_AT]: now }, { ifMatch: active.etag });
    this.#appendActivity(createActivityEvent({
      escalationId: id, type: ACTIVITY_TYPE.FIELD_CHANGE, actorId: opts.actorId ?? null,
      to: { removedTag: tagId }, note: `Tag removed: ${tagId}`, timestamp: now,
    }));
    return this.#materialize(this.#requireTicketRecord(id));
  }

  // ----- Activity, comments, notes (three separate lists) -----
  async listActivity(id) {
    return this.#client().queryAll(LISTS.ACTIVITY, { EscalationKey: id })
      .map((r) => fieldsToActivity(r.fields))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async listComments(id) {
    return this.#client().queryAll(LISTS.COMMENTS, { EscalationKey: id })
      .map((r) => fieldsToComment(r.fields))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listNotes(id) {
    return this.#client().queryAll(LISTS.NOTES, { EscalationKey: id })
      .map((r) => fieldsToNote(r.fields))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addComment(id, input) {
    this.#requireTicketRecord(id);
    const comment = createComment({ ...input, escalationId: id });
    this.#client().createItem(LISTS.COMMENTS, commentToFields(comment));
    this.#appendActivity(createActivityEvent({
      escalationId: id, type: ACTIVITY_TYPE.COMMENT, actorId: comment.authorId,
      note: 'Comment posted', timestamp: comment.createdAt,
    }));
    return comment;
  }

  async addNote(id, input) {
    this.#requireTicketRecord(id);
    const note = createNote({ ...input, escalationId: id });
    this.#client().createItem(LISTS.NOTES, noteToFields(note));
    this.#appendActivity(createActivityEvent({
      escalationId: id, type: ACTIVITY_TYPE.NOTE, actorId: note.authorId,
      note: 'Internal note added', timestamp: note.createdAt,
    }));
    return note;
  }

  // ----- Views -----
  async departmentQueue(deptId, { openOnly = false } = {}) {
    return this.#allTickets().filter((t) => t.assignedDeptId === deptId && (!openOnly || OPEN_STATUSES.has(t.status)));
  }

  async myAssignedTickets(userId, { openOnly = false } = {}) {
    return this.#allTickets().filter((t) => t.assigneeId === userId && (!openOnly || OPEN_STATUSES.has(t.status)));
  }

  // ----- Reference data -----
  async listDepartments() { return this.#client().queryAll(LISTS.DEPARTMENTS).map((r) => fieldsToDept(r.fields)); }
  async listUsers() { return this.#client().queryAll(LISTS.USERS).map((r) => fieldsToUser(r.fields)); }
  async listTags() { return this.#client().queryAll(LISTS.TAGS).map((r) => fieldsToTag(r.fields)); }
}
