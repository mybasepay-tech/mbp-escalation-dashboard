# Migration Foundation (Loop 32; export analysis Loop 34) — OFFLINE ONLY

> Foundation tooling for the future legacy→v2 migration. **Not connected to anything:**
> no network, no SharePoint, no legacy access, no import capability. It reads LOCAL files
> and prints reports. The gated importer that actually writes to v2 pre-production is a
> future, separately-approved loop (see `docs/MIGRATION_DRY_RUN_PLAN.md` gates G1–G3).

| File | Purpose |
|---|---|
| `legacyExportSchema.js` | Known legacy fields (extended Loop 34 with the real-export columns: `CreatedBy`, `AssignedTo`, `EscalationCommentary`, `AddTags2`, `DaysToResolve`), expected status vocabulary, export container shape, and the fail-closed content guards (refuses token/key/secret material and — for the foundation phase — any non-`.invalid` URL, so only clearly-fake data can flow). |
| `validateLegacyExport.js` | Pure validation of a raw export string: guards → JSON → shape → per-item checks; emits problems (blocking), warnings (mapping input), and a summary. |
| `transformLegacyTicket.js` | Pure transform of one exported item into a v2 **import candidate**, implementing the frozen D32/D33 rules: exact status preservation, verbatim `StatusUpdates` + length + sha256, party fields for Additional Details, AmountRemaining/AssignmentID/unknown fields preserved in `legacyData`, departed-author flags carrying the migration-owner closure-exception marker. Loop 34: accepts name-keyed user maps (`name:<display name>`) for spreadsheet exports; description falls back `EscalationCommentary` → `StatusCommentary`; `AddTags2` kept RAW in `legacyData.addTags2Raw` pending its parsing decision. |
| `run-migration-dry-run.js` | CLI: validate + transform + report. Refuses `--import/--write/--apply/...` by name, refuses URL inputs, has no write path except an optional LOCAL `--out` report. |
| `exportColumns.js` | **Loop 34.** Canonical map of the REAL export's 31 display headers → internal field names, plus `rowToLegacyItem(row)` bridging spreadsheet rows into the foundation's `{ id, fields }` shape (`ID`/`Item Type`/`Path` split out as metadata; unknown headers preserved). |
| `parseCsv.js` | **Loop 34.** Zero-dependency strict CSV parser (BOM, CRLF, RFC-4180 quoting incl. multiline `Status Updates` cells). |
| `analyzeLegacyExport.js` | **Loop 34; hardened Loop 35 after the first real run.** SANITIZED aggregate-only analysis: counts, ID range/gaps, per-column completeness, whitelisted enum distributions (status/urgency/departments/issue types + the `Attachments` "0"/"1" indicator and `Days to Resolve` label), date ranges, `Status Updates`/`Teams Post` length metrics **with automatic truncation detection** (uniform-length caps are flagged `truncationSuspected` — a truncated export can never feed verbatim preservation), `AddTags2` counts covering BOTH renderings (`A;#1;#B;#2` pairs and plain `Name A;Name B`), and DISTINCT-COUNT-ONLY metrics for people columns (`Created By`/`Assigned To`/`AddTags2`) to size user-mapping work. Sensitive columns (names, titles, commentary, links, paths) can NEVER be emitted as values — not even by explicit whitelist; raw rows are never emitted; credential material is refused. |
| `run-legacy-export-analysis.js` | **Loop 34.** CLI over the analyzer for a LOCAL `.csv`/`.json` export. Refuses import-style flags and URL inputs; only write path is an optional LOCAL `--out`. |
| `.gitignore` | **Loop 34.** Keeps real exports + derived reports out of git (`exports/`, `*.csv`, `*.xlsx`, `*.local.*`, `*-report.*`). Drop real export files in `tools/migration/exports/`. |

Analyze a LOCAL export (aggregates only — safe to review, still never commit real-data output):
```bash
cd src/v2
node tools/migration/run-legacy-export-analysis.js tools/migration/exports/<your-export>.csv
# or exercise it with the fake fixture:
node tools/migration/run-legacy-export-analysis.js tests/fixtures/legacy-export-analysis.sample.csv
```

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
