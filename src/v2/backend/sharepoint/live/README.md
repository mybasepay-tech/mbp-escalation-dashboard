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
| `d6AuthConfig.js` | **Loop 26 (D6 readiness), extended Loop 33.** Fail-closed validation contract for the app-auth config: certificate-only, `Sites.Selected`, non-production, references-not-secrets; refuses placeholders, secret-style keys, inline key material, and malformed certificate-store refs (`store:CurrentUser/My/<thumbprint>` is the only store shape accepted). |
| `appAuthTokenProvider.js` | **Loop 33 (D6 executed).** COMMITTED, identifier-free app-only token provider: OAuth2 client-credentials with a certificate-signed JWT assertion. Signing happens INSIDE the Windows certificate store (via a short PowerShell call) — the private key is never exported, read, or written to disk. Tokens are cached in memory only; every error is sanitized (GUID/URL/JWT/thumbprint redacted). |
| `appAuthTransport.js` | **Loop 33.** COMMITTED app-auth transport implementing the boundary below on top of the token provider. Two explicit api modes: `graph` (works with the Graph-resource `Sites.Selected` consent; platform limitation: Hyperlink columns are not writable — default behavior REFUSES such writes; validation runs may opt into counted `omit-and-report`) and `sharepoint-rest` (full column fidelity; requires the SHAREPOINT-resource `Sites.Selected` consent). Enforces the `Escalations_v2_` prefix and maps 404/412/429 to the typed errors. |
| `run-appauth-smoke.js` | **Loop 33.** Gated app-auth smoke: status → read-only access to every v2 list → namespaced CRUD (`esc_d6_loop33_*` keys only) → exact cleanup with a zero-leftover assertion. REFUSES to run on a non-app-auth transport. |
| `auth.config.example.json` | Placeholder D6 template (disabled, fail-closed). Real file: `auth.config.local.json` (git-ignored via `*.local.json`) — holds the tenant/client references, the certificate-store thumbprint ref, and the site reference. NEVER committed. |
| `.gitignore` | Ensures `testsite.config.json`, `*.local.json`, transport bootstraps, `.env`, secrets, token caches, and reports are never committed. |

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
**Loop 33 — the transport boundary now has a COMMITTED default.** `loadTransport()` resolves in
this order, both paths gated on git-ignored config:
1. **D6 app-auth (preferred):** if `auth.config.local.json` exists with `enableAppAuth: true`
   and passes `validateD6AuthConfig` (and its site reference matches the approved test-site
   reference exactly), the committed `appAuthTransport` runs with certificate app-only tokens —
   no operator token minting, no interactive sign-in. An enabled-but-invalid config THROWS
   (never silently skipped).
2. **Operator bootstrap (rollback path):** with app-auth absent or explicitly disabled
   (`enableAppAuth: false` is the documented rollback), the git-ignored module named by
   `transportModule` (e.g. `transport.local.js`) is loaded as before: it default-exports
   `createTransport(config)` and owns auth, paging tokens, Retry-After →
   `ThrottledError.retryAfterMs`, and column encoding by type.

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

# 3b) D6 app-auth smoke (Loop 33; requires auth.config.local.json with enableAppAuth=true):
#     status -> read-only list access -> namespaced CRUD (esc_d6_loop33_*) -> zero leftovers.
node run-appauth-smoke.js ./testsite.config.json

# 4) Full acceptance: the store contract against the live client (Loop 22 runner).
#    Seeds/cleans per test; deletes ONLY the items it created; exits non-zero on failure.
#    Under app-auth graph mode, set graphHyperlinkWriteBehavior "omit-and-report" in the
#    auth config for the run (two optional Hyperlink metadata fields; omissions are counted
#    and printed in the summary) — or use apiMode "sharepoint-rest" once the
#    SHAREPOINT-resource Sites.Selected consent exists.
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
