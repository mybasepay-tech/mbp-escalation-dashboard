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

## 2. Open questions (need Rod / stakeholder input)

1. **Status semantics:** Does legacy "Complete" map to **Closed** or **Resolved (awaiting
   closure)** by default? (Current default: Closed if `ResolvedDate` present.)
2. **Pending-* collapse:** OK to collapse Pending Member/Research/Customer into a single
   **Pending Review** (preserving original in notes), or keep distinct pending sub-states?
3. **Target backend:** Stay on SharePoint, or commit to a managed DB + API for v2 prod?
4. **App hosting:** SharePoint SiteAssets (like legacy) or a dedicated SPA host?
5. **Entra app:** New v2 app registration, or reuse legacy (impacts permission isolation)?
6. **Notifications:** What replaces legacy Power Automate flows in v2 (and when)?
7. **Departments/queues:** Authoritative list of departments for `EscalationTeams` seed?
8. **Required fields & categories:** Confirm the generic MVP set (intake validation).
9. **Reporting parity:** Which exact CSVs/columns must match existing spreadsheets at MVP?
10. **Retention:** How long does legacy stay readable post-cutover before any
    archival/decommission (which needs separate approval)?
11. **Pilot group & timing:** Who pilots v2 in parallel run, and what defines "parity"?

## 3. Assumptions (validate)
- Legacy lists `Escalation Tracker`, `Escalations Dept Leads`, `User Information List`
  remain the read-only sources.
- Named users (Maggie, Sarah, Jennifer, Teri) represent reporting/lead/admin personas.
- `daysOpen` is always computed, never trusted from storage.
