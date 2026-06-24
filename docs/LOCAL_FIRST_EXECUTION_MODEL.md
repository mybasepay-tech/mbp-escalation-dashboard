# Local-First Execution Model — Escalation System v2

> **Loop 13.** Clarifies the local-first working model: **where the v2 work lives today**
> (repo-local, mock/design-only) versus **where real data will live later** (a dedicated
> non-production SharePoint v2 test site, then production v2 lists — only after approval).
>
> ⚠️ **Design-only.** Everything described as "now" is local and mock. Nothing here connects
> to SharePoint/Graph/Azure, creates real lists or flows, or adds credentials/URLs. The legacy
> tracker stays operational and is **never written to** (D14/D15). See decision **D17**.

## 1. Current local working roots
- **Repo / working root:** `C:\dev\mbp-escalation-dashboard`
- **v2 app root:** `C:\dev\mbp-escalation-dashboard\src\v2`

All v2 development, tests, and design artifacts live under these paths and are tracked in git.
This is the single source of truth for the mock/design-only build.

## 2. What lives locally today (mock/design-only)
Under `C:\dev\mbp-escalation-dashboard`:
- **MockStore** — the active in-memory backend (`src/v2/store/MockStore.js`).
- **Seed data** — fabricated, local-only sample data (`src/v2/mock/seed.js`; `*.invalid`
  identities).
- **SharePoint schema JSON** — the design-only blueprint
  (`src/v2/backend/sharepoint/schema.sharepoint-v2.json`). Static; connects to nothing.
- **Docs** — specs, decision log, readiness, mapping, cutover, and this model (`docs/`).
- **Runbooks** — the Phase-2 test-site build runbook and admin build package (`docs/`).
- **Tests** — domain/store/contract/governance suites (`src/v2/tests/`).
- **SharePointStore stub** — design-only adapter that throws on every call
  (`src/v2/store/SharePointStore.js`).
- **Contract harness** — the reusable `EscalationStore` contract that runs against MockStore
  (`src/v2/tests/store-contract/`).

## 3. What does NOT live locally (and is not built yet)
- **Real SharePoint lists** — none exist; only the design-only schema JSON does.
- **Production data** — none; only fabricated seed data is used.
- **Live Graph / SharePoint connections** — none; no SDKs, no network calls.
- **Power Automate flows** — none (deferred — D11).
- **Credentials / secrets / env vars / tenant or client IDs / live URLs / API clients** —
  none anywhere in the repo (enforced by the safety scans and `npm run validate`).

## 4. Why the OneDrive / "Information Technology - General" path is NOT the backend
The folder `C:\Users\RodolfoChacon\OneDrive - myBasePay LLC\Information Technology - General`
is **not** used as backend storage for v2, and must not be. Reasons:
- **OneDrive-synced folders are not an application backend.** They are file sync, not a
  queryable list store with indexes, views, item-level permissions, or concurrency control —
  the things the v2 data model needs.
- **No multi-user concurrency / audit semantics.** Sync conflicts, partial syncs, and
  last-writer-wins file overwrites are incompatible with the append-only activity log and the
  ticket↔tag link list.
- **Personal-scope and portability risk.** A user-profile OneDrive path is tied to one
  account and machine; v2 storage must be a **company-owned**, shared, governed resource.
- **Wrong target by decision.** The accepted backend is **SharePoint List v2** (D3) on a
  dedicated site — not a synced documents folder.
> The local **repo** root (`C:\dev\...`, git-tracked) is for code/design artifacts; it is also
> not "backend storage." Real data belongs only in the approved SharePoint v2 lists (§5).

## 5. Future storage location (after approval)
- **Phase 2 (approved):** a **dedicated, company-owned, non-production SharePoint test site**
  with new `Escalations_v2_*` lists, built per the
  [`SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md`](./SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md) and
  the scripted, fail-closed provisioning package
  ([`../src/v2/backend/sharepoint/provisioning/`](../src/v2/backend/sharepoint/provisioning/),
  D18). The operator's runtime config (`provision.config.json`) is **git-ignored** — real site
  references/secrets are **never committed**.
- **Later (gated):** production v2 lists on a company-owned site, reached only through the
  staged [`PARALLEL_RUN_AND_CUTOVER_PLAN.md`](./PARALLEL_RUN_AND_CUTOVER_PLAN.md).
- Real data lives **only** in those SharePoint v2 lists — never in the repo, never in OneDrive.
- Building any of this is **approval-gated** (D6/D7 + Rod + the dry-run checklist).

## 6. Explicit separation from legacy
- v2 lists are new and prefixed `Escalations_v2_`, on a **separate** company-owned site.
- The legacy Escalation Tracker (its lists, views, permissions, and Power Automate flows)
  **stays operational and untouched** during the entire transition (D14).
- v2 never reads-with-intent-to-write or modifies legacy; legacy may be a **read-only**
  source/export only during migration planning.

## 7. No-writeback policy
There is **no** path that writes to, fixes, deletes, re-permissions, or flow-modifies the
legacy tracker (D15). Migration is strictly one-directional (legacy → v2), and all corrections
happen in the v2 copy with a `migration_normalization` note.

## 8. Minimal user-involvement principle
All build, mapping, and validation happen behind the scenes on mock/test data. Rod/end users
are involved only at the defined approval checkpoints (see
[`PARALLEL_RUN_AND_CUTOVER_PLAN.md`](./PARALLEL_RUN_AND_CUTOVER_PLAN.md) §8) and the acceptance
demo — not for routine technical or documentation work, which proceeds autonomously within
[`AI_AUTONOMY_GUARDRAILS.md`](./AI_AUTONOMY_GUARDRAILS.md).
