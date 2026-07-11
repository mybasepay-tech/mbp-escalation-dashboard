// transformLegacyTicket — OFFLINE, pure transform of one exported legacy item into a v2
// IMPORT CANDIDATE (Loop 32 foundation). No I/O, no network, no SharePoint, no writes —
// the eventual gated importer (a later, separately-approved loop) consumes candidates.
//
// Implements the FROZEN standing rules (docs/MIGRATION_MAPPING_TEMPLATE.md, D32/D33):
//   * legacy status strings preserved EXACTLY (blank -> 'New' + note/flag; unknown values
//     preserved verbatim with a warning flag);
//   * StatusUpdates preserved VERBATIM with length + sha256 for integrity validation;
//   * party fields (MemberName/CustomerName/WorkerName) preserved for Additional Details;
//   * AmountRemaining/AssignmentID/TeamsPost/etc. preserved as legacy/additional data;
//   * unknown legacy fields NEVER dropped (legacyData.unknownFields);
//   * departed/unmatched authors flagged: closure only by the designated migration owner.

import { createHash } from 'node:crypto';
import { KNOWN_LEGACY_FIELDS, EXPECTED_LEGACY_STATUSES } from './legacyExportSchema.js';

const CORE_CONSUMED_FIELDS = new Set(KNOWN_LEGACY_FIELDS);

/** Default reference for the D33 exception marker (the NAME lives in docs, not code). */
export const MIGRATION_OWNER_REF = 'designated-migration-owner (D33)';

export function transformLegacyTicket(item, {
  userMap = {}, deptMap = {}, tagMap = {}, migrationOwnerRef = MIGRATION_OWNER_REF,
} = {}) {
  const f = item.fields ?? {};
  const flags = [];
  const warnings = [];

  // ----- status: preserved exactly (rule 1) -----
  let status = String(f.Status ?? '').trim();
  if (status === '') {
    status = 'New';
    flags.push({ type: 'blank-status', detail: "blank legacy status -> 'New' + migration note" });
  } else if (!EXPECTED_LEGACY_STATUSES.includes(status)) {
    warnings.push({ type: 'unknown-status', detail: `status '${status}' preserved exactly; extend v2 choice set before import` });
  }

  // ----- people -----
  // Two author/assignee sources exist (Loop 34): API-style exports carry LOOKUP IDS
  // (userMap key = the id); spreadsheet exports carry DISPLAY NAMES only (userMap key =
  // `name:<display name>`). Lookup id wins when both are present.
  const author = (f.AuthorLookupId != null ? userMap[String(f.AuthorLookupId)] : undefined)
    ?? (f.CreatedBy != null ? userMap[`name:${f.CreatedBy}`] : undefined);
  const assignee = (f.AssignedToLookupId != null ? userMap[String(f.AssignedToLookupId)] : undefined)
    ?? (f.AssignedTo != null ? userMap[`name:${f.AssignedTo}`] : undefined);
  if (!author?.v2Id) {
    flags.push({
      type: 'departed-author',
      detail: 'original requester unmatched — closure ONLY by the designated migration owner (auditable migration exception, D33)',
      closureException: migrationOwnerRef,
    });
  }
  if ((f.AssignedToLookupId != null || f.AssignedTo != null) && !assignee?.v2Id) {
    warnings.push({ type: 'unresolved-assignee', detail: `assignee reference '${f.AssignedToLookupId ?? f.AssignedTo}' unresolved -> imported unassigned` });
  }

  // ----- department -----
  const deptText = f.AssignedDepartmentOwner ?? null;
  const assignedDeptId = deptText != null ? (deptMap[deptText] ?? null) : null;
  if (deptText != null && assignedDeptId == null) {
    flags.push({ type: 'unmapped-department', detail: `legacy department '${deptText}' has no canonical v2 key — resolve before import` });
  }

  // ----- tags -----
  const rawTags = Array.isArray(f.AddTags) ? f.AddTags : [];
  const tags = [];
  const unresolvedTags = [];
  for (const t of rawTags) {
    const key = tagMap[String(t.LookupId)] ?? tagMap[t.LookupValue];
    if (key) tags.push(key);
    else unresolvedTags.push(t.LookupValue ?? String(t.LookupId));
  }
  if (unresolvedTags.length) {
    warnings.push({ type: 'unresolved-tags', detail: `no v2 tag for: ${unresolvedTags.join(', ')} (create tags or map before import)` });
  }

  // ----- StatusUpdates: verbatim + integrity (rule 2) -----
  const blob = String(f.StatusUpdates ?? '');
  const statusUpdates = {
    raw: blob, // VERBATIM — never trimmed, parsed, or reformatted here
    length: blob.length,
    sha256: createHash('sha256').update(blob, 'utf8').digest('hex'),
  };

  // ----- unknown legacy fields: never dropped (rule 4) -----
  const unknownFields = {};
  for (const [key, value] of Object.entries(f)) {
    if (!CORE_CONSUMED_FIELDS.has(key)) unknownFields[key] = value;
  }

  const isComplete = status === 'Complete';
  const candidate = {
    ticket: {
      id: `esc_legacy_${item.id}`,
      title: f.Title || '(no title)',
      // Loop 34: the real export's description source is `Escalation Commentary`;
      // StatusCommentary remains the fallback for API-style exports.
      description: f.EscalationCommentary ?? f.StatusCommentary ?? '',
      status, // exact legacy value
      priority: f.Urgency ?? 'Medium',
      issueCategory: f.IssueCategoryDetail ?? '',
      issueType: f.IssueType ?? '',
      assignedDeptId,
      assigneeId: assignee?.v2Id ?? null,
      ticketOwner: null, // derived from Department Leads at import time
      submitterId: author?.v2Id ?? null,
      requestingDept: f.RequestingDept ?? '',
      escalationDate: f.EscalationDate ?? f.Created ?? null,
      expectedResolutionDate: f.ExpectedResolutionDate ?? null,
      completedDate: isComplete ? (f.ResolvedDate ?? null) : null,
      amountInvolved: f.FinancialImpactAmount ?? null,
      amountCurrency: 'USD',
      legacyItemId: String(item.id),
      legacyUrl: item.webUrl ?? null,
      createdAt: f.Created ?? null,
      modifiedAt: f.Modified ?? null,
      lastActivityAt: f.Modified ?? f.Created ?? null,
    },
    statusUpdates,
    // Rule 7: party fields preserved for the Additional Details area.
    partyFields: {
      memberName: f.MemberName ?? null,
      customerName: f.CustomerName ?? null,
      workerName: f.WorkerName ?? null,
    },
    // Rules 3 + 8 (+ TeamsPost/transfer-tracking preservation).
    legacyData: {
      amountRemaining: f.AmountRemaining ?? null,
      assignmentId: f.AssignmentID ?? null,
      teamsPost: f.TeamsPost ?? null,
      originalAssignedDept: f.OriginalAssignedDept ?? null,
      daysCurrentDept: f.DaysCurrentDept ?? null,
      dateAssignedtoCurrent: f.DateAssignedtoCurrent ?? null,
      internalDocumentationNeeded: f.InternalDocumentationNeeded ?? null,
      // Loop 34 (real-export evidence): preserved uninterpreted for audit — v2 recomputes
      // day counts at read time; AddTags2 stays RAW until its parsing strategy is approved.
      daysOpen: f.DaysOpen ?? null,
      daysToResolve: f.DaysToResolve ?? null,
      createdByName: f.CreatedBy ?? null,
      assignedToName: f.AssignedTo ?? null,
      addTags2Raw: f.AddTags2 ?? null,
      unknownFields,
    },
    internalNotes: f.InternalDocumentationCommentary
      ? [{ body: String(f.InternalDocumentationCommentary), source: 'legacy InternalDocumentationCommentary' }]
      : [],
    tags,
    attachments: {
      // Two indicator sources (Loop 35): API-style exports set item.hasAttachments; the
      // list "Export to CSV" flavor carries an Attachments column with "0"/"1".
      hasAttachments: Boolean(item.hasAttachments) || f.Attachments === '1' || f.Attachments === 1 || f.Attachments === true,
      count: item.attachmentCount ?? 0, // indicator only — no files are ever migrated here
    },
  };

  return { candidate, flags, warnings };
}
