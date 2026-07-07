// Async-transport contract (Loop 22).
//
// The real live transport does network I/O, so every transport method returns a Promise. This
// suite proves the WHOLE committed async path locally — SharePointStore -> SharePointLiveClient
// -> async transport — by running the FULL store contract against an async transport backed by
// the in-memory FakeSharePointClient. 100% local: no network, no SDK, no auth, no URLs.
//
// This is the committed guard for the Loop 22 async fixes: without awaited client calls in
// SharePointStore (#appendActivity idempotency check, tag-label snapshot) an async client makes
// `findBy` return an always-truthy Promise and activity rows silently stop being written. This
// suite fails loudly if that regresses.

import { runStoreContract } from './store-contract/contract.js';
import { SharePointStore } from '../store/SharePointStore.js';
import { SharePointLiveClient } from '../backend/sharepoint/live/SharePointLiveClient.js';
import { createSeededFakeClient } from '../backend/sharepoint/fake/seed.js';

/**
 * Wrap the (synchronous) fake client in the TRANSPORT surface the live wrapper expects, with
 * every method genuinely async (microtask hop) — the same shape a real HTTP transport has.
 */
function createAsyncFakeTransport(seed) {
  const fake = createSeededFakeClient(seed);
  const asyncify = (fn) => async (...args) => {
    await Promise.resolve(); // force a real async boundary, like network I/O
    return fn(...args);
  };
  return {
    createItem: asyncify((list, fields) => fake.createItem(list, fields)),
    getItem: asyncify((list, id) => fake.getItem(list, id)),
    updateItem: asyncify((list, id, fields, opts) => fake.updateItem(list, id, fields, opts)),
    deleteItem: asyncify((list, id) => fake.deleteItem(list, id)),
    query: asyncify((list, opts) => fake.query(list, opts)),
    listNames: asyncify(() => fake.listNames()),
  };
}

runStoreContract('SharePointStore(LiveClient+async-transport)', (seed) => {
  const client = new SharePointLiveClient({ transport: createAsyncFakeTransport(seed), siteRef: 'local-async-fake' });
  return new SharePointStore({ client });
});
