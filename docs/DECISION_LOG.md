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

### D17 — Local-first storage model (Loop 13)
- **Status:** **Accepted** (process/design decision).
- **Context:** It must be unambiguous where v2 artifacts and data live now vs. later, and that
  OneDrive-synced folders are not a backend.
- **Decision:**
  - **Now:** all v2 code and design artifacts are **repo-local and mock/design-only** under
    `C:\dev\mbp-escalation-dashboard` (v2 app at `…\src\v2`), tracked in git. `MockStore` is the
    active backend; no real data exists.
  - **Later (approval-gated):** real data lives **only** in dedicated SharePoint **v2 lists** —
    first a non-production **test site** (Phase 2), then production v2 lists via the staged
    cutover. Never in the repo, never in OneDrive.
  - **OneDrive synced folders are NOT backend storage** — specifically not
    `C:\Users\RodolfoChacon\OneDrive - myBasePay LLC\Information Technology - General`. They lack
    list semantics, concurrency, indexes, views, and item-level permissions, and are
    personal-scope. See [`LOCAL_FIRST_EXECUTION_MODEL.md`](./LOCAL_FIRST_EXECUTION_MODEL.md) §4.
- **Scope:** design-only. Reinforces D14 (legacy operational) and D15 (no writeback).
- **Blocks:** nothing; it is a standing storage-location rule.

### D18 — SharePoint v2 provisioning is scripted, config-driven, and fail-closed (Loop 14)
- **Status:** **Accepted** (Phase 2 approved by Rod/IT; controlled execution).
- **Context:** With Phase 2 approved, the test-site build must be repeatable, safe, and
  reviewable — not hand-clicked — and must be impossible to misfire against legacy/production.
- **Decision:**
  - Provisioning is performed by a **scripted, config-driven** package
    ([`../src/v2/backend/sharepoint/provisioning/`](../src/v2/backend/sharepoint/provisioning/)):
    `provision` / `validate` / `cleanup` PowerShell scripts plus a shared fail-closed safety
    helper, driven by the schema and an operator-supplied **git-ignored** config.
  - **Fail-closed & non-production-first:** every script refuses to act unless
    `phase2Approved=true`, `nonProductionOnly=true`, `legacyWritebackAllowed=false`,
    `powerAutomateAllowed=false`, a non-production `environmentLabel`, the `Escalations_v2_`
    prefix, and a non-legacy/non-production target. Live connection re-checks the connected web
    and aborts on legacy/production tokens.
  - **No secrets in git:** real config (`provision.config.json`) is git-ignored; scripts use
    interactive auth only and store no credentials. Missing module/auth → clear prerequisite
    error, never a fake result.
  - The package must **validate against the schema** (8 lists) and be confirmed before any
    `SharePointStore` adapter implementation proceeds (composes with D16's contract gate).
- **Scope:** execution-ready for a **non-production test site only**; no real lists are created
  by committing this package. No Power Automate, no legacy writeback, no production cutover.
- **Blocks:** nothing in-repo; it *governs* the Phase-2 build execution.

### D19 — SharePointStore is validated against a local simulator before live execution (Loop 15)
- **Status:** **Accepted** (design/local; no live work).
- **Context:** The adapter's tricky logic (ETag concurrency, ticket+activity atomicity, the D12
  one-active-link-per-(ticket,tag) rule, paging, null-not-found) should be proven with zero live
  dependencies before spending a live test site.
- **Decision:**
  - A local, in-memory **FakeSharePoint simulator**
    ([`../src/v2/backend/sharepoint/fake/`](../src/v2/backend/sharepoint/fake/)) models item
    ids, ETags, 404/412/429, paging, filtering, and active-link soft-delete — **no network, no
    SDKs, no auth, no URLs**.
  - **`SharePointStore`** is implemented to operate against an **injected** client and must pass
    the **same store contract** as `MockStore` (D13/D16), run against the simulator
    ([`../src/v2/tests/sharepoint-store-simulated-contract.test.js`](../src/v2/tests/sharepoint-store-simulated-contract.test.js)).
    Without an injected client it remains **fail-closed** (design-only).
  - The simulated green contract run is the **prerequisite** to live test-site execution; the
    live first-green run remains the true acceptance gate (real SharePoint quirks surface only
    there).
- **Scope:** fully local/simulated. `MockStore` remains the active UI backend; no live
  integration, no real lists, no legacy writeback, no Power Automate.
- **Blocks:** nothing; it *sequences* adapter validation ahead of live execution.

### D20 — SharePointStore must prove local resilience before live test-site execution (Loop 16)
- **Status:** **Accepted** (design/local; no live work).
- **Context:** A simulated happy-path contract pass (D19) doesn't exercise the failure modes a
  real tenant throws on day one. Those must be proven locally first.
- **Decision:** Before any live test-site run, `SharePointStore` must demonstrate, against the
  FakeSharePoint simulator, resilience to:
  - **Throttling (429):** bounded retry with injectable backoff (deterministic no-op sleep in
    tests); clear failure after the retry limit.
  - **ETag conflict (412):** re-read latest + re-apply the domain rule + retry; clear failure
    when unresolvable.
  - **Ticket + activity atomicity:** activity appends are **idempotent on ActivityKey** and
    retried on transient failure (no duplicate rows); a permanent append failure raises a clear
    **compensation error** (`ActivityAppendError`) rather than silently losing the row.
  - **Tag-link uniqueness:** exactly **one active** `Escalations_v2_TicketTags` row per
    (ticket, tag); stale-read/duplicate races are reconciled; soft-deleted links are reactivated,
    not duplicated.
  Proven by [`../src/v2/tests/sharepointstore-resilience.test.js`](../src/v2/tests/sharepointstore-resilience.test.js)
  and [`../src/v2/tests/sharepoint-mapping-fidelity.test.js`](../src/v2/tests/sharepoint-mapping-fidelity.test.js);
  the simulator gained operation-specific + repeatable failure injection.
- **Scope:** fully local/simulated. `MockStore` stays the active UI backend; no network, no
  SDKs, no real lists/flows, no legacy writeback. The live first-green contract run remains the
  true acceptance gate (real SharePoint quirks surface only there).
- **Blocks:** nothing; it *gates* readiness for live test-site execution.

### D21 — Live test-site execution uses a fail-closed real-client gate (Loop 17)
- **Status:** **Accepted** (gate is committed; live execution itself remains operator-run).
- **Context:** Going live needs a real SharePoint client *without* leaking tenant/site/app/user
  identifiers into git or letting committed code connect on its own.
- **Decision:**
  - A real **`SharePointLiveClient`** wrapper ([`../src/v2/backend/sharepoint/live/`](../src/v2/backend/sharepoint/live/))
    exposes the **same method surface** as `FakeSharePointClient`, so it drops into
    `SharePointStore`. It imports **no SDK**, hardcodes **no** tenant/client/site/user
    identifiers, makes **no** committed network call, and is **dependency-injected**: the real
    SDK + interactive auth live in an operator-supplied, **git-ignored** transport bootstrap.
    Without a transport it throws `LiveNotConfiguredError` (fail-closed).
  - A **gated runner** (`run-testsite-contract.js`) refuses to act unless a git-ignored config
    sets `phase2Approved`, `nonProductionOnly`, `legacyWritebackAllowed=false`,
    `powerAutomateAllowed=false`, and `contractRunApproved=true`, the label is non-production,
    the prefix is `Escalations_v2_`, and the target is not legacy/production. It loads the
    runtime transport, runs a read-only connectivity smoke, and points to the full store-contract
    run as the acceptance gate. Missing config/auth/transport → clear stop, **never** a fake run.
  - Runtime config (`testsite.config.json`), transport bootstraps, `.env`, and secrets are
    **git-ignored**; only `*.example.json` and the wrapper/runner/docs are committed.
- **Scope:** the gate + wrapper are committed and fully local-safe; no live identifiers/secrets,
  no real lists, no flows, no legacy writeback. Live execution happens only when an operator
  supplies the git-ignored config + auth against the approved non-production test site.
- **Blocks:** nothing in-repo; it *governs* the live test-site execution.

### D22 — Live execution requires local git-ignored config + transport; repo stays secret-free (Loop 18)
- **Status:** **Accepted** (execution-prep; no live run performed this loop).
- **Context:** The live run needs runtime config, auth, a transport bootstrap, and the
  `PnP.PowerShell` module — none of which are committed or available in CI. The committed repo
  must remain free of live identifiers and secrets **by construction**, and the ignore rules
  that guarantee this must not silently regress.
- **Decision:**
  - Runtime config (`provision.config.json`, `testsite.config.json`), the transport bootstrap
    (`transport.local.js` / `*.transport.js`), `.env`, auth caches, and live reports are
    **git-ignored** and **never committed**; only `*.example.json` + code/docs are tracked.
  - A committed **guard test** + a `npm run validate` check assert those ignore rules stay in
    place, so a future edit can't accidentally start tracking a secret-bearing file.
  - Live execution proceeds **only** when an operator supplies the git-ignored config + auth +
    transport against the approved **non-production** test site, and every fail-closed guard
    passes. Loop 18 verified the scripts **fail closed** on example defaults and that the
    runtime-config paths are git-ignored; it performed **no live run** (PnP module + approved
    site reference + auth not present).
- **Scope:** repo-level safety + execution-prep. `MockStore` remains the active UI backend; no
  live integration, no real lists/flows, no legacy writeback.
- **Blocks:** nothing in-repo; it documents and guards the live-execution preconditions.

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
| D17 | Local-first storage model (Loop 13) | Repo-local mock/design now; real data only in dedicated SharePoint v2 lists later; OneDrive is not backend storage | No (standing rule) | **Accepted** |
| D18 | Provisioning is scripted + fail-closed (Loop 14) | Config-driven, non-production-first PowerShell provisioning; no secrets in git; validate vs. schema before adapter | No (governs Phase 2) | **Accepted** (Phase 2 approved) |
| D19 | Simulator-first adapter validation (Loop 15) | SharePointStore passes the store contract against a local FakeSharePoint simulator before live execution | No (sequences adapter work) | **Accepted** (local/simulated) |
| D20 | Adapter resilience hardening (Loop 16) | Prove throttling retry, ETag conflict retry, activity idempotency/compensation, tag-link uniqueness locally before live | No (gates live readiness) | **Accepted** (local/simulated) |
| D21 | Live real-client execution gate (Loop 17) | Fail-closed `SharePointLiveClient` (injected transport, no SDK/secrets in git) + gated runner; store-contract acceptance | No (governs live execution) | **Accepted** (gate committed) |
| D22 | Live execution prerequisites (Loop 18) | Runtime config + transport bootstrap stay local/git-ignored; committed guard keeps repo secret-free; no live run yet | No (execution-prep) | **Accepted** (prep only) |
| D23 | Requester-only closure + closing comment (Loop 21) | Only the requester (`submitterId`) may Complete; a non-empty final closing comment is required and stored/audited | No (stakeholder rule) | **Accepted** |
| D24 | Attachments metadata-first (Loop 21) | `Escalations_v2_Attachments` stores metadata only; no file bytes, no document library; real upload deferred | No (stakeholder rule) | **Accepted** |
| D25 | Priority-based no-movement reminders, local-only (Loop 21) | `lastActivityAt` + thresholds (Critical 2 / High 3 / Medium 7 / Low 14 days) flag candidates locally; no notifications, no flows | No (stakeholder rule) | **Accepted** |
| D26 | Optional amount involved (Loop 21) | `amountInvolved` (Currency, optional, non-negative) + `amountCurrency` (default USD) on tickets | No (stakeholder rule) | **Accepted** |
| D27 | Columns/indexes/views provisioned on nonprod test site (Loop 21) | Schema 0.3.0-design fully provisioned + validated live against the approved non-production site only | No (nonprod only) | **Accepted** (executed) |
| D28 | Live store-contract execution (Loop 22) | Full EscalationStore contract executed against the live nonprod test site via SharePointStore + SharePointLiveClient + runtime transport; async client path committed and contract-tested locally | No (nonprod only) | **Accepted** (executed — see log entry for coverage detail) |
| D29 | UI backend toggle, disabled by default (Loop 23) | v2 UI supports the SharePoint TEST backend behind a dual opt-in (git-ignored server config + explicit `?backend=sharepoint-test`); MockStore stays the default; loopback-only API keeps secrets out of the browser | No (opt-in, nonprod only) | **Accepted** (implemented + smoke-tested) |
| D30 | Namespaced demo fixtures + gated seed/cleanup (Loop 24) | Demo data on the test site is a small `esc_demo_loop24_*` fixture set, seeded idempotently by a gated CLI with exact-key cleanup to zero leftovers; full UI lifecycle smoke passed live incl. both closure-rule refusals | No (test-only data) | **Accepted** (executed + cleaned) |

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
- **D17 — Local-first storage model (Loop 13): Accepted (design-only).** Repo-local
  mock/design artifacts now (`C:\dev\mbp-escalation-dashboard`); real data only in dedicated
  SharePoint v2 lists later (test site → production, gated). OneDrive synced folders are not
  backend storage.
- **D18 — Provisioning scripted + fail-closed (Loop 14): Accepted.** Phase 2 approved;
  provisioning is a config-driven, non-production-first, fail-closed PowerShell package with no
  secrets in git, validated against the schema before adapter implementation. No live lists are
  created by committing it; execution requires an operator's git-ignored config + interactive
  auth against the approved test site.
- **D19 — Simulator-first adapter validation (Loop 15): Accepted.** `SharePointStore` is
  implemented against an injected client and passes the same store contract as `MockStore` via a
  local, in-memory FakeSharePoint simulator (no network/SDK/auth). Default (no client) stays
  fail-closed. This precedes — and de-risks — live test-site execution.
- **D20 — Adapter resilience hardening (Loop 16): Accepted.** `SharePointStore` proves local
  resilience to throttling (bounded retry), ETag conflicts (re-read + retry), activity append
  idempotency/compensation, and one-active tag-link uniqueness — all against the simulator, with
  no live work. The live first-green run remains the true acceptance gate.
- **D21 — Live real-client execution gate (Loop 17): Accepted.** A fail-closed
  `SharePointLiveClient` (same surface as the fake; injected runtime transport; no SDK, secrets,
  or identifiers in git) plus a gated runner enforce approvals and refuse legacy/production. Live
  execution runs only with operator-supplied git-ignored config + interactive auth against the
  approved non-production test site; the store-contract first-green run is the acceptance gate.
- **D22 — Live execution prerequisites (Loop 18): Accepted.** Runtime config + transport
  bootstrap stay local and git-ignored; a committed guard test + validate check keep the repo
  secret-free. Loop 18 verified fail-closed behavior and ignore rules but performed no live run
  (PnP module + approved site reference + auth not present).
- **D23 — Requester-only closure + required closing comment (Loop 21, stakeholder): Accepted.**
  Official ticket closure (Complete) is restricted to the requester/creator (`submitterId`).
  The assignee, the ticket owner, and department leads do NOT gain closure authority unless
  they are also the requester. Completing requires a non-empty final closing comment, stored
  as `finalClosureNote` on the ticket and carried in the `status_change` activity event;
  Reopen clears `completedDate`/`finalClosureNote` while the activity stream preserves closure
  history. Supersedes the Loop 7 owner-only rule; `ticketOwner` remains as the
  queue-accountability owner only.
- **D24 — Attachments are metadata-first (Loop 21, stakeholder): Accepted.** Tickets support
  attachments as METADATA records in a new `Escalations_v2_Attachments` list (fileName,
  placeholder fileUrl/storage ref, mimeType, sizeBytes, uploadedBy/At, source, soft-delete).
  No file bytes are uploaded, and no live document library is provisioned or touched in the
  MVP — real file storage/upload is deferred to a later, explicitly approved loop.
- **D25 — No-movement reminders are priority-based, local-calculation only (Loop 21,
  stakeholder): Accepted.** A ticket with no movement (status/assignment/priority/tag change,
  comment, note, or attachment — tracked via `lastActivityAt`) past its priority threshold
  (Critical 2, High 3, Medium/normal 7, Low 14 calendar days) becomes a reminder CANDIDATE,
  surfaced as local UI indicators/filters only. Actual notification sending is deferred: no
  Power Automate flow is created and no email/Teams message is sent.
- **D26 — Optional amount involved (Loop 21, stakeholder): Accepted.** Tickets carry an
  optional `amountInvolved` (non-negative number, Currency column) with `amountCurrency`
  defaulting to USD. Setting/clearing it records a `field_change` activity event.
- **D27 — SharePoint columns/indexes/views provisioned on the nonprod test site (Loop 21):
  Accepted (executed).** Schema 0.3.0-design (9 `Escalations_v2_*` lists incl. Attachments)
  was provisioned live — columns, lookups, indexes, and views — idempotently against the
  approved NON-PRODUCTION test site only, and validated read-only as fully matching the
  schema. Views with dynamic filters (`[param]`/`[Me]`/status sets) are applied by the adapter
  at query time and are never faked into stored views. No legacy list touched, no Power
  Automate created, no production cutover.
- **D28 — Live store-contract execution (Loop 22): Accepted (executed).** The full
  EscalationStore behavioral contract ran against the LIVE non-production test site through
  `SharePointStore` + `SharePointLiveClient` + an operator-supplied, git-ignored runtime
  transport (SharePoint REST; token minted via PnP interactive auth). ALL 30 contract tests
  executed live and passed — including requester-only Complete, the required final closing
  comment, completedDate/Reopen behavior, comments/notes/tags, optional amount, metadata-only
  attachments, and the lastActivityAt movement stamp (28 in the main session; the final two
  re-run green in a follow-up session after an interactive-auth delay). Post-run verification:
  every run-created record was deleted and item counts match pre-run exactly — the lists were
  left empty, as found. Committed
  hardening from this loop: `SharePointLiveClient` and `SharePointStore` are fully
  async-client-safe (awaited `findBy`/`createItem` — without this, activity rows silently stop
  being written against a real backend), a full local contract now runs through the async
  live-client path, and `run-live-contract.js` seeds per test, tracks every record it creates,
  deletes ONLY those, and verifies post-run counts match pre-run. Run-created records are
  contract fixtures with fixture keys (`esc_*`, `user_*`, `tag_*`, `dept_*`, …); if a future
  run is interrupted, stale fixtures are reported and removable via the operator-approved
  `staleFixtureSweep` config flag. No legacy touched, no flows, no notifications, no real
  files, no cutover; MockStore remains the local UI backend.

- **D29 — UI backend toggle, disabled by default (Loop 23): Accepted.** The v2 UI can use the
  SharePoint TEST backend, but only behind a DUAL opt-in: (1) a git-ignored
  `ui/ui-live.local.json` with `enableSharePointTestBackend=true` on the local UI server —
  which then re-runs the Loop 22 fail-closed safety gate (approvals, non-production label,
  `Escalations_v2_` prefix, legacy/production refusal) before loading the git-ignored
  transport; and (2) an explicit `?backend=sharepoint-test` query in the browser. MockStore
  remains the default in every other case (including unknown query values). The browser talks
  ONLY to loopback `/api/store/*` endpoints on `ui/serve.js`; the SharePoint client, runtime
  config, and token live server-side and never reach the browser or git. A visible backend
  indicator + warning banner state the active backend; a missing/unsafe opt-in yields a
  visible error with NO silent fallback. Supervised smoke: one namespaced ticket created,
  read, and updated live through the UI seam, then deleted (0 remaining). No production
  users, no cutover, no flows, no notifications, no real attachment files.

- **D30 — Namespaced demo fixtures + gated seed/cleanup (Loop 24): Accepted (executed +
  cleaned).** Demo reference data for the SharePoint TEST backend is a small, fixed,
  obviously test-only set (1 department, 2 users, 1 tag; every key prefixed
  `esc_demo_loop24_`, labels marked TEST ONLY, emails on `.invalid`), seeded by a gated CLI
  (`live/seed-demo-fixtures.js`) that is idempotent (created vs reused reported) and cleans
  up by EXACT keys only — fixtures plus explicitly named demo tickets and their
  activity/comments/notes/tag links/attachment metadata — refusing anything outside the
  namespace. Live execution: seeded twice (4 created, then 4 reused), full supervised UI
  lifecycle smoke passed (including live refusal of Complete without a closing note and of
  a non-requester Complete, then requester Complete + Reopen), and cleanup removed all 19
  records with 0 leftovers. The UI gained a minimal "New demo ticket" form that always
  creates `esc_demo_loop24_*` ids. No legacy, no flows, no notifications, no real files,
  no production users, no cutover.

_D2, D9, and D10 are demonstrated in the mock MVP but remain Proposed pending Rod confirmation.
D4 and D5 are superseded by D10. With D3 decided (SharePoint v2, Loop 11), D11's provisional
target is confirmed; Power Automate stays deferred and live integration stays blocked until
explicit approval (D6/D7)._
