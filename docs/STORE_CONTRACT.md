# Store Contract — Escalation System v2

> **Loop 10.** Defines the behavioral contract that **every** `EscalationStore` implementation
> must satisfy, and the **executable harness** that proves it. The harness runs against
> `MockStore` today; the same contract is the **acceptance gate** for any future adapter
> (decision **D13**). **Design-only / no live integration:** the harness and the
> `SharePointStore` stub make **no** network calls and import **no** Graph/SharePoint/Azure
> SDKs.
>
> Code: contract [`../src/v2/tests/store-contract/contract.js`](../src/v2/tests/store-contract/contract.js),
> entry [`../src/v2/tests/store-contract.test.js`](../src/v2/tests/store-contract.test.js),
> interface [`../src/v2/store/EscalationStore.js`](../src/v2/store/EscalationStore.js),
> current backend [`../src/v2/store/MockStore.js`](../src/v2/store/MockStore.js), future stub
> [`../src/v2/store/SharePointStore.js`](../src/v2/store/SharePointStore.js).

## 1. Purpose
The UI and app logic depend only on the abstract `EscalationStore` contract — never on a
concrete backend. The store contract turns that promise into an **executable specification**:
a single, reusable suite of expectations that any implementation must pass. This is what makes
a future backend swap safe — an adapter is "done" only when it passes the same contract that
`MockStore` passes today.

## 2. Methods expected from any `EscalationStore`
| Group | Methods |
|-------|---------|
| Tickets | `getTicket(id)` → ticket\|null · `listTickets(filter)` · `createTicket(input)` |
| Assignment/lifecycle | `assignDepartment(id, deptId, opts)` · `assignPerson(id, userId, opts)` · `clearAssignee(id, opts)` · `setStatus(id, status, opts)` · `setPriority(id, priority, opts)` · `setAmount(id, amount, opts)` |
| Tags | `addTag(id, tagId, opts)` · `removeTag(id, tagId, opts)` |
| Streams | `listActivity(id)` · `listComments(id)` · `listNotes(id)` · `addComment(id, input)` · `addNote(id, input)` |
| Attachments (metadata) | `listAttachments(id)` · `addAttachment(id, input)` · `removeAttachment(id, attachmentId, opts)` — metadata only, no file bytes (D24) |
| Views | `departmentQueue(deptId, opts)` · `myAssignedTickets(userId, opts)` |
| Reference | `listDepartments()` · `listUsers()` · `listTags()` |

All methods are async. `opts` carries `{ actorId, now }` for deterministic, attributable
mutations; `setStatus` additionally accepts `closureNote` (required when targeting
**Complete** — D23).

## 3. Business rules that must hold consistently
The contract asserts these behaviors regardless of backend:
- **Create** persists the ticket and records a `created` activity event.
- **Auto-status on assignment:** assigning a person to a New / Not-yet-assigned ticket
  auto-advances it to **Assigned** (never beyond); clearing the assignee on an Assigned ticket
  reverts to **Not yet assigned**.
- **Department queue** includes person-assigned tickets, not just unassigned ones.
- **My Assigned** returns only the given person's tickets.
- **Owner ≠ assignee ≠ requester:** three distinct roles; the **requester** (`submitterId`)
  is the closure authority (D23).
- **Legal transitions only:** illegal status transitions are rejected.
- **Requester-only Complete (D23):** only the requester who submitted the ticket may move it
  to **Complete**; the assignee, the ticket owner, or anyone else is rejected — and the
  requester is rejected too without a non-empty `closureNote` (final closing comment).
- **Complete** sets `completedDate`, stores `finalClosureNote`, and records a `status_change`
  event carrying the closing comment; **Reopened** clears `completedDate`/`finalClosureNote`
  (closure history stays in activity).
- **Attachments are metadata-first (D24):** `addAttachment`/`listAttachments` manage metadata
  rows only; `removeAttachment` soft-deletes; each change emits an `attachment` activity event.
- **Amount involved is optional (D26):** `setAmount` sets/clears a non-negative amount
  (currency defaults to USD) and emits a `field_change` event.
- **`lastActivityAt` movement stamp (D25):** every real movement — status/assignment/priority/
  tag change, comment, note, attachment — updates the ticket's `lastActivityAt`.
- **Cancelled** is terminal — no further transition is allowed.
- **Comments vs. notes vs. activity** are three separate streams (public comment, internal
  note, typed activity); adding a comment/note emits its own activity event and never leaks
  across streams.
- **Tags:** `addTag` is idempotent; `removeTag` removes (no-op when absent); both emit a
  `field_change` event. *(In a SharePoint backend, tags are the `Escalations_v2_TicketTags`
  link list with soft-delete — D12 — but the store-level contract is expressed in terms of the
  ticket's effective `tagIds`.)*
- **Activity is append-only:** ordered ascending by timestamp; prior events are unchanged after
  a new action.
- **Store-level filtering:** `listTickets` supports `status` / `deptId` / `assigneeId` /
  `openOnly` (openOnly excludes terminal tickets).

## 4. `MockStore` — current implementation
`MockStore` is the **active UI backend** (in-memory, zero-dependency) and the **reference**
behavior. The contract runs against it on every `npm test`:
```js
runStoreContract('MockStore', (seed) => new MockStore().load(seed));
```
As of Loop 15 (D19), the contract **also** runs against `SharePointStore` backed by the local
**FakeSharePoint simulator** — proving the adapter matches the reference behavior with zero live
dependencies:
```js
runStoreContract('SharePointStore(FakeSharePoint)', (seed) =>
  new SharePointStore({ client: createSeededFakeClient(seed) }));
```
Beyond the contract, Loop 16 (D20) adds **resilience tests** (throttling retry, ETag conflict
retry, idempotent activity append/compensation, tag-link uniqueness) in
[`../src/v2/tests/sharepointstore-resilience.test.js`](../src/v2/tests/sharepointstore-resilience.test.js).

## 5. `SharePointStore` — future implementation (design-only stub)
`SharePointStore` extends `EscalationStore`, mirrors the full interface, and **throws a clear
design-only error on every operation**:
```
SharePointStore is design-only and not connected. Use MockStore for local MVP. (method -> mapping)
```
It makes **no** network calls and imports **no** Graph/SharePoint/Azure SDK; it carries no
credentials, env vars, tenant/client IDs, secrets, or live URLs. Each method documents its
*future* mapping to the design-only SharePoint lists (e.g. `setStatus -> Tickets.Status +
Activity(status_change)`), so the build target is visible without anything being live.

The backend target is **SharePoint List v2** (decision D3, accepted Loop 11). When a
controlled build is approved (now gated by D6/D7 and the dry-run checklist, and sequenced by
[`PARALLEL_RUN_AND_CUTOVER_PLAN.md`](./PARALLEL_RUN_AND_CUTOVER_PLAN.md)), the stub becomes a
real adapter and is wired into the **same** contract harness against a disposable test site:
```js
// future, not implemented now:
runStoreContract('SharePointStore(test-site)', async (seed) => provisionAndLoad(seed));
```

### 5a. Live test-site execution (Loop 22 / D28 — EXECUTED)
The contract has now run against the **live, non-production test site** through
`SharePointStore` + `SharePointLiveClient` + a git-ignored runtime transport, driven by the
gated runner [`run-live-contract.js`](../src/v2/backend/sharepoint/live/run-live-contract.js):
- **28 of 30 contract tests executed live and all passed** (2026-07-07), including
  requester-only Complete + required closing comment (D23), completedDate/Reopen, activity
  atomicity, comments/notes/tags, optional amount (D26), and metadata-only attachments (D24).
  The runner process was externally interrupted before the final two tests (lastActivityAt
  assertions, reference-data listing); those pass in the committed local async-transport
  contract and are re-run live when auth allows.
- The client path is **async end-to-end** (Loop 22): `SharePointLiveClient` awaits its
  transport, `SharePointStore` awaits every client call, and
  `tests/sharepoint-live-async-transport-contract.test.js` runs the FULL contract through
  that async path locally on every `npm test` — no network.
- **Data safety:** the runner seeds fixtures per test through the live client, tracks every
  record it creates, deletes exactly those (never lists, never pre-existing rows), and
  verifies post-run item counts match pre-run. Stale fixtures from an interrupted run are
  swept only with the operator-approved `staleFixtureSweep` config flag.

## 6. How contract tests protect backend migration
- **Acceptance gate (D13):** an adapter ships only when it passes the identical contract —
  no behavioral drift between backends.
- **Reference parity:** `MockStore` defines the expected behavior; the contract is the diff
  detector against it.
- **Reusable:** the contract takes a `makeStore(seed)` factory, so any backend that can load
  the standard seed can be verified with one line.
- **Catches regressions early:** auto-status, owner-only Complete, stream separation, and
  append-only activity are all locked down by executable tests, not prose.
- **Test-site execution (future):** how the harness will be reused against a disposable
  SharePoint test site — `makeStore` factory shape, isolation, cleanup, flake handling, and
  what counts as the first green run — is specified in
  [`STORE_CONTRACT_TEST_SITE_PLAN.md`](./STORE_CONTRACT_TEST_SITE_PLAN.md) (D16). It adds no
  real config or secrets.

## 7. No-live-integration guard
The contract harness and the `SharePointStore` stub are **local/design-only**:
- No network I/O; no Graph/SharePoint/Azure/Dataverse SDK; no `fetch`/`XMLHttpRequest`.
- No credentials, env vars, tenant/client IDs, secrets, or live URLs.
- Enforced by [`../src/v2/tests/safety.test.js`](../src/v2/tests/safety.test.js), the
  SharePointStore checks in
  [`../src/v2/tests/store-contract.test.js`](../src/v2/tests/store-contract.test.js), and the
  `SharePointStore adapter is design-only` check in
  [`../src/v2/scripts/validate.js`](../src/v2/scripts/validate.js). `MockStore` remains the
  only real backend.
