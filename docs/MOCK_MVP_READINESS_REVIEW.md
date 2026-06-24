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
- **Automated tests:** 62 passing (`node --test`) across rules, store, interactions
  (comments/notes/tags), views (filters/reporting), UI smoke (view-model), safety, and the
  design-only SharePoint schema check (Loop 8 + Loop 9 hardening, incl. the D12 tag link
  list and admin-package/dry-run doc checks).
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

- **D3 — Target backend** (SharePoint temp vs. managed API/DB vs. Dataverse).
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
