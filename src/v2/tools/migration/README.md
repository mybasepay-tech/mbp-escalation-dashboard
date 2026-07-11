# Migration Foundation (Loop 32) — OFFLINE ONLY

> Foundation tooling for the future legacy→v2 migration. **Not connected to anything:**
> no network, no SharePoint, no legacy access, no import capability. It reads LOCAL files
> and prints reports. The gated importer that actually writes to v2 pre-production is a
> future, separately-approved loop (see `docs/MIGRATION_DRY_RUN_PLAN.md` gates G1–G3).

| File | Purpose |
|---|---|
| `legacyExportSchema.js` | Known legacy fields, expected status vocabulary, export container shape, and the fail-closed content guards (refuses token/key/secret material and — for the foundation phase — any non-`.invalid` URL, so only clearly-fake data can flow). |
| `validateLegacyExport.js` | Pure validation of a raw export string: guards → JSON → shape → per-item checks; emits problems (blocking), warnings (mapping input), and a summary. |
| `transformLegacyTicket.js` | Pure transform of one exported item into a v2 **import candidate**, implementing the frozen D32/D33 rules: exact status preservation, verbatim `StatusUpdates` + length + sha256, party fields for Additional Details, AmountRemaining/AssignmentID/unknown fields preserved in `legacyData`, departed-author flags carrying the migration-owner closure-exception marker. |
| `run-migration-dry-run.js` | CLI: validate + transform + report. Refuses `--import/--write/--apply/...` by name, refuses URL inputs, has no write path except an optional LOCAL `--out` report. |

Try it against the fake sample:
```bash
cd src/v2
node tools/migration/run-migration-dry-run.js tests/fixtures/legacy-export.sample.json
```

**Rules encoded here** (authority: `docs/MIGRATION_MAPPING_TEMPLATE.md`):
legacy statuses preserved 100% · StatusUpdates verbatim (never trimmed/parsed here) ·
party fields preserved · AmountRemaining/AssignmentID preserved uninterpreted · unknown
legacy fields never dropped · departed authors flagged for the designated migration owner
(named in the decision log, not in code) · attachments tracked as indicators only.

**When real exports exist** (after inspection + G1 approval): they are local-only and
git-ignored; the `.invalid`-URL guard will be deliberately revisited in that loop; reports
generated from real data never enter git.
