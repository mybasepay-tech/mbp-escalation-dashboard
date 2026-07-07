# Status Workflow — Escalation System v2

> Planning scaffold. Loop 7 aligned the v2 vocabulary with the real, familiar legacy
> statuses. Loop 21 (stakeholder feedback) changed the closure rule: Complete is now
> **requester-only** and requires a **final closing comment** (§3.2). The authoritative
> source of truth for the values and transitions is
> [`src/v2/domain/constants.js`](../src/v2/domain/constants.js).

## 1. v2 lifecycle statuses
1. **New** — created, not yet triaged. The first v2 status.
2. **Not yet assigned** — triaged into a department/queue but no person assigned.
3. **Assigned** — assigned to a person.
4. **In Process** — actively being worked.
5. **Pending Research** — waiting on internal research.
6. **Pending Member** — waiting on the member.
7. **Pending Customer** — waiting on the customer/employer.
8. **Complete** — the single, final official closure state (terminal). Requester-only, with a required final closing comment (§3.2).
9. **Cancelled** — invalid, duplicate, created-in-error, or no-longer-applicable (terminal).
10. **Reopened** — a completed ticket that needs more work; flows back into the working band.

The three **Pending-\*** states are sub-states a working ticket sits in while it waits on
someone; they are grouped as `PENDING_STATUSES` in code. The normal working band a user may
move a ticket through manually is **Assigned · In Process · Pending Research · Pending
Member · Pending Customer** (`WORKING_STATUSES`).

## 2. State diagram (allowed transitions)

```
New ──▶ Not yet assigned ──▶ Assigned ──▶ In Process ⇄ Pending Research / Member / Customer
 │            │                  │              │                    │
 │            └──────────────────┴──────────────┴────────────────────┘
 │                       (work freely between working statuses)
 │                                                          │
 │                                                          ▼
 ├──────────── Cancelled (from any non-terminal) ◀──── Complete (requester-only, terminal)
 │                                                          │
 └─ Reopened ◀──────────── (from Complete) ───────────────┘
        │
        └──▶ back into the working band (Assigned / In Process / Pending-*) or Complete
```

- **Assign/reassign** can occur from New, Not yet assigned, Assigned, and the working band
  (does not by itself force a status; see §3).
- **Working statuses interconnect freely** — In Process and the three Pending-\* states can
  move to one another and back to Assigned.
- **Complete** is reachable from Assigned, the working band, and Reopened, but only by the
  requester who submitted the ticket, with a final closing comment (§3.2). It is terminal
  except for Reopened.
- **Cancelled** is reachable from any non-terminal status and is fully terminal.
- **Reopened** is reachable from Complete, then flows back into the working band or Complete.

The exact target lists live in `ALLOWED_TRANSITIONS` in
[`constants.js`](../src/v2/domain/constants.js); `rules.changeStatus` enforces them.

## 3. Assignment-driven auto-status rules
These eliminate the legacy drift fixed in commit `72868ff` ("status/assignee drift") by
keeping status and assignment consistent **automatically**, not just by warning.

> Behavior (auto vs. prompt vs. warn-only) is decision **D2** in
> [`DECISION_LOG.md`](./DECISION_LOG.md). Default is **auto for forward moves**, every
> auto-change writing an activity entry.

### 3.1 Auto-status rules (recommended default)
| Trigger | Auto effect | Activity |
|---------|-------------|----------|
| Assign a person while status is `New` or `Not yet assigned` | status → **Assigned** | `assignment_change` + `status_change` |
| Assign to a department while status is `New` | status → **Not yet assigned** | `assignment_change` + `status_change` |
| Clear the assignee while status is `Assigned` | status → **Not yet assigned** | `assignment_change` + `status_change` |
| First substantive work on an `Assigned` ticket | *(no auto-advance)* — user sets **In Process** explicitly | — |
| Set status `Complete` | set `completedDate` + store `finalClosureNote` | `status_change` (note carries the closing comment) |
| Set status `Reopened` | clear `completedDate` + clear `finalClosureNote` (closure history stays in activity) | `status_change` (with note) |

- Auto-rules **never advance past `Assigned`** — In Process, the Pending-\* states, and
  Complete are always explicit human actions.
- Auto-rules apply only to the forward `New → Not yet assigned → Assigned` band and the
  symmetric assignee-clear; they never auto-cancel and never auto-complete.

### 3.2 Requester-only Complete + required final closing comment (Loop 21)
- **`submitterId`** (the requester/creator of the ticket) is the **only** closure authority —
  the person who alone may move a ticket to **Complete**. Neither **`assigneeId`** (the
  worker), nor **`ticketOwner`** (the accountability owner), nor a department lead gains that
  authority — unless they are also the requester.
- Completing **requires a non-empty final closing comment** (`closureNote`). The comment is
  stored on the ticket as `finalClosureNote` and carried in the `status_change` activity
  event, so closure history survives a later Reopen.
- `rules.canComplete(ticket, actorId)` returns true only when `actorId === ticket.submitterId`
  (and a submitter exists). `rules.changeStatus` throws if anyone else targets Complete, or if
  the requester supplies no closing comment.
- Completing sets `completedDate`; reopening clears `completedDate` and `finalClosureNote`
  (the activity stream preserves the closure history).
- Auto-status never targets Complete, so the gate only affects explicit user actions.
- The mock UI reflects this: the Complete option is offered only when the current mock user
  submitted the ticket (`viewModel.statusOptions(ticket, { currentUserId })`), a closing
  comment input appears for the requester, and a validation message is shown if the requester
  tries to complete without one.
- `ticketOwner` remains on the model as the queue-accountability owner; it no longer grants
  closure authority (superseded by this rule — see D23 in the decision log).

### 3.3 Invariants (always enforced)
- If status ∈ {`Assigned`, `In Process`, `Pending Research`, `Pending Member`,
  `Pending Customer`} then `assignedDeptId` **must** be set.
- If `assigneeId` is set, status must be **`Assigned` or later** (auto-corrected per §3.1).
- A ticket assigned to a person still belongs to its department queue (assignment never
  removes it from the dept).

### 3.4 Conflicts the UI must still surface
- Imported/edge records that violate an invariant and cannot be auto-resolved are flagged
  inline (e.g. assignee set but no department). Migration normalizes these in v2 only — see
  [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md) §4.

## 4. Open vs. closed sets
- **Open / active (`OPEN_STATUSES`):** New, Not yet assigned, Assigned, In Process, Pending
  Research, Pending Member, Pending Customer, Reopened.
- **Terminal (`TERMINAL_STATUSES`):** Complete, Cancelled.

## 5. Legacy status mapping (for migration)
v2 now uses the legacy vocabulary directly, so most statuses map 1:1.

| Legacy status | v2 status | Rule / note |
|---------------|-----------|-------------|
| Not yet assigned | Not yet assigned | If `AssignedTo` populated → **Assigned** + migration note. |
| Assigned | Assigned | |
| In Process | In Process | 1:1 (earlier mock builds called this "In Progress"). |
| Pending Research | Pending Research | 1:1 |
| Pending Member | Pending Member | 1:1 |
| Pending Customer | Pending Customer | 1:1 |
| Complete | Complete | 1:1; set `completedDate` if a resolved/closed date is present. |
| Cancelled | Cancelled | 1:1 |
| Reopened | Reopened | 1:1 |
| *(blank/unknown)* | New | Record note. |

Authoritative mapping + drift handling: [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md).

## 6. Every transition writes activity
All status changes append an `EscalationActivity` entry (`type: status_change`, `from`,
`to`, `actorId`, `timestamp`) — including auto-changes and the requester-only Complete
(whose note carries the final closing comment). See
[`ACTIVITY_AND_COMMENTS_SPEC.md`](./ACTIVITY_AND_COMMENTS_SPEC.md).
