# Backend Adapter Readiness Checklist

> **Gate before ANY backend-adjacent work.** No SharePoint, Microsoft Graph, API, or
> Dataverse adapter — and no migration dry-run against real data — may begin until every
> item below is satisfied. This complements
> [`NO_PRODUCTION_MODIFICATION_CHECKLIST.md`](./NO_PRODUCTION_MODIFICATION_CHECKLIST.md).
> Until then, the MVP stays mock-only.

## Approval & decisions
- [ ] **Explicit Rod approval** to begin backend-adapter work (in writing).
- [ ] **Backend choice decided** (D3): SharePoint (temporary) / managed API+DB / Dataverse.
- [ ] **App stack/hosting** decided enough to proceed (D1).
- [ ] **Entra app decision** (D6): new v2 app registration vs. reuse legacy — recorded.
- [ ] Status-mapping decisions resolved for migration (D4 "Complete", D5 Pending-* collapse).
- [ ] Authoritative department/queue list confirmed (D8).

## Ownership & resources
- [ ] **Company-owned site/resource confirmed** for any v2 backend (not a personal
      OneDrive/site; the legacy lists live on a personal site today — v2 must not).
- [ ] Environment(s) identified (dev/v2 isolated from legacy); naming agreed.
- [ ] Any new lists/tables are **new v2 resources**, never the legacy "Escalation Tracker".

## Permissions & security
- [ ] **Permission scope review** completed: least-privilege; **read-only** scopes for any
      legacy access.
- [ ] No change to legacy permissions, sharing, or the legacy Entra app registration.
- [ ] Secrets/config handled via a secure mechanism (never committed); placeholders only in
      the repo.

## Legacy safety
- [ ] **No legacy write-back** rule reaffirmed: zero write/PATCH/POST/DELETE to legacy lists.
- [ ] Legacy access (if any) goes through a dedicated **read-only** reader, separate from
      the writable v2 store.
- [ ] `legacyItemId` / `legacyUrl` preservation plan confirmed.

## Migration
- [ ] **Migration dry-run approved** (read-only, produces candidates + drift report; writes
      nothing to legacy or v2). See
      [`MIGRATION_DRY_RUN_CHECKLIST.md`](./MIGRATION_DRY_RUN_CHECKLIST.md).
- [ ] Dry-run input source agreed (D7): offline export/sample preferred; live read-only
      access only if explicitly approved.

## Rollback & cutover
- [ ] **Rollback / no-cutover confirmation**: this phase does not cut over or declare v2
      official; legacy remains live and untouched.
- [ ] Rollback path documented (revert to legacy, discard v2 data) — see
      [`CUTOVER_AND_ROLLBACK_CHECKLIST.md`](./CUTOVER_AND_ROLLBACK_CHECKLIST.md).

## Engineering gates
- [ ] **Safety scan passing** (`npm run validate`): no production strings / network calls in
      mock code; fake legacy domains only.
- [ ] **All tests passing** (`npm test`).
- [ ] New adapter work sits behind the existing `EscalationStore` contract; UI/domain
      untouched by backend choice.
- [ ] Codex review scheduled for the first adapter PR
      ([`CODEX_REVIEW_CHECKLIST.md`](./CODEX_REVIEW_CHECKLIST.md)).

## Sign-off
- Backend chosen: ____________________   Approved by (Rod): ____________________  Date: ______
- Verified by: ____________________
- Result: ☐ Cleared to start adapter work  ☐ Blocked (reasons: ____________________)
