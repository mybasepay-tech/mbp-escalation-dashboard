// Legacy-export analyzer tests (Loop 34) — 100% offline against the obviously-fake CSV
// fixture. Prove the SANITIZATION CONTRACT with code: aggregates only, sensitive values
// never emitted, raw rows never emitted, credential material refused, no network paths.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseCsv } from '../tools/migration/parseCsv.js';
import {
  analyzeLegacyExport, SAFE_ENUM_COLUMNS, SENSITIVE_COLUMNS,
} from '../tools/migration/analyzeLegacyExport.js';
import { rowToLegacyItem, EXPORT_HEADER_MAP } from '../tools/migration/exportColumns.js';
import { transformLegacyTicket } from '../tools/migration/transformLegacyTicket.js';
import { runAnalysis } from '../tools/migration/run-legacy-export-analysis.js';

const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(V2_ROOT, 'tests', 'fixtures', 'legacy-export-analysis.sample.csv');
const raw = readFileSync(FIXTURE, 'utf8');
const { headers, rows, parseWarnings } = parseCsv(raw);
const report = analyzeLegacyExport(rows);
const reportText = JSON.stringify(report);

// ---------- fixture hygiene ----------

test('the analysis fixture is obviously fake: .invalid hosts only, no GUIDs, no tokens', () => {
  const urls = raw.match(/https?:\/\/[^\s",]+/g) ?? [];
  assert.ok(urls.length > 0, 'fixture should exercise URL-bearing columns');
  for (const u of urls) assert.match(u, /\.invalid/, `URL must be .invalid: ${u}`);
  assert.doesNotMatch(raw, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'no GUIDs');
  assert.doesNotMatch(raw, /eyJ[A-Za-z0-9_-]{15,}/, 'no token material');
  assert.match(raw, /fake|synthetic/i, 'content self-identifies as fake');
});

// ---------- CSV parsing ----------

test('parseCsv handles the export dialect: quoted multiline cells, embedded commas, escaped quotes', () => {
  assert.equal(headers.length, 31, '31 observed export columns');
  assert.equal(rows.length, 6);
  assert.deepEqual(parseWarnings, []);
  const first = rows[0];
  assert.match(first['Status Updates'], /\n/, 'multiline blob survives parsing');
  assert.match(first['Status Updates'], /"quoted note"/, 'escaped quotes decode');
  assert.match(first['Status Updates'], /with, comma/, 'embedded comma survives');
});

// ---------- column inventory + completeness ----------

test('column inventory preserves order and covers all 31 observed export columns', () => {
  assert.deepEqual(report.columns, headers);
  assert.equal(report.columns.length, 31);
});

test('non-empty counts are per-column accurate', () => {
  assert.equal(report.totalRows, 6);
  assert.equal(report.nonEmptyCounts.ID, 6);
  assert.equal(report.nonEmptyCounts.Status, 5, 'one blank status row');
  assert.equal(report.nonEmptyCounts['Member Name'], 3);
  assert.equal(report.nonEmptyCounts['Teams Post'], 3);
  assert.equal(report.nonEmptyCounts.AddTags2, 3);
  assert.equal(report.nonEmptyCounts['Amount Remaining'], 3);
  assert.equal(report.nonEmptyCounts['Status Updates'], 4);
});

test('ID stats expose min/max/gaps so partial views are detectable', () => {
  assert.equal(report.idStats.count, 6);
  assert.equal(report.idStats.min, 201);
  assert.equal(report.idStats.max, 208);
  assert.equal(report.idStats.missingInRange, 2, 'gaps at 204 and 207');
  assert.equal(report.idStats.duplicates, 0);
});

// ---------- enums, statuses, dates ----------

test('distinct value counts exist ONLY for whitelisted enum columns', () => {
  assert.equal(report.enums.Status.values.Complete, 1);
  assert.equal(report.enums.Status.values['On Hold (Legacy)'], 1);
  assert.equal(report.enums.Urgency.values.High, 2);
  assert.equal(report.enums['Assigned Department Owner'].distinctCount, 6);
  for (const col of Object.keys(report.enums)) {
    assert.ok(SAFE_ENUM_COLUMNS.includes(col), `enum column '${col}' must be whitelisted`);
    assert.ok(!SENSITIVE_COLUMNS.includes(col), `enum column '${col}' must not be sensitive`);
  }
});

test('status completeness reports blanks and unexpected values', () => {
  assert.equal(report.statusCompleteness.blankStatusCount, 1);
  assert.deepEqual(report.statusCompleteness.unexpectedStatuses, { 'On Hold (Legacy)': 1 });
});

test('date columns report parsed counts and min/max date-parts only', () => {
  assert.equal(report.dates.Created.parsed, 6);
  assert.equal(report.dates.Created.min, '2026-01-05');
  assert.equal(report.dates.Created.max, '2026-04-02');
  assert.equal(report.dates['Resolved Date'].parsed, 1);
});

// ---------- text metrics without text ----------

test('Status Updates metrics: lengths + multiline/html/emoji detection, never the text', () => {
  const su = report.statusUpdates;
  assert.equal(su.filled, 4);
  assert.ok(su.maxLength > 50);
  assert.ok(su.avgLength > 0 && su.medianLength > 0);
  assert.equal(su.multilineCount, 2);
  assert.ok(su.htmlMarkupCount >= 2, 'entity (&amp;) and <b> markup detected');
  assert.equal(su.emojiCount, 1);
  assert.doesNotMatch(reportText, /triaged|quoted note|escalated/, 'no blob content in the report');
});

test('Teams Post metrics never include URLs', () => {
  assert.deepEqual(report.teamsPost, { filled: 3, urlLikeCount: 3 });
  assert.doesNotMatch(reportText, /teams\.example\.invalid/, 'no URL leaks into the report');
  assert.doesNotMatch(reportText, /https?:\/\//, 'no URL of any kind in the report');
});

test('AddTags2: lookup encoding detected, entry counts approximated, names never emitted', () => {
  assert.equal(report.addTags2.filled, 3);
  assert.equal(report.addTags2.lookupEncodedCount, 3);
  assert.equal(report.addTags2.maxEntriesApprox, 2);
  assert.doesNotMatch(reportText, /Fake Tag|Fake Person/, 'no tag/person names in the report');
});

// ---------- the sanitization contract ----------

test('sensitive values NEVER appear in the report (names, titles, commentary, paths, assignment ids)', () => {
  for (const needle of [
    'Fake Requester', 'Fake Member', 'Fake Employer', 'Fake Worker', 'Fake Agent',
    'billing discrepancy', 'Synthetic commentary', 'ASG-FAKE', 'personal/fake_owner',
    'Fake internal doc',
  ]) {
    assert.ok(!reportText.includes(needle), `report must not contain '${needle}'`);
  }
});

test('raw rows are never emitted and sensitive columns cannot be whitelisted', () => {
  assert.equal(report.sanitization.rawRowsEmitted, false);
  assert.equal(reportText.includes('"rows"'), false);
  for (const col of ['Member Name', 'Teams Post', 'Title', 'Path']) {
    assert.throws(() => analyzeLegacyExport(rows, { extraEnumColumns: [col] }), /REFUSED.*sensitive/);
  }
});

test('credential material in an export is refused outright (clearly-fake synthetic input, tests only)', () => {
  const dirty = [{ ID: '1', Status: 'Complete', 'Status Updates': 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ.fakefakefake' }];
  assert.throws(() => analyzeLegacyExport(dirty), /REFUSED.*token/i);
  const pem = [{ ID: '2', Title: '-----BEGIN PRIVATE KEY----- fake' }];
  assert.throws(() => analyzeLegacyExport(pem), /REFUSED.*private key/i);
});

test('unknown columns are still inventoried and counted (never dropped, values never emitted)', () => {
  const r = analyzeLegacyExport([{ ID: '1', Status: 'Complete', 'Mystery Column': 'secret-ish value' }]);
  assert.ok(r.columns.includes('Mystery Column'));
  assert.equal(r.nonEmptyCounts['Mystery Column'], 1);
  assert.ok(!JSON.stringify(r).includes('secret-ish'), 'unknown column values never emitted');
});

// ---------- CLI wrapper ----------

test('runAnalysis(csv) returns the sanitized report and never the rows', () => {
  const res = runAnalysis(raw, { format: 'csv' });
  assert.equal(res.rows, undefined);
  assert.equal(res.report.totalRows, 6);
  assert.deepEqual(res.report.parseWarnings, []);
});

test('the analysis CLI refuses import-style flags and URL inputs by name', () => {
  const src = readFileSync(join(V2_ROOT, 'tools', 'migration', 'run-legacy-export-analysis.js'), 'utf8');
  for (const flag of ['--import', '--write', '--push', '--apply', '--execute', '--live']) {
    assert.ok(src.includes(`'${flag}'`), `refusal list must include ${flag}`);
  }
  assert.match(src, /REFUSED/, 'refusal path present');
});

// ---------- export-shape bridge into the Loop 32 foundation ----------

test('rowToLegacyItem normalizes display headers to canonical fields; meta columns split out', () => {
  const item = rowToLegacyItem(rows[0]);
  assert.equal(item.id, '201');
  assert.equal(item.itemType, 'Item');
  assert.match(item.sourcePath, /Lists\/Escalations/);
  assert.equal(item.fields.AssignedDepartmentOwner, 'Billing Demo');
  assert.equal(item.fields.CreatedBy, 'Fake Requester A');
  assert.equal(item.fields.EscalationCommentary, 'Synthetic commentary row one — not a real ticket.');
  assert.ok(!('Path' in item.fields) && !('ID' in item.fields), 'meta columns are not ticket fields');
  // every mapped header resolves to a canonical name
  for (const [display, canonical] of Object.entries(EXPORT_HEADER_MAP)) {
    assert.ok(typeof canonical === 'string' && !canonical.includes(' '), `${display} -> ${canonical}`);
  }
});

test('rowToLegacyItem preserves unknown headers as-is (never dropped)', () => {
  const item = rowToLegacyItem({ ID: '9', 'Never Seen Column': 'keep me', Status: 'Complete' });
  assert.equal(item.fields['Never Seen Column'], 'keep me');
});

test('normalized export rows flow through transformLegacyTicket with the frozen rules intact', () => {
  const item = rowToLegacyItem(rows[0]);
  const { candidate, flags } = transformLegacyTicket(item, {
    userMap: { 'name:Fake Requester A': { name: 'Fake Requester A', v2Id: 'user_fake_a' } },
    deptMap: { 'Billing Demo': 'dept_billing_demo' },
  });
  assert.equal(candidate.ticket.status, 'Complete', 'status preserved exactly');
  assert.equal(candidate.ticket.submitterId, 'user_fake_a', 'name-keyed requester mapping works');
  assert.ok(!flags.some((f) => f.type === 'departed-author'));
  assert.equal(candidate.ticket.description, 'Synthetic commentary row one — not a real ticket.');
  assert.equal(candidate.ticket.legacyItemId, '201');
  assert.equal(candidate.statusUpdates.raw, rows[0]['Status Updates'], 'blob verbatim');
  assert.equal(candidate.legacyData.addTags2Raw, rows[0].AddTags2, 'AddTags2 kept raw until parsing strategy is approved');
  assert.equal(candidate.legacyData.createdByName, 'Fake Requester A');
  assert.equal(candidate.legacyData.daysToResolve, '13');
  // unmatched author on a spreadsheet row still produces the D33 exception flag
  const other = transformLegacyTicket(rowToLegacyItem(rows[1]), {});
  assert.ok(other.flags.some((f) => f.type === 'departed-author'));
});

// ---------- offline by construction ----------

test('analysis modules make no network calls and read no env', () => {
  for (const f of ['parseCsv.js', 'analyzeLegacyExport.js', 'run-legacy-export-analysis.js', 'exportColumns.js']) {
    const src = readFileSync(join(V2_ROOT, 'tools', 'migration', f), 'utf8');
    assert.doesNotMatch(src, /\bfetch\s*\(/, `${f}: no fetch`);
    assert.doesNotMatch(src, /XMLHttpRequest/, `${f}: no XHR`);
    assert.doesNotMatch(src, /from\s+['"](node:)?https?['"]/, `${f}: no http(s) import`);
    assert.doesNotMatch(src, /process\.env/, `${f}: no env reads`);
  }
});

test('a tools/migration .gitignore shields real exports and reports from git', () => {
  const ig = readFileSync(join(V2_ROOT, 'tools', 'migration', '.gitignore'), 'utf8');
  for (const pat of ['exports/', '*.csv', '*.xlsx', '*.local.*', '*-report.*']) {
    assert.ok(ig.includes(pat), `.gitignore must cover ${pat}`);
  }
  // The committed fixture lives in tests/fixtures (not covered by that ignore) — assert it
  // is the ONLY csv in the tree's tracked areas we expect.
  const toolsFiles = readdirSync(join(V2_ROOT, 'tools', 'migration'));
  assert.ok(!toolsFiles.some((f) => /\.(csv|xlsx)$/i.test(f)), 'no spreadsheet files inside tools/migration');
});
