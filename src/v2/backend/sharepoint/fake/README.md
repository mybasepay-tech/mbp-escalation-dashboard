# FakeSharePoint Simulator (local, in-memory)

> **Loop 15.** A zero-dependency, in-memory stand-in for a SharePoint/Graph list client, used
> to implement and validate `SharePointStore` **before** any live test-site execution
> (decision **D19**).
>
> ⚠️ **100% local.** No network, no Microsoft Graph / PnP / Azure SDK, no auth, no URLs, no
> secrets, no env vars. It mimics *behaviors* (item ids, ETags, 404/412/429, paging, filtering,
> soft-delete link rows), not a real tenant.

## Files
| File | Purpose |
|------|---------|
| `FakeSharePointClient.js` | Owns named lists; CRUD + `query`/`queryAll` + a one-shot failure hook. |
| `FakeSharePointList.js` | One list: generated ids, monotonic ETags, optimistic concurrency, paging, insertion-order storage. |
| `FakeSharePointErrors.js` | `NotFoundError` (404), `ConflictError` (412 ETag), `ThrottledError` (429). |
| `FakeSharePointQuery.js` | Equality-filter predicate + stable sort helpers. |
| `seed.js` | `createSeededFakeClient(seed)` — provisions the 8 lists and loads a standard seed (tags become active `Escalations_v2_TicketTags` links). |

## How it's used
`SharePointStore` is constructed with an **injected** client:
```js
import { SharePointStore } from '../../../store/SharePointStore.js';
import { createSeededFakeClient } from './seed.js';

const store = new SharePointStore({ client: createSeededFakeClient(buildSeed()) });
```
The **same** store contract that passes against `MockStore` passes against this fake-backed
`SharePointStore` (see `tests/sharepoint-store-simulated-contract.test.js`). Without an injected
client, `SharePointStore` stays **fail-closed** (design-only) and throws on every call.

## What it models (and why)
- **ETag optimistic concurrency** — so the adapter's read-modify-write + `ifMatch` path is real.
- **404 / 412 / 429** — so error handling and (future) retry/backoff are exercised.
- **Paging** — so the adapter pages instead of assuming unbounded reads (5,000-item threshold).
- **Column-named items** — items store fields under SharePoint internal names (e.g. `TicketKey`,
  `Status`), so the real domain↔column mapping (`../mapping.js`) is exercised.
- **Active link rows** — `Escalations_v2_TicketTags` with `IsActive`/`RemovedAt` soft-delete and
  one-active-row-per-(ticket,tag), matching D12.

## What it does NOT model
Real SharePoint quirks: actual Person/Lookup column resolution, real throttling thresholds, view
limits, and Graph payload shapes. Those surface only on a live test site — which is why the
live first-green contract run remains the true acceptance gate (see
[`../../../../../docs/STORE_CONTRACT_TEST_SITE_PLAN.md`](../../../../../docs/STORE_CONTRACT_TEST_SITE_PLAN.md)).
