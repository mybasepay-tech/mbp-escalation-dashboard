# Legacy → v2 Gap Analysis (Loop 29)

> **Phase framing:** v2 is the **replacement system** in a **pre-production build**, not a
> throwaway demo. The legacy Escalation Tracker remains the operational **source of truth**;
> there is no cutover and no real data has been migrated. This document is the controlled
> gap analysis that must precede migration design.
>
> **Evidence basis — honest sourcing.** Facts below marked **[inspected]** were read
> DIRECTLY from the legacy dashboard source (`escalation-dashboard.html`, read-only — the
> file was not modified) during this loop. Items marked **[needs legacy inspection]**
> require looking at the live SharePoint list/flows themselves (admin, read-only), and
> items marked **[needs business confirmation]** require Rodolfo/team answers. Nothing in
> this document is invented; unknowns are stated as unknowns.

## A. Executive summary
- v2 has a production-style UI (All-tickets landing, queues, focused ticket detail), a
  rules-enforced domain model, and a SharePoint adapter that passed its full behavioral
  contract against real (non-production) SharePoint lists. 283 automated tests pass.
- The legacy tracker is a single SharePoint list fronted by a single-file dashboard, with a
  **Power Automate flow on item-modified posting to an Escalations Teams channel**
  [inspected] and a **SharePoint validation rule requiring Status + ResolvedDate +
  InternalDocumentationNeeded together when closing** [inspected].
- The largest gaps are not UI: they are **identity/auth (D6)**, **a small set of legacy
  fields v2 does not carry**, **the StatusUpdates history blob → structured
  comments/activity transformation**, **notifications parity (Teams flow)**, and
  **migration tooling + validation**, plus permissions and reporting parity.
- Recommended posture: keep legacy authoritative; proceed via the phased plan in
  [`LAUNCH_READINESS_PLAN.md`](./LAUNCH_READINESS_PLAN.md).

## B. Current v2 capability inventory (all test-covered)
**Working today, against both MockStore and the SharePoint test backend:**
All-tickets overview (default landing) · Department queue · My assigned · Reporting
summary · ticket detail page (issue summary, public conversation, activity timeline,
details, assignment/status, tags, internal notes, attachments-metadata) · ticket creation
(demo-namespaced) · status workflow with transition guard and auto-status on assignment ·
priority updates · optional amount involved · tags (many-to-many link list, soft-delete) ·
public comments and internal notes as separate streams · append-only activity/audit trail ·
**requester-only closure with required final closing comment** · reopen behavior (closure
history preserved in activity) · no-movement reminder candidacy (priority thresholds,
local indicator only) · `lastActivityAt` movement stamp.

**Infrastructure:** 9 provisioned `Escalations_v2_*` lists (schema-validated live) ·
`SharePointStore` passed the 30-test store contract live (Loop 22) with verified cleanup ·
namespaced demo fixture seeding/cleanup CLI · MockStore default; SharePoint test backend
dual opt-in + fail-closed; sanitized error surfaces · D6 app-auth plan written and
**ready for approval** (certificate + `Sites.Selected`), with fail-closed config validation
already committed.

## C. Legacy/current system — what was inspected vs what remains

### C.1 Established by read-only source inspection [inspected]
- **Data sources:** SharePoint lists via Graph — `Escalation Tracker` (main), `Department
  Leads` (department / primary / backup lead), a user-info lookup, and a tags lookup
  consumed through the `AddTags` multi-lookup column.
- **Tracker fields consumed by the dashboard:** `Title`, `Status`, `Urgency`,
  `EscalationDate`, `ResolvedDate`, `ExpectedResolutionDate`, `RequestingDept`,
  `AssignedDepartmentOwner` (dept as text/choice, not a lookup), `OriginalAssignedDept`,
  `DaysCurrentDept`, `DateAssignedtoCurrent`, `IssueType`, `IssueCategoryDetail`,
  `FinancialImpactAmount`, `AmountRemaining`, `MemberName`, `CustomerName`, `WorkerName`,
  `StatusCommentary`, `StatusUpdates` (prepend-style rich-text history blob),
  `DaysOpen` (stale SP calculated column — the dashboard already recomputes it live),
  `AssignedToLookupId` (person lookup), `AuthorLookupId` (submitter = list-item author,
  not an explicit field), `AddTags`/`AddTagsLookupId` (multi-lookup with email),
  `TeamsPost` (URL to a Teams post), `AssignmentID`, `InternalDocumentationNeeded`,
  `InternalDocumentationCommentary`, `Created`, `Modified`.
- **Status vocabulary in the legacy UI:** Not yet assigned, Assigned, In Process, Pending
  Member, Pending Research, Pending Customer, Complete. (No `New`, `Cancelled`, or
  `Reopened` — those are v2 additions.) Urgency: Critical/High/Medium/Low (matches v2).
- **Automation:** a Power Automate flow triggers on item-modified and posts to the
  Escalations Teams channel; the dashboard deliberately performs ONE combined PATCH per
  update to avoid double-triggering it and to satisfy the closing validation rule
  atomically.
- **History model:** all updates/comments/follow-ups are prepended into the single
  `StatusUpdates` text blob (with a documented data-loss footgun the dashboard mitigates
  by re-reading before writing).

### C.2 Must be inspected in the live legacy system [needs legacy inspection]
- Full list schema (column types, required flags, choice sets, calculated/validation
  formulas) — the dashboard only shows what it *uses*; the list may hold more.
- Native SharePoint **item attachments** on tracker items (the dashboard code shows no
  attachment handling — are attachments used via the list UI anyway?).
- The **Power Automate flow definition(s)**: exact triggers, recipients/channel, message
  content, and any OTHER flows on the list (reminders? assignment emails?).
- SharePoint **version history** usage (is it relied on as audit?), item-level permissions,
  and the site's permission groups (who can read/write which items).
- The tags lookup list contents and the `AddTags` column configuration.
- `AssignmentID` semantics and any integrations keyed on it.
- The `TeamsPost` URL population mechanism (manual? flow?).
- Volume: total items, per-status counts, `StatusUpdates` blob sizes, attachment counts.
- Any Microsoft Forms intake, Outlook rules, or other entry points into the list.

### C.3 Must be confirmed by the business [needs business confirmation]
- Current pain points and manual workarounds (known from repo history: status/assignee
  drift, stale day counts, spreadsheet-order exports "Maggie's spreadsheet", RFP CSV,
  Aging Review KPI — confirm the current list).
- Which legacy fields are still actively used (Member/Customer/Worker names?
  AmountRemaining? InternalDocumentationNeeded?) vs vestigial.
- Reporting/export requirements that must exist on day one.
- Whether the Teams-channel notification must exist at launch (parity) or can follow.
- Who the closure authority is in practice today (v2 enforces requester-only, per
  D23 stakeholder decision — confirm this matches expected operations at scale).

## D. Field mapping matrix

| Legacy field [inspected] | Meaning | v2 target | Migration rule | Req? | Risk | Notes |
|---|---|---|---|---|---|---|
| `Title` | Ticket title | `title` | copy | yes | low | |
| `StatusCommentary` | Description/commentary | `description` | copy | no | low | Confirm it is the "issue description" vs a status note [needs business confirmation] |
| `Status` | Lifecycle status | `status` | 1:1 (same vocabulary); blank → `New` + migration note | yes | low | v2 adds New/Cancelled/Reopened |
| `Urgency` | Priority | `priority` | 1:1 | yes | low | |
| `AssignedDepartmentOwner` | Assigned dept (text) | `assignedDeptId` | resolve text → `Escalations_v2_Departments` key; unknown → create dept or flag | yes | med | Legacy is free-ish text; needs canonical dept list |
| `AssignedToLookupId` | Assignee | `assigneeId` | resolve via user map → v2 user key | no | med | Depends on identity strategy (D6/Person columns) |
| item `Author` (`AuthorLookupId`) | Submitter | `submitterId` | resolve author → v2 user | yes | **high** | v2 closure authority hangs on this; missing/departed authors need a policy |
| *(none — dept lead list)* | Owner/closure authority | `ticketOwner` | derive from Department Leads primary | no | med | Legacy has no per-ticket owner field [inspected: leads list exists] |
| `RequestingDept` | Originating dept | `requestingDept` | copy | no | low | |
| `EscalationDate` | Created/escalated | `escalationDate` | copy | yes | low | |
| `Created` / `Modified` | System stamps | `createdAt` / `modifiedAt` | copy | yes | low | `lastActivityAt` := `Modified` on import |
| `ResolvedDate` | Closed date | `completedDate` | copy when Status=Complete | yes | low | |
| *(within `StatusUpdates`)* | Closing comment | `finalClosureNote` | extract last pre-closure entry if parseable; else placeholder + note | no | med | Best-effort parse; never invent |
| `ExpectedResolutionDate` | Due date | `expectedResolutionDate` | copy | no | low | |
| `StatusUpdates` | Full history blob | comments + activity + preserved raw | parse entries → `Escalations_v2_Comments`/activity; ALWAYS also preserve the verbatim blob in `migrationNotes` or an archival column | yes | **high** | Prepend-format text; parsing is best-effort — raw text must never be lost |
| `AddTags` (multi-lookup) | Tags | `tagIds` via TicketTags link list | resolve each lookup → v2 tag; create missing tags | no | med | Tag emails suggest people-tags — confirm semantics [needs business confirmation] |
| `FinancialImpactAmount` | Money involved | `amountInvolved` | copy | no | low | |
| `AmountRemaining` | Remaining amount | **no v2 field** | ADD to v2 or park in migrationNotes | ? | med | Decide before mapping freeze [needs business confirmation] |
| `MemberName` / `CustomerName` / `WorkerName` | Case parties | **no v2 fields** | ADD to v2 (likely) or fold into description | ? | **high** | Actively displayed in legacy UI — probably must-have |
| `IssueType` / `IssueCategoryDetail` | Classification | `issueType` / `issueCategory` | copy | no | low | |
| `OriginalAssignedDept`, `DaysCurrentDept`, `DateAssignedtoCurrent` | Dept-transfer tracking | activity events (+ optional fields) | synthesize a transfer activity event on import | no | med | v2 tracks transfers via activity going forward |
| `InternalDocumentationNeeded` / `...Commentary` | Closing doc gate | **no v2 fields** | map to internal note on import; decide if v2 needs the closing gate | ? | med | Part of the legacy CLOSING VALIDATION RULE [inspected] |
| `TeamsPost` | Teams post URL | **no v2 field** | park in migrationNotes or add optional link field | no | low | |
| `AssignmentID` | Unknown key | — | preserve in migrationNotes | ? | ? | [needs legacy inspection] |
| item id | Legacy key | `legacyItemId` (+ `legacyUrl`) | copy — traceability is already modeled in v2 | yes | low | |
| Native item attachments | Files | attachment metadata (files deferred) | metadata rows + file strategy decision | ? | **high** | Existence/volume unknown [needs legacy inspection] |
| `DaysOpen` (calculated) | Day count | computed `daysOpen` | DO NOT migrate — v2 computes live | — | none | Legacy drift is the reason |

## E. Gap analysis by area

| Area | State | Detail |
|---|---|---|
| Data model | **Partially ready** | Core model strong; missing legacy fields: Member/Customer/Worker names, AmountRemaining, InternalDocumentation pair, TeamsPost, AssignmentID (decisions needed) |
| UI | **Ready (pre-prod)** | Production-style; needs the new-field decisions above reflected once made; no ticket-edit of title/description yet |
| Store/backend | **Ready (pre-prod)** | Contract passed live incl. resilience; adapter async-safe |
| SharePoint lists | **Ready (test site)** | 9 lists schema-validated live; pre-production/production site provisioning is a re-run of the same fail-closed scripts |
| Permissions | **Missing** | App-layer rules only; site/list permission model undefined ([`LAUNCH_READINESS_PLAN.md`](./LAUNCH_READINESS_PLAN.md) §F) |
| Auth (D6) | **Missing (plan ready)** | Operator-token interim; certificate + `Sites.Selected` plan awaiting approval/admin execution |
| Migration tooling | **Missing** | No importer exists; transform rules defined above; StatusUpdates parser is the hard part |
| Reporting | **Partially ready** | On-screen summary exists; CSV export parity ("Maggie's spreadsheet" column order, RFP CSV) not built [needs business confirmation] |
| Notifications | **Missing (by design so far)** | Legacy has a Teams-channel flow [inspected]; v2 sends nothing. Parity decision required before cutover |
| Attachments | **Partially ready** | Metadata model live-tested; real files deferred (D24); legacy usage unknown |
| Audit/history | **Ready + migration risk** | v2 activity trail is stronger than the legacy blob; the risk is the one-time blob→structured transformation |
| Cutover/rollback | **Missing (planned)** | PARALLEL_RUN_AND_CUTOVER_PLAN exists as governance; concrete runbook not written |
| Training/comms | **Missing** | Walkthrough exists for demos; end-user material not started |

## F. Must-have before launch
1. D6 app registration executed (certificate, `Sites.Selected`, single-site grant) and the
   live contract re-passed under app auth.
2. Legacy list + flows inspected (C.2) and the field mapping (D) frozen and approved.
3. Decisions on the "no v2 field" rows (Member/Customer/Worker, AmountRemaining,
   InternalDocumentation gate, TeamsPost) — add fields or park, explicitly.
4. Migration importer built: read-only legacy export → transform → import to v2
   pre-production lists; idempotent; preserves raw StatusUpdates verbatim; no writeback.
5. Migration dry-run on a full copy with a validation report (counts by status/dept/
   assignee/requester, date spot-checks, sample comparisons, edge cases) — see
   LAUNCH_READINESS_PLAN §E.
6. Permissions/access groups defined and applied on the target site (§F of the plan).
7. Realistic-workflow validation: create/assign/update/close/reopen + comments/notes
   against migrated data with the closure rule confirmed operationally acceptable.
8. Reporting/export parity for whatever the business confirms as day-one.
9. Notification parity decision implemented or explicitly deferred with sign-off.
10. Rollback/support process defined; stakeholder launch approval.

## G. Post-launch / later
Advanced reporting/analytics · real notification automation (Teams/email, replacing the
legacy flow) · real attachment upload into a document library · SLA dashboards · bulk
actions · item-level/advanced permissions · archive/retention policy · deeper Teams
integration · department-specific panel configuration (modeled since the MVP).

## H. Risks and mitigations
| Risk | Mitigation |
|---|---|
| `StatusUpdates` blob parses imperfectly → history distortion | Best-effort parse into structured records **plus verbatim blob preserved on every ticket**; validation samples compare rendered history vs raw |
| Submitter (item Author) unresolvable (departed staff) | Explicit policy: map to a "legacy user" placeholder + business-confirmed closure authority for those tickets |
| Attachments surprise (volume/usage unknown) | Inspect first; metadata-first migration with file migration as its own gated step |
| Notification regression (Teams flow lost at cutover) | Parity decision in must-haves; the legacy flow is never modified before cutover, and cutover explicitly plans its retirement/replacement |
| Legacy validation rule semantics (closing gate) differ from v2 rules | Decision item 3; v2's requester-only + closing-note rule is stakeholder-approved but must be operationally validated in the pilot |
| Dept text values don't match a canonical list | Mapping table with human review; unknowns flagged, never guessed |
| Users keep using legacy after cutover (dual entry) | Freeze window + comms in the cutover runbook |
| Auth remains operator-dependent | D6 is must-have #1 |
| Data duplication during parallel run | v2 pre-prod holds COPIES clearly labeled; legacy remains sole source of truth until cutover |
| Rollback unreadiness | Rollback = keep using legacy (it is never written to); runbook defines the decision point and comms |

## I. Open questions — status after Rodolfo's Loop 30 decisions

**Answered (Loop 30):**
- Permissions: **all users can see the full tracker/All-tickets for now; no fine-grained
  permissions this phase.** Internal notes **visible to all users for now.**
- Closure: **creator/requester-only closure stays required** (D23 confirmed).
- Notifications: **Teams/Power Automate parity is DEFERRED — a separate launch-decision
  gate** (decision expected shortly; documented, not implemented).
- Statuses: **legacy status values respected 100%** — identity mapping; normalization only
  into reporting buckets (see `MIGRATION_MAPPING_TEMPLATE.md` §2).
- History: **`StatusUpdates` preserved verbatim** during migration; parsing into
  activity/history is optional-later and never discards the blob.
- `AmountRemaining`: **not an active business requirement today** — preserved as
  legacy/additional data, not a primary UI field.
- Attachments: **not believed critical** — confirm by inspection (runbook §8), real file
  migration not prioritized.
- Reporting day-one baseline: **totals, open, by status, by department/queue,
  needs-attention, completed** (all already computable in v2).

**Still open:**
1. Member/Customer/Worker name fields — day-one v2 fields, description fold-in, or legacy
   data? (Highest-impact remaining mapping decision.)
2. `AssignmentID` semantics and downstream consumers — inspection.
3. Exact export column lists actually used today (spreadsheet-order/RFP) — inspection §12.
4. Departed-author placeholder policy for requester-only closure on migrated tickets.
5. Cutover freeze-window length; 6. post-launch support owner.

Inspection execution: [`LEGACY_INSPECTION_RUNBOOK.md`](./LEGACY_INSPECTION_RUNBOOK.md).
Mapping capture: [`MIGRATION_MAPPING_TEMPLATE.md`](./MIGRATION_MAPPING_TEMPLATE.md).
Dry-run (future): [`MIGRATION_DRY_RUN_PLAN.md`](./MIGRATION_DRY_RUN_PLAN.md).
