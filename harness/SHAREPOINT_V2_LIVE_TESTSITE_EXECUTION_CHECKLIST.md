# SharePoint v2 — Live Test-Site Execution Checklist

> **Loop 17.** Operator checklist for the **gated** live run against the approved
> **non-production** test site, using the real client wrapper
> ([`../src/v2/backend/sharepoint/live/`](../src/v2/backend/sharepoint/live/)) and the fail-closed
> provisioning package ([`../src/v2/backend/sharepoint/provisioning/`](../src/v2/backend/sharepoint/provisioning/)).
> Scripts are fail-closed; this is the human backstop.
>
> Hard rules (always): no legacy target, **no writeback to legacy** (D15), **no Power Automate
> flows** (D11), **no production cutover**, **no enabling users**, **no secrets/URLs/IDs in git**
> (D17/D21), **no OneDrive backend**.

## Loop 18 prerequisite status (snapshot)
Verified during execution-prep (no live run performed):
- ✅ Scripts **fail closed** on example defaults — provisioning dry-run and the live runner both
  reject `phase2Approved=false` / placeholder site reference.
- ✅ Runtime-config paths are **git-ignored** (`provision.config.json`, `testsite.config.json`,
  `transport.local.js`, `.env`).
- ⛔ **`PnP.PowerShell` not installed** — operator must `Install-Module PnP.PowerShell -Scope CurrentUser`.
- ⛔ **Approved non-production test-site reference, D6 app/auth, and a transport bootstrap** are
  not yet present — supply these (git-ignored) before any live step.

## Before provisioning
- [ ] Phase 2 approval + D6 (app/permissions) + D7 (read/export) recorded.
- [ ] A company-owned, **non-production** test site exists (not legacy, not production).
- [ ] `npm run validate` is green; `npm test` is green (both store contracts + resilience).
- [ ] Git-ignored configs prepared and **not staged**: provisioning `provision.config.json` and
      live `testsite.config.json` (from the `*.example.json` templates).
- [ ] `git status` shows no `*.config.json`, `.env`, secrets, or transport bootstraps staged.

## Before validation
- [ ] Provisioning dry-run reviewed: `provision-sharepoint-v2.ps1` prints the schema plan.
- [ ] Provisioning executed on the test site: `provision-sharepoint-v2.ps1 -Execute`.
- [ ] `validate-sharepoint-v2.ps1 -Execute` reports all 8 lists with expected columns/views.

## Before the contract run
- [ ] `testsite.config.json` has `phase2Approved=true`, `contractRunApproved=true`,
      `nonProductionOnly=true`, `legacyWritebackAllowed=false`, `powerAutomateAllowed=false`,
      `listPrefix=Escalations_v2_`, a non-production `environmentLabel`, and the approved
      site reference (no legacy/prod/onedrive token, not a placeholder).
- [ ] `transportModule` points at a git-ignored bootstrap that builds an authenticated transport
      (real SDK + interactive auth).
- [ ] `node run-testsite-contract.js ./testsite.config.json` passes the gate and the read-only
      connectivity smoke.
- [ ] Run the full store contract against the live client (see
      [`../docs/STORE_CONTRACT_TEST_SITE_PLAN.md`](../docs/STORE_CONTRACT_TEST_SITE_PLAN.md));
      record the **first all-green run** as the acceptance gate.

## Stop conditions (abort immediately)
- Any fail-closed rejection from the runner or provisioning scripts — **do not override**; fix config.
- The connected web title/URL contains `legacy`, `tracker`, `prod`, or `production`.
- Required transport/auth/module missing — run nothing live; report and stop (never fake).
- Any step would touch legacy, production, OneDrive, or create a flow.
- Real config/secrets/IDs appear in `git status` — unstage and remove before continuing.

## Cleanup / rollback
- Delete the `Escalations_v2_*` lists (or the disposable test site) via
  `cleanup-sharepoint-v2-testsite.ps1 -Execute` (requires `allowCleanup=true`).
- No flows created → none to disable. No data migrated → none to reverse. No legacy writeback →
  nothing to undo. Legacy remains the live system throughout.
