// run-migration-dry-run — OFFLINE dry-run CLI for the migration foundation (Loop 32).
//
// Reads a LOCAL export file, validates it (fail-closed), transforms every item into a v2
// import candidate, and prints a sanitized report. THAT IS ALL IT CAN DO:
//   * there is NO import code path in this tool — none, not even gated;
//   * it never opens a network connection (no fetch/http imports exist here);
//   * it never touches SharePoint, legacy, or any live system;
//   * the only write is an OPTIONAL local report file via --out (reports produced from any
//     future real export must stay out of git).
// Importing into v2 pre-production is a FUTURE, separately-approved capability
// (docs/MIGRATION_DRY_RUN_PLAN.md gates G1–G3).
//
// Usage:
//   node run-migration-dry-run.js <export.json> [--out <report.json>]

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { validateLegacyExport } from './validateLegacyExport.js';
import { transformLegacyTicket } from './transformLegacyTicket.js';

/** Words that would suggest someone expects this tool to WRITE anywhere — refused. */
const REFUSED_FLAGS = ['--import', '--write', '--push', '--apply', '--execute', '--live'];

export function runDryRun(rawExportText, { migrationOwnerRef } = {}) {
  const validation = validateLegacyExport(rawExportText);
  if (!validation.ok) {
    return { ok: false, validation, report: null, candidates: null };
  }
  const data = JSON.parse(rawExportText);
  const maps = data.maps ?? {};
  const candidates = [];
  const allFlags = [];
  const allWarnings = [];
  const statusesSeen = {};
  const departmentsSeen = {};
  let withAttachments = 0;
  let statusUpdatesChars = 0;
  let withStatusUpdates = 0;

  for (const item of data.items) {
    const { candidate, flags, warnings } = transformLegacyTicket(item, {
      userMap: maps.users ?? {}, deptMap: maps.departments ?? {}, tagMap: maps.tags ?? {},
      ...(migrationOwnerRef ? { migrationOwnerRef } : {}),
    });
    candidates.push(candidate);
    for (const fl of flags) allFlags.push({ item: String(item.id), ...fl });
    for (const w of warnings) allWarnings.push({ item: String(item.id), ...w });
    statusesSeen[candidate.ticket.status] = (statusesSeen[candidate.ticket.status] ?? 0) + 1;
    const deptKey = candidate.ticket.assignedDeptId ?? '(unmapped/none)';
    departmentsSeen[deptKey] = (departmentsSeen[deptKey] ?? 0) + 1;
    if (candidate.attachments.hasAttachments) withAttachments += 1;
    if (candidate.statusUpdates.length > 0) { withStatusUpdates += 1; statusUpdatesChars += candidate.statusUpdates.length; }
  }

  const report = {
    mode: 'dry-run (validate + transform only — no import capability exists in this tool)',
    totalRows: data.items.length,
    transformed: candidates.length,
    warningCount: allWarnings.length + validation.warnings.length,
    errorCount: 0,
    departedAuthorFlags: allFlags.filter((fl) => fl.type === 'departed-author').length,
    flags: allFlags,
    validationWarnings: validation.warnings,
    transformWarnings: allWarnings,
    statusesSeen,
    departmentsSeen,
    attachments: { itemsWithAttachments: withAttachments },
    statusUpdates: {
      itemsWithBlob: withStatusUpdates,
      totalChars: statusUpdatesChars,
      note: 'every candidate carries the verbatim blob + length + sha256 for import-time integrity checks',
    },
  };
  return { ok: true, validation, report, candidates };
}

// ----- CLI (direct execution only; importing this module has no side effects) -----
const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const refused = args.filter((a) => REFUSED_FLAGS.includes(a.toLowerCase()));
  if (refused.length) {
    console.error(`REFUSED: ${refused.join(', ')} — this foundation tool has NO import/write capability. ` +
      'Importing is a future, separately-approved step (docs/MIGRATION_DRY_RUN_PLAN.md gates G1-G3).');
    process.exit(1);
  }
  const exportPath = args.find((a) => !a.startsWith('--'));
  if (!exportPath || /^https?:/i.test(exportPath)) {
    console.error('Usage: node run-migration-dry-run.js <local-export.json> [--out <report.json>] — local files only, no URLs.');
    process.exit(1);
  }
  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? args[outIdx + 1] : null;

  const raw = readFileSync(exportPath, 'utf8');
  const { ok, validation, report } = runDryRun(raw);
  if (!ok) {
    console.error('VALIDATION FAILED (fail-closed):');
    for (const p of validation.problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(JSON.stringify(report, null, 2));
  if (outPath) {
    writeFileSync(outPath, JSON.stringify({ validation, report }, null, 2));
    console.error(`[note] report written to ${outPath} — if this came from a REAL export, keep it OUT of git.`);
  }
}
