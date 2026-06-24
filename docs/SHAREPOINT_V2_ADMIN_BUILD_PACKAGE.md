# SharePoint v2 — Admin Build Package (design-only)

> ⚠️ **DESIGN-ONLY. DO NOT RUN AGAINST PRODUCTION YET.** This document is a *build recipe*
> for a future, controlled SharePoint List v2 implementation. It is **not** an automation, a
> script, or an approval to build. Nothing here connects to or modifies SharePoint, Microsoft
> Graph, Dataverse, Azure, or any live service. **No Power Automate flows are part of this
> package.** It introduces no credentials, tenant/client IDs, secrets, or live URLs. Building
> live is gated by decisions **D3/D6/D7** and the readiness checklists in
> [`../harness/`](../harness/).
>
> Authoritative schema: [`../src/v2/backend/sharepoint/schema.sharepoint-v2.json`](../src/v2/backend/sharepoint/schema.sharepoint-v2.json).
> Companion docs: [`SHAREPOINT_V2_BACKEND_READINESS.md`](./SHAREPOINT_V2_BACKEND_READINESS.md),
> [`BACKEND_ADAPTER_PLAN.md`](./BACKEND_ADAPTER_PLAN.md),
> [`DECISION_LOG.md`](./DECISION_LOG.md) (D11, D12). Pre-flight:
> [`../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md`](../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md).
>
> **Phase-2 execution:** this package is the **column/index/view source of truth**; the
> ordered, executable build steps live in
> [`SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md`](./SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md)
> (runbook-driven and contract-validated — decision **D16**).

## 1. Purpose and scope
Give a SharePoint admin a single, reviewable checklist to stand up the v2 lists **exactly**
as the design-only schema specifies, **when and if** a controlled build is approved. Scope is
limited to creating new `Escalations_v2_*` lists, columns, indexes, views, and permissions on
a **new, company-owned** site. Out of scope: any change to the legacy tracker, any flow, any
data migration (covered separately and gated).

## 2. Explicit warning
- **Do not run against production yet.** This is a plan, not an execution order.
- Build only after **Rod's explicit approval** and the dry-run checklist passes.
- Build on a **disposable test site first**; promote to the real site only after validation.
- **Never** point any step at the legacy Escalation Tracker site, list, or its flows.

## 3. Prerequisites
- Written approval to build (D3 backend confirmed; D6 app-registration decision made).
- A **company-owned** SharePoint site (not a personal/OneDrive site) dedicated to v2.
- Site Owner / list-management rights on **that v2 site only**.
- The schema JSON at the version recorded in §11 (currently `0.2.0-design`).
- The dry-run checklist completed and signed off.

## 4. Required SharePoint site assumptions
- Dedicated v2 site, **separate** from legacy; no shared lists with legacy.
- Site collection supports list indexing and per-list permissions.
- Time zone / regional settings agreed so `DateTime` columns are interpreted consistently
  (the app stores ISO 8601 / UTC; display is a view concern).
- No tenant-level changes are required or permitted by this package.

## 5. Required lists
Create all of the following (internal names are stable and must match the schema keys):

1. `Escalations_v2_Tickets`
2. `Escalations_v2_Activity`
3. `Escalations_v2_Comments`
4. `Escalations_v2_InternalNotes`
5. `Escalations_v2_Tags` — tag **dictionary** (catalog) only.
6. `Escalations_v2_TicketTags` — many-to-many **link** list (ticket ↔ tag). **Source of
   truth for tags** (decision D12). Tickets carry **no** delimited tag field.
7. `Escalations_v2_Departments`
8. `Escalations_v2_Users` — or the **user reference strategy** (preferred: native
   SharePoint **Person** columns resolving against Entra; the list is a fallback/mock-parity
   shim). Choose one and apply consistently; see the readiness doc §5.

## 6. Column checklist (per list)
Create each column with the **internal name = the schema `name`** (PascalCase, no spaces, so
SharePoint does not encode it), then apply a friendly display label. Use the schema as the
authoritative source; the highlights below must all be present.

**Escalations_v2_Tickets** — `TicketKey`(Text, indexed), `Title`(Text), `Description`(Note),
`Status`(Choice ×10, indexed), `Priority`(Choice ×4, indexed), `IssueCategory`(Text),
`IssueType`(Text), `AssignedDeptKey`(Lookup→Departments, indexed),
`AssigneeKey`(Lookup→Users, indexed), `TicketOwnerKey`(Lookup→Users),
`SubmitterKey`(Lookup→Users), `RequestingDept`(Text), `EscalationDate`(DateTime, indexed),
`ExpectedResolutionDate`(DateTime), `CompletedDate`(DateTime), `LegacyItemId`(Text),
`LegacyUrl`(Hyperlink), `MigrationNotes`(Note), `CreatedAt`(DateTime), `ModifiedAt`(DateTime).
**No tag column** — tags are materialized from `Escalations_v2_TicketTags`.

**Escalations_v2_Activity** — `ActivityKey`(Text, indexed),
`EscalationKey`(Lookup→Tickets, indexed), `Type`(Choice ×8, indexed),
`ActorKey`(Lookup→Users), `FromValue`(Note), `ToValue`(Note), `ActivityNote`(Note),
`Timestamp`(DateTime, indexed). Treat as **append-only / immutable** by convention.

**Escalations_v2_Comments** — `CommentKey`(Text, indexed),
`EscalationKey`(Lookup→Tickets, indexed), `AuthorKey`(Lookup→Users), `Body`(Note),
`Mentions`(Note), `Visibility`(Choice: public), `CreatedAt`(DateTime, indexed),
`EditedAt`(DateTime).

**Escalations_v2_InternalNotes** — `NoteKey`(Text, indexed),
`EscalationKey`(Lookup→Tickets, indexed), `AuthorKey`(Lookup→Users), `Body`(Note),
`Visibility`(Choice: internal), `CreatedAt`(DateTime, indexed).

**Escalations_v2_Tags** (dictionary) — `TagKey`(Text, indexed), `Label`(Text, indexed),
`Color`(Text), `ScopeDeptKey`(Lookup→Departments), `IsActive`(Boolean).

**Escalations_v2_TicketTags** (link) — `TicketTagKey`(Text, indexed),
`Title`(Text; strategy: `${TicketKey}::${TagKey}`), `TicketKey`(Lookup→Tickets, indexed),
`TagKey`(Lookup→Tags, indexed), `TagLabelSnapshot`(Text),
`Source`(Choice: manual/migration/import/system), `IsActive`(Boolean, indexed, required),
`RemovedAt`(DateTime), `CreatedAt`(DateTime, indexed), `CreatedBy`(Lookup→Users / Person).
Enforce **one active row per (TicketKey, TagKey)** in the adapter (SharePoint has no native
composite uniqueness).

**Escalations_v2_Departments** — `DeptKey`(Text, indexed), `Name`(Text), `LeadKeys`(Note),
`MemberKeys`(Note).

**Escalations_v2_Users** (or Person strategy) — `UserKey`(Text, indexed),
`DisplayName`(Text), `Email`(Text), `DepartmentKeys`(Note), `PersonRef`(Person).

## 7. Index checklist
Create indexes **before** loading data (SharePoint throttles filtered/sorted views past the
5,000-item threshold). From the schema's `recommendedIndexes`:
- **Tickets:** `TicketKey`, `Status`, `Priority`, `AssignedDeptKey`, `AssigneeKey`, `EscalationDate`.
- **Activity:** `ActivityKey`, `EscalationKey`, `Type`, `Timestamp`.
- **Comments:** `CommentKey`, `EscalationKey`, `CreatedAt`.
- **InternalNotes:** `NoteKey`, `EscalationKey`, `CreatedAt`.
- **TicketTags:** `TicketTagKey`, `TicketKey`, `TagKey`, `IsActive`, `CreatedAt`.
- **Tags:** `TagKey`, `Label`.

## 8. View checklist
From the schema's `views`:
- **Tickets:** *Open by Department* (group by `AssignedDeptKey`), *My Assigned*
  (`AssigneeKey = [Me]`), *Overdue / At-Risk*, *Legacy Migrated*.
- **Activity / Comments / InternalNotes:** per-ticket chronological (`EscalationKey = [param]`).
- **TicketTags:** *Tags by Ticket* (`TicketKey = [param] AND IsActive = true`), *Tickets by
  Tag* (`TagKey = [param] AND IsActive = true`), *Link Audit (all)* (full history incl.
  soft-deleted).

## 9. Permission assumptions
*(Assumptions only — finalized under D6 before any live work.)*
- v2 site is company-owned, separate from legacy; no legacy permissions altered.
- Read for queue members; write scoped by department membership (app/adapter layer in MVP,
  list permissions later).
- Owner-only Complete is an **application rule**, not a SharePoint permission, in early phases.
- Internal-note confidentiality is metadata today; may later use item-level permissions or a
  separate secured list.
- `TicketTags` inherits the ticket's read scope; link writes follow ticket write rules.

## 10. Naming convention
- **List internal name:** the schema key, prefixed `Escalations_v2_` (stable, never renamed).
- **List display name:** the schema `displayName` (re-labelable without breaking queries).
- **Column internal name:** the schema field `name` (PascalCase, no spaces → no `_x0020_`).
- **Keys vs. labels:** code, views, indexes, and the adapter bind to **internal names only**.

## 11. Ownership convention
- A named **site owner** (team/role, not a personal account) owns the v2 site and lists.
- The v2 **Entra app** (D6), once created, is the service identity for the adapter — separate
  from the legacy app.
- Schema changes are versioned in this repo (`schemaVersion`, currently **`0.2.0-design`**);
  the admin build must match the recorded version. Record the built version and date here at
  build time.

## 12. Rollback plan
Because this package only **creates new** `Escalations_v2_*` lists on a **new** site, rollback
is clean and isolated:
1. If validation fails, **delete the newly created v2 lists** (and the test site, if
   disposable). Legacy is untouched, so there is nothing to restore there.
2. No flows are created, so there are no flows to disable.
3. No data is migrated by this package, so there is no data to reverse.
4. Re-run the dry-run checklist before any retry.
> The legacy tracker remains the live system throughout; this build is parallel and
> non-destructive by construction.

## 13. Dry-run checklist
Complete [`../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md`](../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md)
**before** executing any step here. Do not proceed if any item fails.

## 14. Post-build validation checklist
After building (on the test site first):
- [ ] All 8 lists exist with the exact internal names in §5.
- [ ] Every column in §6 exists with the correct type and internal name.
- [ ] All indexes in §7 are present.
- [ ] All views in §8 return sensible results against a tiny hand-entered sample.
- [ ] `Escalations_v2_Tickets` has **no** tag column; tags resolve only via `TicketTags`.
- [ ] *Tags by Ticket* and *Tickets by Tag* both work and respect `IsActive`.
- [ ] Soft-delete: setting `IsActive=false` (with `RemovedAt`) removes a tag from the active
      views but preserves it in *Link Audit*.
- [ ] Permissions match §9; legacy permissions verified **unchanged**.
- [ ] **No** Power Automate flow was created at any point.
- [ ] (When the adapter exists) the mock-parity contract tests pass against the test site.

## 15. Legacy non-interference (mandatory)
- The **legacy Escalation Tracker list/site must not be touched** — no reads that write, no
  schema edits, no permission changes.
- **Existing legacy Power Automate flows must not be touched, edited, or disabled.**
- v2 lives on its own site with its own (future) app registration. Any deviation voids this
  package and requires re-approval. See
  [`../harness/NO_PRODUCTION_MODIFICATION_CHECKLIST.md`](../harness/NO_PRODUCTION_MODIFICATION_CHECKLIST.md).
