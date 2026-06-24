# Legacy → v2 Source Mapping Plan (SharePoint v2)

> **Loop 11.** A focused, build-ready mapping from the **legacy SharePoint tracker** into the
> **SharePoint v2** data model and the design-only schema
> ([`../src/v2/backend/sharepoint/schema.sharepoint-v2.json`](../src/v2/backend/sharepoint/schema.sharepoint-v2.json)).
> It complements the authoritative [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md) with the
> field-by-field handling decisions for the chosen backend (D3).
>
> ⚠️ **Design/planning only.** Legacy is a **read-only** source. **No writeback to legacy**
> (decision **D15**). No live integration; migration runs against an **export/sample** first
> (D7). Nothing here connects to SharePoint/Graph.

## 1. Legacy source assumptions
- The legacy **Escalation Tracker** SharePoint list is the primary source, supported by
  `Escalations Dept Leads` (→ departments) and a `User Information List` (→ identities), per
  [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md) §2.
- Field names follow the observed legacy schema in [`DATA_MODEL.md`](./DATA_MODEL.md) §9.
- Legacy data carries known drift (status/assignee mismatch, stray day counts, dates) — to be
  corrected **in v2 only**, with a note.

## 2. Legacy is read-only / export-based during planning
- The dry-run consumes an **offline export** (CSV/JSON) provided by Rod/Teri (D7), or — only
  with explicit approval — a **read-only** live read. Either way the migration has **no write
  path** to legacy.
- The legacy list is **byte-for-byte unchanged** after any migration activity (D15).

## 3. Field mapping (legacy → v2)
Targets are the v2 model fields (see [`../src/v2/domain/models.js`](../src/v2/domain/models.js))
and their SharePoint v2 columns (see the schema's `mapsTo`). For the full event/parse details
see [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md) §3.

| Legacy source | v2 field | v2 column (`Escalations_v2_Tickets`) | Notes |
|---------------|----------|--------------------------------------|-------|
| SharePoint item id | `legacyItemId` | `LegacyItemId` | **Preserved**; migration de-dupe key. |
| Item web URL | `legacyUrl` | `LegacyUrl` | **Preserved**; read-only reference, never queried by v2. |
| `Title` | `title` | `Title` | |
| `StatusCommentary` | `description` | `Description` | |
| `Status` | `status` | `Status` | Mapped per §4 + [`STATUS_WORKFLOW.md`](./STATUS_WORKFLOW.md) §5. |
| `Urgency` | `priority` | `Priority` | Mapped per §5. |
| `IssueType` | `issueType` | `IssueType` | |
| `IssueCategoryDetail` | `issueCategory` | `IssueCategory` | |
| `RequestingDept` | `requestingDept` | `RequestingDept` | Free text (originating dept). |
| `AssignedDepartmentOwner` | `assignedDeptId` | `AssignedDeptKey` | Resolve → `Escalations_v2_Departments` (§ requester/dept). |
| `AssignedToLookupId` | `assigneeId` | `AssigneeKey` | Resolve via User Information List (§ assigned person). |
| (closure authority) | `ticketOwner` | `TicketOwnerKey` | **No direct legacy field** — see §6 unknown/missing. |
| `AuthorLookupId` | `submitterId` | `SubmitterKey` | The requester (§ requester). |
| `EscalationDate` | `escalationDate` | `EscalationDate` | |
| `ExpectedResolutionDate` | `expectedResolutionDate` | `ExpectedResolutionDate` | |
| `ResolvedDate` | `completedDate` | `CompletedDate` | **Loop 7 (D10):** legacy resolved/closed date → single `completedDate`; only set when status maps to **Complete**. |
| `AddTags` | `tagIds` (effective) | *(none — link list)* | **D12:** create rows in `Escalations_v2_TicketTags`, not a ticket column (§ tags). |
| `StatusUpdates` (rich-text timeline) | activity / comments | `Escalations_v2_Activity` / `Escalations_v2_Comments` | Parse entries; preserve original text (§ comments/notes). |
| `InternalDocumentation*` | internal note | `Escalations_v2_InternalNotes` | If present, becomes an internal note (§ comments/notes). |
| `Created` / `Modified` | `createdAt` / `modifiedAt` | `CreatedAt` / `ModifiedAt` | App-level timestamps. |
| `OriginalAssignedDept`, `DaysCurrentDept`, `DateAssignedtoCurrent`, `AssignmentID`, `TeamsPost` | `migrationNotes` | `MigrationNotes` | Retained as history notes. |
| `FinancialImpactAmount`, `AmountRemaining` | (optional, deferred) | — | Not in MVP ticket columns; capture in `migrationNotes` until modeled. |
| `MemberName` / `CustomerName` / `WorkerName` | (structured/notes) | `MigrationNotes` | Keep verbatim; structure later. |

## 4. Status mapping
Legacy statuses → v2 Loop-7 vocabulary (`New`, `Not yet assigned`, `Assigned`, `In Process`,
`Pending Research`, `Pending Member`, `Pending Customer`, `Complete`, `Cancelled`, `Reopened`):
- The three legacy **Pending-\*** states map 1:1 (kept distinct, D5/D10).
- Legacy **In Process** maps 1:1.
- Legacy **Complete** maps 1:1 and sets `completedDate` if a resolved/closed date exists.
- **Status/assignee drift:** legacy `Not yet assigned` + populated assignee → v2 **Assigned**
  (drift correction, §7).
- Unknown/blank legacy status → v2 **New** (or **Not yet assigned** if a department is set),
  with a `migration_normalization` note recording the original.

## 5. Priority mapping
Legacy `Urgency` → v2 `priority` (`Low` / `Medium` / `High` / `Critical`). Normalize synonyms
(e.g. "Med" → `Medium`, "Urgent"/"Highest" → `High`/`Critical` per agreed rules); unknown →
`Medium` with a note.

## 6. Field-handling specifics
- **Legacy ID / URL:** always preserved (`legacyItemId` / `legacyUrl`); `legacyItemId` is the
  idempotency key for re-runnable migration.
- **Requester:** `AuthorLookupId` → `submitterId` (resolve via User Information List).
- **Assigned person:** `AssignedToLookupId` → `assigneeId`; unresolved identities are logged
  (not invented) and left null pending review.
- **Department/queue:** `AssignedDepartmentOwner` → `assignedDeptId` resolved to a v2
  department; unmatched departments logged for the canonical-list decision (D8).
- **Ticket owner (`ticketOwner`):** no direct legacy field. Default to the **department lead**
  of `assignedDeptId` (from `Escalations Dept Leads`) as the closure authority, recording a
  note; leave null if no lead resolves. (Owner-only Complete is enforced in v2; D10.)
- **Status:** §4. **Priority:** §5.
- **Expected date:** `ExpectedResolutionDate` → `expectedResolutionDate` (drives overdue/at-
  risk); blank stays null.
- **Complete/completed date:** legacy resolved/closed date → `completedDate`, **only** when the
  mapped status is `Complete`; reconcile "resolved without date" / "date without resolved" and
  note (§7).
- **Comments / notes:** parse `StatusUpdates` into `Escalations_v2_Activity` and public
  `Escalations_v2_Comments`, preserving original text; `InternalDocumentation*` → internal
  notes. If timeline parsing is ambiguous, retain the **whole** original block as one
  comment/note rather than losing content.
- **Attachments:** if the export includes attachment references, **record the reference/URL in
  `migrationNotes`** for traceability; **do not copy binaries** in MVP phase 1 (out of scope,
  flagged as a warning). No attachment is fetched from legacy.
- **Unknown / missing fields:** never fabricate. Leave null where the model allows, capture the
  raw value in `migrationNotes`, and log it in the migration error/summary output for review.

## 7. Migration warnings (surfaced in the dry-run report)
- Unresolved identities (assignee/submitter) or departments.
- Status/assignee drift corrections (before/after).
- Date reconciliations (resolved/completed mismatches; recomputed/clamped `daysOpen`).
- Blank/unknown status or priority defaulted.
- Ambiguous `StatusUpdates` timeline parsing (fell back to whole-block retention).
- Attachments present but not migrated (reference-only).
- Owner inferred from department lead (or left null).

## 8. Dry-run import strategy
- Read from the **export** (D7); **zero writes** to legacy or v2; fail-closed if any write
  path is detected (per [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md) §5).
- Deterministic and idempotent on `legacyItemId`; safe to re-run.
- Staged: parse → map fields → map status + normalization → resolve identities/departments →
  emit artifacts (`migration-candidates.json`, `migration-drift-report.csv`,
  `migration-summary.md`, `migration-errors.log`).
- Review loop: adjust mapping rules in this doc and re-run until clean; **no "apply"** until
  reviewed **and** approved. Apply writes to **v2 storage only** (idempotent), reversible
  without touching legacy.

## 9. No-writeback policy (D15)
Migration is strictly one-directional: **legacy → v2**. There is **no** path that updates,
fixes, deletes, re-permissions, or flow-modifies legacy. All corrections happen in the v2 copy
with a `migration_normalization` note. Any future need to write to legacy requires a separate,
explicit approval and its own decision entry.
