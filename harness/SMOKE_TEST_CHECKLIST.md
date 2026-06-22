# Smoke Test Checklist

> Minimal end-to-end checks for a v2 build. Run against **dev/mock or v2 dev backend
> only** — never against legacy. Demo/mock mode must require no live data.

## Environment
- [ ] Running against v2 dev / mock store (NOT legacy).
- [ ] No network calls write to the legacy tracker (verify in network log).
- [ ] Demo/local mode loads with mock data and no sign-in.

## Intake
- [ ] Create a ticket with required fields → succeeds.
- [ ] New ticket appears with status **New**.
- [ ] Missing required field → blocked with clear validation.

## Assignment
- [ ] Assign ticket to a department/queue → appears in that department queue.
- [ ] Assign ticket to a person → appears in that person's "My Assigned Tickets".
- [ ] Person-assigned ticket **still appears** in the department queue.
- [ ] Assign both dept + person simultaneously → both views correct.

## Department queue views
- [ ] Unassigned-in-dept filter shows only unassigned.
- [ ] Assigned-to-me / assigned-to-others filters correct.
- [ ] In Progress / Pending Review / Resolved-awaiting-closure filters correct.
- [ ] Overdue / nearing-resolution flag shows for past/near `expectedResolutionDate`.
- [ ] Priority, issue-category, tag filters work.

## Status workflow
- [ ] Valid transition (e.g. Assigned → In Progress) succeeds.
- [ ] Invalid transition blocked.
- [ ] Status/assignee inconsistency is surfaced (e.g. assignee set but "Not yet assigned").
- [ ] Resolve sets resolvedDate; Close sets closedDate; Reopen clears them.

## Activity & comments
- [ ] Status/assignment changes append immutable activity entries.
- [ ] Comment can be added; @-mention resolves.
- [ ] Activity entries cannot be edited/deleted.

## Reporting / export
- [ ] CSV export produces expected columns (ID first).
- [ ] daysOpen computed and ≥ 0.

## Result
- Build/commit: ____________________
- Verified by: ____________________   Date: __________
- Result: ☐ Pass  ☐ Fail (notes: ____________________)
