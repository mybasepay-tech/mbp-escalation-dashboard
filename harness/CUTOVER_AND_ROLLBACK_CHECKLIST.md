# Cutover & Rollback Checklist

> **Cutover requires explicit Rod approval.** Do not execute any item here without it.
> See [`../docs/CUTOVER_PLAN.md`](../docs/CUTOVER_PLAN.md).

## Pre-cutover gate
- [ ] **Explicit written approval from Rod to cut over.**
- [ ] Migration dry-run passed (MIGRATION_DRY_RUN_CHECKLIST).
- [ ] v2 populated (v2-only) and validated against legacy (parity check).
- [ ] No-Production-Modification checklist passed for all migration work.
- [ ] Smoke tests pass on v2.
- [ ] Rollback plan rehearsed and confirmed reversible.
- [ ] Stakeholders notified of cutover window.

## Parity validation
- [ ] Ticket counts match legacy (within documented, explained drift).
- [ ] Status distribution reconciles (with mapping rules applied).
- [ ] Key reports/exports match legacy spreadsheets.
- [ ] Spot-check sample tickets: legacy ↔ v2 via `legacyItemId`/`legacyUrl`.

## Cutover steps (only after approval)
- [ ] Optional read-only delta migration to capture last legacy changes.
- [ ] Make v2 the official UX entry point.
- [ ] Communicate to users; direct them away from editing legacy Lists directly.
- [ ] Set legacy to read-only-for-reference (NOT deleted; needs separate approval to
      decommission).
- [ ] Confirm legacy data unmodified by cutover.

## Post-cutover monitoring
- [ ] v2 error/health monitoring green.
- [ ] Users can complete core flows (create, assign, work, resolve, close).
- [ ] Reporting works.

## Rollback (if needed)
- [ ] Redirect users back to the legacy tracker (untouched, fully functional).
- [ ] Confirm legacy still has all data and correct permissions (never changed).
- [ ] Discard/quarantine v2 data if required; can rebuild from a fresh dry-run.
- [ ] Communicate rollback; capture root cause.

## Sign-off
- Approved by (Rod): ____________________   Date: __________
- Executed by: ____________________
- Result: ☐ Cutover complete  ☐ Rolled back (reason: ____________________)
