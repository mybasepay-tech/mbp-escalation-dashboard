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
- **Status:** Open (needs Rod)
- **Context:** Legacy `Complete` is terminal-ish; v2 splits Resolved vs Closed.
- **Options:** (a) `Complete` → **Closed** when `ResolvedDate` set, else **Resolved**;
  (b) always **Closed**; (c) always **Resolved (awaiting closure)**.
- **Recommendation:** (a). Record original in migration note.
- **Blocks:** Phase 7 mapping finalization.

### D5 — Pending-* collapse
- **Status:** Open (needs Rod)
- **Context:** Legacy has Pending Member / Pending Research / Pending Customer.
- **Options:** (a) collapse all into **Pending Review** (preserve original in note);
  (b) keep distinct pending sub-states in v2.
- **Recommendation:** (a) for MVP simplicity; revisit if leads need the distinction.
- **Blocks:** Phase 2 status set + Phase 7 mapping.

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

---

## Resolved
_(none yet)_
