# Migration Dry-Run Plan (Loop 30 — plan only, NOT executed)

> Describes the future controlled dry-run: read-only legacy export → transform → import a
> COPY into v2 pre-production → validate → clean up. **Nothing in this document authorizes
> execution.** Execution requires the approval gates in §10 and happens in a later loop
> (Loop 33 per [`LAUNCH_READINESS_PLAN.md`](./LAUNCH_READINESS_PLAN.md)). See also the
> standing governance in `MIGRATION_SPEC.md` and `harness/MIGRATION_DRY_RUN_CHECKLIST.md`.

## 1. Purpose
Prove, on a full copy of real legacy data, that the frozen mapping
([`MIGRATION_MAPPING_TEMPLATE.md`](./MIGRATION_MAPPING_TEMPLATE.md)) transforms and imports
cleanly into v2 — with counts, samples, and edge cases reconciled — before any pilot or
cutover conversation.

> **Foundation status (Loop 32):** the OFFLINE validate/transform/report stage of this plan
> is now implemented and tested against a fake sample export —
> [`src/v2/tools/migration/`](../src/v2/tools/migration/README.md) (§4 steps 1–8, §6
> report skeleton). It has NO import capability by construction; the gated import stage
> remains future work under G1–G3.

## 2. Prerequisites (all must hold)
- Legacy inspection complete; mapping template frozen and approved (every row `mapped`,
  `deferred`, or an accepted `business decision`).
- D6 app auth executed (no operator token minting mid-run) — strongly preferred; an
  operator-token run is acceptable only for a reduced rehearsal.
- v2 pre-production lists provisioned via the existing fail-closed scripts.
- Importer (Loop 32) built and green against fixtures, including the StatusUpdates
  verbatim-preservation guarantee and idempotent re-run behavior.
- Rodolfo approval to run (gate G1 below).

## 3. Inputs required from the legacy export (read-only copies, kept OUT of git)
- Full tracker item export with ALL columns + system fields (id, Author, Created,
  Modified), un-truncated `StatusUpdates` (JSON/Graph export, not Excel).
- Users/lookup export (id → name/email) for assignee/author resolution.
- Tags lookup export; Department Leads export.
- Attachment inventory (item id → file names/sizes) if inspection found usage.
- Export manifest: date/time, row counts per list — the reconciliation baseline.

## 4. Transform steps (deterministic, re-runnable, no legacy access)
1. Parse export files locally (no network).
2. Apply the frozen field mapping row by row; NEVER drop unknown fields — everything
   unmapped lands in the legacy/additional-data area.
3. Statuses copied EXACTLY (identity mapping); blank → `New` + migration note.
4. Resolve people via the user map; unresolvable → placeholder-user policy + note.
5. Resolve departments via the canonical table; unresolvable → unrouted + flagged row.
6. `StatusUpdates` → verbatim onto the ticket (un-truncated), plus synthesized minimal
   activity (created / migration_normalization / dept transfer when derivable).
7. Emit a transform report: rows in, rows out, flags by category, before/after samples.
8. Every output record carries `legacyItemId` + `legacyUrl` and a dry-run namespace marker.

## 5. Import target
- v2 **pre-production/test** `Escalations_v2_*` lists ONLY — behind the same fail-closed
  config gates as every live tool in this repo (approval flags, non-production label,
  list-prefix guard, legacy/production target refusal).
- Namespaced run id; idempotent (re-import updates/skips, never duplicates); tracked for
  exact cleanup.

## 6. Validation checks (automated, against the export manifest)
- Total ticket count in == out == imported.
- Counts by: status, department/queue, assignee, requester, completed, tagged.
- No-movement candidates computed post-import (sanity: old untouched tickets flag as
  expected).
- Date spot checks: created/escalated/resolved on a random sample.
- `StatusUpdates` integrity: length + checksum comparison export vs imported for EVERY
  ticket (truncation is a hard failure).
- Legacy-field preservation: sampled tickets retain AmountRemaining/TeamsPost/etc. in the
  legacy-data area.
- Random deep sample (N ≥ 20): every mapped field side-by-side.
- Edge cases explicitly included: unassigned; completed; blank status; missing author;
  missing department; oldest ticket; longest StatusUpdates; attachment-bearing (if any);
  orphaned lookups.

**Decision-driven checks (Loop 31 accepted decisions — each is pass/fail):**
- `MemberName`/`CustomerName`/`WorkerName` preserved on every ticket where populated, and
  visible in the detail Additional Details area on sampled tickets.
- `AmountRemaining` preserved (as legacy/additional data) wherever present in the export.
- `AssignmentID` preserved verbatim wherever present; confirmed uninterpreted (no importer
  logic branches on it).
- **Exact status values survive:** per-ticket status string equality export vs import —
  any normalization of a stored status is a hard failure.
- **StatusUpdates integrity:** length + checksum equality for EVERY ticket (already above —
  restated here as a decision-driven must).
- **Departed-author flags:** every ticket whose author could not be matched appears in the
  exception report and carries the migration-owner closure marker (owner: Rodolfo Chacón /
  IT Admin, D33); count reconciled and the exception list delivered to the owner.
- Internal-notes visibility assumption verified (imported notes readable by a non-admin
  test user in pre-production).
- Attachment counts/usage recorded per ticket (even though files are not migrated).
- **Reporting baseline reproduced** on the imported copy: totals / open / by status /
  by department / needs-attention / completed match the transform report's expectations.

## 7. Reconciliation report
Sanitized (counts, keys, flag categories — no live URLs/names/GUIDs): totals table,
per-dimension count comparisons, flag/discrepancy list with disposition
(fix / accept / needs decision), sample-comparison verdicts, StatusUpdates integrity
result. Signed off by Rodolfo before the dry-run is called passed.

## 8. Rollback / cleanup
- The dry-run data is a namespaced COPY: exact-key cleanup deletes every imported record
  (the Loop 22/24 tracked-cleanup pattern) and the report proves leftover count 0.
- Legacy was never written; there is nothing to roll back on the legacy side.
- Local export files are deleted or retained per a retention note — never committed.

## 9. Not included yet (explicitly out of scope for the dry-run)
- Any cutover or freeze; any legacy change; any user-facing announcement.
- Real attachment FILE migration (metadata only, if in scope at all).
- StatusUpdates → structured comment parsing beyond the proven-safe minimum (verbatim
  preservation is the requirement; parsing is additive later).
- Notifications (Teams/Power Automate parity is a separate deferred decision gate).
- Production users or permissions changes.

## 10. Approval gates
- **G1 — Run approval:** Rodolfo approves executing the dry-run on a copy (after
  prerequisites §2). Without G1, no export is even pulled.
- **G2 — Report acceptance:** Rodolfo accepts the reconciliation report (§7), including
  every flagged discrepancy's disposition.
- **G3 — Next-phase release:** only after G2 does pilot planning (Loop 34) proceed.
  A failed dry-run loops back to mapping/importer fixes and re-runs; it never "passes with
  exceptions" silently.
