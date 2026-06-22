# Implementation Plan — Escalation System v2 (MVP)

> Planning scaffold (Loop 2). **This is a plan, not a build.** Nothing here authorizes a
> production change, a SharePoint/Graph/flow/permission connection, or any edit to
> [`../escalation-dashboard.html`](../escalation-dashboard.html). Every phase is gated by
> [`../harness/NO_PRODUCTION_MODIFICATION_CHECKLIST.md`](../harness/NO_PRODUCTION_MODIFICATION_CHECKLIST.md).

## 1. Objectives
Stand up the v2 app as an independent, mock-first application that:
- Implements the assignment model (department/queue + person + both).
- Provides the department queue (main panel) and per-person "My Assigned Tickets".
- Renders a generic, config-driven department panel (department-specific config later).
- Enforces the status lifecycle with assignment-driven auto-status rules.
- Records a complete activity log.
- Talks only to a Data Access Layer (DAL) so SharePoint can be swapped for
  API/database/Dataverse later.
- Supports a read-only migration dry-run.

## 2. Build principles
- **Mock-first:** every phase runs against an in-memory/mock store. No live backend until
  explicitly approved.
- **DAL-only:** UI never calls SharePoint/Graph directly — only `EscalationStore` (see
  [`ARCHITECTURE.md`](./ARCHITECTURE.md)).
- **Vertical slices:** each phase ends in something demoable against mock data and
  testable via [`../harness/SMOKE_TEST_CHECKLIST.md`](../harness/SMOKE_TEST_CHECKLIST.md).
- **Generic-now, configurable-later:** no per-department code paths; behavior is read from
  `EscalationSettings`.
- **Every change passes the harness** before it is "done" (validation → smoke → Codex).

## 3. MVP implementation sequence

Each phase lists: goal · key work · exit criteria · harness gate. Phases are ordered by
dependency; do not start a phase until the prior phase's exit criteria pass.

### Phase 0 — Project foundations (no production)
- **Goal:** a runnable v2 app shell, isolated from production.
- **Work:** decide app stack (see decision D1); scaffold app structure; demo/mock mode
  that loads with no sign-in and no live data; lint/test/CI harness; wire the harness
  checklists into the dev loop.
- **Exit:** app boots in demo mode; no network call reaches SharePoint/Graph; CI runs.
- **Gate:** No-Production-Modification.

### Phase 1 — Domain model + DAL interface
- **Goal:** typed v2 models and the storage seam.
- **Work:** define `EscalationStore` interface (see [`ARCHITECTURE.md`](./ARCHITECTURE.md)
  §3.2); implement `MockStore` (in-memory, seedable); define typed models for
  Escalations, Activity, Comments, Tags, Teams, Settings per
  [`DATA_MODEL.md`](./DATA_MODEL.md); computed `daysOpen` helper (clamped ≥ 0).
- **Exit:** models + `MockStore` covered by unit tests; no persistence to any real backend.
- **Gate:** Validation (data-model section).

### Phase 2 — Status lifecycle + activity engine
- **Goal:** correct, audited state changes.
- **Work:** transition guard enforcing [`STATUS_WORKFLOW.md`](./STATUS_WORKFLOW.md);
  **assignment-driven auto-status rules** (§ STATUS_WORKFLOW); append-only activity writer
  emitting the event taxonomy (created, assignment_change, status_change, priority_change,
  comment, note, migration_normalization); set/clear `resolvedDate`/`closedDate`.
- **Exit:** invalid transitions blocked; every change writes immutable activity; auto-status
  rules verified by tests.
- **Gate:** Validation (workflow section) + Smoke (status section).

### Phase 3 — Assignment + core views
- **Goal:** the assignment model end to end.
- **Work:** assign to department/queue, to person, or both; **person-assigned tickets stay
  visible in the department queue**; build "My Assigned Tickets"; assignment changes emit
  activity and trigger auto-status rules.
- **Exit:** all assignment combinations correct in both views; Smoke assignment checks pass.
- **Gate:** Smoke (intake + assignment + views).

### Phase 4 — Generic department queue panel (config-driven)
- **Goal:** the main work panel, generic but config-driven.
- **Work:** render the panel from a single generic `EscalationSettings`; implement the
  required views/filters: unassigned-in-dept, assigned-to-me, assigned-to-others,
  in-progress, pending-review, resolved-awaiting-closure, overdue/nearing-resolution,
  priority/urgency, issue-category, tags; inline quick actions (role-gated);
  overdue/at-risk visual treatment; status/assignee inconsistency warnings.
- **Exit:** all required views/filters work against mock data; layout driven by config, no
  per-department branches.
- **Gate:** Smoke (queue views) + Validation (product coverage).

### Phase 5 — Ticket detail, activity & comments, notes
- **Goal:** full record interaction.
- **Work:** ticket detail with role-gated actions; unified Activity (immutable) + Comments
  (editable) timeline per [`ACTIVITY_AND_COMMENTS_SPEC.md`](./ACTIVITY_AND_COMMENTS_SPEC.md);
  @-mentions; internal notes; stale / last-update emphasis; legacy link surface
  (`legacyUrl`).
- **Exit:** comments, notes, mentions work; activity immutable; Smoke activity checks pass.
- **Gate:** Smoke (activity & comments).

### Phase 6 — Intake form + reporting/export
- **Goal:** create tickets and report on them.
- **Work:** intake form with required fields from `EscalationSettings`; optional AI assist
  (additive); CSV export (ID first) and core KPIs per
  [`REPORTING_SPEC.md`](./REPORTING_SPEC.md) (aging review, overdue, by dept/priority/
  category, stale).
- **Exit:** create→assign→work→resolve→close flow works on mock data; export columns match
  target spreadsheets.
- **Gate:** Smoke (intake + reporting/export).

### Phase 7 — Migration dry-run (read-only)
- **Goal:** prove we can map legacy → v2 safely, with zero writes.
- **Work:** read-only `LegacyReader` (separate from `EscalationStore`); dry-run producing
  candidates + drift report + summary + error log per [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md);
  drift normalization in v2 candidates only, each emitting a `migration_normalization`
  activity entry and a `migrationNote`; `legacyItemId`/`legacyUrl` preserved.
- **Exit:** dry-run produces all four artifacts against a sample/export; **no write to
  legacy or v2**; idempotent on `legacyItemId`.
- **Gate:** Migration-Dry-Run + No-Production-Modification.

> Note: Phase 7 **connecting to live legacy SharePoint requires explicit Rod approval**
> (decision D7). Until then, dry-run runs against a provided read-only export/sample.

### Beyond MVP (designed-for, not built)
- Live backend (`SharePointStore` / `ApiStore` / `DataverseStore`).
- Department-specific configuration editor.
- SLA rules + notifications (replacing legacy Power Automate flows).
- Migration apply (v2-only writes) and cutover — both approval-gated
  (see [`CUTOVER_PLAN.md`](./CUTOVER_PLAN.md)).

## 4. Dependency view

```
P0 foundations
  └─ P1 model + DAL
       └─ P2 lifecycle + activity
            └─ P3 assignment + views
                 └─ P4 generic queue panel
                      ├─ P5 detail/activity/comments
                      └─ P6 intake + reporting
P1 (model) ─────────────────────────────────► P7 migration dry-run (read-only)
```

## 5. Cross-cutting workstreams (run through all phases)
- **Safety:** No-Production-Modification on every PR; demo/mock isolation verified.
- **Testing:** unit (model/lifecycle/auto-status), component (views), smoke per phase.
- **Docs sync:** keep specs and this plan consistent; log choices in
  [`DECISION_LOG.md`](./DECISION_LOG.md).
- **Review:** Codex review before merge (see
  [`../harness/CODEX_REVIEW_CHECKLIST.md`](../harness/CODEX_REVIEW_CHECKLIST.md)).

## 6. Definition of done (MVP)
- Phases 0–7 exit criteria met against mock data.
- All harness gates passed; Codex approved.
- Open decisions D1–D9 resolved or explicitly deferred (see
  [`DECISION_LOG.md`](./DECISION_LOG.md)).
- Zero production modification; legacy untouched.

## 7. Open decisions blocking/shaping implementation
See [`DECISION_LOG.md`](./DECISION_LOG.md) (D1–D9) and
[`RISKS_AND_OPEN_QUESTIONS.md`](./RISKS_AND_OPEN_QUESTIONS.md). The most schedule-sensitive:
- **D1** app stack/hosting.
- **D2** auto-status rule behavior (auto vs. prompt).
- **D3** target backend (SharePoint vs. API/DB vs. Dataverse).
- **D7** legacy read access for migration dry-run.
