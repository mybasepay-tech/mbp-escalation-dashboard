# Migration Mapping Template (Loop 30)

> Fill this in during/after the legacy inspection
> ([`LEGACY_INSPECTION_RUNBOOK.md`](./LEGACY_INSPECTION_RUNBOOK.md)); freeze it before any
> importer work (Loop 32). Pre-filled rows come from read-only source inspection and
> Rodolfo's Loop 30 decisions. **Status legend:** `mapped` · `needs inspection` ·
> `business decision` · `deferred`.
>
> Machine-readable skeleton: [`templates/migration-field-map.template.json`](./templates/migration-field-map.template.json)
> (placeholder rows only — no real data).

## Standing rules (Rodolfo, Loop 30)
1. **Legacy status values are respected 100%** — migrated tickets keep their exact legacy
   status string; normalization only into REPORTING buckets, never into the stored value.
2. **`StatusUpdates` is preserved verbatim** on every migrated ticket; parsing into
   structured history is an optional, later, additive step — the blob is never discarded.
3. **AmountRemaining** is preserved as legacy/additional data, not a primary UI field.
4. Unknown/unmapped legacy fields are preserved in a legacy/additional-data area
   (`migrationNotes` or a dedicated legacy-payload column) rather than dropped.
5. Requester/creator-only closure carries into v2 unchanged (D23).

## 1. Field mapping

| Legacy field | Legacy type | Meaning | v2 target | v2 type | Migration rule | Req? | Default/fallback | Risk | Decision owner | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| `Title` | Text | Ticket title | `title` | Text | copy | yes | "(no title)" + note | low | — | mapped |
| `StatusCommentary` | Note | Issue description (confirm) | `description` | Note | copy | no | empty | low | inspection §9 | needs inspection |
| `Status` | Choice | Lifecycle status | `status` | Choice | copy EXACT value (rule 1); blank → `New` + migration note | yes | `New` + note | low | — | mapped |
| `Urgency` | Choice | Priority | `priority` | Choice | 1:1 copy | yes | `Medium` + note | low | — | mapped |
| `AssignedDepartmentOwner` | Text/Choice | Assigned dept | `assignedDeptId` | Lookup | resolve text → canonical dept key; unknown → flag row, never guess | yes | unrouted + note | med | Rodolfo (canonical dept list) | needs inspection |
| `AssignedTo` (lookup) | Lookup(person) | Assignee | `assigneeId` | Lookup | resolve via user map | no | null | med | — | needs inspection (user map) |
| item `Author` | System | Creator/requester | `submitterId` | Lookup | resolve author → v2 user; departed users → legacy-user placeholder policy | yes | placeholder user + note | high | Rodolfo (placeholder closure policy) | business decision |
| *(Department Leads.Primary)* | Lookup | Accountability owner | `ticketOwner` | Lookup | derive from dept lead at import time | no | null | med | — | mapped (derived) |
| `RequestingDept` | Text/Choice | Origin dept | `requestingDept` | Text | copy | no | empty | low | — | mapped |
| `EscalationDate` | DateTime | Escalated | `escalationDate` | DateTime | copy | yes | `Created` | low | — | mapped |
| `Created` / `Modified` | System | Stamps | `createdAt` / `modifiedAt` (+ `lastActivityAt` := Modified) | DateTime | copy | yes | — | low | — | mapped |
| `ResolvedDate` | DateTime | Closed date | `completedDate` | DateTime | copy when Status = Complete | yes* | null | low | — | mapped |
| `ExpectedResolutionDate` | DateTime | Due date | `expectedResolutionDate` | DateTime | copy | no | null | low | — | mapped |
| `StatusUpdates` | Note (long) | Full history blob | verbatim preservation (rule 2) + optional later parse | Note | copy verbatim, un-truncated | yes | — | high if truncated | — | mapped (verbatim) |
| `AddTags` | Multi-lookup | Tags | `tagIds` via TicketTags links | Link list | resolve each; create missing v2 tags | no | none | med | inspection §7 (semantics) | needs inspection |
| `FinancialImpactAmount` | Currency | Money involved | `amountInvolved` | Currency | copy | no | null | low | — | mapped |
| `AmountRemaining` | Currency | Remaining amount | legacy/additional data (rule 3) | — | preserve, not surfaced as primary UI | no | — | low | Rodolfo (future) | deferred |
| `MemberName` | Text | Member party | TBD (likely new v2 fields or description fold-in) | — | — | ? | — | high | **Rodolfo** | business decision |
| `CustomerName` | Text | Customer party | TBD | — | — | ? | — | high | **Rodolfo** | business decision |
| `WorkerName` | Text | Worker party | TBD | — | — | ? | — | high | **Rodolfo** | business decision |
| `IssueType` | Choice/Text | Type | `issueType` | Text | copy | no | empty | low | — | mapped |
| `IssueCategoryDetail` | Choice/Text | Category | `issueCategory` | Text | copy | no | empty | low | — | mapped |
| `OriginalAssignedDept` | Text | First dept | activity event (synthesized transfer) + legacy data | — | synthesize `assignment_change` on import | no | — | low | — | mapped (derived) |
| `DaysCurrentDept` / `DateAssignedtoCurrent` | Number/Date | Transfer tracking | legacy/additional data | — | preserve | no | — | low | — | deferred |
| `InternalDocumentationNeeded` | Yes/No | Closing doc gate | internal note on import; v2 gate decision separate | — | preserve as note | no | — | med | Rodolfo (gate parity) | business decision |
| `InternalDocumentationCommentary` | Note | Doc commentary | internal note on import | Note | copy → note | no | — | low | — | mapped |
| `TeamsPost` | URL | Teams post link | legacy/additional data | — | preserve | no | — | low | — | deferred |
| `AssignmentID` | ? | Unknown | legacy/additional data | — | preserve | ? | — | ? | inspection §5 | needs inspection |
| item `id` | System | Legacy key | `legacyItemId` + `legacyUrl` | Text/URL | copy — already modeled | yes | — | low | — | mapped |
| `DaysOpen` (calculated) | Calc | Stale day count | — (v2 computes live) | — | DO NOT migrate | — | — | none | — | mapped (excluded) |
| Native attachments | Files | Attachments | metadata rows; files deferred | — | per inspection §8 outcome | ? | — | med | inspection + Rodolfo | deferred |
| *(any newly discovered column)* | — | — | — | — | add a row here before mapping freeze | — | — | — | — | needs inspection |

\* required when Status = Complete.

## 2. Status mapping (rule 1: preserve exact legacy values)

| Legacy status | v2 stored value | Preserve exact? | Display label | Closing behavior | Reopen behavior | Reporting bucket | Notes |
|---|---|---|---|---|---|---|---|
| Not yet assigned | `Not yet assigned` | **yes** | same | n/a | n/a | open | |
| Assigned | `Assigned` | **yes** | same | n/a | n/a | open | |
| In Process | `In Process` | **yes** | same | n/a | n/a | open | |
| Pending Member | `Pending Member` | **yes** | same | n/a | n/a | open (pending) | |
| Pending Research | `Pending Research` | **yes** | same | n/a | n/a | open (pending) | |
| Pending Customer | `Pending Customer` | **yes** | same | n/a | n/a | open (pending) | |
| Complete | `Complete` | **yes** | same | requester-only + final note (D23) applies to NEW closures post-import; imported completes keep their `ResolvedDate` | → `Reopened` (v2 behavior) | completed | |
| *(blank/unknown value)* | `New` | no (none to preserve) | New | — | — | open | + migration note recording the original |
| *(v2-only)* `New` / `Cancelled` / `Reopened` | — | — | — | — | — | open / cancelled / open | never assigned during import except blank→New |

The v2 status vocabulary already equals the legacy vocabulary (aligned in Loop 7), so
"respect 100%" is satisfied by identity mapping — confirm during inspection §6 that the
column holds NO additional values beyond the UI filter list; if any appear, add rows here
and extend the v2 choice set BEFORE import rather than remapping.

## 3. Party / person fields

| Field | Source | v2 target | Rule | Status |
|---|---|---|---|---|
| Requester/creator | item `Author` | `submitterId` (closure authority, D23) | resolve; departed → placeholder policy | business decision (placeholder policy) |
| Assignee | `AssignedTo` lookup | `assigneeId` | resolve via user map | needs inspection |
| Owner | *(none in legacy)* | `ticketOwner` | derive from Department Leads primary | mapped (derived) |
| Department/queue | `AssignedDepartmentOwner` | `assignedDeptId` | canonical dept resolution table | needs inspection |
| MemberName / CustomerName / WorkerName | text fields | TBD | see field table — Rodolfo decision | business decision |

## 4. Money fields

| Field | Rule | Status |
|---|---|---|
| `FinancialImpactAmount` → `amountInvolved` | copy (currency USD) | mapped |
| `AmountRemaining` | preserve as legacy/additional data; NOT primary UI until business confirms it is active | deferred (per Rodolfo) |

## 5. History / comments

| Item | Rule |
|---|---|
| `StatusUpdates` | **Verbatim preservation on every ticket — non-negotiable.** Stored un-truncated; parsing is additive and later. |
| Public comments | Legacy has no separate comment records — they live inside StatusUpdates. If/when parsed safely, entries become `Escalations_v2_Comments` WITH the blob still preserved. |
| Internal notes | `InternalDocumentationCommentary` → one internal note on import. (Internal notes visible to all users for now, per Rodolfo.) |
| Activity reconstruction | Synthesized minimal events on import (created, migrated, dept transfer if derivable). Full history reconstruction only from a proven parser — never speculative. |

## 6. Attachments

| Item | Rule |
|---|---|
| Presence | Determined by inspection §8 — not assumed either way. |
| If unused | Record the finding; nothing to migrate; v2 metadata model stands ready. |
| If used | Metadata rows first (name/size per item); REAL file migration is its own deferred, gated step (D24). |

## 7. Tags / categories

| Item | Rule |
|---|---|
| `AddTags` multi-lookup | Inspect semantics first (values look person-like: name + email). If topic-tags → map to `Escalations_v2_Tags` + link rows, creating missing tags. If people-tags → business decision on whether they become tags, watchers, or legacy data. |
| `IssueType` / `IssueCategoryDetail` | Copy into `issueType` / `issueCategory` (already mapped). |

## 8. Reporting baseline (day one, per Rodolfo)

| Metric | v2 source | Status |
|---|---|---|
| Total tickets | `listTickets().length` | ready today |
| Open tickets | OPEN_STATUSES count | ready today |
| By status | report byStatus | ready today |
| By department/queue | report byDepartment | ready today |
| Needs attention | reminder-candidate count (local indicator) | ready today |
| Completed | COMPLETE count (+ this-week variant) | ready today |

Anything beyond this baseline (spreadsheet-order CSV, RFP CSV, aging buckets) is
post-baseline and confirmed during inspection §12.
