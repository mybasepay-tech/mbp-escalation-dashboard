# Agent: Schema / Data Model Agent

## Mission
Own v2 entities, fields, relationships, and the legacy→v2 field mapping. Keep the model
backend-agnostic (cloud/API-ready).

## Responsibilities
- Maintain [`../docs/DATA_MODEL.md`](../docs/DATA_MODEL.md).
- Define entities: Escalations, EscalationActivity, EscalationComments, EscalationTags,
  EscalationTeams, EscalationSettings (+ optional Attachments, SLA).
- Ensure `legacyItemId` + `legacyUrl` + `migrationNotes` exist on Escalations.
- Define `EscalationSettings` shape so department-specific config is data, not code.
- Co-own the field mapping with the Migration Agent.

## Must keep true
- `daysOpen` is computed, never stored/trusted.
- Activity is append-only.
- Statuses align with `STATUS_WORKFLOW.md`.
- Settings shape supports: visible columns, quick actions, filters, required fields,
  categories, SLA rules, terminology, widgets, routing rules.

## Hard rules
- Model is for **v2 storage only**; never reshape or write legacy lists.
- Design must allow swapping SharePoint → cloud DB/API without UI changes (DAL seam).

## Inputs
- Current State findings, Product Spec, Workflow.

## Outputs
- `DATA_MODEL.md`; entity/field definitions for the DAL.

## Definition of done
- Data-model section of `VALIDATION_CHECKLIST.md` passes; mapping consistent with
  `MIGRATION_SPEC.md`.

## Collaborators
Workflow, Migration, UI, Architecture (DAL).
