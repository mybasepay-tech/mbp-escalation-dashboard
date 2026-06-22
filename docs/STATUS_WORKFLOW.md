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

## 3. Assignment-driven auto-status rules
These eliminate the legacy drift fixed in commit `72868ff` ("status/assignee drift") by
keeping status and assignment consistent **automatically**, not just by warning.

> Behavior (auto vs. prompt vs. warn-only) is decision **D2** in
> [`DECISION_LOG.md`](./DECISION_LOG.md). Default recommendation below is **auto for
> forward moves**, every auto-change writing an activity entry.

### 3.1 Auto-status rules (recommended default)
| Trigger | Auto effect | Activity |
|---------|-------------|----------|
| Assign a person while status is `New` or `Not yet assigned` | status → **Assigned** | `assignment_change` + `status_change` |
| Assign to a department while status is `New` | status → **Not yet assigned** | `assignment_change` + `status_change` |
| Clear the assignee while status is `Assigned` | status → **Not yet assigned** | `assignment_change` + `status_change` |
| First substantive work update on an `Assigned` ticket | *(no auto-advance)* — user sets **In Progress** explicitly | — |
| Set status `Resolved` | set `resolvedDate` | `status_change` |
| Set status `Closed` | set `closedDate` | `status_change` |
| Set status `Reopened` | clear `resolvedDate`/`closedDate`; require reason | `status_change` (with note) |

- Auto-rules **never advance past `In Progress`** — review/resolution/closure are always
  explicit human actions.
- Auto-rules apply only to the forward `New → Not yet assigned → Assigned` band and the
  symmetric assignee-clear; they never auto-cancel or auto-close.

### 3.2 Invariants (always enforced)
- If status ∈ {`Assigned`, `In Progress`, `Pending Review`} then `assignedDeptId` **must**
  be set.
- If `assigneeId` is set, status must be **`Assigned` or later** (auto-corrected per §3.1).
- A ticket assigned to a person still belongs to its department queue (assignment never
  removes it from the dept).

### 3.3 Conflicts the UI must still surface
- Imported/edge records that violate an invariant and cannot be auto-resolved are flagged
  inline (e.g. assignee set but no department). Migration normalizes these in v2 only — see
  [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md) §4.

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
