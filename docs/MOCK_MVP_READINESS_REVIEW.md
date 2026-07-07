# Mock MVP Readiness Review — Escalation System v2

> Loop 6 (Hardening + Decision Readiness); extended in Loop 8 (§3a, SharePoint backend
> readiness — design-only). This review summarizes the state of the
> **mock-first** v2 MVP and what must be decided before any backend / SharePoint / Graph /
> Dataverse / migration work begins. **Nothing here connects to or modifies any production
> system.**

## 1. What the mock MVP currently supports
Implemented under [`../src/v2/`](../src/v2/), 100% local and in-memory:

- **Domain model:** Tickets, Departments, Users, Tags, Comments, Notes, ActivityEvents,
  with statuses, priorities, and computed `daysOpen` (clamped ≥ 0).
- **Assignment model:** assign to department/queue, to a person, or both; person-assigned
  tickets remain visible in the department queue.
- **Status lifecycle:** the 9 statuses with a transition guard, plus assignment-driven
  auto-status (New / Not yet assigned → Assigned on person assignment; never beyond
  Assigned; clear-assignee reverts).
- **Activity log:** append-only, typed events (`created`, `assignment_change`,
  `status_change`, `priority_change`, `field_change`, `comment`, `note`,
  `migration_normalization`) — not a monolithic text blob.
- **Comments & notes:** public comments and internal notes are **separate streams** from
  activity and from each other; notes carry `visibility: 'internal'` metadata.
- **Tags:** add/remove with activity events; shown in list and detail.
- **Department panel filters:** all, unassigned-in-dept, assigned-to-me, assigned-to-others,
  in-progress, pending-review, resolved-awaiting-closure, migrated/legacy, high-priority.
- **My Assigned Tickets:** current-user-only view.
- **Reporting (mock):** totals; by status / department / priority; unassigned;
  assigned-to-current-user; resolved-awaiting-closure; legacy/migrated counts.
- **Local UI shell:** zero-dependency browser UI served by a loopback static server.
- **Data-access seam:** `EscalationStore` contract with an in-memory `MockStore`; the only
  backend in the MVP.

## 2. What is intentionally NOT connected
By design and per the project safety rules, the MVP does **not**:

- Connect to Microsoft Graph, SharePoint, Power Automate, or Azure Functions.
- Contain credentials, tenant/client IDs, secrets, OAuth scopes, production URLs, or real
  legacy URLs.
- Use MSAL or any auth flow.
- Read from or write to the legacy tracker (no legacy integration code exists).
- Persist anything — state is in-memory and resets on reload.
- Implement any backend adapter (no `SharePointGraphStore`, no `DataverseStore`, no API
  client).

## 3. What has been validated
- **Automated tests:** 90 passing (`node --test`) across rules, store, interactions
  (comments/notes/tags), views (filters/reporting), UI smoke (view-model), safety, the
  design-only SharePoint schema check (Loop 8 + Loop 9, incl. the D12 tag link list and
  admin-package/dry-run doc checks), and the Loop 10 **store contract harness** (run against
  `MockStore`) plus the `SharePointStore` design-only stub checks.
- **Safety scans:** source contains no production-integration strings or network calls;
  browser UI files contain no `fetch`/`XMLHttpRequest`; the local server binds to loopback
  only and rejects path traversal; mock legacy references use a clearly-fake `.invalid`
  domain.
- **Behavioral guarantees:** auto-status rules, department-queue visibility of
  person-assigned tickets, comment/note separation, tag idempotency, and reporting totals
  reconcile — all asserted by tests.
- **Aggregate gate:** `npm run validate` runs the suite plus a tree-wide readiness scan
  (see [`../src/v2/scripts/validate.js`](../src/v2/scripts/validate.js)).

## 3a. Loop 8 — SharePoint backend readiness package (design-only)
Loop 8 added a **design-only** backend readiness package that prepares the ground for a
future SharePoint List v2 backend **without building anything live**:

- [`SHAREPOINT_V2_BACKEND_READINESS.md`](./SHAREPOINT_V2_BACKEND_READINESS.md) — why
  SharePoint List v2 is the provisional target, why Power Automate is deferred for MVP phase
  1, separation from legacy, required lists, field/column mapping, indexes/views, permission
  assumptions, future adapter approach, risks/open questions, manual admin steps, and an
  AI recommendation checkpoint.
- [`BACKEND_ADAPTER_PLAN.md`](./BACKEND_ADAPTER_PLAN.md) — `MockStore` (now) vs. a future
  `SharePointStore`, the store interface expectations, read/write methods, error handling,
  and mock-parity rules.
- A **static, design-only** schema:
  [`../src/v2/backend/sharepoint/schema.sharepoint-v2.json`](../src/v2/backend/sharepoint/schema.sharepoint-v2.json),
  validated locally by
  [`../src/v2/scripts/validateSharePointSchema.js`](../src/v2/scripts/validateSharePointSchema.js)
  (wired into `npm run validate`) and by `tests/sharepoint-schema.test.js`.
- Decision **D11** in [`DECISION_LOG.md`](./DECISION_LOG.md).

**Confirmed: no live backend was added.** No Graph/SharePoint/Dataverse/Azure/Power Automate
connection code, no credentials/tenant/client IDs/secrets/live URLs, no real lists, and no
flows. The schema is static JSON that connects to nothing; the validator and tests only read
local files. The `EscalationStore` abstraction is unchanged and `MockStore` remains the only
backend. This is **design-only readiness**; live work stays blocked by D3/D6/D7.

### Loop 9 — schema hardening + admin build package (design-only)
Loop 9 hardened the readiness package, still entirely design-only:
- **D12 (Accepted, design-only):** tags use a dedicated many-to-many link list
  (`Escalations_v2_TicketTags`) — **no** delimited tag field on Tickets. `Escalations_v2_Tags`
  remains the dictionary. Schema now defines 8 lists, with tag-by-ticket / ticket-by-tag views
  and indexes, soft-delete, and label snapshots.
- **Admin build package:** [`SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md`](./SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md)
  — a *design-only*, "do not run against production yet" build recipe (lists, columns,
  indexes, views, permissions, naming/ownership conventions, rollback, post-build validation,
  legacy non-interference).
- **Dry-run gate:** [`../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md`](../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md)
  — pre-build safety checks (not-legacy target, no write-back, no flows, no Graph/live API,
  schema match, rollback).
- **Validator + tests hardened:** `validateSharePointSchema.js` and `sharepoint-schema.test.js`
  now assert the link list, the no-delimited-tags rule, stable internalName/displayName, tag
  lookup views/indexes, and the presence + safety language of the new docs.

Still **design-only**: no live integration, no flows, `MockStore` unchanged, `EscalationStore`
intact.

### Loop 10 — store contract harness + SharePointStore stub (design-only)
Loop 10 made the backend-swap promise **executable**, still entirely design-only:
- **Reusable store contract** ([`../src/v2/tests/store-contract/contract.js`](../src/v2/tests/store-contract/contract.js),
  documented in [`STORE_CONTRACT.md`](./STORE_CONTRACT.md)): one suite of behavioral
  expectations (CRUD, assignment/auto-status, owner-only Complete, Reopened/Cancelled,
  comments/notes/tags, append-only activity, store-level filtering) that runs against
  **`MockStore`** today via a `makeStore(seed)` factory.
- **`SharePointStore` design-only stub** ([`../src/v2/store/SharePointStore.js`](../src/v2/store/SharePointStore.js)):
  mirrors the interface, throws a clear design-only error on every operation, imports no
  SDKs, makes no network calls, holds no secrets/env vars/URLs.
- **D13 (Accepted, design-only):** the store contract is the **acceptance gate** for any
  future backend adapter.
- **Validator + tests:** `npm run validate` adds a "SharePointStore adapter is design-only"
  check; tests assert the contract passes on `MockStore` and that the stub is inert and
  marker-free.

`MockStore` remains the only active backend; the `EscalationStore` abstraction is intact; no
live integration, no flows.

### Loop 11 — backend decision, parallel-run & cutover readiness (design-only)
- **D3 DECIDED:** the backend target is **SharePoint List v2 / Microsoft List v2**. This
  closes the previously-blocking backend choice; it does **not** authorize a live build (still
  gated by D6/D7 and the checklists).
- **D14 (Accepted) — parallel-run transition:** the legacy tracker **stays operational** and
  is the source of truth for users while v2 is built separately, with a staged cutover and
  rollback at every step. See [`PARALLEL_RUN_AND_CUTOVER_PLAN.md`](./PARALLEL_RUN_AND_CUTOVER_PLAN.md).
- **D15 (Accepted) — no legacy writeback:** no writeback to legacy during MVP/build/migration
  unless separately approved; drift is corrected in the v2 copy only.
- **New docs:** [`PARALLEL_RUN_AND_CUTOVER_PLAN.md`](./PARALLEL_RUN_AND_CUTOVER_PLAN.md),
  [`LEGACY_TO_V2_MAPPING_PLAN.md`](./LEGACY_TO_V2_MAPPING_PLAN.md),
  [`AI_AUTONOMY_GUARDRAILS.md`](./AI_AUTONOMY_GUARDRAILS.md). Power Automate stays deferred
  (D11); `SharePointStore` stays a design-only stub (D13); Graph/live stays blocked.
- Still **design-only**: no live integration, no real lists/flows, no legacy writeback;
  `MockStore` active; `EscalationStore` intact.

### Loop 12 — Phase-2 test-site build runbook & adapter plan (design-only)
Loop 12 made Phase 2 **execution-ready** without doing anything live:
- **Test-site build runbook** ([`SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md`](./SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md)):
  approvals (D6/D7/Rod/test-site), pre-flight, list/column/index/view creation sequences,
  per-list validation, rollback/cleanup, failure handling, go/no-go — "do not run against
  production/legacy", Power Automate stays deferred.
- **SharePointStore implementation plan** ([`SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md`](./SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md)):
  method→list mapping, read/write/activity/comment/note/tag strategies, composite-uniqueness
  for active tag links, Complete/Reopened/Cancelled, error handling, ETag concurrency,
  atomicity/compensation, pagination/threshold, identity mapping, and 5 test-site build phases.
- **Contract test-site execution plan** ([`STORE_CONTRACT_TEST_SITE_PLAN.md`](./STORE_CONTRACT_TEST_SITE_PLAN.md)):
  reuses the existing harness via a `makeStore(seed)` factory; isolation, cleanup, flake
  handling, **placeholder-only** config (no real env vars/URLs/secrets), first-green criteria.
- **D16 (Accepted):** Phase-2 build is runbook-driven and must pass the store contract on a
  disposable test site before any production consideration.
- Still **design-only**: `SharePointStore` remains a stub; no live integration, no real
  lists/flows, no credentials/URLs, no legacy writeback; `MockStore` active.

### Loop 13 — local-first model & Phase-2 approval package (design-only)
Loop 13 clarified where things live and packaged the approval ask:
- **Local-first model** ([`LOCAL_FIRST_EXECUTION_MODEL.md`](./LOCAL_FIRST_EXECUTION_MODEL.md)):
  code/design artifacts are repo-local under `C:\dev\mbp-escalation-dashboard` (mock-only); real
  data will live **only** in dedicated SharePoint v2 lists later. **OneDrive-synced folders are
  not backend storage** (specifically not the "Information Technology - General" path) — **D17**.
- **One-page approval request** ([`PHASE2_TEST_SITE_APPROVAL_REQUEST.md`](./PHASE2_TEST_SITE_APPROVAL_REQUEST.md))
  and a **Rod message draft** ([`ROD_PHASE2_APPROVAL_MESSAGE.md`](./ROD_PHASE2_APPROVAL_MESSAGE.md)):
  request a non-production test site, D6 app/permissions, and D7 read/export — explicitly **no**
  cutover, **no** legacy change, **no** writeback, **no** Power Automate, **no** real users.
- Still **design-only**: no live integration, no real lists/flows, no credentials/URLs, no
  OneDrive backend, no legacy writeback; `SharePointStore` stub; `MockStore` active.

### Loop 14 — SharePoint v2 provisioning package (Phase 2 approved; controlled execution)
Phase 2 is approved (Rod/IT). Loop 14 added the **scripted, config-driven, fail-closed**
provisioning package — still safe-by-construction and committing **no** live anything:
- **Provisioning package** ([`../src/v2/backend/sharepoint/provisioning/`](../src/v2/backend/sharepoint/provisioning/)):
  `provision` / `validate` / `cleanup` PowerShell scripts + a shared fail-closed safety helper,
  a placeholder example config, a manifest, a `.gitignore`, and a README.
- **Fail-closed gate (D18):** scripts refuse to act unless `phase2Approved=true`,
  `nonProductionOnly=true`, `legacyWritebackAllowed=false`, `powerAutomateAllowed=false`, a
  non-production label, the `Escalations_v2_` prefix, and a non-legacy target; live connects
  re-check the web and abort on legacy/production tokens. Dry-run is the default.
- **No secrets in git:** real `provision.config.json` is **git-ignored**; interactive auth
  only; missing module/auth → clear prerequisite error (no faking).
- **Safety checklist:** [`../harness/SHAREPOINT_V2_PROVISIONING_SAFETY_CHECKLIST.md`](../harness/SHAREPOINT_V2_PROVISIONING_SAFETY_CHECKLIST.md).
- Still: **no** real lists created by committing this, **no** Power Automate, **no** legacy
  writeback, **no** production cutover; `SharePointStore` remains a stub; `MockStore` active.

### Loop 15 — FakeSharePoint simulator + SharePointStore simulated contract pass (D19)
Loop 15 proved the adapter's logic with **zero live dependencies**:
- **FakeSharePoint simulator** ([`../src/v2/backend/sharepoint/fake/`](../src/v2/backend/sharepoint/fake/)):
  in-memory client/list with generated ids, ETags, 404/412/429, paging, equality filtering, and
  active-link soft-delete — **no network, no Graph/PnP/Azure SDK, no auth, no URLs**.
- **`SharePointStore` is now dual-mode:** fail-closed by default; operational with an injected
  client. It orchestrates persistence via the shared domain↔column mapping and keeps business
  rules in `domain/rules.js`.
- **Same contract, green:** `runStoreContract('SharePointStore(FakeSharePoint)', …)` passes the
  identical contract as `MockStore` (D13/D16/D19) — CRUD, auto-status, owner-only Complete,
  Reopened/Cancelled, comments/notes, tag link soft-delete, append-only activity, filtering.
- Still: `MockStore` remains the **active UI backend**; no live integration, no real lists/flows,
  no credentials/URLs, no network, no legacy writeback. Live test-site execution is the next,
  separately-gated step.

### Loop 16 — SharePointStore resilience hardening (D20, local-only)
Loop 16 hardened the adapter for real-world SharePoint failure modes — all proven locally:
- **Throttling (429):** bounded retry/backoff (injectable, deterministic no-op sleep in tests);
  clear failure after the limit.
- **ETag conflict (412):** re-read latest, re-apply the domain rule, retry; clear failure when
  unresolvable.
- **Ticket + activity atomicity:** activity appends are **idempotent on ActivityKey** and
  retried on transient failure (no duplicates); a permanent failure raises a clear
  **`ActivityAppendError`** compensation rather than silently losing the row.
- **Tag-link uniqueness:** one **active** `Escalations_v2_TicketTags` row per (ticket, tag);
  stale-read/duplicate races reconcile; soft-deleted links reactivate.
- **Simulator + mapping fidelity:** the fake gained op-specific/repeatable failure injection;
  Lookup/Person/DateTime/Boolean round-trip helpers added and tested.
- Both contracts (`MockStore`, `SharePointStore(FakeSharePoint)`) still pass; `MockStore`
  remains the active UI backend; no network, no SDKs, no live work.

### Loop 17 — real SharePoint client wrapper + execution gate (D21, gate committed; no live run)
Loop 17 built the bridge to live without committing anything live:
- **`SharePointLiveClient`** ([`../src/v2/backend/sharepoint/live/`](../src/v2/backend/sharepoint/live/)):
  a real client wrapper with the **same surface** as `FakeSharePointClient`, so it drops into
  `SharePointStore`. Dependency-injected transport; **no SDK imports, no network, no hardcoded
  tenant/site/app/user identifiers**. Fail-closed (`LiveNotConfiguredError`) until a runtime
  transport is injected.
- **Gated runner** (`run-testsite-contract.js`): refuses to act unless a **git-ignored** config
  sets `phase2Approved`/`contractRunApproved`/`nonProductionOnly` and `legacyWritebackAllowed=
  false`/`powerAutomateAllowed=false`, the label is non-production, and the target is not
  legacy/production; loads the runtime transport, runs a read-only smoke, and points to the full
  contract run. Missing config/auth/transport → clear stop, never faked.
- **Secrets stay out of git:** `testsite.config.json`, transport bootstraps, `.env`, secrets are
  git-ignored; only `*.example.json` + wrapper/runner/docs are committed. Live execution
  checklist: [`../harness/SHAREPOINT_V2_LIVE_TESTSITE_EXECUTION_CHECKLIST.md`](../harness/SHAREPOINT_V2_LIVE_TESTSITE_EXECUTION_CHECKLIST.md).
- No live run was performed (no runtime config/auth present); `MockStore` remains the active UI
  backend; both contracts still pass.

### Loop 18 — live test-site execution prep (D22; no live run)
Execution-prep only — verified readiness without touching anything live:
- **Fail-closed verified:** the provisioning dry-run and the live runner both **reject** the
  example-default config (`phase2Approved=false` + placeholder site reference). Good.
- **Ignore rules verified + guarded:** runtime config (`provision.config.json`,
  `testsite.config.json`), the transport bootstrap (`transport.local.js`), `.env`, and secrets
  are git-ignored; a committed guard test + `npm run validate` check (D22) keep those rules from
  regressing.
- **Live run SKIPPED — reason:** `PnP.PowerShell` is not installed, and the approved
  non-production test-site reference, D6 app/auth, and transport bootstrap are not present. Per
  the safety rules, nothing was faked.
- No runtime config / transport bootstrap was committed; no real lists, no flows, no legacy
  writeback; `MockStore` remains the active UI backend.

### Loops 20–21 — live provisioning on the approved non-production test site + accelerated MVP schema
- **Loop 20** created the 8 `Escalations_v2_*` lists (lists-only) on the confirmed
  non-production test site.
- **Loop 21** incorporated stakeholder feedback into the domain/UI/tests and completed live
  provisioning:
  - **Requester-only Complete + required final closing comment (D23):** only `submitterId`
    may Complete; a non-empty `closureNote` is required, stored as `finalClosureNote`, and
    carried in activity. Reopen clears date+note; history survives in activity.
  - **Attachments metadata-first (D24):** new `Escalations_v2_Attachments` list + store
    methods (`addAttachment`/`listAttachments`/`removeAttachment` soft-delete) — no file
    bytes, no document library.
  - **No-movement reminder readiness (D25):** `lastActivityAt` movement stamp + priority
    thresholds (2/3/7/14 days) → local candidate indicators/filters/report counts only; no
    notifications, no flows.
  - **Optional amount involved (D26):** `amountInvolved` (Currency) + `amountCurrency`
    (USD default) with `setAmount` store method.
  - **Live columns/indexes/views provisioned + validated (D27):** schema 0.3.0-design fully
    provisioned idempotently (9 lists, 80 columns incl. 16 lookups, indexes, views) and
    read-only validation reports a full match. Dynamic view filters remain adapter-applied
    (never faked into stored views). Only `Escalations_v2_*` lists were touched.
- Still: `MockStore` remains the **active UI backend**; no legacy writeback, no Power
  Automate, no production users, no cutover.

## 4. What remains mock-only (not production-ready yet)
- No persistence / no real backend.
- No authentication, identity, or permission enforcement (roles are modeled in docs only;
  note `visibility` is metadata, not enforced).
- No notifications (legacy used Power Automate; v2 replacement is undecided).
- No migration tooling (dry-run is documented, not built).
- Reporting and exports are mock-data summaries, not parity-verified against real data.
- Department configuration is a single generic config; per-department config is deferred.

## 5. Decisions needed before backend work
See [`DECISION_LOG.md`](./DECISION_LOG.md) for full detail. Blocking items in **bold**:

- ~~**D3 — Target backend**~~ **DECIDED (Loop 11): SharePoint List v2 / Microsoft List v2.**
- **D6 — Entra app registration** (new v2 app vs. reuse legacy) — needed before any live
  auth.
- **D7 — Legacy read access for migration dry-run** (offline export/sample vs. approved
  read-only Graph) — needed before any dry-run against real data.
- D1 app stack/hosting (mock proves the shell; final stack still open).
- D10 status vocabulary + owner-only Complete (Loop 7; demonstrated, supersedes D4/D5).
- D8 authoritative department/queue list; D9 generic config confirmation.

Plus the non-negotiable gates in
[`../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md`](../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md):
Rod approval, company-owned site/resource confirmation, permission-scope review, no
legacy write-back, migration dry-run approval, rollback / no-cutover confirmation.

## 6. Explicit no-production-change confirmation
This loop and the entire mock MVP have made **no** change to the legacy tracker, SharePoint,
Graph, Power Automate, Azure Functions, permissions, flows, or any production system.
[`../escalation-dashboard.html`](../escalation-dashboard.html) is unmodified. All work is
isolated under `src/v2/` plus documentation/harness updates. No data has been migrated.
Per the No-Production-Modification checklist
([`../harness/NO_PRODUCTION_MODIFICATION_CHECKLIST.md`](../harness/NO_PRODUCTION_MODIFICATION_CHECKLIST.md)),
this remains a parallel, safe build.
