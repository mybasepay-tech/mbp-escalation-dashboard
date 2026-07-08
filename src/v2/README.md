# Escalation System v2 — Implementation Foundation (mock-first)

This is the **Loop 3** implementation foundation: a small, **zero-dependency**, mock-only
codebase that realizes the domain model, assignment/status rules, and a `MockStore` from
the planning docs in [`../../docs/`](../../docs/).

> **Safety:** This foundation never touches the legacy dashboard
> ([`../../escalation-dashboard.html`](../../escalation-dashboard.html)) and makes **no**
> connection to Microsoft Graph, SharePoint, Power Automate, Azure Functions, or any live
> system. It contains no credentials, tenant/client IDs, scopes, or production URLs. A
> [`tests/safety.test.js`](./tests/safety.test.js) scan enforces this.

## Requirements
- Node.js 18+ (developed on Node 24). Uses only built-ins: ES modules, `node:test`,
  `node:assert`, `node:fs`, `node:crypto`. **No `npm install` needed.**

## Run the tests
```bash
cd src/v2
npm test        # alias for: node --test
```

## Validate readiness (tests + safety scan)
```bash
cd src/v2
npm run validate   # runs the suite + an aggregate safety/readiness scan
```
`validate` is local/mock only — it runs `node --test` and reads local files; it makes no
network or production calls. It fails (non-zero) if any test fails or if any
production-integration string, network call, or non-fake legacy domain is found.

## Mock MVP demo readiness
This is a **mock/local** MVP for decision review — see
[`../../docs/MOCK_MVP_READINESS_REVIEW.md`](../../docs/MOCK_MVP_READINESS_REVIEW.md) and the
walkthrough in [`../../docs/ROD_DEMO_SCRIPT.md`](../../docs/ROD_DEMO_SCRIPT.md). No backend
adapter is built; backend work is gated by
[`../../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md`](../../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md).
Quick start for a demo:
```bash
cd src/v2
npm run validate   # confirm green
npm run ui         # open http://127.0.0.1:4173/ui/index.html
```

## Inspect locally (CLI demo)
```bash
cd src/v2
npm run demo    # alias for: node mock/demo.js
```
The demo prints the seeded Benefits Ops department queue (showing that person-assigned
tickets stay in the queue), Sarah's "My Assigned Tickets", then assigns the New ticket and
shows the auto-status change to **Assigned** plus the activity trail.

## Run the UI shell (browser)
```bash
cd src/v2
npm run ui      # alias for: node ui/serve.js  (starts a LOCAL loopback server)
```
Then open the printed URL: **http://127.0.0.1:4173/ui/index.html**
(set `PORT` to change the port, e.g. `PORT=4199 npm run ui`).

> A tiny built-in (`node:http`) server is used because browsers block ES-module imports over
> `file://`. It binds to **loopback only**, serves files from `src/v2` only (path traversal
> is rejected), and makes **no** outbound/production calls of its own.

**Backend selection (Loop 23, D29) — MockStore is the DEFAULT.** The page always shows a
backend indicator ("Mock backend" / "SharePoint test backend"). The SharePoint TEST backend
is opt-in only and needs BOTH:
1. a git-ignored `ui/ui-live.local.json` with `enableSharePointTestBackend=true` (copy
   `ui/ui-live.example.json`) pointing at the git-ignored live testsite config — the server
   then re-runs the fail-closed live safety gate before loading anything live; and
2. the explicit query `?backend=sharepoint-test` in the browser.
With both, the UI shows the warning banner **"Test SharePoint backend enabled —
non-production only"** and uses `ui/remoteStore.js`, which talks ONLY to the loopback
`/api/store/*` endpoints — the SharePoint client/config/token stay in the local server
process and never reach the browser or git. Missing/unsafe opt-in → a visible error, no
silent fallback; unknown `backend` values → MockStore. See `docs/MVP_DEMO_GUIDE.md`.

**Demo data (Loop 24, D30):** the live test lists stay empty by default. For supervised
demos, `backend/sharepoint/live/seed-demo-fixtures.js` (gated CLI) idempotently seeds a
small `esc_demo_loop24_*` TEST-ONLY fixture set and cleans it up by exact keys (leftover
count must be 0). The UI's minimal **"New demo ticket"** form always creates
`esc_demo_loop24_*` ids so demo tickets are unmistakable and exactly cleanable.

The UI shell provides:
- A **structured filter toolbar** (Loop 26): scope / status / priority dropdowns, a
  "Needs attention" toggle (local no-movement indicator only — nothing is sent), and a
  search field, backed by the pure `applyTicketFilters` model in `ui/viewModel.js`.
- **Department queue** panel (includes tickets assigned to a person) and **My Assigned
  Tickets** panel (current mock user only) — toggle via the tabs.
- A **ticket list** with status/priority/legacy badges, and a **ticket detail** pane.
- **Assignment controls** (assign department, assign person, unassign), **status** and
  **priority** controls — all routed through the existing `MockStore`/rules, so assigning a
  person to a New / Not-yet-assigned ticket **auto-moves it to Assigned**.
- An **activity trail** that updates as you act (assignment / status / priority / comment /
  note / tag events).
- A **legacy metadata** block shown only on migrated tickets (fake id + `.invalid` URL).
- A mock **user** and **department** switcher in the header.

### Loop 5 features (comments, notes, tags, filters, reporting)
- **Three separate streams** on ticket detail: **Public comments**, **Internal notes**
  (carry `visibility: 'internal'` metadata for future permission gating), and the immutable
  **Activity trail**. Comments and notes are stored as discrete records — never as one giant
  history text field. Posting a comment emits a `comment` activity event; posting a note
  emits a `note` event.
- **Tags**: add tags from the catalog and remove them via the chip's ×; tag changes emit
  `field_change` activity events and show as chips in both the list and detail.
- **Department-panel filters** (Department queue tab): all · unassigned in department ·
  assigned to me · assigned to others · in progress · pending review · resolved awaiting
  closure · migrated/legacy · high priority. Department queue still includes
  person-assigned tickets; "My Assigned Tickets" is unchanged.
- **Reporting tab**: totals plus breakdowns by status / department / priority, and counts
  for unassigned, assigned-to-current-user, resolved-awaiting-closure, and legacy/migrated.
  Reporting reads mock data only.

All UI data comes from the in-memory seed; nothing is persisted and no live system is
contacted.

## Layout
```
src/v2/
  domain/
    constants.js   # statuses, priorities, activity types, allowed transitions
    models.js      # Ticket/User/Department/Comment/Note/Tag/ActivityEvent factories
    rules.js       # assignment + status transition rules (auto-status, activity events)
  store/
    EscalationStore.js  # abstract data-access contract (the swap seam)
    MockStore.js        # in-memory implementation (the only backend in MVP)
    SharePointStore.js  # DESIGN-ONLY stub — mirrors the interface, throws not-connected
  mock/
    seed.js        # fabricated sample data (all required scenarios)
    demo.js        # local inspection script
  backend/
    sharepoint/
      schema.sharepoint-v2.json  # DESIGN-ONLY SharePoint v2 list schema (connects to nothing)
  scripts/
    validate.js                  # local readiness gate (npm run validate)
    validateSharePointSchema.js  # local JSON-structure validator for the schema (no network)
  ui/
    index.html     # mock UI shell entry point
    styles.css     # self-contained styles (no external fonts/CDNs)
    viewModel.js   # pure render-ready view-model (shared by UI + tests, no DOM)
    app.js         # DOM rendering + controller (imports MockStore/rules/seed)
    serve.js       # local-only static server (node:http, loopback)
  tests/
    rules.test.js        # auto-status + activity-event behavior
    store.test.js        # queue / My Assigned views, activity recording, seed coverage
    interactions.test.js # comments vs notes separation, activity events, tag add/remove
    views.test.js        # department filters + basic reporting counts
    safety.test.js       # no production strings / network calls; fake legacy domain
    ui-smoke.test.js     # view-model rendering + UI-specific safety scan
    sharepoint-schema.test.js  # design-only schema parses, lists/fields, no live markers
    store-contract.test.js     # runs the reusable store contract on MockStore; asserts SharePointStore is design-only
    store-contract/
      contract.js              # reusable EscalationStore behavioral contract (backend-agnostic)
  README.md
```

## Architecture seam
All app logic depends on the `EscalationStore` contract, not on any backend. The MVP uses
`MockStore`. A future backend (API / database / Dataverse) can implement the same contract
without changing callers — see [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
§3.2. **Microsoft Graph is explicitly NOT part of this foundation**; it would only ever be
one possible future adapter behind this seam.

A reusable **store contract** ([`tests/store-contract/contract.js`](./tests/store-contract/contract.js),
documented in [`../../docs/STORE_CONTRACT.md`](../../docs/STORE_CONTRACT.md)) defines the
behavior every `EscalationStore` must satisfy. It runs against `MockStore` today and is the
**acceptance gate** for any future adapter (decision **D13**).
[`store/SharePointStore.js`](./store/SharePointStore.js) is **dual-mode**: **fail-closed /
design-only by default** (no injected client → throws), and **operational when given an injected
client**. In this repo the only client is the in-memory **FakeSharePoint simulator**
([`backend/sharepoint/fake/`](./backend/sharepoint/fake/)) — no network, no Graph/PnP/Azure SDK,
no auth, no URLs. The fake-backed adapter passes the **same** store contract as `MockStore`
(decision **D19**, see `tests/sharepoint-store-simulated-contract.test.js`). It is also
**hardened for real SharePoint failure modes** (decision **D20**): throttle retry/backoff, ETag
conflict re-read+retry, idempotent activity append with a clear compensation error, and
one-active tag-link reconciliation — proven in `tests/sharepointstore-resilience.test.js`.
`MockStore` remains the **active UI backend**.

For live execution, [`backend/sharepoint/live/`](./backend/sharepoint/live/) holds the real
**`SharePointLiveClient`** (same surface as the fake; dependency-injected transport; **no SDK,
secrets, or identifiers committed**; fail-closed without a transport) and **gated runners**:
`run-testsite-contract.js` (read-only connectivity smoke) and `run-live-contract.js` (the full
store contract live — seeds per test, tracks and deletes ONLY run-created records, verifies
post-run counts) for the approved non-production test site (decisions **D21/D28**). The real
runtime config and transport bootstrap are **git-ignored**; live execution is operator-run
only. **Loop 22 (D28): executed and GREEN** — all 30 contract tests ran live and passed, with
verified full cleanup (every run-created record tracked + deleted; lists left as found). The
whole client path is async-safe: `tests/sharepoint-live-async-transport-contract.test.js` runs
the FULL contract through `SharePointLiveClient` + an async transport locally on every
`npm test`.

The **Phase-2 build** (when D6/D7 + Rod approval land) is fully specified and design-only: the
[test-site build runbook](../../docs/SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md), the
[`SharePointStore` implementation plan](../../docs/SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md), and
the [contract test-site execution plan](../../docs/STORE_CONTRACT_TEST_SITE_PLAN.md) (decision
**D16**). No live work is performed here.

**Local-first (D17):** all code/design artifacts live in this repo under
`C:\dev\mbp-escalation-dashboard` and are mock-only; real data will live **only** in dedicated
SharePoint v2 lists later (never the repo, never OneDrive) — see the
[local-first model](../../docs/LOCAL_FIRST_EXECUTION_MODEL.md). The Phase-2 ask is packaged in
the [approval request](../../docs/PHASE2_TEST_SITE_APPROVAL_REQUEST.md) and
[Rod message draft](../../docs/ROD_PHASE2_APPROVAL_MESSAGE.md).

**Provisioning (D18, Phase 2 approved):** the scripted, config-driven, **fail-closed**
package at [`backend/sharepoint/provisioning/`](./backend/sharepoint/provisioning/) builds /
validates / cleans up the `Escalations_v2_*` lists on a **non-production** test site. It
defaults to dry-run, targets only a non-production site (never legacy), creates no Power
Automate flows, and reads a **git-ignored** runtime config — no secrets/URLs are committed.
As of Loop 21 (D27) the full schema — 9 lists including `Escalations_v2_Attachments`, all
columns/lookups, indexes, and views — has been **provisioned live and validated** against
the approved non-production test site (idempotently; dynamic view filters stay
adapter-applied). `MockStore` remains the active UI backend.

## SharePoint backend readiness (design-only — no live services)
`backend/sharepoint/schema.sharepoint-v2.json` is a **static, design-only** blueprint of the
v2 SharePoint lists, prepared so a future `SharePointStore` adapter can be built behind the
`EscalationStore` seam. It is preparation, **not** integration:

- **SharePoint List v2 / Microsoft List v2 is the accepted backend target** (decision D3,
  Loop 11). The legacy tracker **stays operational** and is **never written to** during the
  transition (D14/D15); cutover is staged — see
  [`../../docs/PARALLEL_RUN_AND_CUTOVER_PLAN.md`](../../docs/PARALLEL_RUN_AND_CUTOVER_PLAN.md).
- It **connects to nothing** — no Microsoft Graph, SharePoint, Dataverse, Azure Functions,
  network, or Power Automate. **No flows are created.**
- It contains **no** credentials, tenant/client IDs, secrets, OAuth scopes, or live URLs.
- **Power Automate is deferred for MVP phase 1** — business rules stay in `domain/rules.js`.
- `MockStore` remains the **only** backend; the `EscalationStore` abstraction is unchanged.
- **Tags are a dedicated many-to-many link list** (`Escalations_v2_TicketTags`), **not** a
  delimited field on tickets (decision **D12**); `Escalations_v2_Tags` is the tag dictionary.

`scripts/validateSharePointSchema.js` validates the JSON **structure only** (it reads a local
file — no network) and is wired into `npm run validate`; `tests/sharepoint-schema.test.js`
asserts the lists/fields, the D12 tag link list, stable internal/display naming, tag-lookup
views/indexes, and that no live/production strings leak in. Design rationale, field/column
mapping, indexes/views, permission assumptions, and the future adapter approach live in
[`../../docs/SHAREPOINT_V2_BACKEND_READINESS.md`](../../docs/SHAREPOINT_V2_BACKEND_READINESS.md)
and [`../../docs/BACKEND_ADAPTER_PLAN.md`](../../docs/BACKEND_ADAPTER_PLAN.md) (decisions D11,
D12). A *design-only* admin build recipe and its pre-build safety gate live in
[`../../docs/SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md`](../../docs/SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md)
and [`../../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md`](../../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md)
— **do not run against production**.

## Key rules implemented (see [`../../docs/STATUS_WORKFLOW.md`](../../docs/STATUS_WORKFLOW.md))
- Tickets can be assigned to a department/queue, a person, or both.
- A person-assigned ticket **remains visible in its department queue**.
- Adding a person while status is **New** or **Not yet assigned** auto-moves to
  **Assigned**. Status is **never** auto-advanced beyond Assigned.
- Clearing the assignee on an **Assigned** ticket reverts to **Not yet assigned**.
- **Complete** is the single final official closure state and is **requester-only**
  (Loop 21/D23): only the ticket's `submitterId` (the requester/creator) may move it to
  Complete — not the assignee, not the `ticketOwner`, not a lead. Completing **requires a
  non-empty final closing comment** (stored as `finalClosureNote` and carried in the
  activity event). Complete sets `completedDate`; **Reopened** clears
  `completedDate`/`finalClosureNote` while closure history stays in activity.
- **Attachments are metadata-first** (Loop 21/D24): `addAttachment`/`listAttachments`/
  `removeAttachment` (soft delete) manage metadata rows only — no file bytes, no document
  library — and emit `attachment` activity events.
- **Optional amount involved** (Loop 21/D26): `setAmount` sets/clears a non-negative
  `amountInvolved` (currency defaults to USD) with a `field_change` activity event.
- **No-movement reminder readiness** (Loop 21/D25): every movement updates
  `lastActivityAt`; `rules.reminderCandidate(ticket, now)` flags open tickets past their
  priority threshold (Critical 2 / High 3 / Medium 7 / Low 14 days). Local indicator only —
  **no notification is sent, no Power Automate flow exists**. The UI shows a
  "no movement" badge, a "Needs attention" department filter, and a report counter.
- Every assignment, status, priority, comment, note, and attachment change records an
  immutable activity event.

## Sample scenarios in the seed
New · Department-only · Person-assigned · In Process · Pending Research · Pending Member ·
Pending Customer · Complete · Reopened · Legacy-migrated (with **fake** legacy id `3071` and
a **fake** `legacy.example.invalid` URL + migration normalization note).
