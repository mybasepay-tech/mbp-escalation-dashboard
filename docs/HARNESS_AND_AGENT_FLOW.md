# Harness & Agent Flow — Escalation System v2

> Planning scaffold. Describes how planning/build work is decomposed across agents and
> gated by the safety harness.

## 1. Why a harness
v2 is built **in parallel with a live production tracker**. Every step must be provably
non-destructive to legacy. The harness is the set of checklists each piece of work passes
through before it is considered done.

Harness files (in [`../harness/`](../harness/)):
- [`NO_PRODUCTION_MODIFICATION_CHECKLIST.md`](../harness/NO_PRODUCTION_MODIFICATION_CHECKLIST.md) — the prime directive gate.
- [`VALIDATION_CHECKLIST.md`](../harness/VALIDATION_CHECKLIST.md) — spec/doc/data-model consistency.
- [`SMOKE_TEST_CHECKLIST.md`](../harness/SMOKE_TEST_CHECKLIST.md) — minimal functional checks.
- [`MIGRATION_DRY_RUN_CHECKLIST.md`](../harness/MIGRATION_DRY_RUN_CHECKLIST.md) — read-only migration verification.
- [`CUTOVER_AND_ROLLBACK_CHECKLIST.md`](../harness/CUTOVER_AND_ROLLBACK_CHECKLIST.md) — gated go-live + rollback.
- [`AGENT_HANDOFF_TEMPLATE.md`](../harness/AGENT_HANDOFF_TEMPLATE.md) — standard handoff format.
- [`CODEX_REVIEW_CHECKLIST.md`](../harness/CODEX_REVIEW_CHECKLIST.md) — independent review gate.

## 2. Agents
Each agent has a charter in [`../agents/`](../agents/):
- **Lead Orchestrator** — plans, sequences, enforces the harness, owns handoffs.
- **Current State Agent** — documents the as-is legacy system (read-only).
- **Product Spec Agent** — owns product requirements.
- **Schema / Data Model Agent** — owns v2 entities and mappings.
- **Workflow Agent** — owns statuses, transitions, consistency rules.
- **UI Agent** — owns panels, views, intake, reporting UX.
- **Migration Agent** — owns dry-run + apply (v2-only writes).
- **Harness / QA Agent** — owns checklists and validation.
- **Codex Reviewer** — independent adversarial review.

## 3. Flow

```
            ┌────────────────────┐
            │  Lead Orchestrator │  (plan, sequence, gate)
            └─────────┬──────────┘
                      │ handoffs (AGENT_HANDOFF_TEMPLATE)
   ┌──────────┬───────┼────────┬──────────┬───────────┐
   ▼          ▼       ▼        ▼          ▼           ▼
Current    Product  Schema  Workflow    UI       Migration
 State      Spec     Model
   └──────────┴───────┴────────┴──────────┴───────────┘
                      │
                      ▼
              ┌───────────────┐      ┌────────────────┐
              │ Harness / QA  │─────▶│ Codex Reviewer │
              │ (checklists)  │      │ (independent)  │
              └───────────────┘      └────────────────┘
                      │                       │
                      └────────► gate ◄───────┘
                                  │
                                  ▼
                        Merge / advance branch
```

## 4. Rules of engagement
- No work item is "done" until it passes the relevant harness checklist(s) **and** Codex
  review.
- The **No Production Modification** checklist applies to *every* item touching anything
  near legacy/SharePoint/flows/permissions.
- Handoffs use the standard template so context is never lost between agents.
- Anything requiring a production action (cutover, permission change, list change) is
  **blocked pending explicit Rod approval**.

## 5. Relationship to the implementation plan
- Build work follows the phased sequence in
  [`../docs/IMPLEMENTATION_PLAN.md`](../docs/IMPLEMENTATION_PLAN.md); each phase names the
  harness gate it must pass.
- Choices made along the way are recorded in
  [`../docs/DECISION_LOG.md`](../docs/DECISION_LOG.md) (referenced as D1–D9).

## 6. Branch discipline
- Planning/refinement happens on dedicated feature branches (Loop 1 scaffold, Loop 2
  spec-refinement, …); merged to `main` via PR.
- v2 build work proceeds on its own branches; no merges to anything that affects legacy.
- Nothing in this repo writes to legacy SharePoint.
