# Codex Review Checklist

> Independent, adversarial review gate. The reviewer assumes nothing is safe until proven.
> Owned by the Codex Reviewer agent (see [`../agents/CODEX_REVIEWER.md`](../agents/CODEX_REVIEWER.md)).

## 1. Safety (highest priority — any failure blocks)
- [ ] Confirm **no** code path writes to the legacy tracker or legacy lists.
- [ ] Confirm migration uses read-only legacy access only.
- [ ] Confirm no permission, sharing, or Entra app change.
- [ ] Confirm no Power Automate flow is touched.
- [ ] Confirm nothing silently initiates cutover or declares v2 official.
- [ ] Confirm writes (if any) target v2 storage only.

## 2. Correctness
- [ ] Status transitions match `STATUS_WORKFLOW.md`; invalid transitions blocked.
- [ ] Status/assignee consistency rules enforced (no #307-style drift).
- [ ] Assignment model correct: dept-only, person-only, and both; person-assigned stays
      visible in dept queue.
- [ ] daysOpen computed and clamped ≥ 0.
- [ ] Legacy field mapping matches `MIGRATION_SPEC.md`.

## 3. Traceability
- [ ] `legacyItemId` + `legacyUrl` preserved.
- [ ] Migration corrections recorded in notes + activity.
- [ ] Activity is append-only/immutable.

## 4. Architecture
- [ ] UI talks to DAL, not directly to SharePoint/Graph.
- [ ] Backend swappable (cloud/API-ready).
- [ ] Department behavior is config-driven (generic MVP, configurable-later shape intact).

## 5. Spec/doc fidelity
- [ ] Implementation matches the relevant spec doc; deviations documented.
- [ ] Cross-doc consistency (data model ↔ workflow ↔ UI ↔ migration).

## 6. Adversarial probes (try to break it)
- [ ] Attempt a legacy write — must be impossible by construction.
- [ ] Feed drifted legacy records — verify correct v2 handling + notes.
- [ ] Edge statuses (blank, unknown, Reopened from Closed) handled.
- [ ] Re-run migration — idempotent (no duplicates).

## Verdict
- Item / commit: ____________________
- Reviewer: ____________________   Date: __________
- Verdict: ☐ Approve  ☐ Approve with notes  ☐ **Block** (reasons: ____________________)
