// SharePointStore — EscalationStore adapter for SharePoint List v2.
//
// Two modes:
//   * DESIGN-ONLY (default, no client): every operation throws a clear design-only error.
//   * LOCAL/SIMULATED (constructed with an injected client): operates against an injected
//     SharePoint-like client. In this repo the only such client is the in-memory
//     FakeSharePointClient (backend/sharepoint/fake/) — NO network, NO Graph/PnP/Azure SDK.
//
// Loop 16 hardening (D20) — realistic SharePoint failure modes, all proven locally:
//   * Throttling (429): bounded retry/backoff (injectable sleep; deterministic in tests).
//   * ETag conflict (412): re-read latest, re-apply the domain rule, retry; fail clearly if
//     exhausted.
//   * Ticket + activity atomicity: activity appends are idempotent on ActivityKey and retried
//     on transient failure (no duplicates); a permanent append failure raises a clear
//     compensation error rather than silently losing the activity row.
//   * Tag links: one ACTIVE Escalations_v2_TicketTags row per (ticket, tag); stale-read/dup
//     races are reconciled (extras soft-deleted), soft-deleted links reactivated not duplicated.
//
// HARD RULES (enforced by tests/safety.test.js, scripts/validate.js, and the contract tests):
//   * No network calls; no SDK imports; no credentials/env vars/secrets/live URLs.
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

/** Raised when a ticket change persisted but its activity row could not be appended. */
export class ActivityAppendError extends Error {
  constructor(event, cause) {
    super(`Activity append failed after retries for ${event.escalationId} (type=${event.type}); ` +
      'ticket change persisted but activity NOT recorded — compensation required.');
    this.name = 'ActivityAppendError';
    this.cause = cause;
    this.compensation = { ticketChangePersisted: true, activityRecorded: false, activityKey: event.id };
  }
}

const DEFAULT_RETRY = Object.freeze({
  maxAttempts: 4,
  baseDelayMs: 0,
  // No real timers by default → deterministic tests. Injectable for real backoff later.
  sleep: async () => {},
  onThrottleRetry: null,
  onConflictRetry: null,
});

export class SharePointStore extends EscalationStore {
  /**
   * @param {object} [opts]
   * @param {object} [opts.client] - injected SharePoint-like client (e.g. FakeSharePointClient).
   * @param {object} [opts.retry]  - retry overrides { maxAttempts, baseDelayMs, sleep, onThrottleRetry, onConflictRetry }.
   */
  constructor(opts = {}) {
    super();
    this._client = opts.client ?? null;
    this._retry = { ...DEFAULT_RETRY, ...(opts.retry ?? {}) };
    /** True when no client is injected: every operation fails closed. */
    this.designOnly = !this._client;
  }

  #client() {
    if (!this._client) throw new Error(DESIGN_ONLY_MESSAGE);
    return this._client;
  }

  // ----- resilience: retry transient throttling (429) -----
  async #withRetry(fn) {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (e) {
        const throttled = e && e.code === 'throttled';
        if (throttled && attempt < this._retry.maxAttempts - 1) {
          attempt += 1;
          this._retry.onThrottleRetry?.(attempt, e);
          await this._retry.sleep(e.retryAfterMs ?? this._retry.baseDelayMs);
          continue;
        }
        throw e;
      }
    }
  }

  // ----- client op wrappers (each retries on throttling) -----
  async #findOne(list, filter) { return this.#withRetry(() => this.#client().findBy(list, filter)); }
  async #all(list, filter = {}) { return this.#withRetry(() => this.#client().queryAll(list, filter)); }
  async #create(list, fields) { return this.#withRetry(() => this.#client().createItem(list, fields)); }
  async #update(list, id, fields, opts) { return this.#withRetry(() => this.#client().updateItem(list, id, fields, opts)); }

  // ----- ticket helpers -----
  async #ticketRecord(ticketKey) { return this.#findOne(LISTS.TICKETS, { TicketKey: ticketKey }); }
  async #requireTicketRecord(ticketKey) {
    const rec = await this.#ticketRecord(ticketKey);
    if (!rec) throw new Error(`Unknown ticket: ${ticketKey}`);
    return rec;
  }
  async #tagIdsFor(ticketKey) {
    const links = await this.#all(LISTS.TICKET_TAGS, { [LINK_COLS.TICKET]: ticketKey, [LINK_COLS.ACTIVE]: true });
    return links.map((r) => r.fields[LINK_COLS.TAG]);
  }
  async #materialize(rec) {
    return fieldsToTicket(rec.fields, await this.#tagIdsFor(rec.fields.TicketKey));
  }
  async #allTickets() {
    const recs = await this.#all(LISTS.TICKETS);
    return Promise.all(recs.map((r) => this.#materialize(r)));
  }

  // ----- atomicity: idempotent, retried activity append (+ clear compensation on failure) -----
  async #appendActivity(event) {
    try {
      await this.#withRetry(async () => {
        const existing = this.#client().findBy(LISTS.ACTIVITY, { ActivityKey: event.id });
        if (existing) return; // idempotent: never duplicate on retry
        this.#client().createItem(LISTS.ACTIVITY, activityToFields(event));
      });
    } catch (cause) {
      throw new ActivityAppendError(event, cause);
    }
  }

  // Read ticket, apply a domain rule (mutates + returns events), persist both, with ETag
  // conflict retry. The rule throws BEFORE mutating on illegal transition / owner gate, so a
  // logical rejection propagates immediately and is never retried.
  async #mutateWithRule(ticketKey, ruleFn) {
    let attempt = 0;
    for (;;) {
      const rec = await this.#requireTicketRecord(ticketKey);
      const ticket = await this.#materialize(rec);
      const events = ruleFn(ticket); // may throw (illegal/owner) -> propagate, no retry
      try {
        await this.#update(LISTS.TICKETS, rec.id, ticketToFields(ticket), { ifMatch: rec.etag });
      } catch (e) {
        if (e && e.code === 'conflict' && attempt < this._retry.maxAttempts - 1) {
          attempt += 1;
          this._retry.onConflictRetry?.(attempt, e);
          continue; // re-read latest + re-apply the rule
        }
        throw e;
      }
      for (const ev of events) await this.#appendActivity(ev);
      return ticket;
    }
  }

  #tagLabelSync(tagKey) {
    const rec = this.#client().findBy(LISTS.TAGS, { TagKey: tagKey });
    return rec ? rec.fields.Label : null;
  }

  async #createLink(ticketKey, tagKey, { now, actorId = null, source = 'manual' }) {
    await this.#create(LISTS.TICKET_TAGS, {
      [LINK_COLS.KEY]: newId('tt'),
      [LINK_COLS.TICKET]: ticketKey,
      [LINK_COLS.TAG]: tagKey,
      [LINK_COLS.ACTIVE]: true,
      [LINK_COLS.REMOVED_AT]: null,
      [LINK_COLS.LABEL_SNAPSHOT]: this.#tagLabelSync(tagKey),
      [LINK_COLS.SOURCE]: source,
      [LINK_COLS.CREATED_AT]: now,
      [LINK_COLS.CREATED_BY]: actorId,
    });
  }

  async #activeLinks(ticketKey, tagKey) {
    return this.#all(LISTS.TICKET_TAGS, { [LINK_COLS.TICKET]: ticketKey, [LINK_COLS.TAG]: tagKey, [LINK_COLS.ACTIVE]: true });
  }

  // Enforce exactly one active link per (ticket, tag): keep the earliest, soft-delete extras.
  async #reconcileSingleActive(ticketKey, tagKey, now) {
    const active = await this.#activeLinks(ticketKey, tagKey);
    for (const extra of active.slice(1)) {
      await this.#update(LISTS.TICKET_TAGS, extra.id,
        { [LINK_COLS.ACTIVE]: false, [LINK_COLS.REMOVED_AT]: now }, { ifMatch: extra.etag });
    }
    return active.length;
  }

  // ----- Tickets -----
  async getTicket(id) {
    const rec = await this.#ticketRecord(id);
    return rec ? this.#materialize(rec) : null;
  }

  async listTickets(filter = {}) {
    let out = await this.#allTickets();
    if (filter.deptId) out = out.filter((t) => t.assignedDeptId === filter.deptId);
    if (filter.assigneeId) out = out.filter((t) => t.assigneeId === filter.assigneeId);
    if (filter.status) out = out.filter((t) => t.status === filter.status);
    if (filter.openOnly) out = out.filter((t) => OPEN_STATUSES.has(t.status));
    return out;
  }

  async createTicket(input) {
    this.#client();
    const ticket = createTicket(input);
    await this.#create(LISTS.TICKETS, ticketToFields(ticket));
    for (const tagId of ticket.tagIds) {
      await this.#createLink(ticket.id, tagId, { now: ticket.createdAt, actorId: input.submitterId ?? null, source: 'manual' });
    }
    await this.#appendActivity(createActivityEvent({
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

  // ----- Tags (Escalations_v2_TicketTags link list, soft-delete, one-active-per-pair, D12) -----
  async addTag(id, tagId, opts = {}) {
    const rec = await this.#requireTicketRecord(id);
    const now = opts.now ?? new Date().toISOString();
    const active = await this.#activeLinks(id, tagId);
    if (active.length === 0) {
      const inactive = await this.#findOne(LISTS.TICKET_TAGS, { [LINK_COLS.TICKET]: id, [LINK_COLS.TAG]: tagId });
      if (inactive) {
        await this.#update(LISTS.TICKET_TAGS, inactive.id,
          { [LINK_COLS.ACTIVE]: true, [LINK_COLS.REMOVED_AT]: null }, { ifMatch: inactive.etag });
      } else {
        await this.#createLink(id, tagId, { now, actorId: opts.actorId ?? null, source: 'manual' });
      }
      // Reconcile in case a racing writer also inserted an active link (stale read).
      await this.#reconcileSingleActive(id, tagId, now);
      await this.#appendActivity(createActivityEvent({
        escalationId: id, type: ACTIVITY_TYPE.FIELD_CHANGE, actorId: opts.actorId ?? null,
        to: { addedTag: tagId }, note: `Tag added: ${tagId}`, timestamp: now,
      }));
    } else if (active.length > 1) {
      // Already active but duplicated (race) — converge to one, no new event (idempotent).
      await this.#reconcileSingleActive(id, tagId, now);
    }
    return this.#materialize(rec);
  }

  async removeTag(id, tagId, opts = {}) {
    const rec = await this.#requireTicketRecord(id);
    const now = opts.now ?? new Date().toISOString();
    const active = await this.#activeLinks(id, tagId);
    if (active.length === 0) return this.#materialize(rec); // no-op when absent
    for (const link of active) { // soft-delete all active (covers any duplicates)
      await this.#update(LISTS.TICKET_TAGS, link.id,
        { [LINK_COLS.ACTIVE]: false, [LINK_COLS.REMOVED_AT]: now }, { ifMatch: link.etag });
    }
    await this.#appendActivity(createActivityEvent({
      escalationId: id, type: ACTIVITY_TYPE.FIELD_CHANGE, actorId: opts.actorId ?? null,
      to: { removedTag: tagId }, note: `Tag removed: ${tagId}`, timestamp: now,
    }));
    return this.#materialize(rec);
  }

  // ----- Activity, comments, notes (three separate lists) -----
  async listActivity(id) {
    const rows = await this.#all(LISTS.ACTIVITY, { EscalationKey: id });
    return rows.map((r) => fieldsToActivity(r.fields)).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async listComments(id) {
    const rows = await this.#all(LISTS.COMMENTS, { EscalationKey: id });
    return rows.map((r) => fieldsToComment(r.fields)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listNotes(id) {
    const rows = await this.#all(LISTS.NOTES, { EscalationKey: id });
    return rows.map((r) => fieldsToNote(r.fields)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addComment(id, input) {
    await this.#requireTicketRecord(id);
    const comment = createComment({ ...input, escalationId: id });
    await this.#create(LISTS.COMMENTS, commentToFields(comment));
    await this.#appendActivity(createActivityEvent({
      escalationId: id, type: ACTIVITY_TYPE.COMMENT, actorId: comment.authorId,
      note: 'Comment posted', timestamp: comment.createdAt,
    }));
    return comment;
  }

  async addNote(id, input) {
    await this.#requireTicketRecord(id);
    const note = createNote({ ...input, escalationId: id });
    await this.#create(LISTS.NOTES, noteToFields(note));
    await this.#appendActivity(createActivityEvent({
      escalationId: id, type: ACTIVITY_TYPE.NOTE, actorId: note.authorId,
      note: 'Internal note added', timestamp: note.createdAt,
    }));
    return note;
  }

  // ----- Views -----
  async departmentQueue(deptId, { openOnly = false } = {}) {
    return (await this.#allTickets()).filter((t) => t.assignedDeptId === deptId && (!openOnly || OPEN_STATUSES.has(t.status)));
  }

  async myAssignedTickets(userId, { openOnly = false } = {}) {
    return (await this.#allTickets()).filter((t) => t.assigneeId === userId && (!openOnly || OPEN_STATUSES.has(t.status)));
  }

  // ----- Reference data -----
  async listDepartments() { return (await this.#all(LISTS.DEPARTMENTS)).map((r) => fieldsToDept(r.fields)); }
  async listUsers() { return (await this.#all(LISTS.USERS)).map((r) => fieldsToUser(r.fields)); }
  async listTags() { return (await this.#all(LISTS.TAGS)).map((r) => fieldsToTag(r.fields)); }
}
