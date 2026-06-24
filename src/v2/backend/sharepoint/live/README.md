# SharePoint Live Client Wrapper + Test-Site Execution Gate

> **Loop 17.** A real SharePoint client **wrapper** (same method surface as the FakeSharePoint
> simulator, so it drops into `SharePointStore`) plus a **fail-closed, gated runner** for the
> approved **non-production** test-site contract run.
>
> ⚠️ **No live anything is committed.** The wrapper imports **no** Graph/PnP/Azure SDK, hardcodes
> **no** tenant ID / client ID / site URL / secret / user ID, and makes **no** network call in
> committed code. It is **dependency-injected**: the real SDK calls live in an operator-supplied,
> **git-ignored** transport bootstrap wired up at runtime. Without that transport + an approving
> config, everything **fails closed**. Legacy is never targeted; no Power Automate flows; no
> writeback to legacy; no production cutover.

## Files
| File | Purpose |
|------|---------|
| `SharePointLiveClient.js` | Wrapper exposing `createItem/getItem/updateItem/deleteItem/query/queryAll/findBy/listNames`; delegates to an injected `transport`; decodes Lookup/Person shapes via the shared mapping. Fail-closed without a transport. |
| `SharePointLiveErrors.js` | `NotFoundError`(404) / `ConflictError`(412) / `ThrottledError`(429) / `LiveNotConfiguredError`, with the same `code` values the adapter's retry logic expects. |
| `run-testsite-contract.js` | Gated runner: loads git-ignored config, enforces approval+safety flags, refuses legacy/production, loads the runtime transport, smoke-tests connectivity, and points to the full contract run. |
| `testsite.config.example.json` | Placeholder config (safe, fail-closed defaults). Copy to `testsite.config.json` (git-ignored). |
| `.gitignore` | Ensures `testsite.config.json`, transport bootstraps, `.env`, secrets, and reports are never committed. |

## The transport boundary (operator provides at runtime, NOT committed)
The wrapper calls an injected `transport` implementing:
```
createItem(listName, fields)                 -> { id, etag, fields }
getItem(listName, id)                        -> { id, etag, fields }   (404 -> NotFoundError)
updateItem(listName, id, fields, {ifMatch})  -> { id, etag, fields }   (412 -> ConflictError)
deleteItem(listName, id)                     -> true
query(listName, { filter, top, skipToken })  -> { items:[{id,etag,fields}], nextSkipToken }
listNames()                                  -> string[]               (optional)
```
The bootstrap (e.g. `transport.local.js`, git-ignored) default-exports `createTransport(config)`
that builds this using the **real** SDK + **interactive** auth. It is responsible for auth, paging
tokens, Retry-After → `ThrottledError.retryAfterMs`, and column encoding by type. **TODO(live):**
finalize the transport against the chosen SDK once the test site + D6 app exist.

## Run it (operator, at runtime — only when approved)
```powershell
# 1) Prepare git-ignored config (never committed):
Copy-Item testsite.config.example.json testsite.config.json
#    set phase2Approved=true, contractRunApproved=true, the approved non-production site reference,
#    and transportModule -> your git-ignored bootstrap path.

# 2) Provision the lists first (separate fail-closed package), dry-run then execute:
#    ../provisioning/provision-sharepoint-v2.ps1            # dry-run
#    ../provisioning/provision-sharepoint-v2.ps1 -Execute

# 3) Gated connectivity + contract pointer:
node run-testsite-contract.js ./testsite.config.json

# 4) Full acceptance: run the store contract against the live client (see
#    docs/STORE_CONTRACT_TEST_SITE_PLAN.md). First all-green run = acceptance gate.
```
If config/auth/transport are missing, the runner **stops with a clear message** — it does not
connect or fake a result.

## Safety
Enforced by `assertSafe()` in the runner and by `tests/sharepoint-live-client-gate.test.js` +
`npm run validate`: approval flags required, non-production label required, `Escalations_v2_`
prefix required, legacy/production/OneDrive targets refused, no committed secrets/URLs/IDs, and
the wrapper throws `LiveNotConfiguredError` until a transport is injected.
