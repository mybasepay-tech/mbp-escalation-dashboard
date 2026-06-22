# Validation Checklist

> Confirms specs, data model, and workflow are internally consistent and complete enough
> for the next branch. Run before handing work to QA/Codex.

## Documentation completeness
- [ ] All required docs exist under `docs/` and are non-empty.
- [ ] Cross-links between docs resolve (no dead references).
- [ ] Each doc states it does not authorize production changes where relevant.

## Product requirements coverage
- [ ] Assignment to department/queue specified.
- [ ] Assignment to person specified.
- [ ] Both-at-once assignment specified.
- [ ] Department queue defined as the main work panel.
- [ ] "My Assigned Tickets" per-person view specified.
- [ ] Person-assigned ticket remains visible in department queue.
- [ ] Department panel covers all required views: unassigned-in-dept, assigned-to-me,
      assigned-to-others, in-progress, pending-review, resolved-awaiting-closure,
      overdue/nearing-resolution, priority/urgency, issue-category, tags.
- [ ] Generic MVP panel + future department-specific configurability both documented.

## Data model consistency
- [ ] All suggested entities present: Escalations, EscalationActivity,
      EscalationComments, EscalationTags, EscalationTeams, EscalationSettings (+ optional
      Attachments, SLA).
- [ ] `legacyItemId` and `legacyUrl` fields present on Escalations.
- [ ] Statuses in data model match `STATUS_WORKFLOW.md`.
- [ ] `EscalationSettings` shape supports future config (columns, quick actions, filters,
      required fields, categories, SLA, terminology, widgets, routing rules).

## Workflow consistency
- [ ] All 9 lifecycle statuses defined (New, Not yet assigned, Assigned, In Progress,
      Pending Review, Resolved, Closed, Cancelled, Reopened).
- [ ] Transitions and invariants documented.
- [ ] **Assignment-driven auto-status rules** documented (forward New→Assigned band; never
      auto-advance past In Progress) and consistent with PRODUCT_SPEC + UI_SPEC.
- [ ] Legacy → v2 status mapping documented.

## Activity taxonomy consistency
- [ ] `EscalationActivity.type` taxonomy identical in `DATA_MODEL.md` and
      `ACTIVITY_AND_COMMENTS_SPEC.md` (created, assignment_change, status_change,
      priority_change, field_change, comment, note, migration_normalization).
- [ ] Assignment that triggers auto-status emits both `assignment_change` + `status_change`.
- [ ] Migration corrections emit `migration_normalization`.

## Migration consistency
- [ ] Legacy treated as read-only source; no write-back.
- [ ] Dry-run defined and produces a drift report.
- [ ] Drift correction is v2-only with notes.
- [ ] Field mapping covers known legacy fields.

## Architecture / safety
- [ ] DAL seam (`EscalationStore`) keeps backend swappable (Mock / SharePoint / API /
      Dataverse).
- [ ] MVP is mock-first (`MockStore`); no live backend assumed.
- [ ] No production-modification anywhere (see NO_PRODUCTION_MODIFICATION_CHECKLIST).

## Plan & decisions
- [ ] `IMPLEMENTATION_PLAN.md` exists with an ordered, gated MVP sequence.
- [ ] `DECISION_LOG.md` exists; open decisions (D1–D9) are referenced where they block work.
- [ ] Cross-doc references resolve (PRODUCT/STATUS/UI ↔ DECISION_LOG ↔ IMPLEMENTATION_PLAN).

## Sign-off
- Verified by: ____________________   Date: __________
- Result: ☐ Pass  ☐ Needs work (notes: ____________________)
