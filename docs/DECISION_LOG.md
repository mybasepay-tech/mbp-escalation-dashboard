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
- **Status:** Open (needs Rod)
- **Context:** SharePoint is acceptable as a temporary backend; design must be swappable.
- **Options:** (a) Managed DB + API (e.g. Postgres/Cosmos); (b) **Dataverse**;
  (c) stay on SharePoint lists long-term.
- **Recommendation:** Keep the DAL backend-agnostic now; decide before any live backend
  work. Dataverse is attractive for Power Platform/Entra alignment.
- **Blocks:** post-MVP live backend (not MVP, which is mock-first).

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

---

## Post-mock-MVP status (Loop 6)

> The mock MVP **demonstrates** behavior but **approves nothing**. Decisions stay as marked
> until Rod explicitly approves them. "Demonstrated in mock" ≠ "decided".

| ID | Topic | Recommendation after mock MVP | Blocks backend work? | Status |
|----|-------|-------------------------------|----------------------|--------|
| D1 | App stack / hosting | Component SPA behind the DAL (mock shell proves the shape) | No | Open |
| D2 | Auto-status behavior | Keep **auto** forward (New/Not-yet-assigned → Assigned); demonstrated, tests green | No | Proposed — needs Rod confirm |
| D3 | Target backend | Decide before any adapter: SharePoint (temp) vs. API+DB vs. **Dataverse** | **YES** | **Open — BLOCKING** |
| D4 | "Complete" mapping | **Superseded by D10** — single `Complete` state, maps 1:1 | Yes (migration mapping) | Superseded |
| D5 | Pending-* collapse | **Superseded by D10** — keep 3 distinct Pending-* states | Yes (migration mapping) | Superseded |
| D6 | Entra app registration | New v2 app (isolate from legacy) | **YES** (any live auth) | **Open — BLOCKING** |
| D7 | Legacy read access (dry-run) | Offline read-only export/sample first | **YES** (dry-run vs. real data) | **Open — BLOCKING** |
| D8 | Dept/queue list | Confirm canonical departments + leads | Yes (seed realism) | Open |
| D9 | Generic MVP config | Mirror legacy required fields/categories (generic default in place) | No | Proposed — needs Rod confirm |
| D10 | Status vocab + owner-only Complete (Loop 7) | Align to legacy vocabulary; `Complete` owner-only; add `ticketOwner`/`completedDate` | No (mock-only) | Proposed — needs Rod confirm |
| D11 | MVP phase-1 backend readiness (Loop 8) | SharePoint List v2 target, Power Automate deferred, no live integrations yet (design-only) | No (design-only) | Proposed — needs Rod confirm |
| D12 | Tag model (Loop 9) | Dedicated many-to-many `Escalations_v2_TicketTags` link list; no delimited tag field on Tickets | No (design-only) | **Accepted** (design-only) |

## Rod review required (before backend work)
These must be **explicitly approved by Rod** before any backend adapter / SharePoint / Graph
/ Dataverse / migration-dry-run work starts:

1. **D3** backend choice.
2. **D6** Entra app decision.
3. **D7** legacy read-access method for the migration dry-run.
4. Company-owned site/resource confirmation (v2 must not live on a personal site).
5. Migration dry-run approval (read-only, **no write-back** to legacy).
6. Rollback / **no-cutover** confirmation (legacy stays live and untouched).

Full gate: [`../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md`](../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md).
Readiness context: [`MOCK_MVP_READINESS_REVIEW.md`](./MOCK_MVP_READINESS_REVIEW.md).

---

## Resolved
- **D12 — Tag model (Loop 9): Accepted (design-only).** Tags use a dedicated many-to-many
  `Escalations_v2_TicketTags` link list; no delimited tag field on Tickets. This is a
  design/schema decision with no live impact and does not pre-empt the blocking D3.

_D2, D9, D10, and D11 are demonstrated / designed in the mock MVP but remain Proposed pending
Rod confirmation. D4 and D5 are superseded by D10. D11 is design-only and does not pre-empt
the still-open, blocking D3._
