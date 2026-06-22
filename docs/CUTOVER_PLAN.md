# Cutover Plan — Legacy → Escalation System v2

> Planning scaffold. **Cutover is NOT authorized by this document.** Legacy remains live
> and open to users until Rod explicitly approves cutover (hard rules #1, #2).

## 1. Principles
- Legacy tracker stays **live and open to users** throughout build and migration.
- Cutover happens **only** on explicit Rod approval.
- Cutover must be **reversible** (rollback to legacy with no data loss).
- No legacy data is modified at any phase; v2 holds its own copy.

## 2. Phases

### Phase 0 — Parallel build (current)
- v2 built independently; legacy untouched.
- Scaffold + specs (this branch).

### Phase 1 — Dry-run migration (read-only)
- Run `LegacyReader` → dry-run outputs (see
  [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md) §5).
- Review drift report. **Zero writes** to legacy or v2.
- Gate: [`harness/MIGRATION_DRY_RUN_CHECKLIST.md`](../harness/MIGRATION_DRY_RUN_CHECKLIST.md).

### Phase 2 — v2 populate (v2-only writes)
- Apply migration to **v2 storage only**, idempotent on `legacyItemId`.
- Legacy still live, still source of truth for users.

### Phase 3 — Parallel run / validation
- v2 used in read/observe mode by a pilot group; legacy remains primary.
- Validate parity (counts, statuses, reports) vs. legacy.
- **Decision point: explicit Rod approval required to proceed.**

### Phase 4 — Cutover (gated, approved only)
- Switch users to v2 as the official UX.
- Optionally re-run migration to capture last-minute legacy changes (read-only delta on
  `legacyItemId`).
- Communicate; freeze new work in legacy (legacy still readable).
- Gate: [`harness/CUTOVER_AND_ROLLBACK_CHECKLIST.md`](../harness/CUTOVER_AND_ROLLBACK_CHECKLIST.md).

### Phase 5 — Post-cutover
- Legacy kept read-only for reference for a defined retention window (no deletion without
  approval).
- Monitor v2; keep rollback available.

## 3. Rollback
- At any phase before/at cutover: revert users to the legacy tracker (which was never
  modified and remains fully functional).
- v2 data can be discarded/rebuilt from a fresh dry-run; legacy is the untouched fallback.
- Rollback steps and verification: [`harness/CUTOVER_AND_ROLLBACK_CHECKLIST.md`](../harness/CUTOVER_AND_ROLLBACK_CHECKLIST.md).

## 4. Hard stops (must have explicit Rod approval)
- Decommissioning, restricting, or modifying the legacy tracker.
- Disabling legacy flows.
- Changing any permission.
- Declaring v2 the official system.

Until each is approved, the default is: **do nothing to legacy.**
