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
- [ ] Transitions and status/assignee consistency rules documented.
- [ ] Legacy → v2 status mapping documented.

## Migration consistency
- [ ] Legacy treated as read-only source; no write-back.
- [ ] Dry-run defined and produces a drift report.
- [ ] Drift correction is v2-only with notes.
- [ ] Field mapping covers known legacy fields.

## Architecture / safety
- [ ] DAL seam keeps backend swappable (cloud/API-ready).
- [ ] No production-modification anywhere (see NO_PRODUCTION_MODIFICATION_CHECKLIST).

## Sign-off
- Verified by: ____________________   Date: __________
- Result: ☐ Pass  ☐ Needs work (notes: ____________________)
