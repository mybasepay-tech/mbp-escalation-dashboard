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
    /** One-shot throttle: set to an error to throw on the next mutating/reading op. */
    this._failNext = null;
  }

  /** Arrange for the next operation to throw the given error once (throttle/conflict sim). */
  failNextWith(error) { this._failNext = error; }

  _maybeThrottle() {
    if (this._failNext) {
      const e = this._failNext;
      this._failNext = null;
      throw e;
    }
  }

  _nextEtag() { return `W/"${++this._etagCounter}"`; }

  _public(rec) {
    // Return a defensive shallow copy so callers cannot mutate internal state directly.
    return { id: rec.id, etag: rec.etag, fields: { ...rec.fields } };
  }

  /** Create an item; returns the stored item with id + etag. */
  createItem(fields = {}) {
    this._maybeThrottle();
    const id = String(++this._idCounter);
    const rec = { id, etag: this._nextEtag(), seq: ++this._seqCounter, fields: { ...fields } };
    this._items.push(rec);
    this._byId.set(id, rec);
    return this._public(rec);
  }

  /** Get an item by id; throws NotFoundError if absent. */
  getItem(id) {
    this._maybeThrottle();
    const rec = this._byId.get(id);
    if (!rec) throw new NotFoundError(`${this.name}: item '${id}' not found`);
    return this._public(rec);
  }

  /** Update an item's fields. If ifMatch is given and stale, throws ConflictError (412). */
  updateItem(id, fields = {}, { ifMatch = null } = {}) {
    this._maybeThrottle();
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
    this._maybeThrottle();
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
    this._maybeThrottle();
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
