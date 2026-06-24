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

// Lists the design must define (mission Loop 8).
export const REQUIRED_LISTS = [
  'Escalations_v2_Tickets',
  'Escalations_v2_Activity',
  'Escalations_v2_Comments',
  'Escalations_v2_InternalNotes',
  'Escalations_v2_Tags',
  'Escalations_v2_Departments',
  'Escalations_v2_Users',
];

// Ticket model fields that must be representable in the schema (must each be a `mapsTo`
// target somewhere in the Tickets list). Mirrors the v2 Ticket model in domain/models.js.
export const REQUIRED_TICKET_MAPPINGS = [
  'id', 'title', 'description', 'status', 'priority', 'issueCategory', 'issueType',
  'assignedDeptId', 'assigneeId', 'ticketOwner', 'submitterId', 'requestingDept',
  'escalationDate', 'expectedResolutionDate', 'completedDate', 'tagIds',
  'legacyItemId', 'legacyUrl', 'migrationNotes', 'createdAt', 'modifiedAt',
];

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

  // 4. Every list has fields with name + type.
  for (const [listName, def] of Object.entries(schema.lists)) {
    if (!Array.isArray(def.fields) || def.fields.length === 0) {
      problems.push(`${listName}: must define a non-empty "fields" array`);
      continue;
    }
    for (const f of def.fields) {
      if (!f.name) problems.push(`${listName}: a field is missing "name"`);
      if (!f.type) problems.push(`${listName}: field "${f.name ?? '?'}" is missing "type"`);
    }
  }

  // 5. Tickets list covers every required Ticket model field via a `mapsTo`.
  const tickets = schema.lists.Escalations_v2_Tickets;
  if (tickets) {
    const mapped = new Set((tickets.fields || []).map((f) => f.mapsTo).filter(Boolean));
    for (const field of REQUIRED_TICKET_MAPPINGS) {
      if (!mapped.has(field)) problems.push(`Escalations_v2_Tickets: no column maps to Ticket.${field}`);
    }
  }

  // 6. Forbidden live/production strings.
  for (const { name, re } of FORBIDDEN) {
    if (re.test(raw)) problems.push(`forbidden live/production marker present: ${name}`);
  }

  const summary = {
    schemaVersion: schema.schemaVersion,
    lists: Object.keys(schema.lists).length,
    requiredListsPresent: REQUIRED_LISTS.every((l) => !!schema.lists[l]),
    ticketMappingsCovered: tickets
      ? REQUIRED_TICKET_MAPPINGS.every((field) =>
          new Set((tickets.fields || []).map((f) => f.mapsTo)).has(field))
      : false,
  };

  return { ok: problems.length === 0, problems, summary };
}

// Standalone run.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('validateSharePointSchema.js')) {
  const { ok, problems, summary } = validateSharePointSchema();
  console.log('SharePoint v2 schema validation (local JSON only — no network)\n');
  console.log(`  schemaVersion        : ${summary.schemaVersion}`);
  console.log(`  lists defined        : ${summary.lists}`);
  console.log(`  required lists present: ${summary.requiredListsPresent}`);
  console.log(`  ticket mappings ok   : ${summary.ticketMappingsCovered}`);
  if (!ok) {
    console.error('\nProblems:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log('\nOK: schema is valid, design-only, and contains no live/production markers.');
}
