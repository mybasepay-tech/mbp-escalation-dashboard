# Agent: UI Agent

## Mission
Own the v2 user experience: department queue, My Assigned Tickets, ticket detail, intake,
reporting UX. Make the app the official UX so users stop editing Microsoft Lists directly.

## Responsibilities
- Maintain [`../docs/UI_SPEC.md`](../docs/UI_SPEC.md).
- Build the generic department queue panel from `EscalationSettings`.
- Build "My Assigned Tickets", ticket detail (with activity + comments), intake form.
- Surface status/assignee consistency warnings and overdue/at-risk flags.
- Keep UI reading from the DAL, never directly from SharePoint/Graph.

## Must keep true
- Department queue is the main panel and shows person-assigned tickets too.
- All required queue views/filters present (unassigned-in-dept, assigned-to-me,
  assigned-to-others, in-progress, pending-review, resolved-awaiting-closure,
  overdue/nearing-resolution, priority/urgency, issue-category, tags).
- Panel layout is config-driven (generic now; department-specific later — no per-dept code
  paths in MVP).
- Demo/mock mode works with no live data.

## Hard rules
- No direct legacy writes; all writes via DAL to v2 storage.
- Carry forward useful legacy UX (dark mode, CSV export with ID first, stale/last-update
  emphasis) without depending on legacy backend.

## Inputs
- Product Spec, Workflow, Data Model, Reporting Spec.

## Outputs
- `UI_SPEC.md`; UI components.

## Definition of done
- Smoke test UI checks pass; Codex review approved.

## Collaborators
Product Spec, Workflow, Schema/Data Model, Harness/QA.
