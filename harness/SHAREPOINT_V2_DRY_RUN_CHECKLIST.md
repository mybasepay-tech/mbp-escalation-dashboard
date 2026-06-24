# SharePoint v2 — Dry-Run Checklist (pre-build safety gate)

> ⚠️ **DESIGN-ONLY pre-flight.** Complete this checklist **before** any future SharePoint v2
> build (see [`../docs/SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md`](../docs/SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md)).
> This repo performs **no** live build and contains **no** live integration. This list exists
> so that when a controlled build is eventually approved, it cannot start until every safety
> condition below is explicitly confirmed. If any item fails, **stop** — do not build.

Related gates: [`NO_PRODUCTION_MODIFICATION_CHECKLIST.md`](./NO_PRODUCTION_MODIFICATION_CHECKLIST.md),
[`BACKEND_ADAPTER_READINESS_CHECKLIST.md`](./BACKEND_ADAPTER_READINESS_CHECKLIST.md),
[`CUTOVER_AND_ROLLBACK_CHECKLIST.md`](./CUTOVER_AND_ROLLBACK_CHECKLIST.md). Decisions: D3, D6,
D7, D11, D12 in [`../docs/DECISION_LOG.md`](../docs/DECISION_LOG.md).

## 1. Pre-build safety checks
- [ ] Rod has **explicitly approved** a controlled build (D3 backend confirmed).
- [ ] Build will run on a **disposable test site first**, not the production v2 site.
- [ ] The build operator has rights on the **target v2 site only** — not on legacy.
- [ ] The schema JSON version to be built is recorded and matches
      [`../src/v2/backend/sharepoint/schema.sharepoint-v2.json`](../src/v2/backend/sharepoint/schema.sharepoint-v2.json)
      (currently `0.2.0-design`).
- [ ] `npm run validate` is green in this repo (schema is structurally valid + design-only).

## 2. Confirm the target site is NOT the legacy tracker
- [ ] Target site URL is a **new, company-owned** v2 site, visually confirmed.
- [ ] Target site is **not** the legacy Escalation Tracker site or any site hosting it.
- [ ] No `Escalations_v2_*` list name collides with an existing legacy list.
- [ ] Legacy tracker list, columns, views, and permissions will not be read-with-intent-to-
      write, edited, or re-permissioned by any step.

## 3. Confirm no production write-back
- [ ] No step writes to, updates, patches, or deletes **any** legacy item or list.
- [ ] No write-back path from v2 to legacy exists or is enabled.
- [ ] Migration (if any) is a **separate, later, read-only** activity — out of scope here and
      gated by D7. This dry-run does not move data.

## 4. Confirm no flows are created
- [ ] **No Power Automate flow** is created, imported, or modified by this build.
- [ ] **Existing legacy flows are not touched, edited, or disabled.**
- [ ] Notifications/automation remain **deferred** (D11); business rules stay in
      `domain/rules.js`, not in flows.

## 5. Confirm no Graph / live API call is used by this repo
- [ ] This repository contains **no** Microsoft Graph, SharePoint REST, Dataverse, Azure
      Functions, or MSAL/auth code (enforced by `tests/safety.test.js` and
      `scripts/validate.js`).
- [ ] No credentials, tenant IDs, client IDs, secrets, OAuth scopes, environment variables,
      or live URLs are present in the repo.
- [ ] The schema JSON is **static** — it connects to nothing and provisions nothing.
- [ ] `MockStore` remains the only active backend; the `EscalationStore` abstraction is intact.

## 6. Confirm the schema matches the JSON
- [ ] Lists to be created exactly match the eight `Escalations_v2_*` keys in the schema.
- [ ] Tags use the **many-to-many `Escalations_v2_TicketTags` link list** (D12); **no**
      delimited tag field is created on `Escalations_v2_Tickets`.
- [ ] `Escalations_v2_Tags` is created as the **dictionary** (catalog) only.
- [ ] Column **internal names** match the schema field `name` values (no spaces / no
      `_x0020_` encoding); display labels applied separately.
- [ ] Indexes and views to be created match the schema's `recommendedIndexes` and `views`,
      including *Tags by Ticket* and *Tickets by Tag*.

## 7. Confirm the rollback path
- [ ] Rollback = **delete the newly created `Escalations_v2_*` lists** (and the disposable
      test site) — legacy is untouched, so nothing legacy needs restoring.
- [ ] No flows to disable (none were created); no migrated data to reverse (none was moved).
- [ ] Legacy remains the live system throughout; the build is parallel and non-destructive.
- [ ] A named owner is recorded for the v2 site/lists before promotion beyond the test site.

---
**Sign-off:** Do not begin the build in
[`../docs/SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md`](../docs/SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md)
until every box above is checked. Any unchecked or failed item is a hard stop.
