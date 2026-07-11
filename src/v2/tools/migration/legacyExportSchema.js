// Legacy export schema + guards (Loop 32) — OFFLINE FOUNDATION ONLY.
//
// Describes the shape of a FUTURE read-only legacy export file (local JSON) and the
// fail-closed content guards every input must pass. This module performs no I/O and has
// no knowledge of any live system. The only data it has ever seen is the obviously-fake
// sample fixture in tests/fixtures/.
//
// Mapping authority: docs/MIGRATION_MAPPING_TEMPLATE.md (D32/D33 standing rules).

/**
 * Tracker fields known from read-only source inspection (gap analysis §C.1), extended with
 * the fields CONFIRMED by the real spreadsheet export (Loop 34 evidence — column names
 * only; no data): CreatedBy/AssignedTo (display-name sources — spreadsheet exports carry
 * no lookup ids), EscalationCommentary (description source), AddTags2 (raw lookup-encoded
 * tag/person field), DaysToResolve (newly observed derived day-count).
 */
export const KNOWN_LEGACY_FIELDS = Object.freeze([
  'Title', 'Status', 'Urgency', 'EscalationDate', 'ResolvedDate', 'ExpectedResolutionDate',
  'RequestingDept', 'AssignedDepartmentOwner', 'OriginalAssignedDept', 'DaysCurrentDept',
  'DateAssignedtoCurrent', 'IssueType', 'IssueCategoryDetail', 'FinancialImpactAmount',
  'AmountRemaining', 'MemberName', 'CustomerName', 'WorkerName', 'StatusCommentary',
  'StatusUpdates', 'DaysOpen', 'AssignedToLookupId', 'AuthorLookupId', 'AddTags',
  'AddTagsLookupId', 'TeamsPost', 'AssignmentID', 'InternalDocumentationNeeded',
  'InternalDocumentationCommentary', 'Created', 'Modified',
  // Loop 34 (real-export evidence):
  'CreatedBy', 'AssignedTo', 'EscalationCommentary', 'AddTags2', 'DaysToResolve',
  // Loop 35 (real analyzer run — list "Export to CSV" flavor):
  'Attachments',
]);

/** Legacy status vocabulary confirmed so far (preserved 100% — identity mapping). */
export const EXPECTED_LEGACY_STATUSES = Object.freeze([
  'Not yet assigned', 'Assigned', 'In Process',
  'Pending Member', 'Pending Research', 'Pending Customer', 'Complete',
]);

/**
 * Fail-closed content guards: an export file matching ANY of these is refused outright.
 * (a) credential material never belongs in an export; (b) this FOUNDATION build only
 * accepts clearly-fake data — every URL must be on a reserved `.invalid` host. The URL
 * guard is deliberately strict for now and will be revisited, with approval, in the loop
 * that first handles a real (git-ignored, local-only) export.
 */
export const FORBIDDEN_EXPORT_CONTENT = Object.freeze([
  ['JWT-like token', /eyJ[A-Za-z0-9_-]{15,}\./],
  ['private key material', /BEGIN [A-Z ]*PRIVATE KEY/],
  ['secret-style key', /"(client_?secret|password|pwd|api[_-]?key|access_?token|refresh_?token)"\s*:/i],
  ['non-.invalid URL (foundation accepts fake data only)', /https?:\/\/(?![A-Za-z0-9.-]*\.invalid)[^\s"'\\]+/i],
]);

/**
 * Expected export container:
 * {
 *   exportedAt?: string,
 *   items: [ { id: string|number, webUrl?: string, hasAttachments?: boolean,
 *              attachmentCount?: number, fields: { <legacy columns> } } ],
 *   maps?: {
 *     users?:       { <legacyLookupId>: { name, email, v2Id } },
 *     departments?: { <legacy dept text>: <v2 dept key> },
 *     tags?:        { <legacy tag lookup id or label>: <v2 tag key> }
 *   }
 * }
 */
export function isExportContainer(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.items);
}
