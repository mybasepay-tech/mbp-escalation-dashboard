# SharePoint v2 Provisioning Package (non-production test site only)

> **Loop 14.** Config-driven, **fail-closed** PowerShell scripts to provision / validate /
> clean up the `Escalations_v2_*` lists on an **approved, non-production SharePoint test site**.
> Phase 2 is approved (Rod/IT); these scripts execute **only** against a test site and **only**
> with an operator-supplied, **git-ignored** config.
>
> ⚠️ **Safety:** never targets legacy; never writes to legacy (D15); creates **no** Power
> Automate flows (D11); performs **no** production cutover. No secrets, tenant IDs, client IDs,
> or live URLs live in git — the real config is supplied at runtime and is git-ignored (D17).
> If the required module/auth is missing, scripts **fail with a prerequisite message** — they
> never fake results.

## Files
| File | Purpose | Default |
|------|---------|---------|
| `provision-sharepoint-v2.ps1` | Create lists/columns/indexes/views from the schema | **dry-run** (no connection) |
| `validate-sharepoint-v2.ps1` | Read-only check of the test site vs. the schema | **dry-run** |
| `cleanup-sharepoint-v2-testsite.ps1` | Delete only `Escalations_v2_*` lists (rollback) | **dry-run** (needs `allowCleanup=true`) |
| `provisioning.common.ps1` | Shared fail-closed safety helpers | n/a (dot-sourced) |
| `provision.config.example.json` | **Placeholder** config template | tracked |
| `provision.config.json` | Real runtime config | **git-ignored — never commit** |
| `provisioning-manifest.json` | Machine-readable package descriptor | tracked |

## How it stays safe (fail-closed gate)
Every script runs `Assert-SafeConfig` before doing anything. It **throws** unless all hold:
- `phase2Approved = true`
- `nonProductionOnly = true`
- `legacyWritebackAllowed = false`
- `powerAutomateAllowed = false`
- `environmentLabel` matches a non-production label (test/sandbox/dev/nonprod/qa/staging)
- `listPrefix = Escalations_v2_`
- `siteReferencePlaceholder` is set, is **not** a placeholder, and contains **no** forbidden
  token (`legacy`, `tracker`, `prod`, `production`, `onedrive`)

When connecting live, scripts re-check the connected web title/URL for legacy/production tokens
and abort if matched (defense in depth).

## Usage
1. **Dry-run (safe, no connection, no module needed):**
   ```powershell
   ./provision-sharepoint-v2.ps1        # prints the schema-derived plan only
   ```
2. **Prepare runtime config (never committed):**
   ```powershell
   Copy-Item provision.config.example.json provision.config.json
   # edit provision.config.json: set phase2Approved=true and the approved test-site reference
   ```
3. **Live apply (after approvals + PnP.PowerShell + interactive auth):**
   ```powershell
   ./provision-sharepoint-v2.ps1 -Execute
   ./validate-sharepoint-v2.ps1 -Execute
   ```
4. **Rollback / dispose:** set `allowCleanup=true`, then
   ```powershell
   ./cleanup-sharepoint-v2-testsite.ps1 -Execute
   ```

## Prerequisite (runtime only)
- `PnP.PowerShell` module (`Install-Module PnP.PowerShell -Scope CurrentUser`) — operator
  action, **not** auto-installed by these scripts.
- Interactive authentication at runtime (`-Interactive`). **No secrets are stored.**

## What remains to be supplied at runtime
- The approved **non-production test-site reference** (in the git-ignored config).
- An authenticated operator session (interactive).
> Until those exist, the scripts run only in **dry-run** (plan/preview) mode.

See [`../../../../../harness/SHAREPOINT_V2_PROVISIONING_SAFETY_CHECKLIST.md`](../../../../../harness/SHAREPOINT_V2_PROVISIONING_SAFETY_CHECKLIST.md)
and [`../../../../../docs/SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md`](../../../../../docs/SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md).
