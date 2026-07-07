# Data Model — Escalation System v2

> Planning scaffold. Defines v2 storage. These are **new** v2 entities, separate from the
> legacy "Escalation Tracker" list, which is read-only.

## 1. Storage entities (v2)

Suggested v2 storage objects (SharePoint lists for the temporary backend, tables for the
target API backend):

| Entity | Purpose |
|--------|---------|
| `Escalations` | Core ticket records. |
| `EscalationActivity` | Append-only audit/activity log (status, assignment, field changes). |
| `EscalationComments` | Human comments / discussion (distinct from system activity). |
| `EscalationTags` | Tag catalog (+ ticket↔tag links). |
| `EscalationTeams` | Departments/queues, members, leads, routing. |
| `EscalationSettings` | Per-department config (generic default for MVP). |
| `EscalationAttachments` *(optional)* | File metadata/links. |
| `EscalationSLA` *(optional)* | SLA rules and computed targets. |

## 2. `Escalations` (core ticket)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string/guid | v2 primary key. |
| `title` | string | Short summary. |
| `description` | text | Body / commentary. |
| `status` | enum | See [`STATUS_WORKFLOW.md`](./STATUS_WORKFLOW.md). |
| `priority` / `urgency` | enum | e.g. Low/Med/High/Critical. |
| `issueCategory` | string/enum | Category (department-configurable later). |
| `issueType` | string/enum | Sub-type. |
| `assignedDeptId` | ref → `EscalationTeams` | Department/queue assignment (the `departmentQueue` context). |
| `assigneeId` | ref → person | Person responsible for the work (`assignedTo`, nullable). |
| `ticketOwner` | ref → person | Queue-accountability owner (nullable). Distinct from `assigneeId`. **No longer the closure authority** — see `submitterId` and D23. |
| `submitterId` | ref → person | Who raised it — the requester/creator. **The ONLY closure authority (Loop 21/D23):** only this person may move the ticket to **Complete**, and a final closing comment is required. See [`STATUS_WORKFLOW.md`](./STATUS_WORKFLOW.md) §3.2. |
| `requestingDept` | string | Originating department. |
| `escalationDate` | datetime | Created/escalated. |
| `expectedResolutionDate` | datetime | Used for overdue/at-risk. |
| `completedDate` | datetime | Set when status → **Complete**; cleared on **Reopened**. (Loop 7 replaced the earlier `resolvedDate`/`closedDate` pair.) |
| `finalClosureNote` | text | Required final closing comment stored when the requester Completes (Loop 21/D23); cleared on **Reopened** — closure history stays in activity. |
| `lastActivityAt` | datetime | Last movement (status/assignment/priority/tag change, comment, note, attachment). Drives no-movement reminder candidacy (Loop 21/D25). Defaults to `createdAt`. |
| `amountInvolved` | money | Optional amount of money involved (non-negative, nullable — Loop 21/D26). |
| `amountCurrency` | string | Currency code for `amountInvolved`; defaults to `USD`. |
| `financialImpactAmount` | money | Optional. |
| `amountRemaining` | money | Optional. |
| `tags` | refs → `EscalationTags` | Many-to-many. |
| **`legacyItemId`** | string | **Legacy SharePoint item ID — preserved.** |
| **`legacyUrl`** | string | **Legacy item URL — preserved.** |
| `migrationNotes` | text | Drift corrections recorded during migration. |
| `createdAt` / `modifiedAt` | datetime | System timestamps. |

> `daysOpen` is **computed** (not stored) — legacy experience showed stored day-counts
> drift. Clamp to ≥ 0.

## 3. `EscalationActivity` (append-only)
| Field | Type | Notes |
|-------|------|-------|
| `id` | guid | |
| `escalationId` | ref | |
| `type` | enum | See event taxonomy below. |
| `actorId` | ref → person | System actor for migration entries. |
| `from` / `to` | json | Old/new values. |
| `note` | text | Human-readable. |
| `timestamp` | datetime | Immutable. |

**Event taxonomy** (`type` values):

| `type` | Emitted when |
|--------|--------------|
| `created` | Ticket created. |
| `assignment_change` | Department or person assignment set/changed/cleared. |
| `status_change` | Lifecycle status changes (including auto-status, see [`STATUS_WORKFLOW.md`](./STATUS_WORKFLOW.md) §3). |
| `priority_change` | Priority/urgency changes. |
| `field_change` | Any other tracked field changes (catch-all). |
| `comment` | A comment is posted (links to `EscalationComments`). |
| `note` | An internal note is added. |
| `attachment` | Attachment metadata added or soft-deleted (Loop 21/D24). |
| `migration_normalization` | A legacy value was normalized during migration (drift correction); see [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md) §4. |

Activity is **immutable** — corrections are new entries, never edits. See
[`ACTIVITY_AND_COMMENTS_SPEC.md`](./ACTIVITY_AND_COMMENTS_SPEC.md).

## 4. `EscalationComments`
| Field | Type | Notes |
|-------|------|-------|
| `id` | guid | |
| `escalationId` | ref | |
| `authorId` | ref → person | |
| `body` | text/markdown | |
| `mentions` | refs → person | @-mentions resolved to identities. |
| `createdAt` | datetime | |
| `editedAt` | datetime | Nullable; comments may be editable (activity is not). |

## 4a. `EscalationAttachments` (metadata-first — Loop 21/D24)
Attachment **metadata** records only. No file bytes are stored and no document library is
touched in the MVP; `fileUrl` is a storage-reference placeholder until real upload is
approved in a later loop. Backed by `Escalations_v2_Attachments` in SharePoint v2.

| Field | Type | Notes |
|-------|------|-------|
| `id` | guid | e.g. `att_...`. |
| `escalationId` | ref | |
| `fileName` | string | Required. |
| `fileUrl` | string | Placeholder storage ref (nullable); no real file behind it in the MVP. |
| `mimeType` | string | Optional. |
| `sizeBytes` | number | Optional. |
| `uploadedBy` | ref → person | |
| `uploadedAt` | datetime | |
| `source` | enum | `manual` / `migration` / `import` / `system`. |
| `isDeleted` | boolean | Soft delete — metadata preserved for audit. |

Adding/soft-deleting an attachment emits an `attachment` activity event and counts as ticket
movement (`lastActivityAt`).

## 5. `EscalationTags`
| Field | Type | Notes |
|-------|------|-------|
| `id` | guid | |
| `label` | string | |
| `color` | string | Optional. |
| `scopeDeptId` | ref | Nullable = global tag. |

> **Tag↔ticket relationship (SharePoint v2 readiness, D12).** `EscalationTags` is the tag
> **dictionary** only. The ticket↔tag relationship is a dedicated **many-to-many link list**
> (`Escalations_v2_TicketTags`), **not** a delimited field on the ticket. The domain
> `Ticket.tagIds` array is materialized from active links at read time. See
> [`SHAREPOINT_V2_BACKEND_READINESS.md`](./SHAREPOINT_V2_BACKEND_READINESS.md) §5a and
> [`DECISION_LOG.md`](./DECISION_LOG.md) D12. (Mock `MockStore` keeps `tagIds` on the ticket
> for in-memory simplicity; the link list is a backend-storage concern.)

## 6. `EscalationTeams` (departments / queues)
| Field | Type | Notes |
|-------|------|-------|
| `id` | guid | |
| `name` | string | Department/queue name. |
| `leadIds` | refs → person | Primary/backup leads. |
| `memberIds` | refs → person | Queue members. |
| `settingsId` | ref → `EscalationSettings` | Defaults to generic config. |
| `routingRules` | json | Reserved (future). |

## 7. `EscalationSettings` (config — generic for MVP)
Shape defined now so department-specific config is a data change later, not a code change.
| Field | Type | Notes |
|-------|------|-------|
| `id` | guid | |
| `deptId` | ref | Nullable = global/generic default. |
| `visibleColumns` | json[] | Column set for the panel. |
| `quickActions` | json[] | Buttons/actions. |
| `filters` | json[] | Available filters. |
| `requiredFields` | string[] | Validation. |
| `categories` | string[] | Allowed issue categories. |
| `slaRules` | json | Reserved (or → `EscalationSLA`). |
| `terminology` | json | Label overrides. |
| `widgets` | json[] | Panel widgets. |

MVP ships exactly one generic `EscalationSettings` (deptId = null) used by all panels.

## 8. Optional entities
- `EscalationAttachments`: `id`, `escalationId`, `fileName`, `url`, `size`, `uploadedBy`,
  `uploadedAt`.
- `EscalationSLA`: `id`, `deptId`, `category`, `targetHours`, `escalateAfterHours`, rules.

## 9. Legacy field → v2 mapping (reference)
See [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md) for the authoritative mapping. Legacy fields
observed: `Title, Status, Urgency, EscalationDate, ResolvedDate, ExpectedResolutionDate,
RequestingDept, AssignedDepartmentOwner, OriginalAssignedDept, DaysCurrentDept,
DateAssignedtoCurrent, IssueType, IssueCategoryDetail, FinancialImpactAmount,
AmountRemaining, MemberName, CustomerName, WorkerName, StatusCommentary, StatusUpdates,
AddTags, TeamsPost, AssignmentID, InternalDocumentationNeeded,
InternalDocumentationCommentary, Created, Modified, AssignedToLookupId, AuthorLookupId`.
