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
| `run-live-contract.js` | **Loop 22.** Gated runner for the FULL store contract against the live test site: same fail-closed gate, then seeds each contract test through the live client, tracks every item it creates, deletes exactly those (run-created only — never lists, never pre-existing rows), and verifies post-run item counts match pre-run. Non-zero exit on any test failure. |
| `demo-fixtures.js` | **Loop 24.** Pure, client-injected demo fixture set (`esc_demo_loop24_*`, obviously TEST ONLY) + idempotent seed / exact-key cleanup engine. Refuses non-namespaced keys; unit-tested against the fake client. |
| `seed-demo-fixtures.js` | **Loop 24.** Gated CLI around the engine: seed (idempotent, reports created/reused), `--verify` (read-only), `--cleanup [--ticket <key>]…` (exact keys only, reports deleted + leftovers; non-zero exit unless leftovers = 0). |
| `testsite.config.example.json` | Placeholder config (safe, fail-closed defaults). Copy to `testsite.config.json` (git-ignored). |
| `d6AuthConfig.js` | **Loop 26 (D6 readiness).** Fail-closed validation contract for the FUTURE app-registration auth config: certificate-only, `Sites.Selected`, non-production, references-not-secrets; refuses placeholders, secret-style keys, and inline key material. No auth is performed; see `docs/D6_AUTH_APP_REGISTRATION_PLAN.md`. |
| `auth.config.example.json` | Placeholder D6 template (disabled, fail-closed). Real file: `auth.config.local.json` (git-ignored via `*.local.json`) — only after the D6 admin setup is approved and executed. |
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

# 3) Gated connectivity smoke (read-only):
node run-testsite-contract.js ./testsite.config.json

# 4) Full acceptance: the store contract against the live client (Loop 22 runner).
#    Seeds/cleans per test; deletes ONLY the items it created; exits non-zero on failure.
node run-live-contract.js ./testsite.config.json
```
If config/auth/transport are missing, the runner **stops with a clear message** — it does not
connect or fake a result.

**Wrapper is async (Loop 22):** every `SharePointLiveClient` method awaits the transport, since
a real transport does network I/O. Synchronous transports still work (`await` passes plain
values through), and the full store contract runs against the async path locally in
`tests/sharepoint-live-async-transport-contract.test.js` — no network required.

## Safety
Enforced by `assertSafe()` in the runner and by `tests/sharepoint-live-client-gate.test.js` +
`npm run validate`: approval flags required, non-production label required, `Escalations_v2_`
prefix required, legacy/production/OneDrive targets refused, no committed secrets/URLs/IDs, and
the wrapper throws `LiveNotConfiguredError` until a transport is injected.
