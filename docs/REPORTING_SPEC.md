# Reporting Spec — Escalation System v2

> Planning scaffold. Goal: replace hand-maintained spreadsheets with built-in reporting +
> exports, at least at parity with today's CSVs.

## 1. Goals
- Self-serve dashboards for leads/admins and read-only viewers (e.g. Maggie).
- Exports that match the spreadsheet column order/names stakeholders already use.
- No dependency on legacy Power Automate flows.

## 2. Core KPIs / widgets (MVP)
- Open vs. closed counts (by the v2 open/terminal sets).
- **Aging review** — tickets by days-open buckets (legacy added an Aging Review KPI).
- Overdue / nearing expected resolution date.
- By department/queue: volume, unassigned count, assigned-to-others, in progress, pending
  review, resolved-awaiting-closure.
- By priority/urgency.
- By issue category / type.
- Financial impact totals / remaining (where present).
- Stale tickets ("no update since X days").

## 3. Filters / slicing
- Department, assignee, status, priority, issue category, tags, date windows.
- Group-by aggregations (legacy Smart Search supported group-by + narrative synthesis;
  candidate carry-over).

## 4. Exports
- **CSV export** from any list/report view.
- Match stakeholder spreadsheet column order and names (legacy commits `05df2a4`,
  `4786b95`: column order matched "Maggie's spreadsheet"; **ID is the first column**).
- Configurable column sets per report (generic default in MVP).
- RFP / specialized CSVs as needed (legacy had an RFP CSV).

## 5. Computed metrics
- `daysOpen` computed live, clamped ≥ 0 (do not trust stored legacy day counts).
- Overdue = `now > expectedResolutionDate` and status in open set.
- At-risk = nearing `expectedResolutionDate` within a threshold (visual yellow in legacy).

## 6. Data sources
- v2 reporting reads only from v2 storage via the DAL — never from the legacy tracker at
  runtime.
- Historical/legacy figures come from the migrated v2 dataset (with `legacyItemId`
  traceability), not live legacy reads.

## 7. Future (designed-for)
- Department-configurable dashboards/widgets via `EscalationSettings`.
- SLA attainment reporting via `EscalationSLA`.
- Scheduled report delivery (replacing legacy flow-based notifications).
