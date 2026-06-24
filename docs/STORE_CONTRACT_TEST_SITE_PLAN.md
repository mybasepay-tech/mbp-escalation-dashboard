# Store Contract — Test-Site Execution Plan (design-only)

> **Loop 12.** How the **existing** store contract harness (D13) will be reused to validate a
> future `SharePointStore` against a **disposable, non-production** SharePoint test site —
> without changing the contract itself.
>
> ⚠️ **DESIGN-ONLY.** Nothing here runs live. **No real env vars, config files, tenant/client
> IDs, site URLs, secrets, or live endpoints are added** — only **placeholder names** in prose.
> The harness today runs only against `MockStore`; the test-site wiring below is built **only**
> after D6/D7 + Rod approval (see
> [`SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md`](./SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md)).
>
> Companion: contract [`STORE_CONTRACT.md`](./STORE_CONTRACT.md), adapter plan
> [`SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md`](./SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md).

## 1. Reusing the existing harness
The contract in [`../src/v2/tests/store-contract/contract.js`](../src/v2/tests/store-contract/contract.js)
is **backend-agnostic**: `runStoreContract(label, makeStore)` registers all behavioral
expectations and takes a `makeStore(seed)` factory. Today:
```js
runStoreContract('MockStore', (seed) => new MockStore().load(seed));
```
The **same** call — same assertions, no edits — will validate the adapter:
```js
// FUTURE, test-site only, not implemented now:
runStoreContract('SharePointStore(test-site)', async (seed) => provisionAndLoad(seed));
```
The contract is the **single source of behavioral truth**; an adapter is correct only when it
passes it unchanged.

## 2. `makeStore` factory shape (future)
A test-site factory must, per invocation, return a store preloaded with the standard seed and
isolated from other runs. Shape (illustrative pseudocode — **no real values**):
```
async function makeSharePointTestStore(seed) {
  const cfg = loadTestSiteConfig();   // placeholders only: <TEST_SITE_REF>, <V2_APP_REF>
  const run = newRunNamespace();      // e.g. "ct_<timestamp>_<rand>" — unique, disposable
  await provisionRunData(cfg, run, seed); // create rows for THIS run only
  const store = new SharePointStore({ siteRef: cfg.siteRef, runNamespace: run });
  store.__teardown = () => cleanupRun(cfg, run);  // used in afterEach/after
  return store;
}
```
- Config is read from a **runner-provided** mechanism at execution time; this repo ships **no**
  config file and **no** secrets. Placeholders: `<TEST_SITE_REF>`, `<V2_APP_REF>`,
  `<RUN_NAMESPACE>`.
- The factory **never** references legacy and **never** writes outside the test site.

## 3. Setup / teardown expectations
- **Setup:** ensure the 8 lists exist (built via the runbook), then load the seed for the run's
  namespace. Setup must be **idempotent** and **fail-closed** if it detects a non-test target.
- **Teardown:** remove all rows created by the run (by `RunTag`, see §4); optionally delete the
  whole disposable site at the end of a session. Teardown runs even on test failure.
- The standard seed (`buildSeed()`) remains the dataset, so behavior matches `MockStore`.

## 4. Test-data isolation
- Every contract run gets a unique **run namespace** and tags every row it creates with a
  `RunTag` (e.g. a `Source`/marker column value or a key prefix) so concurrent or repeated runs
  never collide.
- Reads in a run are scoped to its `RunTag`; one run can never see another's data.
- Only **synthetic/seed** data is used — **never** production or legacy data (Phase 2).

## 5. Naming conventions for disposable runs
- Run namespace: `ct_<UTCstamp>_<shortRand>` (contract-test prefix; clearly disposable).
- Row keys within a run carry the namespace prefix (e.g. `esc_ct_<...>`), so cleanup is a
  prefix sweep and stray data is obvious.
- The test **site** name itself should contain `test`/`sandbox` and never resemble legacy.

## 6. Cleanup strategy
- **Per test:** `afterEach` calls the store's `__teardown` to delete that run's rows.
- **Per session:** `after` deletes any leftover `ct_*` namespaces (defensive sweep).
- **Disposable site:** the site is deletable wholesale at any time (runbook §14) — the ultimate
  cleanup. No legacy cleanup is ever needed (legacy untouched).

## 7. Handling flaky network / permission errors
- Wrap test-site calls with **bounded retry + backoff** for transient/throttling errors
  (HTTP 429/503); surface a clear message after the retry budget is exhausted.
- Treat **permission**/validation errors as **terminal** — do not retry; fail fast (a perms
  error may indicate a mis-scoped or wrong target, which must stop the run).
- Distinguish "infrastructure flake" (retry, may quarantine the test) from "contract failure"
  (a real behavioral mismatch — never retried away). Quarantine/flaky handling must **never**
  mask a genuine contract failure.

## 8. Required environment / config placeholders (NO real values)
Documented here so the runner can supply them later; **none are added to the repo**:
- `<TEST_SITE_REF>` — opaque reference to the disposable v2 test site.
- `<V2_APP_REF>` — opaque reference to the D6 test-scope app identity.
- `<RUN_NAMESPACE>` — per-run disposable namespace/prefix.
> No `.env`, no config file with tenant/client IDs or URLs, no secrets are committed. If a
> future runner needs them, they are injected **at execution time** outside version control.

## 9. What counts as the first green contract run
The **first green contract run** = the entire `runStoreContract('SharePointStore(test-site)', …)`
suite passes against the test site with:
- the standard seed loaded,
- all assertions identical to the `MockStore` run,
- isolation + teardown working (no residue), and
- no test quarantined to hide a failure.
This is the adapter's **acceptance signal** (D13) and the go-criterion in the runbook (§16).

## 10. What failures block the adapter
Any of these is a hard block (no promotion beyond the test site):
- A behavioral mismatch with the contract (ordering, auto-status, owner-only Complete,
  Reopened/Cancelled, stream separation, tag soft-delete/uniqueness, filtering).
- Activity not append-only/immutable, or a ticket changed without a matching activity row.
- Composite-uniqueness violations (more than one active link per ticket/tag).
- Any write reaching legacy, any production data used, or any secret/URL committed.
- Non-deterministic failures that cannot be shown to be pure infrastructure flake.
