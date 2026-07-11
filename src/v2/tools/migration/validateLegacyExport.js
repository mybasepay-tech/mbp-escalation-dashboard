// validateLegacyExport — OFFLINE, fail-closed validation of a local legacy export file
// (Loop 32 foundation). Pure function over a raw string: no I/O, no network, no SharePoint,
// no writes. Refusals (`ok: false`) block everything downstream.

import {
  KNOWN_LEGACY_FIELDS, EXPECTED_LEGACY_STATUSES, FORBIDDEN_EXPORT_CONTENT, isExportContainer,
} from './legacyExportSchema.js';

/**
 * @param {string} raw - the export file's raw text.
 * @returns {{ ok: boolean, problems: string[], warnings: string[], summary: object }}
 */
export function validateLegacyExport(raw) {
  const problems = [];
  const warnings = [];

  // 1. Fail-closed content guards run on the RAW text before anything else.
  for (const [why, re] of FORBIDDEN_EXPORT_CONTENT) {
    if (re.test(raw)) problems.push(`REFUSED: input contains ${why}`);
  }
  if (problems.length) return { ok: false, problems, warnings, summary: {} };

  // 2. Shape.
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, problems: [`not valid JSON: ${e.message}`], warnings, summary: {} };
  }
  if (!isExportContainer(data)) {
    return { ok: false, problems: ['export must be an object with an `items` array'], warnings, summary: {} };
  }

  // 3. Per-item checks (problems block; warnings inform the mapping freeze).
  const statusesSeen = {};
  const unknownFields = new Set();
  const seenIds = new Set();
  let missingTitle = 0;
  let blankStatus = 0;
  data.items.forEach((item, i) => {
    const where = `items[${i}]`;
    if (item == null || typeof item !== 'object') { problems.push(`${where}: not an object`); return; }
    if (item.id == null || String(item.id).trim() === '') problems.push(`${where}: missing id`);
    else if (seenIds.has(String(item.id))) problems.push(`${where}: duplicate id '${item.id}'`);
    else seenIds.add(String(item.id));
    const f = item.fields;
    if (f == null || typeof f !== 'object') { problems.push(`${where}: missing fields object`); return; }
    if (!f.Title) missingTitle += 1;
    const status = f.Status ?? '';
    if (String(status).trim() === '') blankStatus += 1;
    else {
      statusesSeen[status] = (statusesSeen[status] ?? 0) + 1;
      if (!EXPECTED_LEGACY_STATUSES.includes(status)) {
        warnings.push(`${where}: unexpected status '${status}' — will be PRESERVED exactly; extend the v2 choice set before import`);
      }
    }
    for (const key of Object.keys(f)) {
      if (!KNOWN_LEGACY_FIELDS.includes(key)) unknownFields.add(key);
    }
  });
  if (missingTitle > 0) warnings.push(`${missingTitle} item(s) have no Title (fallback "(no title)" + note applies)`);
  if (blankStatus > 0) warnings.push(`${blankStatus} item(s) have a blank status (rule: -> 'New' + migration note)`);
  if (unknownFields.size > 0) {
    warnings.push(`unknown legacy field(s) present — they will be PRESERVED, add mapping rows: ${[...unknownFields].join(', ')}`);
  }

  return {
    ok: problems.length === 0,
    problems,
    warnings,
    summary: {
      itemCount: data.items.length,
      statusesSeen,
      unknownFields: [...unknownFields],
      hasMaps: Boolean(data.maps),
    },
  };
}
