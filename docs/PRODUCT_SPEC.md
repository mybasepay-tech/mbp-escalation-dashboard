# Product Spec — myBasePay Escalation System v2

> Status: **Planning / scaffold.** This document describes the target v2 product. It does
> not authorize any change to the live legacy tracker. See
> [`harness/NO_PRODUCTION_MODIFICATION_CHECKLIST.md`](../harness/NO_PRODUCTION_MODIFICATION_CHECKLIST.md).

## 1. Purpose

The myBasePay Escalation System tracks internal escalations (member/customer/worker
issues, financial impact items, research requests) from intake through resolution and
closure. Today this runs on a SharePoint List ("Escalation Tracker") fronted by a
single-file dashboard ([`escalation-dashboard.html`](../escalation-dashboard.html)) using
MSAL + Microsoft Graph.

**v2 goal:** deliver a purpose-built application that becomes the *official* user
experience — so staff stop working directly in Microsoft Lists — while remaining safe to
build in parallel with the live legacy system and cloud/API-ready for a future backend
swap.

## 2. Why v2

- The single-file dashboard + raw SharePoint List has reached its ceiling: status drift,
  inconsistent assignment, no first-class department queues, no clean per-person work view.
- Legacy flows (Power Automate) are brittle and must not be the long-term system.
- We want department-configurable workflows, a real activity/audit trail, and reporting
  that does not depend on hand-maintained spreadsheets.

## 3. Scope

### In scope (MVP)
- Ticket intake and lifecycle management.
- **Assignment to a department/queue** and/or **assignment to a person** (both allowed
  simultaneously).
- **Department queue** as the primary work panel (generic for MVP).
- **"My Assigned Tickets"** per-person view.
- Tickets assigned to a person **remain visible in the department queue**.
- Activity log + comments.
- Tags, priority/urgency, issue category.
- Dry-run migration from legacy (read-only) with traceability.
- Reporting/exports comparable to today's CSV outputs.

### Out of scope (MVP, designed-for-later)
- Department-specific panel configuration (columns, quick actions, filters, required
  fields, categories, SLA rules, terminology, widgets, routing rules).
- Automated SLA enforcement / notifications.
- Replacing or decommissioning the legacy tracker (cutover is a separate, approved step).

## 4. Users & primary jobs

| Role | Primary jobs |
|------|--------------|
| Submitter / requester | Create an escalation, watch its status, add comments. |
| Department member (assignee) | See "My Assigned Tickets", work and update them. |
| Department lead | Own a department queue, triage unassigned, assign to people, monitor overdue. |
| Admin / system owner (Rod, Teri) | Configure teams/settings, run migration, approve cutover. |
| Viewer / reporting (e.g. Maggie) | Read dashboards, export, aggregate. |

(Named users observed in legacy work: Maggie, Sarah, Jennifer, Teri.)

## 5. Core requirements

### Assignment model
1. A ticket can be assigned to a **department/queue**.
2. A ticket can be assigned to a **person**.
3. A ticket can have **both** at once.
4. The **department queue is the main work panel**.
5. Every person has a **"My Assigned Tickets"** view.
6. A ticket assigned to a person **stays visible in its department queue**.
7. Assignment is **status-aware**: assigning a person auto-advances a `New`/`Not yet
   assigned` ticket to `Assigned`, and clearing the assignee reverts it — keeping status
   and assignment consistent. See [`STATUS_WORKFLOW.md`](./STATUS_WORKFLOW.md) §3 (behavior
   is decision **D2** in [`DECISION_LOG.md`](./DECISION_LOG.md)).

### Department panel (generic MVP)
The generic department panel must support these views/filters:
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

See [`UI_SPEC.md`](./UI_SPEC.md) for layout, [`STATUS_WORKFLOW.md`](./STATUS_WORKFLOW.md)
for the lifecycle, and [`DATA_MODEL.md`](./DATA_MODEL.md) for fields.

### Department configurability (future)
The generic panel must be **architected** so that, later, each department can configure:
visible columns, quick actions, filters, required fields, categories, SLA rules,
terminology, widgets, and routing rules — without code changes per department. MVP ships
one generic config; the config *shape* is defined now (see `EscalationSettings` /
`EscalationTeams` in [`DATA_MODEL.md`](./DATA_MODEL.md)).

## 6. Success criteria (MVP)
- A lead can triage a department queue and assign tickets to people.
- A person sees only their tickets in "My Assigned Tickets" but the department still sees
  them in the queue.
- Status changes and assignments are recorded in the activity log.
- A dry-run migration produces a v2 dataset with legacy IDs/URLs preserved and a drift
  report — with **zero writes** to the legacy tracker.
- Reporting/export parity with today's key CSVs.

## 7. Non-goals / guardrails
- v2 does **not** modify, migrate, restrict, or replace the legacy tracker before approved
  cutover.
- v2 does **not** write back to the legacy list.
- v2 does **not** depend on legacy Power Automate flows long-term.

## 8. Open questions & plan
- Decisions tracked in [`DECISION_LOG.md`](./DECISION_LOG.md).
- Risks/questions in [`RISKS_AND_OPEN_QUESTIONS.md`](./RISKS_AND_OPEN_QUESTIONS.md).
- Build sequence in [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md).
