# Decision Log — Escalation System v2

> Records decisions that shape v2. Each has a status: **Open** (needs input, usually Rod),
> **Proposed** (we recommend; awaiting confirmation), **Decided**, or **Deferred**.
> Open/Proposed items that block implementation are also surfaced in
> [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) and
> [`RISKS_AND_OPEN_QUESTIONS.md`](./RISKS_AND_OPEN_QUESTIONS.md).

## How to use
- Add a row when a choice is made or a question is raised.
- When an Open item is resolved, set status **Decided**, date it, and note the rationale.
- Reference decisions by ID (D1, D2, …) from other docs.

---

## Decisions

### D1 — v2 app stack & hosting
- **Status:** Open (needs Rod)
- **Context:** Legacy is a single-file HTML app on SharePoint SiteAssets. v2 should be the
  official UX and remain cloud/API-ready.
- **Options:** (a) SPA (e.g. React/TS) on a dedicated static host; (b) SPA on SharePoint
  SiteAssets like legacy; (c) continue single-file approach.
- **Recommendation:** (a) component-based SPA with a clean DAL seam.
- **Blocks:** Phase 0.

### D2 — Assignment-driven auto-status behavior
- **Status:** Proposed (needs Rod confirm)
- **Context:** Legacy suffered status/assignee drift (#307). v2 can auto-set status on
  assignment, or only warn.
- **Options:** (a) **Auto** — assigning a person moves `New`/`Not yet assigned` →
  `Assigned`; clearing the assignee on `Assigned` reverts to `Not yet assigned`;
  (b) **Prompt** — suggest the change, user confirms; (c) **Warn only** (legacy behavior).
- **Recommendation:** (a) Auto for forward moves, with activity entries; never auto-advance
  past `In Progress`. See [`STATUS_WORKFLOW.md`](./STATUS_WORKFLOW.md) §3.
- **Blocks:** Phase 2.

### D3 — Target backend
- **Status:** **DECIDED (Loop 11) — SharePoint List v2 / Microsoft List v2.**
- **Decision (Rod/user, Loop 11):** The backend target is **SharePoint List v2 /
  Microsoft List v2**. This resolves the previously-open, blocking choice and confirms the
  provisional direction in D11 as the accepted target.
- **Context:** SharePoint is already the team's environment and hosts the legacy tracker;
  the v2 lists are new and isolated (prefixed `Escalations_v2_`). The design stays swappable
  behind `EscalationStore` (the seam is preserved), so a future re-platform remains possible
  but is not planned.
- **Options considered:** (a) Managed DB + API (e.g. Postgres/Cosmos); (b) Dataverse;
  (c) **SharePoint List v2** ← chosen.
- **Rationale:** lowest friction to a working backend, familiar to operators, native
  views/indexes/permissions, and full separation from legacy. Dataverse/API remain
  reconsiderable later only if SharePoint limits (e.g. list-view threshold, cross-list
  reporting, row-level security) become blocking — see
  [`SHAREPOINT_V2_BACKEND_READINESS.md`](./SHAREPOINT_V2_BACKEND_READINESS.md) §11.
- **Still blocked (separate decisions):** building real lists / live integration remains
  gated by **D6** (Entra app), **D7** (legacy read access), and the dry-run / backend-adapter
  checklists. Deciding the target does **not** authorize any live build. Power Automate stays
  **deferred** (D11); `SharePointStore` stays a **design-only stub** (D13) until live-build
  approval; Graph/live integration stays **blocked** until explicit approval.
- See also **D14** (parallel-run transition) and **D15** (no legacy writeback).

### D4 — "Complete" → v2 status mapping
- **Status:** Superseded by **D10** (Loop 7)
- **Context:** Earlier mock builds split closure into Resolved vs Closed.
- **Loop 7 outcome:** v2 now has a **single** `Complete` closure state (no separate
  Resolved/Closed). Legacy `Complete` maps 1:1; set `completedDate` if a resolved/closed
  date is present. See D10 and [`STATUS_WORKFLOW.md`](./STATUS_WORKFLOW.md) §5.

### D5 — Pending-* collapse
- **Status:** Superseded by **D10** (Loop 7)
- **Context:** Legacy has Pending Member / Pending Research / Pending Customer.
- **Loop 7 outcome:** v2 **keeps the three distinct Pending-\* states** (no collapse) to
  match the familiar legacy vocabulary. Earlier "Pending Review" stand-in is removed.

### D10 — Status vocabulary alignment + owner-only Complete (Loop 7)
- **Status:** Proposed (needs Rod confirm) — demonstrated in mock
- **Context:** Earlier mock builds used stand-in statuses (In Progress / Pending Review /
  Resolved / Closed) that did not match what leads actually use. Loop 7 realigns v2 to the
  real legacy vocabulary and clarifies who may close a ticket.
- **Decision (demonstrated):**
  - Statuses: New, Not yet assigned, Assigned, **In Process**, **Pending Research**,
    **Pending Member**, **Pending Customer**, **Complete**, Cancelled, Reopened.
  - **Complete** is the single final official closure state, and is **owner-only**:
    only `ticketOwner` may move a ticket to Complete (`assigneeId`/worker may not).
  - Data model adds **`ticketOwner`** and replaces `resolvedDate`/`closedDate` with a single
    **`completedDate`** (set on Complete, cleared on Reopened).
- **Blocks:** nothing (mock-only); supersedes D4 and D5.
- See [`STATUS_WORKFLOW.md`](./STATUS_WORKFLOW.md) §1–§3 and
  [`DATA_MODEL.md`](./DATA_MODEL.md) §2.

### D6 — Entra app registration
- **Status:** Open (needs Rod)
- **Context:** Legacy uses Entra app `c1b03319-…`. Permission isolation matters.
- **Options:** (a) **new** v2 Entra app with its own scopes; (b) reuse legacy app.
- **Recommendation:** (a) so legacy permissions are never altered (hard rule #3).
- **Blocks:** any live auth work (post-MVP).

### D7 — Legacy read access for migration dry-run
- **Status:** Open (needs Rod)
- **Context:** Dry-run needs legacy data; we must not connect to live SharePoint without
  approval.
- **Options:** (a) Rod provides a **read-only export/sample** to run dry-run offline;
  (b) approved **read-only** Graph access to legacy lists.
- **Recommendation:** (a) first (fully offline, safest), (b) later if needed.
- **Blocks:** Phase 7 against real data.

### D8 — Authoritative department/queue list
- **Status:** Open (needs Rod/Teri)
- **Context:** `EscalationTeams` must be seeded with real departments and leads.
- **Recommendation:** Seed from legacy "Escalations Dept Leads" (read-only) during dry-run;
  confirm the canonical list with Rod/Teri.
- **Blocks:** Phase 3 realistic seeding (mock placeholders fine earlier).

### D9 — Generic MVP config (required fields, categories, columns)
- **Status:** Proposed (needs Rod confirm)
- **Context:** MVP ships one generic `EscalationSettings`.
- **Recommendation:** Mirror legacy required fields/categories (urgency, issue type, issue
  category detail, assigned dept) as the generic default; refine with stakeholders.
- **Blocks:** Phase 4/6 defaults.

### D11 — MVP phase-1 backend readiness path (Loop 8)
- **Status:** Proposed (needs Rod confirm) — design-only, no live integration built
- **Context:** v2 needs a concrete *readiness* target so the data model and adapter seam can
  be prepared, without committing to live work while D3 is still open. Loop 8 prepares the
  ground without building anything live.
- **Decision (provisional / design-only):**
  - **Backend readiness target:** **SharePoint List v2** (lists prefixed `Escalations_v2_`
    on a company-owned site, fully separate from the legacy tracker). Provisional and
    reversible — it sits behind the `EscalationStore` seam and does **not** pre-empt D3.
  - **Power Automate: deferred for MVP phase 1.** Business rules stay in the tested domain
    layer (`domain/rules.js`); no flows are created. Notifications/automation are revisited
    later (additive flow, Graph subscription, or app-side) when concretely required.
  - **No live integrations yet:** no Graph/SharePoint/Dataverse/Azure connection code, no
    credentials/tenant/client IDs/secrets/live URLs, no real lists, no real flows.
  - Artifacts: design-only schema
    [`../src/v2/backend/sharepoint/schema.sharepoint-v2.json`](../src/v2/backend/sharepoint/schema.sharepoint-v2.json),
    [`SHAREPOINT_V2_BACKEND_READINESS.md`](./SHAREPOINT_V2_BACKEND_READINESS.md), and
    [`BACKEND_ADAPTER_PLAN.md`](./BACKEND_ADAPTER_PLAN.md).
- **Relationship to D3:** D11 is the *phase-1 readiness* path; **D3** (final backend:
  SharePoint vs. managed API/DB vs. Dataverse) remains **Open — BLOCKING** for any live work.
- **Blocks:** nothing (design-only). Live work still blocked by D3/D6/D7 and the
  backend-adapter readiness checklist.

### D12 — Tags use a dedicated many-to-many link list (Loop 9)
- **Status:** **Accepted** for v2 backend readiness (design-only; supersedes the Loop 8
  open question OQ-3).
- **Context:** Loop 8 left the tag representation open: a comma-delimited tag field on
  `Escalations_v2_Tickets` vs. a dedicated link list. A delimited field is hard to filter,
  report on, audit, de-duplicate, and migrate.
- **Decision:**
  - **Do NOT** store tags as a comma-delimited field on `Escalations_v2_Tickets`.
  - Use three lists: **`Escalations_v2_Tickets`**, **`Escalations_v2_Tags`** (the tag
    **dictionary**), and **`Escalations_v2_TicketTags`** (the many-to-many **link** list that
    is the **source of truth** for ticket↔tag relationships).
  - `Escalations_v2_TicketTags` carries `TicketKey`/`TagKey` lookups, a `TagLabelSnapshot`,
    `Source`, soft-delete (`IsActive`/`RemovedAt`), `CreatedAt`, and `CreatedBy`.
  - The Ticket model's `tagIds` array is **materialized at read time** from active links —
    never persisted on the ticket.
  - Views/indexes support querying **tags by ticket** and **tickets by tag**.
- **Reason:** cleaner filtering, reporting, auditing, de-duplication, and future migration.
- **Scope:** design-only. Enforced by the schema, `scripts/validateSharePointSchema.js`, and
  `tests/sharepoint-schema.test.js`. No live integration. `EscalationStore`/`MockStore`
  semantics for tags are unchanged (the mock continues to expose `tagIds`).
- **Blocks:** nothing (design-only). Reflected in the schema (`tagModel:
  many-to-many-link-list`) and the admin build package.

### D13 — Store contract tests are the acceptance gate for any backend adapter (Loop 10)
- **Status:** **Accepted** (design-only; process decision).
- **Context:** A future `SharePointStore` (or any other backend) must not introduce
  behavioral drift from the mock MVP. We need an objective, executable definition of "the
  adapter is correct."
- **Decision:**
  - The reusable **store contract** ([`../src/v2/tests/store-contract/contract.js`](../src/v2/tests/store-contract/contract.js))
    is the single source of behavioral truth for `EscalationStore` implementations.
  - It runs against **`MockStore`** today and is the **mandatory acceptance gate** for any
    future adapter: an adapter ships only when it **passes the identical contract** (run
    against a disposable test site for `SharePointStore`).
  - **`SharePointStore`** is added as a **design-only stub** that mirrors the interface and
    throws a clear design-only error on every operation — no network, no SDKs, no secrets.
  - Contract scope is documented in [`STORE_CONTRACT.md`](./STORE_CONTRACT.md).
- **Scope:** design-only / process. No live integration. `EscalationStore`/`MockStore`
  behavior is unchanged.
- **Blocks:** nothing now; it *gates* the future adapter build (composes with D3/D6/D7 and the
  backend-adapter / dry-run checklists).

### D14 — Parallel-run transition (Loop 11)
- **Status:** **Accepted** (Rod/user, Loop 11).
- **Context:** The legacy SharePoint/List process must keep working while the v2 SharePoint
  backend is built and validated. A hard, immediate replacement is not acceptable.
- **Decision:** Adopt a **parallel-run / staged-cutover** strategy. The legacy tracker
  **remains operational and the source of truth for users** while v2 is built separately,
  test-built on a v2 site, populated by dry-run migration, validated in parallel, demoed for
  acceptance, and only then cut over — with rollback available at every step. Legacy may be
  treated as a **read-only** source/reference/export during migration planning.
- **Phases & gates:** see [`PARALLEL_RUN_AND_CUTOVER_PLAN.md`](./PARALLEL_RUN_AND_CUTOVER_PLAN.md)
  (supersedes the older scaffold in [`CUTOVER_PLAN.md`](./CUTOVER_PLAN.md)).
- **Blocks:** nothing now (planning only). Cutover itself requires explicit Rod approval.

### D15 — Legacy writeback policy (Loop 11)
- **Status:** **Accepted** (Rod/user, Loop 11).
- **Decision:** **No writeback to the legacy tracker** during MVP, build, or migration —
  no field updates, status fixes, deletes, schema/permission/flow changes. Legacy is
  **read-only** to v2 work. Any future writeback would require a **separate, explicit**
  approval and its own decision entry. Drift is corrected **in the v2 copy only**, always
  with a `migration_normalization` note (see [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md) §4).
- **Enforced by:** the no-writeback language across the migration/cutover docs and the
  validator doc-guard check added in Loop 11.
- **Blocks:** nothing now; it is a standing prohibition.

### D16 — Phase-2 test-site build is runbook-driven and contract-validated (Loop 12)
- **Status:** **Accepted** (process/design decision).
- **Context:** When D6/D7 + Rod approval exist, the Phase-2 test-site build must be executable
  mechanically and verifiable objectively — not ad hoc.
- **Decision:**
  - The Phase-2 build follows the **runbook**
    ([`SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md`](./SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md))
    step-by-step on a **disposable, company-owned, non-production** test site.
  - The future `SharePointStore` follows the **implementation plan**
    ([`SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md`](./SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md)).
  - The adapter must achieve a **first green run of the store contract** (D13) against the test
    site, per [`STORE_CONTRACT_TEST_SITE_PLAN.md`](./STORE_CONTRACT_TEST_SITE_PLAN.md), **before
    any production consideration**.
- **Scope:** design-only / process. No live integration, no real lists/flows, no legacy
  writeback. `SharePointStore` stays a stub until the approvals land.
- **Blocks:** nothing now; it *gates* Phase-2 execution and any later production step (composes
  with D6/D7 and the dry-run / backend-adapter checklists).

---

## Post-mock-MVP status (Loop 6)

> The mock MVP **demonstrates** behavior but **approves nothing**. Decisions stay as marked
> until Rod explicitly approves them. "Demonstrated in mock" ≠ "decided".

| ID | Topic | Recommendation after mock MVP | Blocks backend work? | Status |
|----|-------|-------------------------------|----------------------|--------|
| D1 | App stack / hosting | Component SPA behind the DAL (mock shell proves the shape) | No | Open |
| D2 | Auto-status behavior | Keep **auto** forward (New/Not-yet-assigned → Assigned); demonstrated, tests green | No | Proposed — needs Rod confirm |
| D3 | Target backend | **SharePoint List v2 / Microsoft List v2** (chosen Loop 11) | Live build still gated by D6/D7 | **DECIDED — SharePoint v2** |
| D4 | "Complete" mapping | **Superseded by D10** — single `Complete` state, maps 1:1 | Yes (migration mapping) | Superseded |
| D5 | Pending-* collapse | **Superseded by D10** — keep 3 distinct Pending-* states | Yes (migration mapping) | Superseded |
| D6 | Entra app registration | New v2 app (isolate from legacy) | **YES** (any live auth) | **Open — BLOCKING** |
| D7 | Legacy read access (dry-run) | Offline read-only export/sample first | **YES** (dry-run vs. real data) | **Open — BLOCKING** |
| D8 | Dept/queue list | Confirm canonical departments + leads | Yes (seed realism) | Open |
| D9 | Generic MVP config | Mirror legacy required fields/categories (generic default in place) | No | Proposed — needs Rod confirm |
| D10 | Status vocab + owner-only Complete (Loop 7) | Align to legacy vocabulary; `Complete` owner-only; add `ticketOwner`/`completedDate` | No (mock-only) | Proposed — needs Rod confirm |
| D11 | MVP phase-1 backend readiness (Loop 8) | SharePoint List v2 target, Power Automate deferred, no live integrations yet (design-only) | No (design-only) | **Confirmed via D3 (Loop 11)** — PA still deferred |
| D12 | Tag model (Loop 9) | Dedicated many-to-many `Escalations_v2_TicketTags` link list; no delimited tag field on Tickets | No (design-only) | **Accepted** (design-only) |
| D13 | Adapter acceptance gate (Loop 10) | Store contract tests gate any backend adapter; `SharePointStore` is a design-only stub | No (design-only) | **Accepted** (design-only) |
| D14 | Parallel-run transition (Loop 11) | Legacy stays operational; v2 built separately; staged cutover with rollback | No (planning) | **Accepted** |
| D15 | Legacy writeback policy (Loop 11) | No writeback to legacy during MVP/build/migration unless separately approved | No (standing rule) | **Accepted** |
| D16 | Phase-2 build governance (Loop 12) | Test-site build is runbook-driven; adapter must pass the store contract before any production step | No (gates Phase 2) | **Accepted** |

## Rod review required (before backend work)
These must be **explicitly approved by Rod** before any backend adapter / SharePoint / Graph
/ Dataverse / migration-dry-run work starts:

1. ~~**D3** backend choice.~~ **DECIDED (Loop 11): SharePoint List v2.**
2. **D6** Entra app decision.
3. **D7** legacy read-access method for the migration dry-run.
4. Company-owned site/resource confirmation (v2 must not live on a personal site).
5. Migration dry-run approval (read-only, **no write-back** to legacy — see **D15**).
6. Rollback / **no-cutover** confirmation (legacy stays live and untouched — see **D14**).

Full gate: [`../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md`](../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md).
Readiness context: [`MOCK_MVP_READINESS_REVIEW.md`](./MOCK_MVP_READINESS_REVIEW.md).

---

## Resolved
- **D3 — Target backend (Loop 11): DECIDED — SharePoint List v2 / Microsoft List v2.** The
  previously-blocking backend choice is closed. Deciding the target does not authorize any
  live build (still gated by D6/D7 and the checklists).
- **D14 — Parallel-run transition (Loop 11): Accepted.** Legacy stays operational while v2 is
  built separately; staged cutover with rollback. See
  [`PARALLEL_RUN_AND_CUTOVER_PLAN.md`](./PARALLEL_RUN_AND_CUTOVER_PLAN.md).
- **D15 — Legacy writeback policy (Loop 11): Accepted.** No writeback to legacy during
  MVP/build/migration unless separately approved.
- **D12 — Tag model (Loop 9): Accepted (design-only).** Tags use a dedicated many-to-many
  `Escalations_v2_TicketTags` link list; no delimited tag field on Tickets.
- **D13 — Adapter acceptance gate (Loop 10): Accepted (design-only).** The store contract
  tests are the mandatory acceptance gate for any future backend adapter; `SharePointStore`
  is a design-only stub.
- **D16 — Phase-2 build governance (Loop 12): Accepted (design-only).** The test-site build is
  runbook-driven and the adapter must pass the store contract (D13) on a disposable test site
  before any production consideration. No live work is authorized.

_D2, D9, and D10 are demonstrated in the mock MVP but remain Proposed pending Rod confirmation.
D4 and D5 are superseded by D10. With D3 decided (SharePoint v2, Loop 11), D11's provisional
target is confirmed; Power Automate stays deferred and live integration stays blocked until
explicit approval (D6/D7)._
