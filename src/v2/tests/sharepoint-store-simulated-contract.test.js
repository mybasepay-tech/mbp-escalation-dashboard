// SharePointStore must pass the SAME store contract as MockStore — against a local, in-memory
// FakeSharePoint simulator (no network, no SDKs, no live calls). This is the D13/D16 acceptance
// gate exercised locally before any live test-site execution (D19).
import { SharePointStore } from '../store/SharePointStore.js';
import { createSeededFakeClient } from '../backend/sharepoint/fake/seed.js';
import { runStoreContract } from './store-contract/contract.js';

runStoreContract('SharePointStore(FakeSharePoint)', (seed) =>
  new SharePointStore({ client: createSeededFakeClient(seed) }));
