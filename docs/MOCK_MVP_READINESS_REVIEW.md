# Mock MVP Readiness Review — Escalation System v2

> Loop 6 (Hardening + Decision Readiness). This review summarizes the state of the
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
- **Automated tests:** 42 passing (`node --test`) across rules, store, interactions
  (comments/notes/tags), views (filters/reporting), UI smoke (view-model), and safety.
- **Safety scans:** source contains no production-integration strings or network calls;
  browser UI files contain no `fetch`/`XMLHttpRequest`; the local server binds to loopback
  only and rejects path traversal; mock legacy references use a clearly-fake `.invalid`
  domain.
- **Behavioral guarantees:** auto-status rules, department-queue visibility of
  person-assigned tickets, comment/note separation, tag idempotency, and reporting totals
  reconcile — all asserted by tests.
- **Aggregate gate:** `npm run validate` runs the suite plus a tree-wide readiness scan
  (see [`../src/v2/scripts/validate.js`](../src/v2/scripts/validate.js)).

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
- D4 "Complete" mapping and D5 Pending-* collapse (needed to finalize migration mapping).
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
