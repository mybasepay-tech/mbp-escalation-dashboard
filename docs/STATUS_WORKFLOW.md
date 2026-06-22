# Status Workflow — Escalation System v2

> Planning scaffold.

## 1. v2 lifecycle statuses
1. **New** — created, not yet triaged.
2. **Not yet assigned** — triaged into a department but no person assigned.
3. **Assigned** — assigned to a person.
4. **In Progress** — actively being worked.
5. **Pending Review** — work done, awaiting reviewer/approver.
6. **Resolved** — resolved, awaiting closure confirmation.
7. **Closed** — confirmed closed (terminal).
8. **Cancelled** — closed without resolution (terminal).
9. **Reopened** — previously resolved/closed, now active again.

## 2. State diagram (allowed transitions)

```
New ──▶ Not yet assigned ──▶ Assigned ──▶ In Progress ──▶ Pending Review ──▶ Resolved ──▶ Closed
 │            │                  │             │                 │              │
 │            └──────────────────┴─────────────┴─────────────────┘              │
 │                         (assign / reassign person)                           │
 │                                                                              │
 ├──────────────────────────── Cancelled (from any non-terminal) ◀─────────────┤
 │                                                                              │
 └─ Reopened ◀── (from Resolved or Closed) ──▶ In Progress                      │
```

- **Assign/reassign** can occur from New, Not yet assigned, Assigned, In Progress, Pending
  Review (does not by itself force a status; see rules).
- **Cancelled** is reachable from any non-terminal status (requires reason).
- **Reopened** is reachable from Resolved or Closed, then flows back into In Progress.

## 3. Status ↔ assignment consistency rules
These prevent the legacy drift fixed in commit `72868ff` ("status/assignee drift").
- If `assigneeId` is set and status is `Not yet assigned` → status should be **Assigned**
  (or later). The UI must surface this inconsistency.
- If status is `Assigned`/`In Progress`/`Pending Review` then `assignedDeptId` **must** be
  set.
- Clearing the assignee while status is `Assigned` should drop status back to **Not yet
  assigned** (or prompt).
- Setting status to `Resolved` sets `resolvedDate`; `Closed` sets `closedDate`.
- `Reopened` clears `resolvedDate`/`closedDate` and requires a reason in activity.

## 4. Open vs. closed sets
- **Open / active:** New, Not yet assigned, Assigned, In Progress, Pending Review,
  Resolved (awaiting closure), Reopened.
- **Terminal:** Closed, Cancelled.

> Note: "Resolved" is treated as still-active (awaiting closure) for queue and overdue
> purposes — distinct from legacy "Complete".

## 5. Legacy status mapping (for migration)
| Legacy status | v2 status | Rule / note |
|---------------|-----------|-------------|
| Not yet assigned | Not yet assigned | If `AssignedTo` populated → **Assigned** + migration note. |
| Assigned | Assigned | |
| In Process | In Progress | Rename. |
| Pending Member | Pending Review | Pending-* collapse to Pending Review (preserve original in note). |
| Pending Research | Pending Review | " |
| Pending Customer | Pending Review | " |
| Complete | Closed *(or Resolved)* | Decide at migration; default Closed if `ResolvedDate` set. Record note. |
| *(blank/unknown)* | New | Record note. |

Authoritative mapping + drift handling: [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md).

## 6. Every transition writes activity
All status changes append an `EscalationActivity` entry (`type: status_change`, `from`,
`to`, `actorId`, `timestamp`). See
[`ACTIVITY_AND_COMMENTS_SPEC.md`](./ACTIVITY_AND_COMMENTS_SPEC.md).
