# Migration Dry-Run Checklist

> Verifies a migration dry-run was correct, complete, and **caused zero writes** to legacy
> or v2. See [`../docs/MIGRATION_SPEC.md`](../docs/MIGRATION_SPEC.md).

## Pre-run
- [ ] `LegacyReader` uses **read-only** credentials/scopes.
- [ ] Dry-run flag is ON; no v2 write path is enabled.
- [ ] Output directory is a scratch/working location (not committed legacy data).

## Read-only proof
- [ ] No write/PATCH/POST/DELETE call to any legacy list (verify in request log).
- [ ] No write to v2 storage during dry-run.
- [ ] Legacy item count/last-modified unchanged before vs. after run.

## Outputs produced
- [ ] `migration-candidates.json` (proposed v2 records).
- [ ] `migration-drift-report.csv` (before/after for each correction).
- [ ] `migration-summary.md` (counts by status, drift types, unresolved).
- [ ] `migration-errors.log` (unmappable records).

## Traceability
- [ ] Every candidate has `legacyItemId` and `legacyUrl`.
- [ ] Candidates keyed/deduped on `legacyItemId` (idempotent re-run safe).

## Drift correction (v2-only, noted)
- [ ] Status/assignee drift handled (e.g. "Not yet assigned" + assignee → "Assigned").
- [ ] Pending-* collapse recorded with original status in notes.
- [ ] Complete → Closed/Resolved decision applied consistently and noted.
- [ ] Negative/garbage day counts recomputed (clamped ≥ 0).
- [ ] Every correction has a `migrationNote` and a `migration_normalization` activity entry.

## Review
- [ ] Drift report reviewed; surprises investigated.
- [ ] Unresolved identities/departments listed for manual follow-up.
- [ ] Counts reconcile with legacy totals.

## Sign-off
- Run id / date: ____________________
- Verified by: ____________________
- Result: ☐ Pass (safe to consider apply)  ☐ Issues (notes: ____________________)
- Reminder: **Apply is a separate, approval-gated step (v2 writes only).**
