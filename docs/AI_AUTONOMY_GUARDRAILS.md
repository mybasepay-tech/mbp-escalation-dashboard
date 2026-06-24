# AI Autonomy Guardrails — Escalation System v2

> **Loop 11.** Defines what Claude/AI may decide **autonomously** while building v2, and what
> **requires explicit Rod/user approval**. The goal is to keep momentum on routine technical
> and documentation work without interrupting Rod, while making it **impossible** to take a
> consequential or production-affecting action without a human decision.
>
> This codifies the mission's autonomy instruction: *where a technical decision does not
> require approval and stays within safety guardrails, make it and document it; do not block on
> minor implementation/documentation choices.*

## 1. Operating principles
- **Reversible + local + non-production → decide and document.** If a choice only affects
  mock/local/design-only artifacts in this repo and is easily reversed, make it.
- **Irreversible, outward-facing, or production-touching → stop and ask.** Anything that
  touches legacy, creates real cloud resources, moves real data, or exposes users requires
  explicit approval first.
- **When in doubt, treat it as requiring approval.** Default to the safe side of the line.
- **Always leave a trail.** Autonomous decisions are recorded (decision log, doc text, or
  commit message) so they are visible and reversible.
- These guardrails **compose with** the repo safety rules and the
  [`../harness/NO_PRODUCTION_MODIFICATION_CHECKLIST.md`](../harness/NO_PRODUCTION_MODIFICATION_CHECKLIST.md);
  they never relax them.

## 2. AI MAY decide without approval (autonomous)
Within the approved direction (SharePoint v2 target, mock/local, no live integration):
- **Documentation structure & content** — organize, rewrite, and add design/technical docs.
- **Schema naming details** — column/list/view/index names *within* the approved
  `Escalations_v2_` convention and naming strategy.
- **Test organization** — add/refactor tests, the store contract, and test fixtures.
- **Mock data improvements** — extend/clean the local seed (kept fake; `*.invalid`, `user_*`,
  `esc_*`).
- **Validation checks** — add/adjust local readiness/safety checks in `scripts/validate.js`
  and test guards.
- **Adapter stub details** — method signatures, comments, and the design-only error shape in
  `SharePointStore` (kept inert; no network/SDKs).
- **Non-live internal implementation choices** — domain/rules/store refactors that preserve
  behavior and the `EscalationStore` contract.
- **Minor UI wording** in the mock/local v2 shell.
- **Technical doc updates** — keeping the docs consistent with decisions already made.

## 3. AI MUST request/require approval before (gated)
Each of these is a **hard stop** until Rod/user explicitly approves:
- **Touching the legacy dashboard, list, or flows** in any way (read-with-intent-to-write,
  edit, re-permission, disable).
- **Creating real SharePoint lists** (any non-disposable, or anything beyond an approved test
  site).
- **Connecting to Microsoft Graph / SharePoint live** or any production API.
- **Adding credentials, app registrations, environment variables, tenant/client IDs, secrets,
  or live URLs / API clients.**
- **Creating or modifying Power Automate flows** (PA stays deferred — D11).
- **Deploying Azure / Dataverse / API resources.**
- **Migrating production data** (applying migration beyond a reviewed, offline dry-run).
- **Enabling live users** on v2.
- **Cutover** (making v2 the system of record — Phase 6 of the parallel-run plan).
- **Writeback to legacy** (prohibited by **D15**; would need a separate explicit approval).

## 4. Quick reference
| Action | Autonomous? |
|--------|-------------|
| Edit/add docs, tests, validation, mock data | ✅ Yes |
| Name v2 columns/views within convention | ✅ Yes |
| Refactor domain/store keeping the contract + behavior | ✅ Yes |
| Flesh out the `SharePointStore` **stub** (still inert) | ✅ Yes |
| Touch legacy list/dashboard/flows | ⛔ Approval |
| Create real SharePoint lists / connect Graph/live | ⛔ Approval |
| Add secrets / app reg / env vars / live URLs | ⛔ Approval |
| Create/modify Power Automate flows | ⛔ Approval |
| Apply migration to real data / enable users / cutover | ⛔ Approval |
| Any writeback to legacy | ⛔ Approval |

## 5. Relationship to the decision log and checklists
- Approval checkpoints for the transition are enumerated in
  [`PARALLEL_RUN_AND_CUTOVER_PLAN.md`](./PARALLEL_RUN_AND_CUTOVER_PLAN.md) §8.
- Backend decision (**D3**), parallel-run (**D14**), and no-writeback (**D15**) are recorded in
  [`DECISION_LOG.md`](./DECISION_LOG.md).
- Live-build gates live in
  [`../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md`](../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md)
  and [`../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md`](../harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md).
