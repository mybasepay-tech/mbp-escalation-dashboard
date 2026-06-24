# Phase-2 Test-Site Build — Approval Request (one page)

> **For:** Rod / IT · **From:** Escalation System v2 build · **Date context:** Loop 13 ·
> **Status:** awaiting approval. This requests permission to build a **non-production**
> SharePoint **test** site only. It authorizes **no** production change. Legacy stays
> operational and untouched.

## 1. What is being requested
1. **Approval to build a non-production SharePoint test site** with new `Escalations_v2_*`
   lists (disposable, company-owned, separate from legacy).
2. **A dedicated v2 Entra app / permissions path** (D6) — least-privilege, scoped to the test
   site only, isolated from the legacy app.
3. **An approved legacy read/export method** (D7) — **ideally an offline read-only export**
   (CSV/JSON) for later migration dry-run; live read-only access only if separately approved.

## 2. What is NOT being requested
- ❌ No production cutover.
- ❌ No modification to the legacy tracker (lists, views, permissions).
- ❌ No writeback to legacy (one-directional only).
- ❌ No Power Automate flows (deferred — D11).
- ❌ No enabling of end users.
- ❌ No production data migration (Phase 2 uses synthetic/seed data only).

## 3. Why it is safe
- **Parallel, non-destructive:** new lists on a **new** site; legacy keeps running as the
  source of truth (D14).
- **Reversible:** rollback = delete the disposable test lists/site; nothing legacy to restore,
  no flows to disable, no data migrated.
- **No writeback (D15):** there is no code path from v2 to legacy.
- **Least-privilege & isolated:** a separate Entra app scoped to the test site; the legacy app
  and permissions are untouched.
- **Objectively gated:** the adapter must pass the existing **store contract** before anything
  advances (D13/D16); pre-flight is the dry-run checklist.

## 4. What has already been completed (local/design-only)
- ✅ **Design-only schema** — `src/v2/backend/sharepoint/schema.sharepoint-v2.json` (8 lists,
  views, indexes; validated locally).
- ✅ **Admin build package** — `docs/SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md`.
- ✅ **Dry-run checklist** — `harness/SHAREPOINT_V2_DRY_RUN_CHECKLIST.md`.
- ✅ **Store contract harness** — runs green against `MockStore` (the acceptance gate, D13).
- ✅ **Test-site build runbook** — `docs/SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md`.
- ✅ **SharePointStore implementation plan** — `docs/SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md`.
- ✅ **Contract test-site execution plan** — `docs/STORE_CONTRACT_TEST_SITE_PLAN.md`.
- ✅ **Local-first model** — `docs/LOCAL_FIRST_EXECUTION_MODEL.md` (real data lives only in v2
  lists; not the repo, not OneDrive — D17).

## 5. Approval checklist
- [ ] **D6 approved** — dedicated v2 Entra app / permissions (test-site scope).
- [ ] **D7 approved** — legacy read/export method (offline export preferred).
- [ ] **Non-production test site approved** — company-owned, disposable, separate from legacy.
- [ ] **Phase-2 go-ahead approved** — proceed with the test-site build runbook.

## 6. Next step after approval
1. Build the `Escalations_v2_*` lists on the disposable test site (runbook-driven).
2. Implement `SharePointStore` against that test site (per the implementation plan).
3. Run the **store contract** tests against the test site.
4. Evaluate the **first green contract run** — the go/no-go signal before any further phase.

## 7. Rollback / safety summary
- Delete the disposable test lists/site to fully roll back; legacy is unaffected.
- No flows created → none to disable. No data migrated → none to reverse. No legacy writeback →
  nothing to undo.
- Legacy remains the live system throughout; cutover is a **separate**, later, explicitly-
  approved decision (see [`PARALLEL_RUN_AND_CUTOVER_PLAN.md`](./PARALLEL_RUN_AND_CUTOVER_PLAN.md)).

> Detail backing this request: [`LOCAL_FIRST_EXECUTION_MODEL.md`](./LOCAL_FIRST_EXECUTION_MODEL.md),
> [`SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md`](./SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md),
> [`SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md`](./SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md),
> [`STORE_CONTRACT_TEST_SITE_PLAN.md`](./STORE_CONTRACT_TEST_SITE_PLAN.md),
> [`DECISION_LOG.md`](./DECISION_LOG.md) (D3, D6, D7, D11–D17).
