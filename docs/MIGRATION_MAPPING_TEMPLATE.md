# Migration Mapping Template (Loop 30)

> Fill this in during/after the legacy inspection
> ([`LEGACY_INSPECTION_RUNBOOK.md`](./LEGACY_INSPECTION_RUNBOOK.md)); freeze it before any
> importer work (Loop 32). Pre-filled rows come from read-only source inspection and
> Rodolfo's Loop 30 decisions. **Status legend:** `mapped` · `needs inspection` ·
> `business decision` · `deferred`.
>
> Machine-readable skeleton: [`templates/migration-field-map.template.json`](./templates/migration-field-map.template.json)
> (placeholder rows only — no real data).
>
> **Loop 34 evidence update:** the REAL spreadsheet export (300 visible rows, 31 display
> columns) confirmed this mapping's field set and surfaced four previously-unmodeled
> columns — `Created By`, `Assigned To` (display names; spreadsheet exports carry no
> lookup ids), `Escalation Commentary` (description source), and `Days to Resolve` — plus
> `AddTags2` as the actual tag column name. The canonical display-header→field map is now
> CODE: `src/v2/tools/migration/exportColumns.js` (sanitized evidence:
> `LEGACY_GAP_ANALYSIS.md` §C.1b). Statuses in the visible rows are exactly the seven
> expected values — the §2 identity mapping holds on real data.
>
> **Loop 35 evidence update (real analyzer run — 46-row OPEN-ITEMS view export; gap
> analysis §C.1c):** a SECOND export flavor exists carrying `Initial Financial Impact`
> (= `FinancialImpactAmount`) and a per-row `Attachments` "0"/"1" indicator (18/46 open
> items HAVE attachments — handling strategy now required, not hypothetical). CRITICAL:
> this export flavor TRUNCATES `Status Updates` (~195-char cap, HTML-mangled) and
> `Teams Post` (100-char cap) — spreadsheet exports can never feed verbatim preservation;
> the un-truncated JSON/API export is mandatory (dry-run plan §3). `AddTags2` appears in
> a second rendering: plain display names separated by `;` (up to ~8 entries) — parsing
> must handle both `A;#1;#B;#2` and `Name A;Name B`. `Amount Remaining`, `Days Open`,
> and `DaysCurrentDept` exported EMPTY on all open items; `Days to Resolve` renders the
> label `Open` for unresolved rows (a calculated display value — never migrate it).
> Data-quality flag: 3 OPEN items carry a `Resolved Date` — import rules must not infer
> completion from `ResolvedDate` alone (the `Status = Complete` guard already in the
> transform is confirmed correct).

## Standing rules (Rodolfo, Loops 30–31 — accepted)
1. **Legacy status values are respected 100%** — migrated tickets keep their exact legacy
   status string; normalization only into REPORTING buckets, never into the stored value.
2. **`StatusUpdates` is preserved verbatim** on every migrated ticket; parsing into
   structured history is an optional, later, additive step — the blob is never discarded.
3. **AmountRemaining** is preserved as legacy/additional data, not a primary UI field.
4. Unknown/unmapped legacy fields are preserved in a legacy/additional-data area
   (`migrationNotes` or a dedicated legacy-payload column) rather than dropped.
5. Requester/creator-only closure carries into v2 unchanged (D23).
6. **Departed-author exception (Loop 31; owner named Loop 32/D33):** tickets whose original
   requester cannot be matched are closable ONLY by the designated migration owner —
   **Rodolfo Chacón / IT Admin** — as an auditable, migration-scoped exception, never a
   general permission rule. The importer must FLAG these records.
7. **Party fields (Loop 31):** `MemberName`/`CustomerName`/`WorkerName` are preserved AND
   displayed in the ticket detail Additional Details area — visible, not protagonist.
8. **`AssignmentID` (Loop 31):** preserved as legacy data; never interpreted or depended on
   until inspection identifies consumers.
9. **Internal notes are visible to all users for now** — no fine-grained note permissions
   this phase.
10. **Attachments:** default deferred/metadata-only unless inspection proves active use.

## 1. Field mapping

| Legacy field | Legacy type | Meaning | v2 target | v2 type | Migration rule | Req? | Default/fallback | Risk | Decision owner | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| `Title` | Text | Ticket title | `title` | Text | copy | yes | "(no title)" + note | low | — | mapped |
| `EscalationCommentary` ("Escalation Commentary") | Note | Issue description — CONFIRMED by the Loop 34 export as the real column | `description` | Note | copy | no | empty | low | — | mapped (evidence) |
| `StatusCommentary` | Note | Issue description (API-shaped exports; fallback source) | `description` | Note | copy when `EscalationCommentary` absent | no | empty | low | inspection §9 | needs inspection |
| `Status` | Choice | Lifecycle status | `status` | Choice | copy EXACT value (rule 1); blank → `New` + migration note | yes | `New` + note | low | — | mapped |
| `Urgency` | Choice | Priority | `priority` | Choice | 1:1 copy | yes | `Medium` + note | low | — | mapped |
| `AssignedDepartmentOwner` | Text/Choice | Assigned dept | `assignedDeptId` | Lookup | resolve text → canonical dept key; unknown → flag row, never guess | yes | unrouted + note | med | Rodolfo (canonical dept list) | needs inspection |
| `AssignedTo` (lookup / "Assigned To" display name) | Lookup(person) / Text | Assignee | `assigneeId` | Lookup | resolve via user map (lookup id when present; `name:<display name>` key for spreadsheet exports); unresolved → unassigned + warning; raw name preserved in `legacyData.assignedToName` | no | null | med | — | mapped (name-based; user map still needed) |
| item `Author` / "Created By" display name | System / Text | Creator/requester | `submitterId` | Lookup | resolve author → v2 user (lookup id or `name:` key); departed/unmatched → D33 flag (closure only by migration owner); raw name preserved in `legacyData.createdByName` | yes | D33 exception + note | high | decided (D33) | mapped (name-based; user map still needed) |
| *(Department Leads.Primary)* | Lookup | Accountability owner | `ticketOwner` | Lookup | derive from dept lead at import time | no | null | med | — | mapped (derived) |
| `RequestingDept` | Text/Choice | Origin dept | `requestingDept` | Text | copy | no | empty | low | — | mapped |
| `EscalationDate` | DateTime | Escalated | `escalationDate` | DateTime | copy | yes | `Created` | low | — | mapped |
| `Created` / `Modified` | System | Stamps | `createdAt` / `modifiedAt` (+ `lastActivityAt` := Modified) | DateTime | copy | yes | — | low | — | mapped |
| `ResolvedDate` | DateTime | Closed date | `completedDate` | DateTime | copy when Status = Complete | yes* | null | low | — | mapped |
| `ExpectedResolutionDate` | DateTime | Due date | `expectedResolutionDate` | DateTime | copy | no | null | low | — | mapped |
| `StatusUpdates` | Note (long) | Full history blob | verbatim preservation (rule 2) + optional later parse | Note | copy verbatim, un-truncated | yes | — | high if truncated | — | mapped (verbatim) |
| `AddTags` | Multi-lookup | Tags (API shape) | `tagIds` via TicketTags links | Link list | resolve each; create missing v2 tags | no | none | med | inspection §7 (semantics) | needs inspection |
| `AddTags2` ("AddTags2") | Lookup-encoded text / plain names | Tags/watchers — CONFIRMED as the export's tag column; TWO renderings observed: `value;#id` pairs (Loop 34 flavor) and plain `Name A;Name B` display names, up to ~8 entries (Loop 35 flavor) | `legacyData.addTags2Raw` now; `tagIds` after parsing strategy approval | — | preserve RAW; parser must handle BOTH renderings; parse ONLY after semantics (watchers vs tags vs recipients) are confirmed | no | none | med | Rodolfo + inspection §7 | needs decision (raw preserved) |
| `FinancialImpactAmount` | Currency | Money involved | `amountInvolved` | Currency | copy | no | null | low | — | mapped |
| `AmountRemaining` | Currency | Remaining amount | legacy/additional data (rule 3) | — | preserve, not surfaced as primary UI | no | — | low | — | mapped (preserve) |
| `MemberName` | Text | Member party | party field, Additional Details (rule 7) | Text | copy; display in detail Additional Details | no | empty | low | — | mapped |
| `CustomerName` | Text | Customer party | party field, Additional Details (rule 7) | Text | copy; display in detail Additional Details | no | empty | low | — | mapped |
| `WorkerName` | Text | Worker party | party field, Additional Details (rule 7) | Text | copy; display in detail Additional Details | no | empty | low | — | mapped |
| `IssueType` | Choice/Text | Type | `issueType` | Text | copy | no | empty | low | — | mapped |
| `IssueCategoryDetail` | Choice/Text | Category | `issueCategory` | Text | copy | no | empty | low | — | mapped |
| `OriginalAssignedDept` | Text | First dept | activity event (synthesized transfer) + legacy data | — | synthesize `assignment_change` on import | no | — | low | — | mapped (derived) |
| `DaysCurrentDept` / `DateAssignedtoCurrent` | Number/Date | Transfer tracking | legacy/additional data | — | preserve | no | — | low | — | deferred |
| `InternalDocumentationNeeded` | Yes/No | Closing doc gate | internal note on import; v2 gate decision separate | — | preserve as note | no | — | med | Rodolfo (gate parity) | business decision |
| `InternalDocumentationCommentary` | Note | Doc commentary | internal note on import | Note | copy → note | no | — | low | — | mapped |
| `TeamsPost` | URL | Teams post link | legacy/additional data | — | preserve | no | — | low | — | deferred |
| `AssignmentID` | ? | Unknown key | legacy/additional data (rule 8) | — | preserve, uninterpreted | no | — | low | inspection §5 (consumers only) | mapped (preserve) |
| item `id` | System | Legacy key | `legacyItemId` + `legacyUrl` | Text/URL | copy — already modeled | yes | — | low | — | mapped |
| `DaysOpen` (calculated) | Calc | Stale day count | `legacyData.daysOpen` (audit only) — v2 computes live | — | preserve uninterpreted; never displayed as current | — | — | none | — | mapped (preserve, excluded from UI) |
| `DaysToResolve` ("Days to Resolve") | Calc/Number | Resolution day count — NEW column observed in the Loop 34 export | `legacyData.daysToResolve` (audit only) | — | preserve uninterpreted; v2 derives resolution metrics live | no | — | low | — | mapped (preserve) |
| Native attachments | Files | Attachments — CONFIRMED IN USE (Loop 35: 18/46 open items have attachments via the export's `Attachments` "0"/"1" column; indicator now feeds `candidate.attachments.hasAttachments`) | metadata rows; files deferred | — | per inspection §8 outcome — a handling strategy is now REQUIRED before cutover (inventory + decision: migrate files vs link back vs metadata-only) | ? | — | **high** (real usage) | inspection + Rodolfo | needs decision (usage confirmed) |
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
| Requester/creator | item `Author` | `submitterId` (closure authority, D23) | resolve; unmatched/departed → FLAG + closable only by designated admin/migration owner (rule 6) | mapped (owner name still to assign) |
| Assignee | `AssignedTo` lookup | `assigneeId` | resolve via user map | needs inspection |
| Owner | *(none in legacy)* | `ticketOwner` | derive from Department Leads primary | mapped (derived) |
| Department/queue | `AssignedDepartmentOwner` | `assignedDeptId` | canonical dept resolution table | needs inspection |
| MemberName / CustomerName / WorkerName | text fields | party fields in Additional Details | copy + display (rule 7) | mapped |

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
