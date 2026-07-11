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
import { analyzeLegacyExport } from './analyzeLegacyExport.js';

// Import-style capability does not exist here; refuse the flags BY NAME so nobody can
// even ask (same convention as run-migration-dry-run.js).
const REFUSED_FLAGS = ['--import', '--write', '--push', '--apply', '--execute', '--live'];

export function jsonContainerToRows(data) {
  // Foundation container { items: [{ id, fields }] } -> row objects (ID + fields).
  return (data.items ?? []).map((item) => ({ ID: String(item.id ?? ''), ...(item.fields ?? {}) }));
}

export function runAnalysis(rawText, { format }) {
  let rows;
  let parseWarnings = [];
  if (format === 'json') {
    rows = jsonContainerToRows(JSON.parse(rawText));
  } else {
    const parsed = parseCsv(rawText);
    rows = parsed.rows;
    parseWarnings = parsed.parseWarnings;
  }
  const report = analyzeLegacyExport(rows);
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
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;
  const inputs = args.filter((a, i) => a !== '--out' && (outIdx < 0 || i !== outIdx + 1));
  const path = inputs[0];
  if (!path) {
    throw new Error('usage: node run-legacy-export-analysis.js <local-export.csv|.json> [--out report.local.json]');
  }
  const rawText = readFileSync(path, 'utf8');
  const format = /\.json$/i.test(path) ? 'json' : 'csv';
  const { report } = runAnalysis(rawText, { format });

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
