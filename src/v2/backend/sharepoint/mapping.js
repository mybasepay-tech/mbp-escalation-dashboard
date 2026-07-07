// mapping.js — domain model <-> SharePoint v2 column translation (aligned with the schema).
//
// Shared by SharePointStore and the fake seeder so both use the SAME column internal names as
// schema.sharepoint-v2.json. Pure data + functions; no I/O, no network. `tagIds` is NOT a
// ticket column (D12) — it is materialized from the Escalations_v2_TicketTags link list.

export const LISTS = Object.freeze({
  TICKETS: 'Escalations_v2_Tickets',
  ACTIVITY: 'Escalations_v2_Activity',
  COMMENTS: 'Escalations_v2_Comments',
  NOTES: 'Escalations_v2_InternalNotes',
  TAGS: 'Escalations_v2_Tags',
  TICKET_TAGS: 'Escalations_v2_TicketTags',
  DEPARTMENTS: 'Escalations_v2_Departments',
  USERS: 'Escalations_v2_Users',
  ATTACHMENTS: 'Escalations_v2_Attachments',
});

export const ALL_LISTS = Object.freeze(Object.values(LISTS));

// Field specs: [domainProp, columnInternalName, isJsonEncoded?]
const TICKET_SPEC = [
  ['id', 'TicketKey'], ['title', 'Title'], ['description', 'Description'],
  ['status', 'Status'], ['priority', 'Priority'], ['issueCategory', 'IssueCategory'],
  ['issueType', 'IssueType'], ['assignedDeptId', 'AssignedDeptKey'], ['assigneeId', 'AssigneeKey'],
  ['ticketOwner', 'TicketOwnerKey'], ['submitterId', 'SubmitterKey'], ['requestingDept', 'RequestingDept'],
  ['escalationDate', 'EscalationDate'], ['expectedResolutionDate', 'ExpectedResolutionDate'],
  ['completedDate', 'CompletedDate'], ['finalClosureNote', 'FinalClosureNote'],
  ['lastActivityAt', 'LastActivityAt'], ['amountInvolved', 'AmountInvolved'],
  ['amountCurrency', 'AmountCurrency'],
  ['legacyItemId', 'LegacyItemId'], ['legacyUrl', 'LegacyUrl'],
  ['migrationNotes', 'MigrationNotes'], ['createdAt', 'CreatedAt'], ['modifiedAt', 'ModifiedAt'],
];
const ATTACHMENT_SPEC = [
  ['id', 'AttachmentKey'], ['escalationId', 'EscalationKey'], ['fileName', 'FileName'],
  ['fileUrl', 'FileUrl'], ['mimeType', 'MimeType'], ['sizeBytes', 'SizeBytes'],
  ['uploadedBy', 'UploadedByKey'], ['uploadedAt', 'UploadedAt'], ['source', 'Source'],
  ['isDeleted', 'IsDeleted'],
];
const ACTIVITY_SPEC = [
  ['id', 'ActivityKey'], ['escalationId', 'EscalationKey'], ['type', 'Type'], ['actorId', 'ActorKey'],
  ['from', 'FromValue', true], ['to', 'ToValue', true], ['note', 'ActivityNote'], ['timestamp', 'Timestamp'],
];
const COMMENT_SPEC = [
  ['id', 'CommentKey'], ['escalationId', 'EscalationKey'], ['authorId', 'AuthorKey'], ['body', 'Body'],
  ['mentions', 'Mentions', true], ['visibility', 'Visibility'], ['createdAt', 'CreatedAt'], ['editedAt', 'EditedAt'],
];
const NOTE_SPEC = [
  ['id', 'NoteKey'], ['escalationId', 'EscalationKey'], ['authorId', 'AuthorKey'], ['body', 'Body'],
  ['visibility', 'Visibility'], ['createdAt', 'CreatedAt'],
];
const DEPT_SPEC = [
  ['id', 'DeptKey'], ['name', 'Name'], ['leadIds', 'LeadKeys', true], ['memberIds', 'MemberKeys', true],
];
const USER_SPEC = [
  ['id', 'UserKey'], ['displayName', 'DisplayName'], ['email', 'Email'], ['departmentIds', 'DepartmentKeys', true],
];
const TAG_SPEC = [['id', 'TagKey'], ['label', 'Label']];

// TicketTags link list columns (no domain object — managed directly by the adapter, D12).
export const LINK_COLS = Object.freeze({
  KEY: 'TicketTagKey', TICKET: 'TicketKey', TAG: 'TagKey', ACTIVE: 'IsActive',
  REMOVED_AT: 'RemovedAt', LABEL_SNAPSHOT: 'TagLabelSnapshot', SOURCE: 'Source',
  CREATED_AT: 'CreatedAt', CREATED_BY: 'CreatedBy',
});

function toFields(spec, obj) {
  const fields = {};
  for (const [prop, col, json] of spec) {
    const v = obj[prop];
    fields[col] = json ? JSON.stringify(v === undefined ? null : v) : (v === undefined ? null : v);
  }
  return fields;
}
function fromFields(spec, fields) {
  const obj = {};
  for (const [prop, col, json] of spec) {
    const raw = fields[col];
    obj[prop] = json ? JSON.parse(raw ?? 'null') : (raw ?? null);
  }
  return obj;
}

// ----- field-shape round-trip helpers (fidelity for the future real client) -----
// Real SharePoint/Graph returns Lookup as { LookupId, LookupValue } and Person as a user
// object, stores DateTime as ISO 8601, and Boolean as true/false. The fake stores plain keys
// for simplicity; these helpers encode/decode the *shaped* forms so the eventual real-client
// adapter layer can translate losslessly. encode/decode are inverses (null-safe).

/** Lookup column: app key <-> { LookupValue }. */
export const lookupField = {
  encode: (key) => (key == null ? null : { LookupValue: String(key) }),
  decode: (val) => {
    if (val == null) return null;
    if (typeof val === 'object') return val.LookupValue ?? val.LookupId ?? null;
    return String(val);
  },
};

/** Person-or-Group column: app key <-> { Key, Title }. */
export const personField = {
  encode: (key) => (key == null ? null : { Key: String(key), Title: String(key) }),
  decode: (val) => {
    if (val == null) return null;
    if (typeof val === 'object') return val.Key ?? val.LookupValue ?? null;
    return String(val);
  },
};

/** DateTime column: ISO string <-> normalized ISO string. */
export const dateTimeField = {
  encode: (iso) => (iso == null ? null : new Date(iso).toISOString()),
  decode: (val) => (val == null ? null : String(val)),
};

/** Boolean column: coerce to a strict true/false (handles 'true'/1 from some surfaces). */
export const booleanField = {
  encode: (b) => b === true,
  decode: (val) => val === true || val === 'true' || val === 1,
};

export const ticketToFields = (t) => toFields(TICKET_SPEC, t);
export const fieldsToTicket = (f, tagIds = []) => ({ ...fromFields(TICKET_SPEC, f), tagIds });
export const activityToFields = (a) => toFields(ACTIVITY_SPEC, a);
export const fieldsToActivity = (f) => fromFields(ACTIVITY_SPEC, f);
export const commentToFields = (c) => toFields(COMMENT_SPEC, c);
export const fieldsToComment = (f) => fromFields(COMMENT_SPEC, f);
export const noteToFields = (n) => toFields(NOTE_SPEC, n);
export const fieldsToNote = (f) => fromFields(NOTE_SPEC, f);
export const deptToFields = (d) => toFields(DEPT_SPEC, d);
export const fieldsToDept = (f) => fromFields(DEPT_SPEC, f);
export const userToFields = (u) => toFields(USER_SPEC, u);
export const fieldsToUser = (f) => fromFields(USER_SPEC, f);
export const tagToFields = (t) => toFields(TAG_SPEC, t);
export const fieldsToTag = (f) => fromFields(TAG_SPEC, f);
export const attachmentToFields = (a) => toFields(ATTACHMENT_SPEC, a);
// isDeleted is a Boolean column: coerce so a null/undefined read is a strict false.
export const fieldsToAttachment = (f) => {
  const a = fromFields(ATTACHMENT_SPEC, f);
  a.isDeleted = a.isDeleted === true;
  return a;
};
