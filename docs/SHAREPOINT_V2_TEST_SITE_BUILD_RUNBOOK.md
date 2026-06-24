# SharePoint v2 — Phase-2 Test-Site Build Runbook (design-only)

> ⚠️ **DESIGN-ONLY. DO NOT RUN AGAINST PRODUCTION OR LEGACY.** This is a step-by-step recipe
> for building the v2 lists on a **disposable, company-owned, non-production SharePoint test
> site** — to be executed **only after** the approvals in §3 are in place. This document does
> not connect to anything, creates no lists, adds no credentials, and authorizes nothing on
> its own. It introduces no tenant IDs, client IDs, site URLs, secrets, or live endpoints.
>
> Phase mapping: this is **Phase 2** of
> [`PARALLEL_RUN_AND_CUTOVER_PLAN.md`](./PARALLEL_RUN_AND_CUTOVER_PLAN.md). The legacy tracker
> **stays operational and untouched** throughout (D14/D15). **Power Automate remains deferred**
> (D11) — this runbook creates **no flows**.
>
> Authoritative inputs: schema
> [`../src/v2/backend/sharepoint/schema.sharepoint-v2.json`](../src/v2/backend/sharepoint/schema.sharepoint-v2.json),
> admin recipe [`SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md`](./SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md),
> adapter plan [`SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md`](./SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md),
> contract execution [`STORE_CONTRACT_TEST_SITE_PLAN.md`](./STORE_CONTRACT_TEST_SITE_PLAN.md),
> pre-flight [`../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md`](../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md).

## 1. Purpose and scope
Give a builder an exact, reviewable sequence to stand up the eight `Escalations_v2_*` lists
(with columns, indexes, views, and permissions) on a **throwaway test site**, so the future
`SharePointStore` adapter can be validated against the existing **store contract** (D13). Scope
is limited to creating **new** lists on a **new** site. **Out of scope:** any change to legacy,
any Power Automate flow, any production data migration, enabling end users, or cutover.

## 2. Explicit warning
- **Never** point any step at the legacy Escalation Tracker site, list, or its flows.
- Build on a **disposable** test site first; treat it as deletable at any time.
- Nothing in this runbook is executed until **every** approval in §3 is granted.
- If any step would touch production/legacy, **stop** — that is a hard rule, not a judgment call.

## 3. Required approvals before execution (ALL required)
This runbook stays inert until the following are explicitly granted and recorded:
- [ ] **D6 — dedicated v2 Entra app / permissions.** A new app registration isolated from the
      legacy app, with least-privilege scopes for the test site only. *(Approval-gated; not
      created by this repo.)*
- [ ] **D7 — approved legacy read/export method.** An offline read-only export/sample (or, only
      if separately approved, read-only access) for the later dry-run. The build itself uses
      **no** legacy data.
- [ ] **Rod approval for the Phase-2 test-site build** specifically.
- [ ] **Company-owned, non-production SharePoint test site** provisioned and confirmed (not a
      personal/OneDrive site, not legacy).
> Until all four are checked, this document is reference only.

## 4. Pre-flight checklist
- [ ] Complete [`../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md`](../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md)
      (not-legacy target, no writeback, no flows, no Graph/live API in repo, schema match,
      rollback path).
- [ ] `npm run validate` is green in this repo (schema valid + design-only; adapter stub inert).
- [ ] Record the schema version being built (currently `0.2.0-design`) for traceability.
- [ ] Confirm the builder has rights on the **test site only**.
- [ ] Confirm a rollback owner and a deletion window for the disposable site.

## 5. Target site requirements
- A dedicated, **company-owned** v2 **test** site, separate from legacy and from the eventual
  production v2 site.
- List indexing and per-list permissions available.
- Regional/time-zone settings agreed (app stores ISO 8601 / UTC; display is a view concern).
- No tenant-level changes are required or permitted.

## 6. List creation sequence
Create lists in **dependency order** so lookups resolve. Internal names **must** equal the
schema keys.
1. `Escalations_v2_Departments`
2. `Escalations_v2_Users` (or the Person-column reference strategy — see schema)
3. `Escalations_v2_Tags` (dictionary)
4. `Escalations_v2_Tickets`
5. `Escalations_v2_TicketTags` (link list → depends on Tickets + Tags)
6. `Escalations_v2_Activity` (→ depends on Tickets)
7. `Escalations_v2_Comments` (→ depends on Tickets)
8. `Escalations_v2_InternalNotes` (→ depends on Tickets)

## 7. Column creation sequence
For each list, create columns from the schema with **internal name = field `name`**
(PascalCase, no spaces → no `_x0020_` encoding), then apply display labels. Create **lookup
columns last** for each list, after their target lists exist (§6 order guarantees this). Use
the per-list column checklist in
[`SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md`](./SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md) §6 as the
authoritative list. Key reminders:
- `Escalations_v2_Tickets` has **no tag column** (tags live in the link list — D12).
- Choice columns use the exact choice sets in the schema (10 statuses, 4 priorities, 8 activity
  types, visibility values, link `Source`).
- `Escalations_v2_TicketTags` includes `TicketKey`, `TagKey`, `IsActive`, `RemovedAt`,
  `TagLabelSnapshot`, `Source`, `CreatedAt`, `CreatedBy`, and a `Title` set to
  `${TicketKey}::${TagKey}`.

## 8. Index creation sequence
Create indexes **before loading data** (SharePoint throttles filtered/sorted views past the
5,000-item threshold). From the schema's `recommendedIndexes`:
- **Tickets:** `TicketKey`, `Status`, `Priority`, `AssignedDeptKey`, `AssigneeKey`, `EscalationDate`.
- **Activity:** `ActivityKey`, `EscalationKey`, `Type`, `Timestamp`.
- **Comments / InternalNotes:** key, `EscalationKey`, `CreatedAt`.
- **TicketTags:** `TicketTagKey`, `TicketKey`, `TagKey`, `IsActive`, `CreatedAt`.
- **Tags:** `TagKey`, `Label`.

## 9. View creation sequence
From the schema's `views`:
- **Tickets:** *Open by Department*, *My Assigned*, *Overdue / At-Risk*, *Legacy Migrated*.
- **Activity / Comments / InternalNotes:** per-ticket chronological (`EscalationKey = [param]`).
- **TicketTags:** *Tags by Ticket* (`TicketKey = [param] AND IsActive = true`), *Tickets by
  Tag* (`TagKey = [param] AND IsActive = true`), *Link Audit (all)*.

## 10. Permission setup assumptions
*(Assumptions only — finalized under D6.)*
- Test site is company-owned, isolated; **no legacy permissions are altered**.
- Builder/service identity (the D6 app) can read/write the **test-site lists only**.
- Owner-only Complete stays an **application rule** (enforced in the adapter/domain), not a
  SharePoint permission, in this phase.
- `TicketTags` inherits the ticket's read scope.

## 11. Validation steps after each list
After creating each list:
- [ ] Internal name matches the schema key exactly.
- [ ] All columns exist with correct type + internal name; lookups resolve to the right list.
- [ ] Declared indexes are present.
- [ ] Declared views return sensible results against a tiny hand-entered sample row.
- [ ] Delete the sample row(s) before adapter testing so the site starts clean.
After **all** lists: run the schema-conformance spot-check (list/column/index/view names vs.
`schema.sharepoint-v2.json`).

## 12. Dry-run import preparation
*(Migration runs later — Phase 3 — and is gated separately.)*
- [ ] Confirm the **offline export/sample** (D7) is available and read-only.
- [ ] Confirm the migration tooling has **no write path** to legacy and writes to **v2 test
      site only** (fail-closed), per [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md) §5 and
      [`LEGACY_TO_V2_MAPPING_PLAN.md`](./LEGACY_TO_V2_MAPPING_PLAN.md).
- [ ] Do **not** import production data during Phase 2; use synthetic/seed data for adapter
      validation.

## 13. Store contract test preparation
- [ ] Implement `SharePointStore` per
      [`SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md`](./SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md)
      (test-site only).
- [ ] Wire it into the existing harness via a `makeStore(seed)` factory that loads the standard
      seed into the test site — see [`STORE_CONTRACT_TEST_SITE_PLAN.md`](./STORE_CONTRACT_TEST_SITE_PLAN.md).
- [ ] Run the **same** store contract that passes against `MockStore` (D13). A **first green
      contract run against the test site** is the build's success signal.

## 14. Rollback / cleanup steps
The build only **creates new** lists on a **new** site, so rollback is clean and isolated:
1. Delete the newly created `Escalations_v2_*` lists (or delete the disposable test site).
2. No flows were created → nothing to disable.
3. No legacy writeback occurred → nothing to reverse.
4. Re-run the pre-flight (§4) before any retry.
> Legacy remains the live system throughout; this build is parallel and non-destructive.

## 15. Failure handling
- **A list/column/view fails to create:** stop, fix the schema mismatch, delete the partial
  list, recreate. Do not "patch around" divergences — internal names must match the schema.
- **Lookups fail to resolve:** confirm §6 dependency order; create lookup columns after targets.
- **Throttling / transient SharePoint errors:** retry with backoff at the build-tool level; do
  not disable indexing to "work around" threshold errors.
- **Permission errors:** verify the D6 app scope is test-site-only; never broaden scope to
  touch legacy.
- **Any step touches production/legacy:** **abort immediately**, run cleanup (§14), and
  re-seek approval.

## 16. Final go / no-go criteria
**Go (build accepted)** when all are true:
- [ ] All 8 lists exist with exact internal names; columns/indexes/views match the schema.
- [ ] `Escalations_v2_Tickets` has no tag column; tags resolve only via `TicketTags`.
- [ ] *Tags by Ticket* / *Tickets by Tag* work and respect `IsActive` (soft-delete).
- [ ] Legacy verified **unchanged**; **no** Power Automate flow created.
- [ ] The store contract (D13) passes green against the test site (first green run).
**No-go** → run cleanup (§14), remain on the current phase, and report. No partial promotion to
the production v2 site.

## 17. Power Automate remains deferred
This runbook creates **no** Power Automate flows. Notifications/automation stay deferred for MVP
phase 1 (D11); any future flow is a separate, explicitly-approved decision and is never the
system of record. Business rules remain in `domain/rules.js` and the adapter.
