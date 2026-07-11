// Migration foundation — transform tests (Loop 32). 100% offline against the obviously-fake
// sample fixture; proves the frozen D32/D33 rules are enforced by code, not prose.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { transformLegacyTicket, MIGRATION_OWNER_REF } from '../tools/migration/transformLegacyTicket.js';
import { runDryRun } from '../tools/migration/run-migration-dry-run.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, 'fixtures', 'legacy-export.sample.json');
const raw = readFileSync(FIXTURE, 'utf8');
const data = JSON.parse(raw);
const maps = data.maps;
const item = (id) => data.items.find((i) => i.id === id);
const tx = (id) => transformLegacyTicket(item(id), { userMap: maps.users, deptMap: maps.departments, tagMap: maps.tags });

test('legacy status strings are preserved EXACTLY', () => {
  assert.equal(tx('101').candidate.ticket.status, 'In Process');
  assert.equal(tx('102').candidate.ticket.status, 'Complete');
  assert.equal(tx('106').candidate.ticket.status, 'Pending Research');
});

test('unknown legacy status is preserved verbatim with a warning (never normalized)', () => {
  const { candidate, warnings } = tx('104');
  assert.equal(candidate.ticket.status, 'On Hold (Legacy)');
  assert.ok(warnings.some((w) => w.type === 'unknown-status'));
});

test("blank status becomes 'New' with a flag (the only permitted status substitution)", () => {
  const { candidate, flags } = tx('103');
  assert.equal(candidate.ticket.status, 'New');
  assert.ok(flags.some((f) => f.type === 'blank-status'));
});

test('StatusUpdates is preserved VERBATIM with correct length and sha256', () => {
  const blob = item('106').fields.StatusUpdates;
  const { statusUpdates } = tx('106').candidate;
  assert.equal(statusUpdates.raw, blob, 'byte-for-byte verbatim');
  assert.equal(statusUpdates.length, blob.length);
  assert.equal(statusUpdates.sha256, createHash('sha256').update(blob, 'utf8').digest('hex'));
  // Empty blob is still explicit, not dropped.
  assert.equal(tx('105').candidate.statusUpdates.raw, '');
});

test('party fields are preserved for the Additional Details area', () => {
  const p = tx('101').candidate.partyFields;
  assert.equal(p.memberName, 'Demo Member A (fake)');
  assert.equal(p.customerName, 'Demo Employer X (fake)');
  assert.equal(p.workerName, 'Demo Worker Z (fake)');
  assert.deepEqual(tx('105').candidate.partyFields, { memberName: null, customerName: null, workerName: null });
});

test('AmountRemaining and AssignmentID are preserved as legacy data, uninterpreted', () => {
  const d = tx('101').candidate.legacyData;
  assert.equal(d.amountRemaining, 300.25);
  assert.equal(d.assignmentId, 'ASG-000101');
  // amountInvolved (active field) still maps from FinancialImpactAmount.
  assert.equal(tx('101').candidate.ticket.amountInvolved, 1250.75);
});

test('departed/unmatched author is FLAGGED with the migration-owner closure exception (D33)', () => {
  const { candidate, flags } = tx('102');
  assert.equal(candidate.ticket.submitterId, null);
  const fl = flags.find((f) => f.type === 'departed-author');
  assert.ok(fl, 'departed-author flag required');
  assert.equal(fl.closureException, MIGRATION_OWNER_REF);
  assert.match(fl.detail, /migration owner/i);
  // A matched author produces NO such flag.
  assert.ok(!tx('101').flags.some((f) => f.type === 'departed-author'));
  assert.equal(tx('101').candidate.ticket.submitterId, 'user_maggie');
});

test('unknown legacy fields are never dropped', () => {
  const d = tx('103').candidate.legacyData;
  assert.equal(d.unknownFields.LegacyOddColumn, 'value the mapping has never seen - must be preserved');
});

test('unmapped department is flagged, tags resolve with warnings for the unmappable', () => {
  assert.ok(tx('105').flags.some((f) => f.type === 'unmapped-department'));
  assert.equal(tx('105').candidate.ticket.assignedDeptId, null);
  const t106 = tx('106');
  assert.deepEqual(t106.candidate.tags, ['tag_urgent']);
  assert.ok(t106.warnings.some((w) => w.type === 'unresolved-tags'));
});

test('legacy identity, dates, and attachment indicators carry over', () => {
  const t = tx('102').candidate;
  assert.equal(t.ticket.legacyItemId, '102');
  assert.match(t.ticket.legacyUrl, /example\.invalid/);
  assert.equal(t.ticket.completedDate, '2026-03-20T16:00:00Z', 'ResolvedDate -> completedDate on Complete');
  assert.equal(tx('101').candidate.ticket.completedDate, null, 'open tickets get no completedDate');
  assert.deepEqual(tx('106').candidate.attachments, { hasAttachments: true, count: 2 });
});

test('dry-run report aggregates counts, flags, statuses, departments, and blob stats', () => {
  const { ok, report, candidates } = runDryRun(raw);
  assert.equal(ok, true);
  assert.equal(report.totalRows, 6);
  assert.equal(report.transformed, 6);
  assert.equal(candidates.length, 6);
  assert.equal(report.departedAuthorFlags, 1);
  assert.equal(report.errorCount, 0);
  assert.ok(report.warningCount >= 3);
  assert.equal(report.statusesSeen['In Process'], 1);
  assert.equal(report.statusesSeen['On Hold (Legacy)'], 1, 'unknown status counted under its EXACT value');
  assert.equal(report.statusesSeen.New, 1, 'blank status surfaced as New');
  assert.ok(report.departmentsSeen['dept_benefits'] >= 2);
  assert.ok(report.departmentsSeen['(unmapped/none)'] >= 1);
  assert.equal(report.attachments.itemsWithAttachments, 1);
  assert.equal(report.statusUpdates.itemsWithBlob, 4);
  assert.ok(report.statusUpdates.totalChars > 0);
  assert.match(report.mode, /no import capability/i);
});
