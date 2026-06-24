// FakeSharePointList — an in-memory stand-in for a single SharePoint list.
//
// 100% local; no network, no SDKs. Models the behaviors the adapter depends on:
//   * generated item ids + monotonic ETags
//   * optimistic concurrency via ifMatch ETag (412 conflict on mismatch)
//   * not-found (404) on missing items
//   * insertion-ordered storage (append-only friendly) + stable filtered/paged reads
//   * a one-shot throttling hook (429) for resilience testing
// Items store fields under SharePoint *column internal names* (e.g. TicketKey, Status), so the
// adapter exercises real column mapping. Determinism: ids/etags come from per-list counters.

import { NotFoundError, ConflictError, ThrottledError } from './FakeSharePointErrors.js';
import { buildPredicate } from './FakeSharePointQuery.js';

export class FakeSharePointList {
  constructor(name) {
    this.name = name;
    this._items = [];        // insertion order preserved
    this._byId = new Map();  // id -> internal record
    this._idCounter = 0;
    this._etagCounter = 0;
    this._seqCounter = 0;
    /** Queue of failure specs: { error, op, remaining }. op=null matches any operation. */
    this._failures = [];
  }

  /**
   * Inject a failure for upcoming operations (throttle/conflict/etc.).
   * @param {Error} error - the error to throw.
   * @param {object} [opts]
   * @param {('create'|'get'|'update'|'delete'|'query'|null)} [opts.op=null] - restrict to one op.
   * @param {number} [opts.times=1] - how many matching ops should fail.
   */
  failOn(error, { op = null, times = 1 } = {}) {
    this._failures.push({ error, op, remaining: times });
  }

  /** Shorthand: fail the very next operation once (any op). */
  failNextWith(error) { this.failOn(error, { op: null, times: 1 }); }

  /** Clear all pending injected failures. */
  clearFailures() { this._failures = []; }

  _maybeFail(op) {
    const spec = this._failures.find((s) => (s.op === null || s.op === op) && s.remaining > 0);
    if (!spec) return;
    spec.remaining -= 1;
    if (spec.remaining <= 0) this._failures = this._failures.filter((s) => s !== spec);
    throw spec.error;
  }

  _nextEtag() { return `W/"${++this._etagCounter}"`; }

  _public(rec) {
    // Return a defensive shallow copy so callers cannot mutate internal state directly.
    return { id: rec.id, etag: rec.etag, fields: { ...rec.fields } };
  }

  /** Create an item; returns the stored item with id + etag. */
  createItem(fields = {}) {
    this._maybeFail('create');
    const id = String(++this._idCounter);
    const rec = { id, etag: this._nextEtag(), seq: ++this._seqCounter, fields: { ...fields } };
    this._items.push(rec);
    this._byId.set(id, rec);
    return this._public(rec);
  }

  /** Get an item by id; throws NotFoundError if absent. */
  getItem(id) {
    this._maybeFail('get');
    const rec = this._byId.get(id);
    if (!rec) throw new NotFoundError(`${this.name}: item '${id}' not found`);
    return this._public(rec);
  }

  /** Update an item's fields. If ifMatch is given and stale, throws ConflictError (412). */
  updateItem(id, fields = {}, { ifMatch = null } = {}) {
    this._maybeFail('update');
    const rec = this._byId.get(id);
    if (!rec) throw new NotFoundError(`${this.name}: item '${id}' not found`);
    if (ifMatch !== null && ifMatch !== rec.etag) {
      throw new ConflictError(`${this.name}: item '${id}' changed since read (etag mismatch)`);
    }
    rec.fields = { ...rec.fields, ...fields };
    rec.etag = this._nextEtag();
    return this._public(rec);
  }

  /** Delete an item by id (used for hard cleanup; the adapter prefers soft-delete fields). */
  deleteItem(id) {
    this._maybeFail('delete');
    if (!this._byId.has(id)) throw new NotFoundError(`${this.name}: item '${id}' not found`);
    this._byId.delete(id);
    this._items = this._items.filter((r) => r.id !== id);
    return true;
  }

  /**
   * Query with an equality `filter` over column names, with paging.
   * Returns { items, nextSkipToken }. `skipToken` is an integer offset (opaque to callers).
   */
  query({ filter = {}, top = 100, skipToken = 0 } = {}) {
    this._maybeFail('query');
    const pred = buildPredicate(filter);
    const matched = this._items.filter((r) => pred(r.fields)); // insertion order
    const start = Number(skipToken) || 0;
    const page = matched.slice(start, start + top);
    const next = start + top < matched.length ? start + top : null;
    return { items: page.map((r) => this._public(r)), nextSkipToken: next };
  }

  /** Total item count (all, unfiltered). */
  count() { return this._items.length; }
}
