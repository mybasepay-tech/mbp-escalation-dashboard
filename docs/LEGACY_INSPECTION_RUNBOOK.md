# Legacy Inspection Runbook (Loop 30)

> **Purpose-built for the pre-migration phase.** This runbook tells an operator/admin
> exactly what to inspect in the LIVE legacy Escalation Tracker — strictly READ-ONLY — so
> the migration mapping ([`MIGRATION_MAPPING_TEMPLATE.md`](./MIGRATION_MAPPING_TEMPLATE.md))
> can be frozen. Nothing here migrates data or changes anything. Facts already established
> by read-only inspection of the legacy dashboard source are pre-filled in
> [`LEGACY_GAP_ANALYSIS.md`](./LEGACY_GAP_ANALYSIS.md) §C.1 — this runbook covers what the
> source alone cannot show.

## 1. Purpose
Answer every "[needs legacy inspection]" item from the gap analysis with evidence, so the
field mapping, migration importer (Loop 32), and dry-run plan can proceed without guesses.

## 2. Safety rules (absolute)
- READ-ONLY throughout. Browse, view, screenshot, export. Never edit, save, rename,
  reorder, re-permission, or delete anything.
- Do not open any item in edit mode; use view mode. If SharePoint drops you into an edit
  form, press Cancel/Esc — never Save.
- Power Automate: open flows in the DETAILS/read view only. Do NOT open the flow editor;
  do NOT toggle a flow off/on; do NOT resubmit runs.
- Do not change list settings, views, or columns while inspecting them.
- Exports are COPIES for local analysis. Treat every export as sensitive: store them
  OUTSIDE the repo (or in a git-ignored `exports/` folder) — raw legacy exports are never
  committed. Only sanitized summaries (counts, field names, choice values) may enter docs.
- The legacy dashboard file (`escalation-dashboard.html`) stays untouched.

## 3. Required legacy artifacts (checklist)
- [ ] The Escalation Tracker list URL and site (record privately, not in git).
- [ ] `Department Leads` list.
- [ ] The users lookup source used for `AssignedToLookupId` resolution.
- [ ] The tags lookup list behind the `AddTags` multi-lookup.
- [ ] The Power Automate flow(s) attached to the tracker list.
- [ ] Any Microsoft Form / email / Teams intake feeding the list (ask the team).

## 4. List schema inspection checklist
For the tracker list (List settings → Columns; or Graph `columns` read):
- [ ] Full column inventory: internal name, display name, type, required?, default.
- [ ] Calculated columns and their formulas (esp. `DaysOpen`).
- [ ] Validation settings — capture the exact closing-rule formula
      (source shows Status + ResolvedDate + InternalDocumentationNeeded are required
      together when closing).
- [ ] Versioning settings (is version history on? item limit?).
- [ ] Content approval / drafts (expected off — confirm).
- [ ] Indexes and views defined on the list.

## 5. Field/column inventory checklist
Confirm each source-known field exists and note anything the dashboard does NOT use:
`Title, Status, Urgency, EscalationDate, ResolvedDate, ExpectedResolutionDate,
RequestingDept, AssignedDepartmentOwner, OriginalAssignedDept, DaysCurrentDept,
DateAssignedtoCurrent, IssueType, IssueCategoryDetail, FinancialImpactAmount,
AmountRemaining, MemberName, CustomerName, WorkerName, StatusCommentary, StatusUpdates,
DaysOpen, AssignedTo (lookup), Author, AddTags (multi-lookup), TeamsPost, AssignmentID,
InternalDocumentationNeeded, InternalDocumentationCommentary, Created, Modified`
- [ ] Any additional columns not in this list → add to the mapping template as new rows.
- [ ] For each: % populated (spot check or export count) — drives required/fallback rules.
- [ ] `AssignmentID`: determine what writes it and what (if anything) reads it.

## 6. Choice values checklist
- [ ] `Status` choice set — exact values and order. (Source shows: Not yet assigned,
      Assigned, In Process, Pending Member, Pending Research, Pending Customer, Complete.
      Confirm whether MORE values exist in the column definition than the UI filter shows.)
- [ ] `Urgency` choices (expect Critical/High/Medium/Low).
- [ ] `IssueType`, `IssueCategoryDetail` choice sets (or free text?).
- [ ] `RequestingDept`, `AssignedDepartmentOwner` — choice, text, or lookup? Exact values.
- [ ] `InternalDocumentationNeeded` — Yes/No or choice?
- [ ] Any deprecated/legacy choice values still present on old items.

## 7. Lookup / multi-lookup checklist
- [ ] `AssignedTo`: target list, show field, single/multi.
- [ ] `AddTags`: target list, show field(s) (source suggests name + email — people-tags?),
      full catalog of current values, multi allowed?
- [ ] `Department Leads` list: columns (Title/dept, Primary, Backup, emails), row count.
- [ ] Orphaned lookups: items whose lookup targets were deleted (sample check).

## 8. Attachments inspection checklist
(Rodolfo: not believed critical — CONFIRM by inspection, don't assume.)
- [ ] Are native item attachments enabled on the list?
- [ ] Count of items WITH attachments (view with attachment indicator, or export flag).
- [ ] Sample: what kinds of files, typical sizes.
- [ ] Any linked document library usage instead of attachments.
- [ ] Record the finding either way — "none in practice" is a valid, useful answer.

## 9. StatusUpdates / history inspection checklist
- [ ] Copy 5–10 representative `StatusUpdates` blobs (short, medium, and the LONGEST) into
      a local (git-ignored) sample file for parser design.
- [ ] Identify the entry format(s) produced by the dashboard (`formatStatusUpdateEntry`,
      `formatFollowUpEntry`) AND any hand-typed styles that predate it.
- [ ] Note HTML vs plain text, date formats, author formats, separators.
- [ ] Largest blob size (characters) — informs storage and parser limits.
- [ ] Confirm `StatusCommentary` semantics: original issue description vs latest note.

## 10. Power Automate / Teams dependency checklist
(Notification parity is a DEFERRED decision — document now, decide later.)
- [ ] List every flow attached to the tracker (name, state on/off, owner).
- [ ] For the item-modified → Teams-channel flow (known from source): trigger conditions,
      target channel, message template, run frequency/recent failures — from the DETAILS
      view only.
- [ ] Any other flows: reminders, assignment emails, intake automation.
- [ ] Who owns the flows (account) — cutover will need them retired/replaced by an owner.
- [ ] `TeamsPost` column: what populates it (flow? manual?).

## 11. Permissions / access observations
(Rodolfo: everyone sees everything for now — verify legacy actually behaves that way.)
- [ ] Site members/owners/visitors groups and who's in them.
- [ ] Any item-level permissions in use (expected none — confirm).
- [ ] Who can create/edit/delete items today in practice.
- [ ] Any audience carve-outs for internal documentation fields.

## 12. Reporting observations
- [ ] What exports/views the team actually uses today (confirm spreadsheet-order export,
      RFP CSV, Aging Review) and their exact column lists.
- [ ] Any scheduled/reporting consumers of the list (Power BI? Excel connections?).
- [ ] Day-one v2 baseline (per Rodolfo): totals, open, by status, by department/queue,
      needs-attention, completed — confirm nothing else is load-bearing.

## 13. Export requirements for future migration (read-only copies)
- [ ] Full-item export including ALL columns (Graph paged read or list export), items +
      system fields (id, Author, Created, Modified).
- [ ] `StatusUpdates` must survive the export UN-TRUNCATED (verify against the longest
      blob; Excel export may truncate long text — prefer Graph/JSON export).
- [ ] Attachment inventory export (item id → attachment names/sizes), if any exist.
- [ ] Lookup lists exported (users, tags, department leads).
- [ ] Store exports locally OUTSIDE git; record row counts + export date in a sanitized
      note for the dry-run reconciliation baseline.

## 14. Evidence to capture (all sanitized before any commit)
Screenshots or notes for: column settings pages, choice sets, validation formula,
versioning settings, flow details page, attachment indicator column, permissions groups
page, and the counts listed above. File privately; only counts/field names/choice values
(no URLs, no people, no GUIDs) go into the repo docs.

## 15. Stop conditions — abort the session immediately if:
- Any step would require write/change permission to proceed.
- A flow opens in EDIT mode or any save/update/turn-off prompt appears.
- Any production record would be modified, even trivially (e.g., accidental edit form save).
- An export contains sensitive data with no git-safe handling path (keep it out of the
  repo; summarize instead).
- You are uncertain whether an action is read-only — treat uncertainty as "no".
- Anything suggests the legacy system is mid-incident (don't inspect during a fire).

Record any stop event and its cause in the inspection report before resuming later.
