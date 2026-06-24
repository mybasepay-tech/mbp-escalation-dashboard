// SharePointLiveClient — REAL SharePoint client wrapper (thin adapter skeleton).
//
// Exposes the SAME method surface SharePointStore uses on FakeSharePointClient
// (createItem / getItem / updateItem / deleteItem / query / queryAll / findBy + list discovery),
// so the live wrapper is a drop-in replacement: `new SharePointStore({ client: liveClient })`.
//
// FAIL-CLOSED & DEPENDENCY-INJECTED:
//   * It hardcodes NO tenant ID, client ID, site URL, secret, or user ID — none.
//   * It imports NO Graph/PnP/Azure SDK and makes NO direct network call in committed code.
//   * The actual live calls go through an injected `transport` boundary that an operator wires up
//     at RUNTIME from a git-ignored bootstrap (using the real SDK + interactive auth there).
//   * Without a transport, EVERY operation throws LiveNotConfiguredError — it never connects or
//     fakes a result.
//
// The transport boundary contract (what the operator's runtime module must implement):
//   transport.createItem(listName, fields) -> { id, etag, fields }
//   transport.getItem(listName, id)        -> { id, etag, fields }            (404 -> notFound)
//   transport.updateItem(listName, id, fields, { ifMatch }) -> { id, etag, fields } (412 -> conflict)
//   transport.deleteItem(listName, id)     -> true
//   transport.query(listName, { filter, top, skipToken }) -> { items:[{id,etag,fields}], nextSkipToken }
//   transport.listNames()                  -> string[]    (optional; for discovery)
// The transport is responsible for auth, the real SDK calls, paging tokens, and translating
// HTTP 429/412/404 into the SharePointLiveErrors below (Retry-After -> ThrottledError.retryAfterMs).
//
// Field-shape fidelity: live Lookup/Person columns come back as objects; this wrapper DECODES
// them to plain keys on read (via the shared mapping helpers) so SharePointStore sees the same
// flat field values the fake produces. Encoding on write is a documented TODO for the transport
// (it knows each column's type from the provisioned list).

import { NotFoundError, ConflictError, ThrottledError, LiveNotConfiguredError } from './SharePointLiveErrors.js';
import { lookupField, personField } from '../mapping.js';

export class SharePointLiveClient {
  /**
   * @param {object} [opts]
   * @param {object} [opts.transport] - runtime-injected boundary implementing the transport
   *   contract above (built by the operator from the real SDK + interactive auth, NOT committed).
   * @param {string} [opts.siteRef]   - non-production test-site reference (from git-ignored config).
   */
  constructor(opts = {}) {
    this._transport = opts.transport ?? null;
    this._siteRef = opts.siteRef ?? null;
    /** True until a runtime transport is injected: every op fails closed. */
    this.designOnly = !this._transport;
  }

  #transport() {
    if (!this._transport) throw new LiveNotConfiguredError();
    return this._transport;
  }

  // Decode live-shaped field objects (Lookup/Person come back as objects) to plain keys, so the
  // adapter sees the same flat values the fake stores. Scalars pass through unchanged.
  #decodeFields(fields = {}) {
    const out = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        // Person objects expose Key/Title; Lookup objects expose LookupValue/LookupId.
        out[k] = ('Key' in v || 'Title' in v) ? personField.decode(v) : lookupField.decode(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  #decodeRecord(rec) {
    return rec ? { id: rec.id, etag: rec.etag, fields: this.#decodeFields(rec.fields) } : rec;
  }

  // TODO(live): encode plain keys -> Lookup/Person shapes per column type before write. The
  // transport currently owns encoding (it knows the provisioned column types). Kept as a
  // pass-through here to avoid guessing column types in committed code.
  #encodeFields(fields = {}) { return fields; }

  // ----- item operations (delegate to the injected transport) -----
  createItem(listName, fields) {
    return this.#decodeRecord(this.#transport().createItem(listName, this.#encodeFields(fields)));
  }

  getItem(listName, id) {
    return this.#decodeRecord(this.#transport().getItem(listName, id));
  }

  updateItem(listName, id, fields, opts) {
    return this.#decodeRecord(this.#transport().updateItem(listName, id, this.#encodeFields(fields), opts));
  }

  deleteItem(listName, id) {
    return this.#transport().deleteItem(listName, id);
  }

  query(listName, opts) {
    const res = this.#transport().query(listName, opts);
    return { items: (res.items ?? []).map((r) => this.#decodeRecord(r)), nextSkipToken: res.nextSkipToken ?? null };
  }

  /** Page through every matching item (same convenience the adapter relies on). */
  queryAll(listName, filter = {}, pageSize = 100) {
    const out = [];
    let skipToken = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { items, nextSkipToken } = this.query(listName, { filter, top: pageSize, skipToken });
      out.push(...items);
      if (nextSkipToken == null) break;
      skipToken = nextSkipToken;
    }
    return out;
  }

  /** First item matching an equality filter, or null. */
  findBy(listName, filter) { return this.query(listName, { filter, top: 1 }).items[0] ?? null; }

  /** List discovery (optional; used by provisioning/validation). */
  listNames() {
    const t = this.#transport();
    return typeof t.listNames === 'function' ? t.listNames() : [];
  }
}

// Re-export the error types so callers/tests have one import site.
export { NotFoundError, ConflictError, ThrottledError, LiveNotConfiguredError };
