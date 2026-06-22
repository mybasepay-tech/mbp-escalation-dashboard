# UI Spec — Escalation System v2

> Planning scaffold. The v2 app/UI becomes the **official user experience** so users no
> longer work directly in Microsoft Lists.

## 1. Primary surfaces
1. **Department Queue panel** — the main work panel (generic for MVP).
2. **My Assigned Tickets** — per-person view.
3. **Ticket detail** — full record, activity, comments, actions.
4. **Intake form** — create an escalation.
5. **Reporting** — dashboards + exports (see [`REPORTING_SPEC.md`](./REPORTING_SPEC.md)).

## 2. Department Queue panel (generic MVP)
The primary panel. Renders from an `EscalationSettings` config (generic default in MVP).

**Required views / filters:**
- Unassigned tickets in department
- Assigned to me
- Assigned to others
- In Progress
- Pending Review
- Resolved awaiting closure
- Overdue / nearing expected resolution date
- Priority / urgency
- Issue category
- Tags

**Behavior:**
- A ticket assigned to a person **still appears** in the department queue (with an
  assignee indicator). Product req #6.
- Quick actions (assign, change status, comment) available inline, gated by role.
- At-risk / overdue rows visually flagged (legacy used yellow "at-risk"; keep a clear
  overdue treatment).
- Reassignment indicator/pill when a ticket has moved between people/depts.

**Generic columns (MVP default):** Title, Status, Priority, Assignee, Department, Issue
Category, Tags, Expected Resolution, Days Open, Last Update.

## 3. My Assigned Tickets
- Shows tickets where `assigneeId == currentUser`.
- Same row treatment as the queue; defaults to active statuses.
- A ticket here is also visible in its department queue (not exclusive).

## 4. Ticket detail
- Header: title, status badge, priority, department, assignee, legacy link (`legacyUrl`).
- Tabs/sections: Details, **Activity** (immutable log), **Comments**, Attachments
  (optional).
- Actions (role-gated): change status (valid transitions only), assign/reassign to person,
  set priority, add tag, comment.
- Status/assignee consistency warnings surfaced inline (per
  [`STATUS_WORKFLOW.md`](./STATUS_WORKFLOW.md) §3).

## 5. Intake form
- Required fields driven by `EscalationSettings.requiredFields` (generic set in MVP).
- Captures title, description, requesting dept, suggested department/queue, priority,
  issue category/type, financial impact (optional), tags.
- Optional AI assist (as legacy had: suggest urgency/issue type/category) — additive,
  not required.

## 6. Generic-now, configurable-later
MVP renders one generic config. The UI reads layout from `EscalationSettings` so future
department-specific configuration (visible columns, quick actions, filters, required
fields, categories, SLA rules, terminology, widgets, routing rules) is a **data change**,
not a code change. No department-specific code paths in MVP.

## 7. Cross-cutting UI
- Dark mode (legacy supports it for all users).
- Search/filter bar; smart-search style querying is a candidate carry-over.
- CSV export from any list view.
- Empty/loading/error states; demo/mock mode for local dev (no live data).

## 8. Out of scope (MVP)
- Per-department theming/terminology, custom widgets, routing-rule editors — designed-for
  but not built.
