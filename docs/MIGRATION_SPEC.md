# Migration Spec — Legacy → v2

> Planning scaffold. **The legacy tracker is a READ-ONLY source.** Migration never writes
> back to it. See [`harness/MIGRATION_DRY_RUN_CHECKLIST.md`](../harness/MIGRATION_DRY_RUN_CHECKLIST.md)
> and [`harness/NO_PRODUCTION_MODIFICATION_CHECKLIST.md`](../harness/NO_PRODUCTION_MODIFICATION_CHECKLIST.md).

## 1. Principles
1. Treat the old tracker as **legacy source only**.
2. **Do not write back** to the old tracker (no field updates, no status fixes, no deletes).
3. **Preserve `legacyItemId` and `legacyUrl`** on every migrated record (traceability).
4. **Dry-run first** — produce a report and a candidate v2 dataset with zero v2 writes.
5. Correct obvious legacy **data drift in v2 only**, never in the old tracker, and always
   record a `migrationNote`.

## 2. Sources (read-only)
- `Escalation Tracker` list (main records).
- `Escalations Dept Leads` (department leads → `EscalationTeams`).
- `User Information List` (identities → person refs).

Access via a dedicated **read-only** `LegacyReader` using read-only Graph scopes. The
writable v2 store and the legacy reader are separate components and must never be confused.

## 3. Field mapping (legacy → v2 `Escalations`)

| Legacy field | v2 field | Notes |
|--------------|----------|-------|
| (SharePoint item id) | `legacyItemId` | **Preserved.** |
| (item web URL) | `legacyUrl` | **Preserved.** |
| `Title` | `title` | |
| `StatusCommentary` | `description` | |
| `Status` | `status` | Mapped per [`STATUS_WORKFLOW.md`](./STATUS_WORKFLOW.md) §5. |
| `Urgency` | `priority`/`urgency` | |
| `IssueType` | `issueType` | |
| `IssueCategoryDetail` | `issueCategory` | |
| `AssignedDepartmentOwner` | `assignedDeptId` | Resolve to `EscalationTeams`. |
| `AssignedToLookupId` | `assigneeId` | Resolve via User Information List. |
| `AuthorLookupId` | `submitterId` | |
| `RequestingDept` | `requestingDept` | |
| `OriginalAssignedDept` | `migrationNotes` | Keep as history note. |
| `EscalationDate` | `escalationDate` | |
| `ExpectedResolutionDate` | `expectedResolutionDate` | |
| `ResolvedDate` | `resolvedDate` | |
| `FinancialImpactAmount` | `financialImpactAmount` | |
| `AmountRemaining` | `amountRemaining` | |
| `MemberName`/`CustomerName`/`WorkerName` | (structured fields/notes) | Keep. |
| `AddTags` | `tags` | Map to `EscalationTags`. |
| `StatusUpdates` (rich-text timeline) | `EscalationActivity` / `EscalationComments` | Parse entries into activity/comments; preserve original text. |
| `InternalDocumentationNeeded`/`...Commentary` | fields/notes | Keep. |
| `Created`/`Modified` | `createdAt`/`modifiedAt` | |
| `DaysCurrentDept`/`DateAssignedtoCurrent`/`AssignmentID`/`TeamsPost` | `migrationNotes` | Retain as needed. |

## 4. Drift correction (v2-only)
Detect and fix obvious inconsistencies **in the v2 copy**, recording a note each time:

- **Status/assignee drift:** legacy `Status = "Not yet assigned"` but `AssignedTo`
  populated → v2 `status = "Assigned"`, note: *"Legacy status was 'Not yet assigned' with
  an assignee; corrected to 'Assigned' on migration."*
- **Negative/garbage day counts:** recompute `daysOpen`; clamp ≥ 0 (legacy issue, see
  `df6ee22`).
- **Resolved without date / date without resolved:** reconcile, note.
- **Pending-* collapse:** record original legacy status in the note.

Every correction → one `EscalationActivity` entry of `type: migration` plus a line in
`migrationNotes`.

## 5. Dry-run output
A dry-run produces, **without writing to v2 or legacy**:
- `migration-candidates.json` — proposed v2 records.
- `migration-drift-report.csv` — every detected/corrected drift with before/after.
- `migration-summary.md` — counts (records, by status, drift types, unresolved
  identities/depts).
- `migration-errors.log` — records that could not be mapped (for manual review).

## 6. Apply (v2 only, gated)
- Only after dry-run review **and** explicit approval.
- Writes to **v2 storage only**.
- Idempotent: keyed on `legacyItemId` so re-runs upsert, never duplicate.
- Reversible: v2 apply can be rolled back without touching legacy (see
  [`CUTOVER_PLAN.md`](./CUTOVER_PLAN.md)).

## 7. Traceability guarantees
- Every v2 record links back via `legacyItemId` + `legacyUrl`.
- Every transformation is explained in `migrationNotes` and/or a `migration` activity
  entry.
- The legacy tracker is byte-for-byte unchanged after any migration run.
