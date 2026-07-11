# Launch Readiness Plan — Escalation System v2 (Loop 29)

> v2 is the **replacement system** for the legacy Escalation Tracker, currently a
> **pre-production build** under controlled validation. The legacy system remains the
> **source of truth** and is never modified; there is **no cutover** and **no real data
> migration** yet. This plan defines the gated path from here to launch. Companion:
> [`LEGACY_GAP_ANALYSIS.md`](./LEGACY_GAP_ANALYSIS.md).

## A. Current phase
- Pre-production replacement build; visual/product direction accepted (Loops 26–28).
- Domain rules, store contract, and SharePoint adapter proven live on the non-production
  test site (30/30 contract tests, verified cleanup); 283 automated tests green.
- MockStore is the default UI backend; the SharePoint test backend is dual opt-in and
  fail-closed; D6 auth plan ready for approval.
- Legacy: untouched, authoritative, protected by automated guards.

## B → C. Launch path phases with gates

| # | Phase | Entry criteria | Exit criteria | Owner | Key risks | Deliverables |
|---|---|---|---|---|---|---|
| 1 | **Gap analysis** (this loop) | Loop 28 accepted | Gap analysis + this plan merged; open questions issued | Eng (AI loops) | unknown legacy internals | LEGACY_GAP_ANALYSIS.md, this plan |
| 2 | **D6 auth execution** | Rod approves D6 plan | App registration live (cert, `Sites.Selected`, single-site grant); live contract re-passed under app auth | Admin + Eng | admin availability; cert handling | Working non-interactive auth; D6 marked executed |
| 3 | **Legacy inspection** | Read-only admin access approved | C.2 checklist answered; field mapping frozen; open questions answered | Rodolfo + Eng | undocumented flows/fields | Inspection report; approved mapping matrix |
| 4 | **Migration design** | Phases 2–3 done | Transform rules (incl. StatusUpdates parser + preservation strategy) reviewed and approved | Eng | history-blob parsing | Migration design doc |
| 5 | **Migration tool build** | Phase 4 approved | Importer runs idempotently against fixtures; unit-tested; read-only toward legacy by construction | Eng | edge cases | Importer + tests |
| 6 | **Controlled import (copy)** | Phase 5 done; pre-prod lists provisioned | Full COPY of legacy data imported to v2 pre-production; zero legacy writes | Eng (supervised) | data surprises | Import run log (sanitized) |
| 7 | **Validation** | Phase 6 done | §E validation report passes; discrepancies triaged to zero-or-accepted | Eng + Rodolfo | silent data loss | Validation report |
| 8 | **Controlled pilot** | Phase 7 passed; §F permissions applied | Small named group works real-ish cases in v2 (copies); acceptance criteria met; feedback triaged | Rodolfo + pilot users | workflow mismatch | Pilot report; UAT sign-off |
| 9 | **Cutover plan** | Phase 8 passed | Runbook approved: freeze window, final delta import, comms, rollback, flow retirement/replacement | Rodolfo + leadership | timing; notifications parity | Cutover runbook |
| 10 | **Launch** | Phase 9 approved; launch date set | v2 authoritative; legacy frozen read-only (never deleted) | All | dual-entry drift | Executed runbook |
| 11 | **Post-launch support** | Launch | Support owner active; issue triage; legacy retained per retention decision | Support owner | trust erosion | Support rota; post-launch review |

Every phase is **fail-closed**: if exit criteria aren't met, the phase repeats or the plan
stops — later phases never start early, and nothing in phases 1–8 touches legacy or
production users.

## D. Migration strategy (safety-first)
1. **Read-only export/copy** from the legacy list (Graph read or admin export). The
   importer has NO write path to legacy by construction — same fail-closed pattern as every
   existing live tool in this repo.
2. **Transform** into v2 shape per the approved mapping matrix; every ticket carries
   `legacyItemId` + `legacyUrl`; the verbatim `StatusUpdates` blob is preserved on the
   ticket even after parsing into structured comments/activity.
3. **Import** into v2 SharePoint **pre-production** lists (namespaced run ids, idempotent,
   resumable, exact-cleanup capable — the Loop 22/24 patterns).
4. **Validate** per §E before anyone treats the copy as meaningful.
5. **Legacy remains the source of truth** until the approved cutover moment; before then
   the v2 copy is explicitly labeled a validation copy.
6. **Rollback** at any pre-launch point = discard the v2 copy (namespaced, deletable) and
   continue on legacy. Rollback immediately post-launch = unfreeze legacy (it was never
   written to) and re-open it as authoritative per the runbook.

## E. Data validation strategy
Automated report comparing legacy export vs v2 import:
- Total ticket count; counts by status, department/queue, assignee, requester.
- Date spot checks (created / escalated / resolved) on a random sample.
- Per-ticket comment/entry counts from the parsed StatusUpdates vs structured records.
- Internal-note and attachment-metadata counts (if in scope after inspection).
- Random-sample deep comparison (N ≥ 20): every mapped field side by side.
- Edge cases explicitly sampled: unassigned tickets; closed tickets; reopened-like
  histories; missing requester/author; missing department; oldest tickets; tickets with
  attachments; tickets with the longest StatusUpdates blobs.
- Output is a sanitized report (counts and keys only — no live URLs/identities in git).

## F. Permission / access readiness (matrix to fill in phase 3/8)
| Capability | Who (to confirm) |
|---|---|
| See all tickets | [needs business confirmation] |
| See department queue | department members/leads |
| See my assigned | every signed-in user |
| Create tickets | [needs business confirmation — all staff?] |
| Close tickets | requester (D23 rule) — confirm operationally |
| View internal notes | [needs business confirmation] |
| Edit assignment/status | department members/leads |
| Run reports/exports | leads + leadership |
| Admin | Rodolfo + [named backup] |

v2 currently enforces rules at the application layer; SharePoint group/site permissions
for the pre-production/production site are defined and applied before the pilot.

## G. Launch checklist
- [ ] D6 completed and live contract green under app auth
- [ ] Legacy inspection done; mapping matrix approved
- [ ] "No v2 field" decisions made (names/amount-remaining/doc-gate/TeamsPost)
- [ ] Migration dry run passed; validation report reviewed
- [ ] Notification parity decision implemented or signed off as deferred
- [ ] Reporting/export parity confirmed
- [ ] Permissions applied and spot-checked
- [ ] Pilot/user acceptance passed
- [ ] Rollback plan approved
- [ ] Communications approved
- [ ] Launch date + legacy freeze window approved
- [ ] Support owner assigned

## H. Recommended next loops
- **Loop 30:** Legacy inspection checklist runner + migration mapping template (read-only
  tooling to answer C.2 systematically and emit a sanitized inspection report).
- **Loop 31:** D6 execution/wiring (after admin approval): certificate auth in the runtime
  transport, live contract re-run under app auth.
- **Loop 32:** Migration importer design + build (fixture-driven, StatusUpdates parser
  with verbatim preservation, idempotent, exact cleanup).
- **Loop 33:** Controlled import dry-run on a full copy + §E validation report.
- **Loop 34:** Pilot readiness: permissions model applied, pilot fixtures, UAT script.
- **Loop 35:** Cutover runbook (freeze window, delta import, comms, flow retirement,
  rollback) — for approval, not execution.
