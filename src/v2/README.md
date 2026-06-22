# Escalation System v2 — Implementation Foundation (mock-first)

This is the **Loop 3** implementation foundation: a small, **zero-dependency**, mock-only
codebase that realizes the domain model, assignment/status rules, and a `MockStore` from
the planning docs in [`../../docs/`](../../docs/).

> **Safety:** This foundation never touches the legacy dashboard
> ([`../../escalation-dashboard.html`](../../escalation-dashboard.html)) and makes **no**
> connection to Microsoft Graph, SharePoint, Power Automate, Azure Functions, or any live
> system. It contains no credentials, tenant/client IDs, scopes, or production URLs. A
> [`tests/safety.test.js`](./tests/safety.test.js) scan enforces this.

## Requirements
- Node.js 18+ (developed on Node 24). Uses only built-ins: ES modules, `node:test`,
  `node:assert`, `node:fs`, `node:crypto`. **No `npm install` needed.**

## Run the tests
```bash
cd src/v2
npm test        # alias for: node --test
```

## Inspect locally (demo)
```bash
cd src/v2
npm run demo    # alias for: node mock/demo.js
```
The demo prints the seeded Benefits Ops department queue (showing that person-assigned
tickets stay in the queue), Sarah's "My Assigned Tickets", then assigns the New ticket and
shows the auto-status change to **Assigned** plus the activity trail.

## Layout
```
src/v2/
  domain/
    constants.js   # statuses, priorities, activity types, allowed transitions
    models.js      # Ticket/User/Department/Comment/Note/Tag/ActivityEvent factories
    rules.js       # assignment + status transition rules (auto-status, activity events)
  store/
    EscalationStore.js  # abstract data-access contract (the swap seam)
    MockStore.js        # in-memory implementation (the only backend in MVP)
  mock/
    seed.js        # fabricated sample data (all required scenarios)
    demo.js        # local inspection script
  tests/
    rules.test.js  # auto-status + activity-event behavior
    store.test.js  # queue / My Assigned views, activity recording, seed coverage
    safety.test.js # no production strings / network calls; fake legacy domain
  README.md
```

## Architecture seam
All app logic depends on the `EscalationStore` contract, not on any backend. The MVP uses
`MockStore`. A future backend (API / database / Dataverse) can implement the same contract
without changing callers — see [`../../docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md)
§3.2. **Microsoft Graph is explicitly NOT part of this foundation**; it would only ever be
one possible future adapter behind this seam.

## Key rules implemented (see [`../../docs/STATUS_WORKFLOW.md`](../../docs/STATUS_WORKFLOW.md))
- Tickets can be assigned to a department/queue, a person, or both.
- A person-assigned ticket **remains visible in its department queue**.
- Adding a person while status is **New** or **Not yet assigned** auto-moves to
  **Assigned**. Status is **never** auto-advanced beyond Assigned.
- Clearing the assignee on an **Assigned** ticket reverts to **Not yet assigned**.
- Every assignment, status, priority, comment, and note change records an immutable
  activity event.

## Sample scenarios in the seed
New · Department-only · Person-assigned · In Progress · Pending Review · Resolved
(awaiting closure) · Reopened · Legacy-migrated (with **fake** legacy id `3071` and a
**fake** `legacy.example.invalid` URL + migration normalization note).
