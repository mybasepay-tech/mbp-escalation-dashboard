# Risks & Open Questions — Escalation System v2

> Planning scaffold. Living document; update as decisions are made.

## 1. Risks

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R1 | Accidental write to legacy tracker | Data corruption in production | Read-only `LegacyReader`; read-only Graph scopes for migration; No-Production-Modification checklist on every item. |
| R2 | Permission/flow change as a side effect | Breaks live system / access | Hard rule: never touch permissions or flows; separate v2 Entra app. |
| R3 | Legacy data drift carried into v2 | Bad reports/decisions | Drift detection + correction **in v2 only**, with notes; dry-run review. |
| R4 | Lost traceability to legacy | Can't audit/rollback | Preserve `legacyItemId` + `legacyUrl`; idempotent on `legacyItemId`. |
| R5 | Backend lock-in to SharePoint | Hard future migration | DAL seam (`EscalationStore`); SharePoint is temporary, API-ready design. |
| R6 | Status mapping ambiguity (Complete → Resolved vs Closed; Pending-* collapse) | Wrong lifecycle state | Documented rules; decision logged at migration; original preserved in notes. |
| R7 | Dependence on legacy Power Automate flows | Brittle long-term | v2 owns its own notifications later; flows not part of v2 design. |
| R8 | Premature cutover | Users disrupted | Phased, gated cutover; explicit Rod approval; reversible rollback. |
| R9 | Identity/dept resolution gaps in migration | Unassigned/mis-routed tickets | Errors log + manual review; seed teams from leads/user lists. |
| R10 | Scope creep into department-specific config in MVP | Delays MVP | Generic panel only; config *shape* defined, behavior deferred. |
| R11 | Over-aggressive auto-status surprises users / hides intent | Wrong lifecycle state, distrust | Auto only for forward New→Assigned band; never past In Progress; every auto-change logged + shown; behavior gated by D2. |
| R12 | DAL leakage (UI calling Graph/SharePoint directly) | Backend lock-in, accidental prod coupling | Single `EscalationStore` seam; lint/review rule forbidding direct Graph calls in UI; Codex check. |

## 2. Open questions (need Rod / stakeholder input)

> Tracked with decision IDs in [`DECISION_LOG.md`](./DECISION_LOG.md). Items below note the
> related decision (Dx).

1. **App stack & hosting (D1):** SPA on a dedicated host, SPA on SharePoint SiteAssets, or
   single-file like legacy? *Blocks Phase 0.*
2. **Auto-status behavior (D2):** On assignment, should v2 **auto-set** status, **prompt**,
   or **warn only**? (Recommend auto for forward moves.) *Blocks Phase 2.*
3. **Target backend (D3):** Stay on SharePoint, or commit to a managed DB + API, or
   **Dataverse** for v2 prod? (MVP is mock-first, so this is post-MVP.)
4. **"Complete" mapping (D4):** Map legacy "Complete" to **Closed** or **Resolved (awaiting
   closure)**? (Default: Closed if `ResolvedDate` present.)
5. **Pending-* collapse (D5):** Collapse Pending Member/Research/Customer into a single
   **Pending Review** (preserving original in notes), or keep distinct sub-states?
6. **Entra app (D6):** New v2 app registration, or reuse legacy (impacts permission
   isolation)?
7. **Migration dry-run access (D7):** Provide a read-only **export/sample** for offline
   dry-run, or approve read-only Graph access to legacy lists? *Blocks Phase 7 vs real data.*
8. **Departments/queues (D8):** Authoritative list of departments for `EscalationTeams` seed?
9. **Required fields & categories (D9):** Confirm the generic MVP set (intake validation).
10. **Notifications:** What replaces legacy Power Automate flows in v2 (and when)?
11. **Reporting parity:** Which exact CSVs/columns must match existing spreadsheets at MVP?
12. **Retention:** How long does legacy stay readable post-cutover before any
    archival/decommission (which needs separate approval)?
13. **Pilot group & timing:** Who pilots v2 in parallel run, and what defines "parity"?

## 3. Assumptions (validate)
- Legacy lists `Escalation Tracker`, `Escalations Dept Leads`, `User Information List`
  remain the read-only sources.
- Named users (Maggie, Sarah, Jennifer, Teri) represent reporting/lead/admin personas.
- `daysOpen` is always computed, never trusted from storage.
