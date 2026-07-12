// run-legacy-export-analysis — CLI for the SANITIZED legacy-export analysis (Loop 34).
//
// Reads ONE LOCAL export file (.csv from the spreadsheet export, or the foundation's
// .json container) and prints the aggregate-only report. OFFLINE ONLY: no network, no
// SharePoint, no import capability, no write path except an optional LOCAL --out file.
//
//   cd src/v2
//   node tools/migration/run-legacy-export-analysis.js <local-export.csv> [--out report.local.json]
//
// Reports derived from REAL data stay local: keep them under tools/migration/ (the
// .gitignore there covers *.local.*, *-report.*, exports/, *.csv, *.xlsx) and never
// commit them. The report carries no row content by construction — aggregates only.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { parseCsv } from './parseCsv.js';
import { analyzeLegacyExport, analyzeAttachmentInventory, summarizeSchemaSnapshot } from './analyzeLegacyExport.js';
import { EXPORT_HEADER_MAP } from './exportColumns.js';

// Import-style capability does not exist here; refuse the flags BY NAME so nobody can
// even ask (same convention as run-migration-dry-run.js).
const REFUSED_FLAGS = ['--import', '--write', '--push', '--apply', '--execute', '--live'];

// API exports carry INTERNAL field names; the analyzer's metric keys use the observed
// DISPLAY headers. Reverse of EXPORT_HEADER_MAP, optionally overridden by a real schema
// snapshot (internalName -> displayName) when one is supplied.
export function internalToDisplayMap(schema) {
  const map = {};
  for (const [display, internal] of Object.entries(EXPORT_HEADER_MAP)) map[internal] = display;
  for (const f of Array.isArray(schema) ? schema : []) {
    if (f?.internalName && f?.displayName && EXPORT_HEADER_MAP[f.displayName]) {
      map[f.internalName] = f.displayName;
    }
  }
  return map;
}

export function jsonContainerToRows(data, { schema } = {}) {
  // Foundation/exporter container { items: [{ id, fields, hasAttachments }] } -> row
  // objects keyed by DISPLAY headers where known (internal names preserved otherwise).
  const toDisplay = internalToDisplayMap(schema);
  return (data.items ?? []).map((item) => {
    const row = { ID: String(item.id ?? '') };
    for (const [k, v] of Object.entries(item.fields ?? {})) row[toDisplay[k] ?? k] = v;
    if (item.hasAttachments !== undefined && row.Attachments === undefined) {
      row.Attachments = item.hasAttachments ? '1' : '0';
    }
    return row;
  });
}

export function runAnalysis(rawText, { format, schema, attachments } = {}) {
  let rows;
  let parseWarnings = [];
  if (format === 'json') {
    rows = jsonContainerToRows(JSON.parse(rawText), { schema });
  } else {
    const parsed = parseCsv(rawText);
    rows = parsed.rows;
    parseWarnings = parsed.parseWarnings;
  }
  const report = analyzeLegacyExport(rows);
  if (attachments) report.attachments = analyzeAttachmentInventory(attachments);
  if (schema) report.schema = summarizeSchemaSnapshot(schema);
  return { report: { ...report, parseWarnings }, rows: undefined }; // rows are never returned
}

function summarize(report) {
  const lines = [];
  lines.push(`rows=${report.totalRows} columns=${report.columns.length} ids=${report.idStats.min ?? '?'}..${report.idStats.max ?? '?'} (missingInRange=${report.idStats.missingInRange ?? '?'} duplicates=${report.idStats.duplicates})`);
  const st = report.enums.Status;
  if (st) lines.push(`statuses (${st.distinctCount}): ${Object.entries(st.values).map(([v, n]) => `${v}=${n}`).join(', ')}`);
  lines.push(`blank status=${report.statusCompleteness.blankStatusCount} unexpected=${JSON.stringify(report.statusCompleteness.unexpectedStatuses)}`);
  lines.push(`StatusUpdates: filled=${report.statusUpdates.filled} len=${report.statusUpdates.minLength}..${report.statusUpdates.maxLength} avg=${report.statusUpdates.avgLength} multiline=${report.statusUpdates.multilineCount} html=${report.statusUpdates.htmlMarkupCount}${report.statusUpdates.truncationSuspected ? ' TRUNCATION-SUSPECTED (this file cannot satisfy verbatim preservation)' : ''}`);
  lines.push(`TeamsPost: filled=${report.teamsPost.filled} urlLike=${report.teamsPost.urlLikeCount}${report.teamsPost.truncationSuspected ? ' TRUNCATION-SUSPECTED' : ''} (URLs never emitted)`);
  lines.push(`AddTags2: filled=${report.addTags2.filled} lookupEncoded=${report.addTags2.lookupEncodedCount} plainSemicolon=${report.addTags2.plainSemicolonCount} maxEntries~=${report.addTags2.maxEntriesApprox}`);
  // Loop 36: when a full JSON/API export shows natural length variation, say so explicitly.
  if (report.statusUpdates.filled > 0 && !report.statusUpdates.truncationSuspected) {
    lines.push('StatusUpdates: NOT uniformly capped — verbatim preservation is satisfiable from this source.');
  }
  if (report.teamsPost.filled > 0 && !report.teamsPost.truncationSuspected) {
    lines.push('TeamsPost: NOT uniformly capped — full links available from this source.');
  }
  if (report.attachments) {
    lines.push(`Attachments: items=${report.attachments.itemsWithAttachments} files=${report.attachments.totalFiles} maxPerItem=${report.attachments.maxFilesPerItem} knownBytes=${report.attachments.totalKnownBytes}`);
  }
  if (report.schema) {
    lines.push(`Schema: fields=${report.schema.fieldCount} visible=${report.schema.visibleFieldCount} required=${report.schema.requiredFields.length} choiceFields=${Object.keys(report.schema.choiceFields).length}`);
  }
  return lines.join('\n');
}

export async function main(argv = process.argv) {
  const args = argv.slice(2);
  for (const a of args) {
    if (REFUSED_FLAGS.includes(a)) {
      throw new Error(`REFUSED: '${a}' — this tool analyzes local files only; it has no import/write capability.`);
    }
    if (/^https?:\/\//i.test(a)) {
      throw new Error('REFUSED: URL inputs are not accepted — pass a LOCAL file path (this tool makes no network calls).');
    }
  }
  const flagValue = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  const outPath = flagValue('--out');
  const schemaPath = flagValue('--schema');
  const attachmentsPath = flagValue('--attachments');
  const consumed = new Set();
  for (const name of ['--out', '--schema', '--attachments']) {
    const i = args.indexOf(name);
    if (i >= 0) { consumed.add(i); consumed.add(i + 1); }
  }
  const inputs = args.filter((_, i) => !consumed.has(i));
  const path = inputs[0];
  if (!path) {
    throw new Error('usage: node run-legacy-export-analysis.js <local-export.csv|.json> [--schema schema.local.json] [--attachments inventory.local.json] [--out report.local.json]');
  }
  const rawText = readFileSync(path, 'utf8');
  const format = /\.json$/i.test(path) ? 'json' : 'csv';
  const schema = schemaPath ? JSON.parse(readFileSync(schemaPath, 'utf8')) : null;
  const attachments = attachmentsPath ? JSON.parse(readFileSync(attachmentsPath, 'utf8')) : null;
  const { report } = runAnalysis(rawText, { format, schema, attachments });

  console.log('[mode] SANITIZED ANALYSIS — aggregates only; raw rows/values are never emitted; no import capability.');
  console.log(summarize(report));
  if (outPath) {
    if (/^https?:\/\//i.test(outPath)) throw new Error('REFUSED: --out must be a LOCAL path.');
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`[out] sanitized report written LOCALLY to ${outPath} — if derived from real data, keep it out of git (see tools/migration/.gitignore).`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  return report;
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main().catch((e) => { console.error(String(e.message ?? e)); process.exitCode = 1; });
}
