// FakeSharePointClient — an in-memory stand-in for a SharePoint/Graph list client.
//
// 100% local; NO network, NO Graph/PnP/Azure SDK, NO auth, NO URLs. It owns a set of named
// FakeSharePointList instances and exposes a small CRUD+query surface that SharePointStore is
// written against. Swapping this for a real client later is an implementation detail behind the
// same method names — the adapter and the store contract do not change.

import { FakeSharePointList } from './FakeSharePointList.js';
import { NotFoundError } from './FakeSharePointErrors.js';

export class FakeSharePointClient {
  constructor() {
    /** @type {Map<string, FakeSharePointList>} */
    this._lists = new Map();
    this.designOnly = false; // a real, usable (but local) client
  }

  /** Idempotently create a list. */
  ensureList(name) {
    if (!this._lists.has(name)) this._lists.set(name, new FakeSharePointList(name));
    return this._lists.get(name);
  }

  hasList(name) { return this._lists.has(name); }
  listNames() { return [...this._lists.keys()]; }

  _list(name) {
    const l = this._lists.get(name);
    if (!l) throw new NotFoundError(`list '${name}' does not exist`);
    return l;
  }

  // ----- item operations (delegate to the named list) -----
  createItem(listName, fields) { return this._list(listName).createItem(fields); }
  getItem(listName, id) { return this._list(listName).getItem(id); }
  updateItem(listName, id, fields, opts) { return this._list(listName).updateItem(id, fields, opts); }
  deleteItem(listName, id) { return this._list(listName).deleteItem(id); }
  query(listName, opts) { return this._list(listName).query(opts); }

  /** Page through every matching item (adapter convenience; keeps page sizes realistic). */
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

  /** Test hook: make the next operation on a list throw the given error once (e.g. throttle). */
  failNextOn(listName, error) { this._list(listName).failNextWith(error); }
}
