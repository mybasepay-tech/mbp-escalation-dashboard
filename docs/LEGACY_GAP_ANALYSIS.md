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

### C.1b Confirmed by the REAL spreadsheet export (Loop 34 — sanitized evidence)
Rodolfo exported the visible legacy Escalations list (2026-07). The export was analyzed
LOCALLY; only aggregates and column names are recorded here — no row content, names,
links, or paths are committed, and the raw export file never enters git.

- **Shape:** 31 columns (spreadsheet display headers, plus the export artifacts
  `Item Type` and `Path`). Canonical header→field mapping is now code:
  `src/v2/tools/migration/exportColumns.js`.
- **Volume:** 300 visible/exported rows; IDs range up to 362. The ID gaps mean deletions
  and/or a filtered view — **whether this is the complete list is NOT yet confirmed.**
- **Source:** the list lives on a PERSONAL SharePoint site (`personal/<owner>/Lists/
  Escalations`) — treated as source evidence only, not proof there are no other related
  lists/views.
- **Statuses observed:** exactly the seven expected values (Not yet assigned, Assigned,
  In Process, Pending Research, Pending Member, Pending Customer, Complete) — the frozen
  100% identity mapping holds; no new status appeared in the visible rows.
- **Departments observed (Assigned Department Owner):** nine queues — Billing,
  Technology, HR, Operations, Finance, Contracts, Sales, Leadership, Payroll.
- **Fields confirmed real and mapped:** party fields (Member/Customer/Worker Name →
  Additional Details), `Assignment ID` (legacy data), `Amount Remaining` (sparse → legacy
  data), `Status Updates` (verbatim + length + sha256), `Teams Post` (hyperlink metadata;
  never emitted raw in reports), `Internal Documentation Needed`/`Commentary` (internal
  documentation mapping).
- **Newly observed columns** (added to the known-field set + transform): `Created By` and
  `Assigned To` (DISPLAY NAMES — spreadsheet exports carry no lookup ids, so requester/
  assignee matching needs a name-keyed user map), `Escalation Commentary` (description
  source), `Days to Resolve` (derived day count; preserved uninterpreted — v2 recomputes).
- **AddTags2:** lookup/person-style encoded (`value;#id` pairs). Kept RAW in
  `legacyData.addTags2Raw` until its meaning (watchers? tags? recipients?) and parsing
  strategy are approved.
- **Attachments:** NOT visible in a spreadsheet export — still requires SharePoint
  inspection (unresolved).
- **Deep per-column statistics** (non-empty counts, date ranges, blob length/HTML/emoji
  metrics): the committed sanitized analyzer produces them locally in one command —
  `node tools/migration/run-legacy-export-analysis.js <local-export.csv>` — emitting
  AGGREGATES ONLY by construction. *Status: an analyzer run happened in Loop 35 (§C.1c) —
  against a 46-row OPEN-ITEMS VIEW export, not the 300-row set described above, which
  remains to be provided/analyzed.*

### C.1c REAL analyzer run (Loop 35 — sanitized aggregates; open-items view export)
The Loop 34 analyzer ran against a real local export file (git-ignored; raw file and raw
report never committed). **The analyzed file is NOT the 300-row export described in
§C.1b:** it is a 46-row export of the CURRENT OPEN items view — zero `Complete` rows —
so all statistics below describe the open workload only.

- **Shape:** 31 columns again, but a DIFFERENT export flavor: it carries
  `Initial Financial Impact` and a per-row `Attachments` indicator, and has NO
  `Item Type`/`Path` artifacts. Both flavors are now mapped in `exportColumns.js`.
- **Volume:** 46 rows; IDs 63–362 (254 ids missing in range — consistent with a filtered
  view over a longer-lived list). Parsed cleanly: 0 CSV warnings, 0 duplicate ids, all
  date fields parseable.
- **Statuses (open items):** In Process 17 · Assigned 17 · Pending Research 5 ·
  Pending Member 3 · Pending Customer 2 · Not yet assigned 2. No blank, no unexpected
  values — the frozen seven-value identity mapping continues to hold.
- **Urgency:** High 21 · Critical 13 · Medium 12 (no Low among open items).
- **Departments:** Assigned Department Owner across 8 queues (Finance 10, Billing 9,
  Technology 9, Operations 5, Leadership 4, Sales 4, Contracts 4, Payroll 1);
  Requesting Dept across 7 values incl. the variant label `Sales/BD` — the requesting
  vocabulary differs from the assigned-owner vocabulary (mapping note).
- **ATTACHMENTS ARE REAL: 18 of 46 open items (≈39%) have attachments.** This converts
  the attachment question from "verify whether used" to "attachment migration/handling
  strategy REQUIRED before cutover."
- **Truncation findings (critical for migration inputs):** `Status Updates` is TRUNCATED
  by this export (all 46 values capped at 194–195 chars, HTML-entity-mangled) and
  `Teams Post` is TRUNCATED (all 45 links exactly 100 chars). The analyzer now detects
  and flags uniform-length caps. **A spreadsheet "Export to CSV" can never be the
  migration source for verbatim `StatusUpdates` or usable Teams links — the un-truncated
  JSON/API export remains mandatory.**
- **Completeness (46 rows):** always-filled — Title, Created, Created By, Status,
  Urgency, Requesting Dept, Assigned Department Owner, Escalation Commentary (72–2251
  chars, multiline in 32 rows, NOT truncated), Issue Type, Issue Category Detail.
  Partially filled — Assigned To 44, Member Name 45, Customer Name 35, Worker Name 20,
  AddTags2 40, Original Assigned Dept 41, DateAssignedtoCurrent 17, Expected Resolution
  Date 15, Initial Financial Impact 15, Assignment ID 16, Internal Documentation Needed
  11 (Yes 7 / No 4), Internal Documentation Commentary 6, Resolved Date 3. EMPTY in all
  rows — `Amount Remaining`, `Days Open`, `DaysCurrentDept` (calculated/legacy columns
  export blank); `Days to Resolve` renders the literal label `Open` on every open item.
- **Date ranges (open items):** Created 2026-01-28..2026-07-10; Expected Resolution
  2026-02-18..2026-07-10; DateAssignedtoCurrent 2026-03-31..2026-07-10; Resolved Date
  2026-04-07..2026-06-26 — note 3 OPEN items carry a Resolved Date (data-quality
  oddity: resolved-then-reopened or mis-set field; flag for import rules).
- **People (distinct counts only):** 14 distinct creators, 21 distinct assignees —
  the user-map/departed-author work is bounded and small.
- **AddTags2:** in this flavor the values are PLAIN display names separated by `;`
  (36 of 40 filled rows; up to ~8 entries; no `;#` lookup pairs). Parsing strategy must
  therefore handle BOTH renderings; semantics (watchers vs tags) still unconfirmed.

### C.1d Migration-grade READ-ONLY export path (Loop 36 — built; blocked on one grant)
A committed, GET-only-by-construction full-list exporter now exists
(`tools/migration/exportLegacyListReadonly.js` + gated runner): all items paginated with
raw un-truncated fields, site-user resolution for Author/Editor ids, full field-schema
snapshot (types/required/choices/hidden), and attachment METADATA only (never binaries).
Raw output goes only to the git-ignored `exports/` folder; the analyzer consumes the JSON
directly (internal→display name mapping via the schema snapshot) and reports explicitly
when the Loop 35 truncation caps are gone.

**Blocker (verified live, read-only):** the D6 app identity gets **HTTP 403** on the
legacy personal site — its `Sites.Selected` grant covers only the v2 test site. The
delegated fallback requires an interactive sign-in an unattended session cannot perform.
**Manual step (2 min, admin):** grant the v2 app **Read** on the legacy site via
`Grant-PnPAzureADAppSitePermission … -Permissions Read` (PnP admin utility), then run
`node tools/migration/run-legacy-readonly-export.js` — the git-ignored local config is
already staged on the operator machine. Alternative: operator mints a delegated token
into the git-ignored token file (`auth.mode: "token-file"`).

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
  *(Partially evidenced by the Loop 34 export: 300 visible rows, IDs to 362 — full-list
  confirmation still required.)*
- Any Microsoft Forms intake, Outlook rules, or other entry points into the list.
- **Loop 34 additions:** is the 300-row export the complete list or a filtered view? Are
  all historical IDs (including gaps) needed? Does `AddTags2` represent watchers, tags,
  or notification recipients? Are `Teams Post` links needed in day-one UI or only in
  Additional Details? Are there departed authors among `Created By` values (D33 exception
  volume)? Are there other related lists/views beside the personal-site list the export
  came from?

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
| item `Author` (`AuthorLookupId`) | Submitter | `submitterId` | resolve author → v2 user | yes | med | Closure authority. Departed/unmatched authors: closure by designated admin/migration owner ONLY (Loop 31 accepted exception) |
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
| `AmountRemaining` | Remaining amount | legacy/additional data | preserve; NOT primary UI (Loop 31 decision) | no | low | Revisit only if business confirms active use |
| `MemberName` / `CustomerName` / `WorkerName` | Case parties | legacy party fields shown in Additional Details | preserve + display (Loop 31 decision); not protagonist fields | yes | low | Small pre-import UI item to surface them |
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
| Data model | **Partially ready** | Core model strong; legacy carry-fields now DECIDED (Loop 31): party names preserved + displayed in Additional Details; AmountRemaining/AssignmentID/TeamsPost preserved as legacy data; InternalDocumentation pair → internal note. Remaining work: add the party/legacy-data fields to schema + UI before import |
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
3. ~~Decisions on the "no v2 field" rows~~ **DECIDED (Loops 30–31):** party names preserved
   + displayed in Additional Details; AmountRemaining/AssignmentID/TeamsPost preserved as
   legacy data; InternalDocumentation pair → internal note on import. Remaining engineering:
   add the party/legacy-data fields to the v2 schema + detail UI before import.
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

**Answered (Loop 31 — accepted by Rodolfo):**
- **Party fields (`MemberName`/`CustomerName`/`WorkerName`): PRESERVE and DISPLAY** in the
  ticket detail's Details / "Additional details" area — important enough to keep visible,
  not protagonist fields. (UI surfacing is a small pre-import work item.)
- **Departed-author exception:** when a migrated ticket's original requester cannot be
  matched, closure is allowed **only by a designated admin / migration owner**. This is a
  documented MIGRATION exception, not a general permission rule; requester-only closure
  remains the standing rule for everything else.
- **`AssignmentID`: PRESERVE** as a legacy/additional-data field; do not interpret or
  depend on it until inspection confirms whether anything consumes it.

**Answered (Loop 32):**
- **Designated migration owner: Rodolfo Chacón / IT Admin (D33).** Departed/unmatched-author
  tickets are closable only by the migration owner during migration validation — an
  auditable, migration-scoped exception; requester-only closure is unchanged everywhere else.

**Still open:**
1. `AssignmentID` consumers (preserve-only until inspection answers this).
2. Exact export column lists actually used today (spreadsheet-order/RFP) — inspection §12.
3. Cutover freeze-window length; 4. post-launch support owner.
5. Teams/PA parity decision (deferred gate — must close before the cutover runbook).

Inspection execution: [`LEGACY_INSPECTION_RUNBOOK.md`](./LEGACY_INSPECTION_RUNBOOK.md).
Mapping capture: [`MIGRATION_MAPPING_TEMPLATE.md`](./MIGRATION_MAPPING_TEMPLATE.md).
Dry-run (future): [`MIGRATION_DRY_RUN_PLAN.md`](./MIGRATION_DRY_RUN_PLAN.md).
