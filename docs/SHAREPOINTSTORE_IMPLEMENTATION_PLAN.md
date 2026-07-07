# SharePointStore — Implementation Plan (design-only)

> **Loop 12.** A concrete, build-ready plan for turning the design-only
> [`../src/v2/store/SharePointStore.js`](../src/v2/store/SharePointStore.js) stub into a real
> `EscalationStore` adapter backed by SharePoint List v2 (D3) — executed **only** on a
> disposable test site after D6/D7 + Rod approval.
>
> ⚠️ **DESIGN-ONLY.** This loop implements nothing live. No network code, no SDK imports, no
> credentials/env vars/tenant IDs/client IDs/secrets/live URLs. `SharePointStore` remains a
> stub that throws on every call. **No writeback to legacy** (D15). The plan is validated by
> the existing **store contract** (D13) when eventually built.
>
> Companion docs: build [`SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md`](./SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md),
> contract exec [`STORE_CONTRACT_TEST_SITE_PLAN.md`](./STORE_CONTRACT_TEST_SITE_PLAN.md),
> schema [`../src/v2/backend/sharepoint/schema.sharepoint-v2.json`](../src/v2/backend/sharepoint/schema.sharepoint-v2.json),
> contract [`STORE_CONTRACT.md`](./STORE_CONTRACT.md).

## 1. Purpose
Specify exactly how each `EscalationStore` method maps to SharePoint v2 lists, so the adapter
can be implemented mechanically and proven by the same contract `MockStore` passes today. The
adapter is the **only** component that knows about SharePoint; the UI/domain never change.

## 2. Current state (Loop 15 update)
`SharePointStore extends EscalationStore` now has **two modes**:
- **Default (no injected client): fail-closed / design-only** — throws
  `"SharePointStore is design-only and not connected. Use MockStore for local MVP."` on every
  operation.
- **With an injected client: operational (local/simulated)** — it orchestrates persistence
  against the client using the shared domain↔column mapping (`../src/v2/backend/sharepoint/mapping.js`).
  In this repo the only injected client is the in-memory **FakeSharePoint simulator**
  ([`../src/v2/backend/sharepoint/fake/`](../src/v2/backend/sharepoint/fake/)) — no network, no
  SDKs. **D19:** the fake-backed adapter passes the **same store contract** as `MockStore`
  ([`../src/v2/tests/sharepoint-store-simulated-contract.test.js`](../src/v2/tests/sharepoint-store-simulated-contract.test.js)).
  Business rules stay in `domain/rules.js`; the adapter only persists results + appends activity.
A real client (Graph/PnP) would be a drop-in replacement for the injected fake — same method
surface, same contract. **Loop 17 (D21):** that real client now exists as
[`SharePointLiveClient`](../src/v2/backend/sharepoint/live/SharePointLiveClient.js) — a
fail-closed, dependency-injected wrapper with the identical surface; the operator supplies the
authenticated transport at runtime (git-ignored), and `run-testsite-contract.js` is the gated
entry point. No SDK, secrets, or identifiers are committed.

**Loop 16 (D20) — resilience implemented & proven locally.** §12–§14 below are now built and
tested against the simulator: bounded **throttle retry/backoff** (injectable, deterministic
sleep), **ETag conflict** re-read+re-apply+retry, **idempotent activity append** (keyed on
`ActivityKey`) with a clear **`ActivityAppendError`** compensation on permanent failure, and
**one-active tag-link** reconciliation (stale-read/duplicate races converge; soft-deleted links
reactivate). See [`../src/v2/tests/sharepointstore-resilience.test.js`](../src/v2/tests/sharepointstore-resilience.test.js)
and [`../src/v2/tests/sharepoint-mapping-fidelity.test.js`](../src/v2/tests/sharepoint-mapping-fidelity.test.js).

## 3. Future implementation scope
> **Prerequisite (D18):** the test site must first be provisioned and **validated against the
> schema** using the scripted, fail-closed package
> ([`../src/v2/backend/sharepoint/provisioning/`](../src/v2/backend/sharepoint/provisioning/))
> before adapter implementation begins. Build lists → `validate-sharepoint-v2.ps1` green →
> implement `SharePointStore` → store-contract first green run.

- A single `SharePointStore` class translating the contract ↔ SharePoint list items.
- Access via Microsoft Graph list APIs using the D6 app (least-privilege, test-site scope) —
  **not built now**.
- Business rules (auto-status, owner-only Complete, transition guard) stay in `domain/rules.js`;
  the adapter **persists results**, it does not re-implement rules.
- Translation is **table-driven** off the schema `mapsTo` metadata (column ↔ model field).

## 4. Method → list mapping
| EscalationStore method | SharePoint v2 action |
|------------------------|----------------------|
| `getTicket(id)` | GET `Escalations_v2_Tickets` item where `TicketKey = id` (indexed); materialize `tagIds` from active `TicketTags`. Return `null` if absent. |
| `listTickets(filter)` | Query `Tickets` via indexed views/`$filter` for `status`/`deptId`/`assigneeId`/`openOnly`. |
| `createTicket(input)` | Create `Tickets` item + append a `created` `Activity` row. |
| `assignDepartment` / `assignPerson` / `clearAssignee` | Patch `Tickets` lookup field + append `assignment_change` (and any auto `status_change`). |
| `setStatus(id,status)` | Patch `Tickets.Status` + append `status_change` (after rules validate the transition + the requester-only Complete with required `closureNote` — D23; Complete also patches `CompletedDate`/`FinalClosureNote`). |
| `setPriority(id,priority)` | Patch `Tickets.Priority` + append `priority_change`. |
| `setAmount(id,amount)` | Patch `Tickets.AmountInvolved`/`AmountCurrency` + append `field_change` (D26). |
| `addTag` / `removeTag` | Upsert / soft-delete a row in `Escalations_v2_TicketTags` + append `field_change` (see §8). |
| `listActivity(id)` | Query `Activity` where `EscalationKey = id`, ascending by `Timestamp`. |
| `listComments(id)` / `listNotes(id)` | Query `Comments` / `InternalNotes` where `EscalationKey = id`, ascending by `CreatedAt`. |
| `addComment` / `addNote` | Create `Comments` / `InternalNotes` item + append `comment` / `note` activity + patch `Tickets.LastActivityAt` (movement stamp, D25). |
| `listAttachments(id)` | Query `Escalations_v2_Attachments` where `EscalationKey = id AND IsDeleted = false`, ascending by `UploadedAt` (metadata only — D24). |
| `addAttachment` / `removeAttachment` | Create / soft-delete (`IsDeleted = true`) an `Attachments` metadata row + append `attachment` activity + patch `Tickets.LastActivityAt`. No file bytes are transferred. |
| `departmentQueue(deptId)` | `Tickets` "Open by Department" view filtered to `AssignedDeptKey` (includes person-assigned). |
| `myAssignedTickets(userId)` | `Tickets` "My Assigned" view filtered to `AssigneeKey`. |
| `listDepartments` / `listUsers` / `listTags` | Read `Departments` / `Users` (or Person) / `Tags`. |

## 5. Read strategy
- Resolve by **key columns** (`TicketKey`, etc.), not SharePoint item IDs, so app keys stay
  stable and backend-independent.
- Use the **indexed views** (§8 of the readiness doc) and request only needed columns.
- Materialize `Ticket.tagIds` by reading **active** `TicketTags` rows (`TicketKey = id AND
  IsActive = true`) → `TagKey`s. `daysOpen` stays **computed** at read time, never stored.
- Preserve `MockStore` semantics exactly: same return shapes, sort orders (activity asc by
  timestamp; comments/notes asc by createdAt), and `null`-for-not-found.

## 6. Write strategy
- All writes go through **domain rules first** (`domain/rules.js`): the rules mutate an
  in-memory ticket and return the activity events; the adapter then persists the ticket patch
  **and** the returned events. Invalid transitions throw **before** any write (no partial
  writes).
- Writes target the **test site only**; there is **no** code path to legacy (D15).
- Patches are minimal (changed columns only) to reduce conflict surface.

## 7. Activity append strategy
- `Escalations_v2_Activity` is **append-only / immutable**: corrections are new rows, never
  edits. The adapter creates one row per returned event with a stable `ActivityKey`.
- `from`/`to` are JSON-encoded into `FromValue`/`ToValue`. Ordering on read is by `Timestamp`
  ascending (ties broken by `ActivityKey`).

## 8. Comment / note append strategy
- `addComment` → create a `Comments` row (`visibility = public`) + a `comment` activity row.
- `addNote` → create an `InternalNotes` row (`visibility = internal`) + a `note` activity row.
- Three streams stay separate (comments / notes / activity); bodies never go into activity rows.

## 9. Tag link strategy (`Escalations_v2_TicketTags`, D12)
- **addTag:** find an existing row for `(TicketKey, TagKey)`. If an **active** row exists →
  no-op (idempotent). If an **inactive** (soft-deleted) row exists → **reactivate** it
  (`IsActive = true`, clear `RemovedAt`). Otherwise insert a new row (`IsActive = true`,
  `CreatedAt`, `CreatedBy`, `TagLabelSnapshot` from the dictionary, `Source = manual`). Append a
  `field_change` activity (`{ addedTag }`).
- **removeTag:** if an active row exists → **soft-delete** (`IsActive = false`, set
  `RemovedAt`); never hard-delete. No-op if none active. Append a `field_change` activity
  (`{ removedTag }`).
- `Ticket.tagIds` is always derived from active rows; the ticket has no tag column.

## 10. Composite uniqueness for active links
SharePoint has **no** native composite-unique constraint, so the adapter enforces **one active
row per (`TicketKey`, `TagKey`)**:
- Before insert/reactivate, query for any active row for the pair; act on it instead of
  inserting a duplicate.
- Guard the read-modify-write with the concurrency strategy in §13 (ETag on the found row; on
  conflict, re-query and re-evaluate).
- A periodic/`Link Audit` reconciliation can detect and soft-merge accidental duplicates
  (defensive; the upsert path is the primary guarantee).

## 11. Completed / Reopened / Cancelled handling
- **Complete:** allowed only when `canComplete(ticket, actorId)` (owner-only, enforced in
  rules); on success patch `Status = Complete` and set `CompletedDate`; append `status_change`.
- **Reopened:** patch `Status = Reopened` and **clear** `CompletedDate` (set null); append
  `status_change`.
- **Cancelled:** terminal — the transition guard rejects any further transition out of
  `Cancelled`. No date side-effects.
- All three are driven by `domain/rules.js`/`constants.js` (`ALLOWED_TRANSITIONS`), so behavior
  matches `MockStore` exactly and is covered by the contract.

## 12. Error handling
- **Never** surface raw transport errors to callers; wrap them in a stable error shape so the
  UI can show a consistent message and retry where safe.
- `getTicket` returns `null` for not-found; reserve thrown errors for genuine failures.
- Domain-rule violations (illegal transition, non-owner Complete) throw the **same messages**
  `MockStore` throws, so the contract's `assert.rejects` checks pass unchanged.
- Distinguish retryable (throttling/transient) from terminal (permission/validation) failures.

## 13. ETag / concurrency strategy
- Use SharePoint item **ETags** with `If-Match` on every update; on a `412`/precondition
  failure, **re-read, re-apply the domain rule, and retry** (bounded), or surface a clear
  "changed since you loaded it" error rather than clobbering.
- Reads that feed a write (status change, tag upsert) capture the ETag they validated against.

## 14. Atomicity / compensation (ticket + activity)
SharePoint offers no multi-item transaction, so:
- **Order:** apply the ticket patch first, then append the activity row(s).
- **Compensation:** if the activity append fails after the ticket patch succeeded, retry the
  append (idempotent on `ActivityKey`); if it still fails, record the inconsistency for
  reconciliation — a ticket must **never** end up changed without an activity trail.
- Tag upserts + their `field_change` activity follow the same append-after-write rule.
- Idempotency keys (`ActivityKey`, `TicketTagKey`, `legacyItemId` for migration) make retries
  safe.

## 15. Pagination / list-view threshold
- All large reads use **server-side paging** (page size well under the 5,000-item threshold)
  and **indexed** filter/sort columns (§8 indexes).
- `Activity` and `TicketTags` grow fastest; queries always filter by an indexed key
  (`EscalationKey` / `TicketKey` / `TagKey`) and page.
- Never fetch an unbounded list; aggregate counts via filtered, indexed queries.

## 16. Identity / user mapping
- App keys (`UserKey`) are the contract currency. Preferred production approach is native
  **Person** columns resolved against Entra; the `Escalations_v2_Users` list is the
  fallback/test-site shim so seed users resolve (see schema `referenceStrategy`).
- Unresolved identities are **left null and logged**, never fabricated (matches the migration
  policy).

## 17. Test-site-only implementation phases
Build and validate incrementally; each phase runs the relevant slice of the contract on the
test site (no production data):
1. **Read-only list loading** — reference reads (`listDepartments/Users/Tags`), `getTicket`,
   `listTickets`, queue/My-Assigned views from hand-seeded rows.
2. **Ticket create/update** — `createTicket`, assignment, `setStatus`, `setPriority` with rule
   enforcement + activity append + ETag concurrency.
3. **Activity / comments / notes** — `addComment`, `addNote`, `listActivity/Comments/Notes`
   ordering and stream separation.
4. **Tags** — `addTag`/`removeTag` via the link list with soft-delete and composite-uniqueness.
5. **Full contract pass** — the entire store contract green against the test site (D13) = the
   adapter's acceptance signal.

## 18. No-production / no-legacy-writeback guard
The adapter targets the **test site only** and has **no** path that writes to, fixes, deletes,
re-permissions, or flow-modifies the legacy tracker (D15). It adds no Power Automate dependency
(D11). Promotion beyond the test site, real-data migration, enabling users, and cutover all
remain **approval-gated** ([`AI_AUTONOMY_GUARDRAILS.md`](./AI_AUTONOMY_GUARDRAILS.md),
[`PARALLEL_RUN_AND_CUTOVER_PLAN.md`](./PARALLEL_RUN_AND_CUTOVER_PLAN.md)).
