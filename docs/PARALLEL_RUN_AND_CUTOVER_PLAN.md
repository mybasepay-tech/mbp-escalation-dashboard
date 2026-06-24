# Parallel-Run & Cutover Plan — Legacy → SharePoint v2

> **Loop 11.** The backend target is **SharePoint List v2 / Microsoft List v2** (decision
> **D3**). This plan describes how the **legacy SharePoint/List process keeps operating** while
> the v2 SharePoint backend is built, migrated, validated, and cut over safely (decision
> **D14**). It supersedes the earlier scaffold in [`CUTOVER_PLAN.md`](./CUTOVER_PLAN.md).
>
> ⚠️ **Nothing here is live.** This is design/planning only. No real SharePoint lists, no
> flows, no Graph/live integration, **no writeback to legacy** (decision **D15**). `MockStore`
> remains the active backend; `SharePointStore` remains a design-only stub. Each live phase is
> gated by explicit Rod approval and the harness checklists.

## 1. Purpose
Provide a low-risk, reversible path from the legacy tracker to SharePoint v2 in which **legacy
is never disrupted** and **legacy is never modified**. Users keep working in legacy until a
deliberate, approved cutover — and can be rolled back to it at any point.

## 2. System roles during transition
- **Legacy SharePoint/List tracker — stays operational.** It remains the **source of truth**
  for users throughout build, migration, and parallel validation. It is treated as a
  **read-only** source/reference/export for migration planning. It is **never written to,
  re-permissioned, or flow-modified** by v2 work (D15).
- **SharePoint v2 (new `Escalations_v2_*` lists) — the future target.** Built **separately**
  on a new, company-owned site. Holds its **own copy** of data (keyed on `legacyItemId`),
  populated only by reviewed dry-run migration. Becomes the official UX only at cutover.

## 3. Transition phases
Legacy stays live and unmodified in **every** phase below.

### Phase 1 — Mock/local MVP *(current — no approval needed)*
- What it is: the in-memory `MockStore` MVP, schema, store contract, and design docs in this
  repo.
- Live: **legacy only** (for users). v2 is local/mock.
- Read-only: n/a (no legacy access yet).
- Never modify: legacy (untouched).
- Exit: design package complete; D3 decided (✅).

### Phase 2 — SharePoint v2 test-site build *(requires Rod approval; D6 + dry-run checklist)*
- Build the eight `Escalations_v2_*` lists on a **disposable test site** by following the
  step-by-step [`SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md`](./SHAREPOINT_V2_TEST_SITE_BUILD_RUNBOOK.md)
  (column source: [`SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md`](./SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md)).
- Implement `SharePointStore` per
  [`SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md`](./SHAREPOINTSTORE_IMPLEMENTATION_PLAN.md) and run it
  against the **store contract** (D13/D16) on the test site
  ([`STORE_CONTRACT_TEST_SITE_PLAN.md`](./STORE_CONTRACT_TEST_SITE_PLAN.md)).
- Live: **legacy only**. v2 test site holds throwaway/sample data.
- Read-only: legacy (not yet accessed unless export provided).
- Never modify: legacy lists/permissions/flows.
- Exit: store contract green against the test site; no live markers in repo.

### Phase 3 — Migration dry-run from export *(requires Rod approval; D7 + migration dry-run checklist)*
- Run the read-only migration **from an offline export/sample** (D7 prefers offline) →
  candidates + drift report. **Zero writes** to legacy or v2.
- Live: **legacy only**.
- Read-only: the legacy **export** (not the live list).
- Never modify: legacy. No writeback (D15).
- Exit: drift report reviewed; mapping rules stable (see
  [`LEGACY_TO_V2_MAPPING_PLAN.md`](./LEGACY_TO_V2_MAPPING_PLAN.md) and
  [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md)).

### Phase 4 — Parallel validation *(requires Rod approval)*
- Apply migration to **v2 storage only** (idempotent on `legacyItemId`); run v2 in
  read/observe mode beside legacy. Compare parity: counts, statuses, assignments, reports.
- Live: **legacy primary** (users). v2 runs in parallel, observed only.
- Read-only: legacy remains read-only to v2.
- Never modify: legacy. v2 is not yet the system of record.
- Exit: parity within agreed tolerance; open issues triaged.

### Phase 5 — User acceptance / demo *(requires Rod approval)*
- Walk Rod/stakeholders through v2 against real(istic) migrated data; collect sign-off.
- Live: **legacy primary**.
- Read-only: legacy.
- Never modify: legacy.
- Exit: explicit acceptance to proceed toward cutover.

### Phase 6 — Controlled cutover *(HARD GATE — explicit Rod approval; cutover/rollback checklist)*
- Optionally re-run the read-only migration delta (keyed on `legacyItemId`) to capture
  last-minute legacy changes, then switch users to v2 as the official UX.
- Communicate the switch; **freeze new work in legacy** (legacy stays **readable**, not
  deleted, not modified).
- Live: **v2 becomes primary**; legacy read-only.
- Never modify: legacy data/history (freeze = no new entries by process, not by deletion).
- Exit: v2 stable in production use; rollback still available.

### Phase 7 — Legacy freeze / archive *(requires Rod approval)*
- Keep legacy **read-only for a defined retention window** for reference; no deletion or
  decommissioning without separate approval.
- Live: **v2 only** (legacy archived/read-only).
- Never modify: legacy contents during retention.
- Exit: retention window elapses; archival/decommission decided **separately**.

## 4. Live / read-only / never-modify summary
| Phase | Live for users | Read-only | Never modify |
|-------|----------------|-----------|--------------|
| 1 Mock MVP | Legacy | — | Legacy |
| 2 Test-site build | Legacy | Legacy | Legacy lists/permissions/flows |
| 3 Dry-run | Legacy | Legacy **export** | Legacy (no writeback) |
| 4 Parallel validation | Legacy (primary) | Legacy | Legacy; v2 not yet authoritative |
| 5 Acceptance/demo | Legacy (primary) | Legacy | Legacy |
| 6 Cutover | **v2 (primary)** | Legacy | Legacy data/history |
| 7 Freeze/archive | v2 | Legacy (retention) | Legacy contents |

## 5. Go / no-go criteria (per gated phase)
- **Build → dry-run:** store contract green on the test site; no live markers; admin build
  validated; dry-run checklist passable.
- **Dry-run → parallel:** drift report reviewed and acceptable; unresolved identities/depts
  triaged; mapping rules stable.
- **Parallel → acceptance:** parity within agreed tolerance (counts/statuses/reports);
  no Sev-1 discrepancies.
- **Acceptance → cutover:** explicit Rod sign-off; rollback rehearsed; comms ready; support
  window scheduled.
- **No-go at any gate** → remain on the current phase; legacy stays primary. No partial
  cutover.

## 6. Rollback plan
- Before/at cutover: **revert users to legacy**, which was never modified and remains fully
  functional. No data loss — legacy is the untouched fallback.
- v2 data can be **discarded and rebuilt** from a fresh, reviewed dry-run (idempotent on
  `legacyItemId`).
- No flows exist to disable; no legacy writeback to undo (D15).
- Detailed steps: [`../harness/CUTOVER_AND_ROLLBACK_CHECKLIST.md`](../harness/CUTOVER_AND_ROLLBACK_CHECKLIST.md).

## 7. Communications checklist
- [ ] Announce *before* Phase 4/parallel that a new system is being validated (no action
      needed from users yet).
- [ ] Provide the cutover date/time and what changes for users (Phase 6).
- [ ] State clearly that **legacy data is preserved read-only**, nothing is deleted.
- [ ] Share where to report issues during parallel run and immediately post-cutover.
- [ ] Confirm rollback messaging is pre-drafted in case of no-go.
- [ ] Post-cutover confirmation that v2 is now the system of record.

## 8. Rod approval checkpoints
1. **Phase 2** — build real v2 lists on a test site (also needs D6 + dry-run checklist).
2. **Phase 3** — run the migration dry-run; confirm the legacy read-access method (D7).
3. **Phase 4** — apply migration to v2 storage and begin parallel run.
4. **Phase 5** — acceptance/demo sign-off.
5. **Phase 6** — **cutover** (hard gate) + rollback confirmation.
6. **Phase 7** — legacy freeze/retention; any later archival/decommission is separate.
> Plus the standing non-negotiables in
> [`../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md`](../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md)
> and [`../harness/NO_PRODUCTION_MODIFICATION_CHECKLIST.md`](../harness/NO_PRODUCTION_MODIFICATION_CHECKLIST.md).

## 9. Minimal user-involvement principle
Keep demands on Rod and end users as small as possible: do all build, migration-mapping, and
validation work behind the scenes on mock/test data; bring users in only for (a) acceptance
review (Phase 5) and (b) the cutover switch (Phase 6). Routine technical and documentation
choices are made autonomously within the guardrails in
[`AI_AUTONOMY_GUARDRAILS.md`](./AI_AUTONOMY_GUARDRAILS.md); only the approval checkpoints above
require a decision from Rod.
