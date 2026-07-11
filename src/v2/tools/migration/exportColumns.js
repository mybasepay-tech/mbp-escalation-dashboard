// exportColumns — canonical mapping for the REAL legacy spreadsheet export shape
// (Loop 34, evidence-based). OFFLINE ONLY: pure data + pure functions; no I/O, no network.
//
// Evidence: Rodolfo exported the visible legacy Escalations list (spreadsheet export with
// DISPLAY headers containing spaces, plus the export artifacts `Item Type` and `Path`).
// This module normalizes one exported ROW (header -> cell text) into the `{ id, fields }`
// item shape the Loop 32 foundation (validate/transform) already understands, so the SAME
// frozen mapping rules apply to spreadsheet exports without duplicating them.
//
// No real data lives here — only COLUMN NAMES observed in the export (committed as shape
// evidence per docs/MIGRATION_MAPPING_TEMPLATE.md; values are never committed).

/**
 * Observed export display header -> canonical internal field name.
 * 31 columns observed in the real export (2026-07). `ID`, `Item Type`, and `Path` are
 * handled as item-level metadata, not fields.
 */
export const EXPORT_HEADER_MAP = Object.freeze({
  'Title': 'Title',
  'Created': 'Created',
  'Created By': 'CreatedBy', // display-name author source; requester matching happens at import mapping time
  'Requesting Dept': 'RequestingDept',
  'Member Name': 'MemberName',
  'Customer Name': 'CustomerName',
  'Worker Name': 'WorkerName',
  'Assignment ID': 'AssignmentID',
  'Urgency': 'Urgency',
  'Status': 'Status',
  'Assigned Department Owner': 'AssignedDepartmentOwner',
  'Assigned To': 'AssignedTo', // display-name assignee source (lookup ids are not present in spreadsheet exports)
  'Escalation Commentary': 'EscalationCommentary', // description/issue summary source
  'Expected Resolution Date': 'ExpectedResolutionDate',
  'Resolved Date': 'ResolvedDate',
  'Issue Type': 'IssueType',
  'Issue Category Detail': 'IssueCategoryDetail',
  'Amount Remaining': 'AmountRemaining',
  'Status Updates': 'StatusUpdates', // preserved VERBATIM downstream (D32 rule 2)
  'Days Open': 'DaysOpen',
  'Original Assigned Dept': 'OriginalAssignedDept',
  'DaysCurrentDept': 'DaysCurrentDept',
  'DateAssignedtoCurrent': 'DateAssignedtoCurrent',
  'Days to Resolve': 'DaysToResolve', // newly observed in the real export
  'Internal Documentation Needed': 'InternalDocumentationNeeded',
  'Internal Documentation Commentary': 'InternalDocumentationCommentary',
  'Teams Post': 'TeamsPost', // hyperlink metadata; preserved, never exposed raw in reports
  'AddTags2': 'AddTags2', // lookup/person-style encoded field; kept RAW until parsing strategy is approved
});

/** Item-level export columns (not ticket fields). */
export const EXPORT_META_COLUMNS = Object.freeze(['ID', 'Item Type', 'Path']);

/** Classic SharePoint lookup/person multi-value encoding, e.g. `Name;#12;#Other;#34`. */
export const LOOKUP_ENCODING = /;#/;

/**
 * Normalize one spreadsheet-export row into the foundation's item shape.
 * Unknown headers are PRESERVED under their original name (never dropped) — the
 * transform routes them into `legacyData.unknownFields` downstream.
 *
 * @param {Record<string, string>} row  header -> cell text (as parsed from the export)
 * @returns {{ id: string|null, sourcePath: string|null, itemType: string|null,
 *             fields: Record<string, string> }}
 */
export function rowToLegacyItem(row) {
  const fields = {};
  let id = null;
  let sourcePath = null;
  let itemType = null;
  for (const [header, value] of Object.entries(row ?? {})) {
    const h = String(header).trim();
    if (h === 'ID') { id = String(value ?? '').trim() || null; continue; }
    if (h === 'Path') { sourcePath = value ?? null; continue; } // metadata only; never exposed unsanitized
    if (h === 'Item Type') { itemType = value ?? null; continue; }
    const canonical = EXPORT_HEADER_MAP[h];
    fields[canonical ?? h] = value; // unknown headers preserved as-is
  }
  return { id, sourcePath, itemType, fields };
}

export default rowToLegacyItem;
