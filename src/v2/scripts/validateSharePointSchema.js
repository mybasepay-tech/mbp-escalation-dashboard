// SharePoint v2 schema validator — LOCAL JSON STRUCTURE ONLY.
//
// This validates the design-only blueprint at
// backend/sharepoint/schema.sharepoint-v2.json. It makes NO network calls, contacts NO
// SharePoint/Graph/Azure/Dataverse endpoint, and provisions nothing. It only reads a local
// file, parses it, and checks shape + a forbidden-string scan. It is imported by
// scripts/validate.js and can also be run standalone: `node scripts/validateSharePointSchema.js`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // .../src/v2
export const SCHEMA_PATH = join(V2_ROOT, 'backend', 'sharepoint', 'schema.sharepoint-v2.json');

const TICKETS = 'Escalations_v2_Tickets';
const TAGS = 'Escalations_v2_Tags';
const TICKET_TAGS = 'Escalations_v2_TicketTags';

// Lists the design must define (mission Loop 8 + Loop 9 link list).
export const REQUIRED_LISTS = [
  TICKETS,
  'Escalations_v2_Activity',
  'Escalations_v2_Comments',
  'Escalations_v2_InternalNotes',
  TAGS,
  TICKET_TAGS,
  'Escalations_v2_Departments',
  'Escalations_v2_Users',
];

// Ticket model fields that must be representable as a DIRECT column on the Tickets list via a
// `mapsTo` target. NOTE: `tagIds` is intentionally NOT here — per decision D12, tags are a
// many-to-many link list (Escalations_v2_TicketTags), not a column on Tickets. `tagIds` is
// materialized from that link list at read time.
export const REQUIRED_TICKET_MAPPINGS = [
  'id', 'title', 'description', 'status', 'priority', 'issueCategory', 'issueType',
  'assignedDeptId', 'assigneeId', 'ticketOwner', 'submitterId', 'requestingDept',
  'escalationDate', 'expectedResolutionDate', 'completedDate',
  'legacyItemId', 'legacyUrl', 'migrationNotes', 'createdAt', 'modifiedAt',
];

// Model fields that are deliberately satisfied by a relation/link list, not a Tickets column.
export const RELATION_BACKED_TICKET_FIELDS = ['tagIds'];

// Live/production indicators that must NEVER appear in a design-only schema. The literal
// `.invalid` legacy host used in mock data is allowed; real hosts are not.
const FORBIDDEN = [
  { name: 'Microsoft Graph host', re: /graph\.microsoft\.com/i },
  { name: 'SharePoint host', re: /\bsharepoint\.com/i },
  { name: 'Azure AD login host', re: /login\.microsoftonline|microsoftonline\.com/i },
  { name: 'Azure Functions host', re: /azurewebsites\.net/i },
  { name: 'SharePoint REST path', re: /_api\/web/i },
  { name: 'Graph REST path', re: /\/v1\.0\/sites|\/beta\/sites/i },
  { name: 'Power Automate', re: /powerautomate|flow\.microsoft/i },
  { name: 'MSAL usage', re: /\bmsal\b|PublicClientApplication/i },
  { name: 'OAuth scopes', re: /Sites\.ReadWrite\.All|Sites\.Read\.All/i },
  { name: 'Bearer token', re: /Bearer\s+\$\{|Authorization['"]?\s*:/i },
  { name: 'GUID (possible tenant/client id)', re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i },
  { name: 'secret-like assignment', re: /(client_secret|clientSecret|api[_-]?key|password|pwd)\s*[:=]/i },
];

/**
 * Validate the design-only schema. Returns { ok, problems, summary } — never throws on
 * validation failure (only the file read can throw if the file is missing).
 */
export function validateSharePointSchema() {
  const problems = [];
  const raw = readFileSync(SCHEMA_PATH, 'utf8');

  // 1. Parses as JSON.
  let schema;
  try {
    schema = JSON.parse(raw);
  } catch (e) {
    return { ok: false, problems: [`schema is not valid JSON: ${e.message}`], summary: {} };
  }

  // 2. Top-level design-only markers.
  if (schema.designOnly !== true) problems.push('top-level "designOnly" must be true');
  if (!schema.lists || typeof schema.lists !== 'object') {
    return { ok: false, problems: [...problems, 'schema.lists object is missing'], summary: {} };
  }

  // 3. Required lists exist.
  for (const list of REQUIRED_LISTS) {
    if (!schema.lists[list]) problems.push(`required list missing: ${list}`);
  }

  // 4. Every list has fields with name + type, plus a stable displayName/internalName.
  for (const [listName, def] of Object.entries(schema.lists)) {
    if (!Array.isArray(def.fields) || def.fields.length === 0) {
      problems.push(`${listName}: must define a non-empty "fields" array`);
      continue;
    }
    for (const f of def.fields) {
      if (!f.name) problems.push(`${listName}: a field is missing "name"`);
      if (!f.type) problems.push(`${listName}: field "${f.name ?? '?'}" is missing "type"`);
      if (f.name && /\s/.test(f.name)) problems.push(`${listName}: field internalName "${f.name}" must not contain spaces`);
    }
    // Naming strategy: internalName must equal the list key; displayName must be present.
    if (def.internalName !== listName) problems.push(`${listName}: internalName must equal the list key (got "${def.internalName ?? 'undefined'}")`);
    if (!def.displayName) problems.push(`${listName}: missing displayName`);
  }

  // 5. Tickets list covers every required Ticket model field via a `mapsTo`.
  const tickets = schema.lists[TICKETS];
  if (tickets) {
    const mapped = new Set((tickets.fields || []).map((f) => f.mapsTo).filter(Boolean));
    for (const field of REQUIRED_TICKET_MAPPINGS) {
      if (!mapped.has(field)) problems.push(`${TICKETS}: no column maps to Ticket.${field}`);
    }

    // 5a. D12 — tags are NOT a delimited source-of-truth field on Tickets.
    if (schema.tagModel !== 'many-to-many-link-list') {
      problems.push(`top-level "tagModel" must be "many-to-many-link-list" (got "${schema.tagModel ?? 'undefined'}")`);
    }
    if (tickets.tagsVia !== TICKET_TAGS) {
      problems.push(`${TICKETS}: must declare "tagsVia": "${TICKET_TAGS}"`);
    }
    for (const f of tickets.fields || []) {
      if (f.mapsTo === 'tagIds') problems.push(`${TICKETS}: field "${f.name}" must not map Ticket.tagIds to a column — tags are a link list (D12)`);
      if (/^tag(s|keys|ids)$/i.test(f.name || '')) problems.push(`${TICKETS}: field "${f.name}" looks like a delimited tag field — forbidden source-of-truth (D12)`);
    }
  }

  // 6. TicketTags link list links tickets to tags.
  const ticketTags = schema.lists[TICKET_TAGS];
  let linksTicket = false;
  let linksTag = false;
  if (ticketTags) {
    const fields = ticketTags.fields || [];
    linksTicket = fields.some((f) => f.lookupList === TICKETS);
    linksTag = fields.some((f) => f.lookupList === TAGS);
    if (!linksTicket) problems.push(`${TICKET_TAGS}: must have a Lookup field to ${TICKETS}`);
    if (!linksTag) problems.push(`${TICKET_TAGS}: must have a Lookup field to ${TAGS}`);
    if (!fields.some((f) => f.name === 'IsActive') && !fields.some((f) => f.name === 'RemovedAt')) {
      problems.push(`${TICKET_TAGS}: should support soft-delete (IsActive or RemovedAt)`);
    }
  }

  // 7. Tags remains a dictionary (catalog) list with a label.
  const tagsList = schema.lists[TAGS];
  if (tagsList && !(tagsList.fields || []).some((f) => f.mapsTo === 'label')) {
    problems.push(`${TAGS}: dictionary must expose a label column (mapsTo "label")`);
  }

  // 8. Indexes + views support tag lookups both directions.
  const indexes = Array.isArray(schema.recommendedIndexes) ? schema.recommendedIndexes : [];
  const ttIndex = indexes.find((i) => i.list === TICKET_TAGS);
  const ttIndexed = !!ttIndex && ['TicketKey', 'TagKey'].every((c) => (ttIndex.columns || []).includes(c));
  if (!ttIndexed) problems.push(`recommendedIndexes: ${TICKET_TAGS} must index TicketKey and TagKey`);

  const views = Array.isArray(schema.views) ? schema.views : [];
  const ttViews = views.filter((v) => v.list === TICKET_TAGS);
  const hasTagsByTicket = ttViews.some((v) => /TicketKey/.test(v.filter || ''));
  const hasTicketsByTag = ttViews.some((v) => /TagKey/.test(v.filter || ''));
  if (!hasTagsByTicket) problems.push(`views: need a ${TICKET_TAGS} view filtering by TicketKey (tags by ticket)`);
  if (!hasTicketsByTag) problems.push(`views: need a ${TICKET_TAGS} view filtering by TagKey (tickets by tag)`);

  // 9. Forbidden live/production strings.
  for (const { name, re } of FORBIDDEN) {
    if (re.test(raw)) problems.push(`forbidden live/production marker present: ${name}`);
  }

  const summary = {
    schemaVersion: schema.schemaVersion,
    tagModel: schema.tagModel,
    lists: Object.keys(schema.lists).length,
    requiredListsPresent: REQUIRED_LISTS.every((l) => !!schema.lists[l]),
    ticketMappingsCovered: tickets
      ? REQUIRED_TICKET_MAPPINGS.every((field) =>
          new Set((tickets.fields || []).map((f) => f.mapsTo)).has(field))
      : false,
    ticketTagsLinks: linksTicket && linksTag,
    tagLookupViews: hasTagsByTicket && hasTicketsByTag,
  };

  return { ok: problems.length === 0, problems, summary };
}

// Standalone run.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('validateSharePointSchema.js')) {
  const { ok, problems, summary } = validateSharePointSchema();
  console.log('SharePoint v2 schema validation (local JSON only — no network)\n');
  console.log(`  schemaVersion        : ${summary.schemaVersion}`);
  console.log(`  tagModel             : ${summary.tagModel}`);
  console.log(`  lists defined        : ${summary.lists}`);
  console.log(`  required lists present: ${summary.requiredListsPresent}`);
  console.log(`  ticket mappings ok   : ${summary.ticketMappingsCovered}`);
  console.log(`  TicketTags links ok  : ${summary.ticketTagsLinks}`);
  console.log(`  tag-lookup views ok  : ${summary.tagLookupViews}`);
  if (!ok) {
    console.error('\nProblems:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log('\nOK: schema is valid, design-only, and contains no live/production markers.');
}
