# SharePoint v2 Provisioning — Safety Checklist

> **Loop 14.** Operator checklist for running the provisioning package
> ([`../src/v2/backend/sharepoint/provisioning/`](../src/v2/backend/sharepoint/provisioning/))
> against an **approved, non-production** SharePoint test site. Phase 2 is approved; this gates
> *execution*. Scripts are fail-closed, but this checklist is the human backstop.
>
> Hard rules (always): no legacy target, **no writeback to legacy** (D15), **no Power Automate
> flows** (D11), **no production cutover**, **no enabling users**, **no secrets/URLs in git**
> (D17), **no OneDrive backend**.

## Before running provisioning
- [ ] Phase 2 approval recorded (Rod/IT); D6 (app/permissions) and D7 (read/export) confirmed.
- [ ] A **company-owned, non-production** test site exists (not legacy, not production).
- [ ] `provision.config.json` created from the example, **git-ignored**, with:
      `phase2Approved=true`, `nonProductionOnly=true`, `legacyWritebackAllowed=false`,
      `powerAutomateAllowed=false`, `listPrefix=Escalations_v2_`, a non-production
      `environmentLabel`, and the approved test-site reference (no legacy/prod/onedrive token).
- [ ] `git status` shows **no** real config staged; `provision.config.json` is ignored.
- [ ] Dry-run first: `./provision-sharepoint-v2.ps1` prints the plan with no connection.
- [ ] `PnP.PowerShell` installed and you can authenticate **interactively** (no secrets).

## After provisioning
- [ ] `validate-sharepoint-v2.ps1 -Execute` reports all 8 lists present with expected columns.
- [ ] Lookups resolve; indexes/views exist per schema.
- [ ] Legacy verified **unchanged**; **no** Power Automate flow created.
- [ ] No credentials/URLs were written to disk or committed.

## Before validation
- [ ] Same config + safety gate as provisioning (read-only; modifies nothing).
- [ ] Confirm you are pointed at the test site (script re-checks connected web for legacy/prod).

## Before cleanup
- [ ] You intend to **dispose** of the test-site v2 lists (rollback or teardown).
- [ ] `allowCleanup=true` set in the git-ignored config (extra gate).
- [ ] Dry-run preview reviewed; only `Escalations_v2_*` lists are listed for deletion.
- [ ] Legacy is **not** the target (script aborts if the connected web looks like legacy/prod).

## Rollback notes
- Cleanup deletes only `Escalations_v2_*` lists on the test site; legacy is untouched.
- The whole disposable test site can be deleted wholesale by IT as the ultimate rollback.
- No flows were created (none to disable); no data migrated (none to reverse); no legacy
  writeback (nothing to undo).

## Stop conditions (abort immediately)
- Any script reports a fail-closed safety rejection — **do not override**; fix the config.
- The connected web title/URL contains `legacy`, `tracker`, `prod`, or `production`.
- The required module/auth is missing (run dry-run instead; do not fake).
- Any step would touch legacy, production, OneDrive, or create a flow.
- Real config, secrets, or URLs appear in `git status` — unstage and remove before continuing.
