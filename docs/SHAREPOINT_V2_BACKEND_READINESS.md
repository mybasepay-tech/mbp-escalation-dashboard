# SharePoint List v2 — Backend Readiness (design-only, no flows)

> **Loop 8.** This document prepares the v2 system for a *future* SharePoint List backend.
> It is **design-only**. Nothing here connects to, provisions, or modifies SharePoint,
> Microsoft Graph, Dataverse, Azure Functions, or any live service. **No Power Automate
> flows are created.** No credentials, tenant IDs, client IDs, secrets, site URLs, or OAuth
> scopes are introduced. The MVP remains the in-memory `MockStore`.
>
> Companion docs: [`BACKEND_ADAPTER_PLAN.md`](./BACKEND_ADAPTER_PLAN.md),
> [`DATA_MODEL.md`](./DATA_MODEL.md), [`DECISION_LOG.md`](./DECISION_LOG.md) (D3, D11),
> [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md). Design artifact:
> [`../src/v2/backend/sharepoint/schema.sharepoint-v2.json`](../src/v2/backend/sharepoint/schema.sharepoint-v2.json).

## 1. Why SharePoint List v2 is the provisional backend target
- **Lowest friction to a working backend.** The team and tenant already run on Microsoft
  365 / SharePoint. A v2 list set can be stood up by an admin without new infrastructure,
  hosting, or licensing decisions.
- **Familiar to the operators.** Leads already work in SharePoint lists/views; the legacy
  Escalation Tracker is a SharePoint list. The mental model carries over.
- **Built-in views, indexing, and permissions.** SharePoint gives list views, column
  indexes, and item/list permissions out of the box — enough for an MVP queue tool.
- **Behind the `EscalationStore` seam.** Because all app logic depends only on the
  `EscalationStore` contract (not on any backend), SharePoint is just *one possible adapter*.
  Choosing it now does not lock us in — D3 (managed API/DB vs. Dataverse vs. SharePoint)
  stays open, and a later swap is a new adapter, not a rewrite.
- **Provisional, not final.** This is the *MVP phase-1 readiness target*, explicitly
  reversible. See §9 risks and the recommendation checkpoint in §11.

## 2. Why Power Automate is deferred for MVP phase 1
- **Avoids opaque, hard-to-version logic.** Flows live outside the repo, are hard to code
  review, diff, and test, and tend to accumulate undocumented business rules — exactly the
  kind of drift that hurt the legacy system.
- **Business rules already live in the domain layer.** Auto-status, owner-only Complete,
  assignment visibility, and activity logging are implemented and tested in
  [`../src/v2/domain/rules.js`](../src/v2/domain/rules.js). Duplicating them into flows would
  create two sources of truth.
- **Notifications can wait.** The one thing flows obviously buy us (email/Teams
  notifications) is not MVP-critical and can be added deliberately later (flow, Graph
  subscription, or app-side) once the data model is stable.
- **Smaller blast radius.** No flows means no flow owners, no flow run history to audit, no
  accidental writes to legacy, and nothing to disable on rollback.
- **Reversible.** Deferring is not rejecting. §11 and D11 leave the door open to reconsider
  Power Automate / Graph / Azure once requirements (notifications, scheduled SLA checks,
  cross-list automation) are concrete.

## 3. Separation from the legacy tracker
- **Distinct lists, distinct site.** All v2 lists are prefixed **`Escalations_v2_`** and are
  intended to live on a **company-owned** site/library that is **separate** from the legacy
  Escalation Tracker. v2 never reads or writes legacy lists.
- **One-way, read-only legacy reference.** Migrated tickets keep `legacyItemId` /
  `legacyUrl` purely for traceability. There is **no write-back** to legacy and no live query
  of legacy from v2.
- **No shared permissions or app registration.** Per D6, v2 uses its own (future) app
  registration and its own site permissions; legacy permissions are never altered.
- **No shared flows.** Existing legacy Power Automate flows are untouched; v2 adds none.

## 4. Required v2 lists
Authoritative shapes are in
[`../src/v2/backend/sharepoint/schema.sharepoint-v2.json`](../src/v2/backend/sharepoint/schema.sharepoint-v2.json).

| List | Maps to model | Purpose |
|------|---------------|---------|
| `Escalations_v2_Tickets` | `Ticket` | Core ticket records. |
| `Escalations_v2_Activity` | `ActivityEvent` | Append-only, immutable audit/activity log. |
| `Escalations_v2_Comments` | `Comment` | Public, member/requester-facing comments. |
| `Escalations_v2_InternalNotes` | `Note` | Internal notes (visibility metadata for future gating). |
| `Escalations_v2_Tags` | `Tag` | Tag **dictionary** (catalog) only. |
| `Escalations_v2_TicketTags` | (relation) | Many-to-many **link** list — source of truth for ticket↔tag (decision **D12**). |
| `Escalations_v2_Departments` | `Department` | Departments/queues, leads, members. |
| `Escalations_v2_Users` | `User` | Reference-user directory — **see §5 strategy** (prefer native Person columns). |

## 5. Field / column mapping
Each schema field carries a `mapsTo` pointing at the v2 model property, so the adapter can
translate mechanically. Highlights for `Escalations_v2_Tickets`:

| v2 model (`Ticket.*`) | SharePoint column | Type | Notes |
|-----------------------|-------------------|------|-------|
| `id` | `TicketKey` | Text (indexed) | App key, distinct from SharePoint's item ID. |
| `title` | `Title` | Text | |
| `description` | `Description` | Note | |
| `status` | `Status` | Choice (indexed) | 10-value Loop-7 vocabulary. |
| `priority` | `Priority` | Choice (indexed) | Low/Medium/High/Critical. |
| `assignedDeptId` | `AssignedDeptKey` | Lookup → Departments (indexed) | Queue context. |
| `assigneeId` | `AssigneeKey` | Lookup → Users (indexed) | Worker. |
| `ticketOwner` | `TicketOwnerKey` | Lookup → Users | Closure authority (owner-only Complete). |
| `completedDate` | `CompletedDate` | DateTime | Set on Complete, cleared on Reopened. |
| `tagIds` | *(none — link list)* | — | **D12:** materialized from `Escalations_v2_TicketTags` active links; **not** a column on Tickets. |
| `legacyItemId` / `legacyUrl` | `LegacyItemId` / `LegacyUrl` | Text / Hyperlink | Read-only traceability. |
| `createdAt` / `modifiedAt` | `CreatedAt` / `ModifiedAt` | DateTime | App timestamps, distinct from SharePoint Created/Modified. |

> `daysOpen` and `tagIds` are intentionally **not** columns — `daysOpen` is computed at read
> time and clamped ≥ 0 (legacy stored day-counts drifted); `tagIds` is materialized from the
> `Escalations_v2_TicketTags` link list. Both are recorded under `computedNotInStorage`.

### 5a. Tag model — dedicated many-to-many link list (D12)
Tags are **not** a delimited field on the ticket. Three lists collaborate:
- **`Escalations_v2_Tags`** — the tag **dictionary** (`TagKey`, `Label`, optional `Color`,
  `ScopeDeptKey`, `IsActive`). Authoritative tag definitions only.
- **`Escalations_v2_TicketTags`** — the **link** list and **source of truth** for which tags
  are on which ticket. One row per relationship: `TicketTagKey`, `TicketKey`→Tickets,
  `TagKey`→Tags, `TagLabelSnapshot` (survives later relabeling), `Source`
  (manual/migration/import/system), `IsActive` + `RemovedAt` (**soft-delete**), `CreatedAt`,
  `CreatedBy`. The adapter enforces **one active row per (ticket, tag)** for de-duplication.
- **`Escalations_v2_Tickets`** carries **no** tag column; the model's `tagIds` is built from
  active links at read time.

**Why (resolves Loop 8 OQ-3):** a link list gives clean filtering, tag-based reporting
(*Tickets by Tag*), full audit/history (soft-delete keeps removed links), de-duplication, and
a migration-friendly shape — none of which a comma-delimited field supports well.

**Reference-user strategy (`Escalations_v2_Users`).** The *preferred* production approach is
**native SharePoint `Person` columns** resolving identities against Entra/SharePoint user
info, **not** a hand-maintained user table. The `Escalations_v2_Users` list exists as a
design fallback / mock-parity shim (so `MockStore` user objects have a 1:1 home and lookups
resolve where directory access isn't available). Identity binding is gated by D6/D7.

## 6. Required indexes / views
**Indexes** (SharePoint throttles list views past the 5,000-item threshold unless filtered/
sorted columns are indexed):
- `Tickets`: `TicketKey`, `Status`, `Priority`, `AssignedDeptKey`, `AssigneeKey`, `EscalationDate`.
- `Activity` (grows fastest): `ActivityKey`, `EscalationKey`, `Type`, `Timestamp`.
- `Comments` / `InternalNotes`: key, `EscalationKey`, `CreatedAt`.
- `TicketTags`: `TicketTagKey`, `TicketKey`, `TagKey`, `IsActive`, `CreatedAt` — both lookup
  directions indexed (can grow large: many tags × many tickets).
- `Tags`: `TagKey`, `Label`.

**Views** (defined in the schema's `views` array):
- **Open by Department** — backs the department queue (includes person-assigned tickets).
- **My Assigned** — `AssigneeKey = [Me]`.
- **Overdue / At-Risk** — `ExpectedResolutionDate < [Today]` and open.
- **Legacy Migrated** — `LegacyItemId is not null` (traceability).
- Per-ticket chronological views for Activity, Comments, and Internal Notes.
- **Tags by Ticket** (`TicketKey = [param] AND IsActive = true`) and **Tickets by Tag**
  (`TagKey = [param] AND IsActive = true`) on `TicketTags`, plus a **Link Audit (all)** view
  retaining soft-deleted links (D12).

## 7. Permission model assumptions
Assumptions only — **no permissions are configured by this work**; finalized under D6 before
any live work:
- v2 lists live on a **company-owned** site, separate from legacy, never a personal site.
- Read for queue members; write scoped by department membership — enforced in the
  **app/adapter layer** for MVP, by list permissions later.
- **Owner-only Complete** is an application rule (`domain/rules.js`), not a SharePoint
  permission, in early phases.
- Internal-note visibility is **metadata today**; future hardening may gate it via
  item-level permissions or a separate secured list.
- No legacy permissions are altered; v2 uses its own site and (per D6) its own app
  registration.

## 8. Future Graph / SharePoint adapter approach
- **A single new class `SharePointStore extends EscalationStore`** implementing the exact
  same contract as `MockStore` (see [`BACKEND_ADAPTER_PLAN.md`](./BACKEND_ADAPTER_PLAN.md)). A
  **design-only stub** already exists ([`../src/v2/store/SharePointStore.js`](../src/v2/store/SharePointStore.js))
  — it mirrors the interface and throws a clear design-only error on every call; no network,
  no SDKs. Callers/UI do not change.
- **Access via Microsoft Graph list APIs** (`/sites/{site}/lists/{list}/items`) using a
  dedicated v2 Entra app (D6) with least-privilege scopes — **not built now**.
- **Translation layer** maps model ↔ columns using the `mapsTo` metadata already in the
  schema (mechanical, table-driven).
- **Reads** use the indexed views in §6; **writes** append immutable Activity rows alongside
  ticket mutations (mirroring `MockStore.#record`).
- **No Power Automate dependency**: the adapter does the reads/writes directly; flows, if
  ever added, would be additive (e.g. notifications), never the system of record.
- **Mock parity is the contract test (D13)**: the reusable store contract
  ([`STORE_CONTRACT.md`](./STORE_CONTRACT.md)) — which passes against `MockStore` today — is
  the **acceptance gate**. `SharePointStore` ships only when it passes the *identical* contract
  run against a disposable test site, before any cutover.

## 9. Risks and open questions
- **OQ-1 — D3 not decided.** SharePoint is *provisional*. If D3 lands on Dataverse or a
  managed API/DB, this schema becomes a reference, not the build target. Mitigated by the
  store seam.
- **OQ-2 — 5,000-item list-view threshold.** Activity grows fastest; indexing (§6) and
  paged queries are mandatory. Re-evaluate if volume approaches the threshold quickly.
- **OQ-3 — Tags representation. RESOLVED (D12).** Decided in favor of the dedicated
  many-to-many `Escalations_v2_TicketTags` link list (not a delimited field) for clean
  filtering/reporting/auditing/de-duplication/migration. See §5a. The cost (an extra list +
  joins) is accepted. Remaining detail: the adapter enforces one-active-row-per-(ticket,tag).
- **OQ-4 — Identity binding.** Native `Person` columns vs. the `Escalations_v2_Users` shim;
  depends on directory access (D6/D7).
- **OQ-5 — Immutability of Activity.** SharePoint doesn't truly prevent edits; immutability
  is an app convention. Consider item-level permissions or a write-once pattern.
- **OQ-6 — Notifications.** Deferring Power Automate means MVP has no notifications; confirm
  that's acceptable for phase 1 (see §11).
- **OQ-7 — Concurrency / optimistic concurrency.** Two leads editing one ticket — rely on
  SharePoint ETags; the adapter must handle conflicts.

## 10. Manual / admin steps that may eventually be required
*(None are performed now — listed so the future live phase is predictable. The full,
step-by-step recipe lives in
[`SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md`](./SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md), gated by the
[dry-run checklist](../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md).)*
1. Provision a **company-owned** SharePoint site for v2 (separate from legacy).
2. Create the **eight** `Escalations_v2_*` lists from the schema (incl. the
   `Escalations_v2_TicketTags` link list); add columns and choice sets.
3. Apply the **indexes** in §6 and create the **views** in §6.
4. Register a **new v2 Entra app** (D6) with least-privilege Graph scopes.
5. Configure list/site **permissions** per §7.
6. Run the **migration dry-run** (read-only legacy export, no write-back) — gated by D7 and
   the backend-adapter readiness checklist.
7. Run the **mock-parity contract tests** against a disposable test site before any cutover.

## 11. Claude / AI recommendation checkpoint (for the later architecture decision)
> A decision aid for a *future* loop. Not a decision; D3/D11 remain owned by Rod.

**Current recommendation:** SharePoint List v2 with **no flows** is the right MVP phase-1
readiness path — it minimizes new moving parts, keeps all business logic in the testable
domain layer, and stays fully behind the swap seam.

**Reconsider Power Automate / Graph / Azure when any of these become true:**
- Notifications (email/Teams) or scheduled SLA escalations become MVP-required → a *single,
  additive, version-controlled* flow **or** an app-side/Graph-subscription approach.
- The 5,000-item threshold or query performance starts to bite, or reporting needs
  cross-list joins SharePoint can't do well → reconsider **Dataverse** or a **managed
  API/DB** (D3).
- Permission requirements exceed SharePoint item-level capabilities (e.g. strict
  note confidentiality) → reconsider a backend with row-level security.

**Bias:** keep automation **in code, in the repo, under test** for as long as practical;
introduce a flow/Graph automation only when the requirement is concrete and an app-side
implementation is clearly worse.
