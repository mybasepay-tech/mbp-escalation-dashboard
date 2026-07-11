// analyzeLegacyExport — SANITIZED, aggregate-only analysis of a LOCAL legacy export
// (Loop 34). OFFLINE ONLY: pure function over parsed rows; no I/O, no network, no
// SharePoint, no import capability.
//
// PRIVACY BY CONSTRUCTION — this module's whole contract:
//   * The report contains AGGREGATES ONLY: counts, lengths, min/max dates, and distinct
//     values for a fixed whitelist of small choice-style columns (statuses, departments,
//     urgency, issue categories). Nothing else.
//   * SENSITIVE columns (names, titles, commentary, Status Updates text, Teams links,
//     tags, paths, assignment ids) can NEVER be emitted as values — only counted and
//     measured. They cannot be whitelisted, even explicitly: the analyzer throws.
//   * There is NO option to include raw rows. Reports derived from real data still must
//     not be committed (see tools/migration/.gitignore) — but even if one leaked, it
//     would carry no row content.
//   * Inputs carrying credential material (tokens/private keys) are refused outright.

import { EXPECTED_LEGACY_STATUSES } from './legacyExportSchema.js';
import { LOOKUP_ENCODING } from './exportColumns.js';

export const ANALYSIS_VERSION = 'loop34-v1';

/** Columns whose DISTINCT VALUES may appear in a report (small business choice sets). */
export const SAFE_ENUM_COLUMNS = Object.freeze([
  'Status', 'Urgency', 'Requesting Dept', 'Assigned Department Owner',
  'Issue Type', 'Issue Category Detail', 'Internal Documentation Needed', 'Item Type',
  // Loop 35 (real "Export to CSV" flavor): per-row attachment indicator ("0"/"1") and
  // the Days-to-Resolve calculated label/number — both value-safe.
  'Attachments', 'Days to Resolve',
]);

/**
 * Sensitive people-ish columns reported as DISTINCT COUNT ONLY (never values) — sizes the
 * user-mapping/departed-author work without leaking a single name.
 */
export const DISTINCT_COUNT_ONLY_COLUMNS = Object.freeze(['Created By', 'Assigned To', 'AddTags2']);

/** Columns whose values are NEVER emitted — counts/metrics only. Not whitelistable. */
export const SENSITIVE_COLUMNS = Object.freeze([
  'Title', 'Created By', 'Member Name', 'Customer Name', 'Worker Name', 'Assigned To',
  'Escalation Commentary', 'Status Updates', 'Internal Documentation Commentary',
  'Teams Post', 'AddTags2', 'Path', 'Assignment ID',
]);

/** Date columns reported as parsed-count + min/max (date part only). */
export const DATE_COLUMNS = Object.freeze([
  'Created', 'Expected Resolution Date', 'Resolved Date', 'DateAssignedtoCurrent',
]);

const CREDENTIAL_GUARDS = [
  ['JWT-like token', /eyJ[A-Za-z0-9_-]{15,}\./],
  ['private key material', /BEGIN [A-Z ]*PRIVATE KEY/],
];

const MAX_DISTINCT = 50; // enum columns larger than this are truncated, flagged, never dumped
const MAX_VALUE_LEN = 80;

const filled = (v) => v != null && String(v).trim() !== '';

function median(sorted) {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * @param {Record<string,string>[]} rows  parsed export rows (header -> cell text)
 * @param {object} [opts]
 * @param {string[]} [opts.extraEnumColumns] additional columns to treat as safe enums —
 *   REFUSED if any is in SENSITIVE_COLUMNS.
 * @returns {object} sanitized aggregate report (JSON-serializable)
 */
export function analyzeLegacyExport(rows, opts = {}) {
  if (!Array.isArray(rows)) throw new Error('analyzeLegacyExport: rows must be an array');
  const extra = opts.extraEnumColumns ?? [];
  for (const col of extra) {
    if (SENSITIVE_COLUMNS.includes(col)) {
      throw new Error(`REFUSED: '${col}' is a sensitive column — its values can never be emitted, not even by explicit whitelist`);
    }
  }
  const enumColumns = [...new Set([...SAFE_ENUM_COLUMNS, ...extra])];

  // ----- credential guard over every cell (fail-closed; message carries no cell text) -----
  for (const row of rows) {
    for (const v of Object.values(row)) {
      const s = String(v ?? '');
      for (const [why, re] of CREDENTIAL_GUARDS) {
        if (re.test(s)) throw new Error(`REFUSED: input contains ${why} — an export must never carry credential material`);
      }
    }
  }

  // ----- column inventory (first-seen order) + non-empty counts -----
  const columns = [];
  const nonEmptyCounts = {};
  for (const row of rows) {
    for (const col of Object.keys(row)) {
      if (!(col in nonEmptyCounts)) { columns.push(col); nonEmptyCounts[col] = 0; }
      if (filled(row[col])) nonEmptyCounts[col] += 1;
    }
  }

  // ----- ID stats -----
  const idsNumeric = [];
  let idNonNumeric = 0;
  const idSeen = new Set();
  let idDuplicates = 0;
  for (const row of rows) {
    const raw = String(row.ID ?? '').trim();
    if (raw === '') continue;
    if (idSeen.has(raw)) idDuplicates += 1; else idSeen.add(raw);
    const n = Number(raw);
    if (Number.isFinite(n)) idsNumeric.push(n); else idNonNumeric += 1;
  }
  const idStats = idsNumeric.length
    ? {
      count: idsNumeric.length,
      min: Math.min(...idsNumeric),
      max: Math.max(...idsNumeric),
      duplicates: idDuplicates,
      nonNumeric: idNonNumeric,
      // gaps signal the export may be a filtered VIEW rather than the full list
      missingInRange: Math.max(...idsNumeric) - Math.min(...idsNumeric) + 1 - new Set(idsNumeric).size,
    }
    : { count: 0, duplicates: idDuplicates, nonNumeric: idNonNumeric };

  // ----- distinct values for safe enum columns only -----
  const enums = {};
  for (const col of enumColumns) {
    if (!(col in nonEmptyCounts)) continue;
    const counts = new Map();
    for (const row of rows) {
      if (!filled(row[col])) continue;
      const v = String(row[col]).trim().slice(0, MAX_VALUE_LEN);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    enums[col] = {
      distinctCount: counts.size,
      truncated: counts.size > MAX_DISTINCT,
      values: Object.fromEntries(sorted.slice(0, MAX_DISTINCT)),
    };
  }

  // ----- status completeness -----
  const blankStatusCount = rows.filter((r) => !filled(r.Status)).length;
  const unexpectedStatuses = {};
  for (const [value, count] of Object.entries(enums.Status?.values ?? {})) {
    if (!EXPECTED_LEGACY_STATUSES.includes(value)) unexpectedStatuses[value] = count;
  }

  // ----- date ranges (date part only — never full row context) -----
  const dates = {};
  for (const col of DATE_COLUMNS) {
    if (!(col in nonEmptyCounts)) continue;
    let parsed = 0;
    let unparsable = 0;
    let min = null;
    let max = null;
    for (const row of rows) {
      if (!filled(row[col])) continue;
      const t = Date.parse(String(row[col]).trim());
      if (Number.isNaN(t)) { unparsable += 1; continue; }
      parsed += 1;
      if (min == null || t < min) min = t;
      if (max == null || t > max) max = t;
    }
    dates[col] = {
      filled: nonEmptyCounts[col], parsed, unparsable,
      min: min == null ? null : new Date(min).toISOString().slice(0, 10),
      max: max == null ? null : new Date(max).toISOString().slice(0, 10),
    };
  }

  // Uniform value lengths across many rows signal an EXPORT TRUNCATION CAP — such a
  // column cannot satisfy a verbatim-preservation requirement from this file (Loop 35:
  // observed on Status Updates ~195 chars and Teams Post exactly 100 chars).
  const lengthProfile = (values) => {
    const lens = values.map((s) => s.length).sort((a, b) => a - b);
    return {
      minLength: lens[0] ?? 0,
      maxLength: lens.at(-1) ?? 0,
      distinctLengthCount: new Set(lens).size,
      truncationSuspected: values.length >= 5 && (lens.at(-1) - lens[0]) <= 2,
    };
  };

  // ----- Status Updates metrics (NEVER the text) -----
  const blobs = rows.map((r) => String(r['Status Updates'] ?? '')).filter((s) => s.trim() !== '');
  const lengths = blobs.map((s) => s.length).sort((a, b) => a - b);
  const statusUpdates = {
    filled: blobs.length,
    ...lengthProfile(blobs),
    avgLength: lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0,
    medianLength: median(lengths),
    multilineCount: blobs.filter((s) => /\r|\n/.test(s)).length,
    htmlMarkupCount: blobs.filter((s) => /<[a-z][^>]*>|&#?\w{2,8};/i.test(s)).length,
    emojiCount: blobs.filter((s) => /\p{Extended_Pictographic}/u.test(s)).length,
  };

  // ----- Teams Post metrics (NEVER the URLs) -----
  const teams = rows.map((r) => String(r['Teams Post'] ?? '')).filter((s) => s.trim() !== '');
  const teamsPost = {
    filled: teams.length,
    urlLikeCount: teams.filter((s) => /https?:\/\//i.test(s)).length,
    ...lengthProfile(teams),
  };

  // ----- AddTags2 metrics (NEVER the names) -----
  // Two encodings exist in the wild (Loop 35): classic lookup pairs `A;#1;#B;#2`, and the
  // list "Export to CSV" flavor rendering plain display names separated by `;`.
  const tags = rows.map((r) => String(r.AddTags2 ?? '')).filter((s) => s.trim() !== '');
  const lookupEncoded = tags.filter((s) => LOOKUP_ENCODING.test(s));
  const plainSemicolon = tags.filter((s) => !LOOKUP_ENCODING.test(s) && s.includes(';'));
  const entriesIn = (s) => (LOOKUP_ENCODING.test(s)
    ? Math.ceil(s.split(';#').length / 2)
    : s.split(';').filter((p) => p.trim() !== '').length);
  const addTags2 = {
    filled: tags.length,
    lookupEncodedCount: lookupEncoded.length,
    plainSemicolonCount: plainSemicolon.length,
    maxEntriesApprox: tags.length ? Math.max(...tags.map(entriesIn)) : 0,
  };

  // ----- distinct-count-only metrics for people-ish columns (NEVER values) -----
  const distinctCounts = {};
  for (const col of DISTINCT_COUNT_ONLY_COLUMNS) {
    if (!(col in nonEmptyCounts)) continue;
    const set = new Set();
    for (const row of rows) { const v = String(row[col] ?? '').trim(); if (v) set.add(v); }
    distinctCounts[col] = { filled: nonEmptyCounts[col], distinctCount: set.size };
  }

  return {
    analysisVersion: ANALYSIS_VERSION,
    sanitization: {
      aggregateOnly: true,
      rawRowsEmitted: false,
      sensitiveColumnsValueFree: [...SENSITIVE_COLUMNS],
      enumValueColumns: enumColumns.filter((c) => c in nonEmptyCounts),
    },
    totalRows: rows.length,
    idStats,
    columns,
    nonEmptyCounts,
    enums,
    statusCompleteness: { blankStatusCount, unexpectedStatuses },
    dates,
    statusUpdates,
    teamsPost,
    addTags2,
    distinctCounts,
  };
}

export default analyzeLegacyExport;
