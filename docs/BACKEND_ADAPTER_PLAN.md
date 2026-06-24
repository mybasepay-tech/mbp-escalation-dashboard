# Backend Adapter Plan — Escalation System v2

> **Loop 8 (updated Loop 11), design-only.** Plans the seam between the current in-memory
> backend and the future live backend. **The backend target is SharePoint List v2 (decision
> D3, accepted Loop 11).** **No live integration is built here** — no Graph, SharePoint,
> Dataverse, Azure, network code, credentials, or Power Automate flows (PA deferred — D11).
> The MVP backend remains `MockStore`. During the transition the **legacy tracker stays
> operational and is never written to** (D14/D15).
>
> See [`SHAREPOINT_V2_BACKEND_READINESS.md`](./SHAREPOINT_V2_BACKEND_READINESS.md),
> [`PARALLEL_RUN_AND_CUTOVER_PLAN.md`](./PARALLEL_RUN_AND_CUTOVER_PLAN.md),
> [`STORE_CONTRACT.md`](./STORE_CONTRACT.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md) §3.2, and
> the contract in [`../src/v2/store/EscalationStore.js`](../src/v2/store/EscalationStore.js).
> **The concrete build plan** for the future adapter lives in
> [`SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md`](./SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md), with the
> test-site build in [`SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md`](./SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md)
> and contract execution in [`STORE_CONTRACT_TEST_SITE_PLAN.md`](./STORE_CONTRACT_TEST_SITE_PLAN.md)
> (Loop 12, D16).

## 1. The seam
All UI and app logic depend **only** on the abstract `EscalationStore` contract — never on a
concrete backend. Swapping backends is therefore a matter of providing a new subclass; no
caller changes. This abstraction is preserved by every loop and must continue to be.

```
UI / viewModel / app  ──►  EscalationStore (abstract contract)
                                  ▲                 ▲
                          MockStore (now)   SharePointStore (future, not built)
```

## 2. Current backend — `MockStore`
[`../src/v2/store/MockStore.js`](../src/v2/store/MockStore.js)
- 100% in-memory; zero dependencies; no network, no credentials.
- Loaded from [`../src/v2/mock/seed.js`](../src/v2/mock/seed.js).
- Implements the full contract; every mutating method records immutable activity via a
  private `#record(events)` helper.
- It is the **only** backend in the MVP and the **reference behavior** all future adapters
  must match.

## 3. Future backend — `SharePointStore` (implemented against an injected client; live deferred)
- `class SharePointStore extends EscalationStore`
  ([`../src/v2/store/SharePointStore.js`](../src/v2/store/SharePointStore.js)) is **fail-closed
  by default** (no injected client → throws the design-only error) and **operational when given
  an injected client**. No network, no SDK imports, no credentials/env vars/secrets/live URLs.
- **Loop 15 (D19):** it is validated locally by passing the **same store contract** as
  `MockStore`, run against the in-memory **FakeSharePoint simulator**
  ([`../src/v2/backend/sharepoint/fake/`](../src/v2/backend/sharepoint/fake/)). A real Graph/PnP
  client would be a drop-in replacement for the injected fake. Mapping is table-driven via
  [`../src/v2/backend/sharepoint/mapping.js`](../src/v2/backend/sharepoint/mapping.js).
- It will be backed by the design-only schema in
  [`../src/v2/backend/sharepoint/schema.sharepoint-v2.json`](../src/v2/backend/sharepoint/schema.sharepoint-v2.json),
  reached via Microsoft Graph list APIs using a dedicated v2 Entra app (D6) — **none of
  which exists yet**.
- Translation is **table-driven** off the schema's `mapsTo` metadata (model ↔ column).
- **No Power Automate dependency:** the adapter performs reads/writes directly; flows, if
  ever added, are additive (notifications), never the system of record.
- **Acceptance gate (D13):** the adapter ships only when it passes the **same store contract**
  ([`STORE_CONTRACT.md`](./STORE_CONTRACT.md)) that `MockStore` passes today — run against a
  disposable test site. Gated by
  [`../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md`](../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md),
  the [dry-run checklist](../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md), and the blocking
  decisions D3, D6, D7.

## 4. Store interface expectations
Any adapter must implement the entire `EscalationStore` contract with the same semantics as
`MockStore`:

**Reads**
- `getTicket(id)` → `Ticket | null`
- `listTickets(filter)` — supports `{ deptId, assigneeId, status, openOnly }`
- `listActivity(id)` — chronological, ascending by `timestamp`
- `listComments(id)` / `listNotes(id)` — chronological, ascending by `createdAt`
- `departmentQueue(deptId, { openOnly })` — **all** tickets for the dept, *including*
  person-assigned ones
- `myAssignedTickets(userId, { openOnly })` — only that person's tickets
- `listDepartments()` / `listUsers()` / `listTags()`

**Writes (each records an activity event)**
- `createTicket(input)` → emits `created`
- `assignDepartment` / `assignPerson` / `clearAssignee` → emit `assignment_change` (+ any
  auto `status_change`)
- `setStatus` → `status_change` (transition guard + owner-only Complete enforced in
  `domain/rules.js`, not the backend)
- `setPriority` → `priority_change`
- `addTag` / `removeTag` → `field_change`
- `addComment` → persists a `Comment` + emits `comment`
- `addNote` → persists a `Note` + emits `note`

**Invariants the adapter must preserve**
- Activity is **append-only / immutable** — corrections are new rows, never edits.
- Comments, notes, and activity are **three separate streams**.
- Business rules (auto-status, owner-only Complete, transition guard) stay in the **domain
  layer**; the adapter persists results, it does not re-implement rules.
- `daysOpen` is **computed**, never stored.
- **Tags are a many-to-many link list (D12)**: `Ticket.tagIds` is materialized from active
  `Escalations_v2_TicketTags` rows, never a delimited ticket field; removals are soft-deletes.

## 5. Read / write methods needed (mapped to the backend)
| Contract method | SharePoint adapter action (future) |
|-----------------|-------------------------------------|
| `getTicket` | Get item by `TicketKey` (indexed). |
| `listTickets` / `departmentQueue` / `myAssignedTickets` | Query `Tickets` via indexed views (§6 of the readiness doc). |
| `listActivity` / `listComments` / `listNotes` | Filter child lists by `EscalationKey`, sort ascending. |
| `createTicket` + lifecycle writes | Create/patch the `Tickets` item **and** append the corresponding `Activity` row(s). |
| `addComment` / `addNote` | Create a `Comments` / `InternalNotes` item **and** append an `Activity` row. |
| `addTag` / `removeTag` | **D12 — operate on the `Escalations_v2_TicketTags` link list, not a ticket column.** `addTag`: upsert an **active** link for (ticket, tag), de-duplicating against any existing active row (reactivate a soft-deleted one rather than inserting a duplicate). `removeTag`: **soft-delete** the active link (`IsActive=false`, set `RemovedAt`) — never hard-delete. Both append a `field_change` `Activity` row. |
| reading a ticket's tags | Materialize `Ticket.tagIds` from **active** `TicketTags` rows (`TicketKey = id AND IsActive = true`) → `TagKey`s. Never read a delimited field. |
| reference lists | Read `Departments` / `Users` / `Tags` (tag **dictionary**). |

## 6. Error-handling expectations
- **Never throw raw transport errors at callers.** Wrap backend/network failures in a stable
  error shape so the UI can show a consistent message and retry where safe.
- **`getTicket` returns `null`** for "not found" (matches `MockStore`); reserve thrown errors
  for genuine failures.
- **Mutations are validated by domain rules first**; invalid transitions fail *before* any
  write (no partial writes).
- **Ticket mutation + its activity append should be atomic** where possible; if the backend
  can't transact, write activity last and reconcile/retry so a ticket never silently changes
  without an activity trail.
- **Optimistic concurrency:** use ETags/`If-Match`; on conflict, surface a clear
  "changed since you loaded it" error rather than clobbering.
- **Throttling/transient failures:** bounded retry with backoff in the adapter only — callers
  stay unaware.

## 7. Offline / mock parity rules
- `MockStore` is the **reference implementation**. The reusable **store contract**
  ([`../src/v2/tests/store-contract/contract.js`](../src/v2/tests/store-contract/contract.js),
  documented in [`STORE_CONTRACT.md`](./STORE_CONTRACT.md)) — plus
  [`../src/v2/tests/store.test.js`](../src/v2/tests/store.test.js) and
  [`../src/v2/tests/interactions.test.js`](../src/v2/tests/interactions.test.js) — must pass
  against any future adapter (run against a disposable test site) before cutover. This is the
  D13 acceptance gate. The contract takes a `makeStore(seed)` factory, so wiring a new backend
  in is a one-liner.
- Identical **method signatures, return shapes, sort orders, and null semantics** across
  backends.
- A future adapter must be **selectable without code changes to callers** (e.g. a factory /
  config switch), and development/tests must remain runnable **fully offline** on `MockStore`.
- Seed data and mock identities (`*.invalid`, `user_*`, `esc_*`) stay local-only and never
  leak real directory data.

## 8. No live integration yet (scope guard)
This plan adds **no** live backend, network code, credentials, environment variables, app
registrations, tenant/client IDs, secrets, live URLs, or Power Automate flows. It is design
documentation plus a design-only schema. **D3 is decided (SharePoint v2)**, but live adapter
work is still **blocked** on **D6/D7** and the backend-adapter / dry-run checklists, and
proceeds only via the staged
[`PARALLEL_RUN_AND_CUTOVER_PLAN.md`](./PARALLEL_RUN_AND_CUTOVER_PLAN.md) with **no legacy
writeback** (D15). The `EscalationStore` abstraction is preserved exactly as-is.
