// Tests for the design-only SharePoint v2 schema + its validator.
//
// These run entirely locally: they read the JSON blueprint and the design docs and assert
// their shape/content. Nothing here connects to SharePoint, Graph, Azure, Dataverse, or any
// network endpoint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  validateSharePointSchema, SCHEMA_PATH, REQUIRED_LISTS, REQUIRED_TICKET_MAPPINGS,
  RELATION_BACKED_TICKET_FIELDS,
} from '../scripts/validateSharePointSchema.js';
import { createTicket } from '../domain/models.js';

const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = dirname(dirname(V2_ROOT));
const raw = readFileSync(SCHEMA_PATH, 'utf8');
const schema = JSON.parse(raw);

const ADMIN_PACKAGE = join(REPO_ROOT, 'docs', 'SHAREPOINT_V2_ADMIN_BUILD_PACKAGE.md');
const DRY_RUN = join(REPO_ROOT, 'harness', 'SHAREPOINT_V2_DRY_RUN_CHECKLIST.md');

test('schema file parses as JSON and is marked design-only', () => {
  assert.equal(schema.designOnly, true);
  assert.equal(schema.status, 'design-only');
  assert.equal(typeof schema.lists, 'object');
});

test('all required v2 lists exist (including the TicketTags link list)', () => {
  assert.ok(REQUIRED_LISTS.includes('Escalations_v2_TicketTags'), 'TicketTags must be required');
  for (const list of REQUIRED_LISTS) {
    assert.ok(schema.lists[list], `missing required list: ${list}`);
    assert.ok(Array.isArray(schema.lists[list].fields) && schema.lists[list].fields.length > 0,
      `${list} must have fields`);
  }
});

test('every required list has a stable internalName + displayName strategy', () => {
  for (const list of REQUIRED_LISTS) {
    const def = schema.lists[list];
    assert.equal(def.internalName, list, `${list}: internalName must equal the list key`);
    assert.ok(def.displayName && def.displayName.length > 0, `${list}: must have a displayName`);
    for (const f of def.fields) {
      assert.doesNotMatch(f.name, /\s/, `${list}.${f.name}: internal field name must not contain spaces`);
    }
  }
});

test('ticket schema covers every DIRECT field of the current Ticket data model', () => {
  const tickets = schema.lists.Escalations_v2_Tickets;
  const mapped = new Set((tickets.fields || []).map((f) => f.mapsTo).filter(Boolean));
  const modelFields = Object.keys(createTicket({ title: 'x' }));

  for (const field of modelFields) {
    if (RELATION_BACKED_TICKET_FIELDS.includes(field)) continue; // satisfied by a link list
    assert.ok(REQUIRED_TICKET_MAPPINGS.includes(field),
      `Ticket model field "${field}" is not in REQUIRED_TICKET_MAPPINGS — update the validator`);
    assert.ok(mapped.has(field),
      `Escalations_v2_Tickets has no column mapping to Ticket.${field}`);
  }
});

// ----- D12: tags are a dedicated many-to-many link list, not a delimited field -----

test('D12: tag model is a many-to-many link list', () => {
  assert.equal(schema.tagModel, 'many-to-many-link-list');
  assert.equal(schema.lists.Escalations_v2_Tickets.tagsVia, 'Escalations_v2_TicketTags');
});

test('D12: Tickets does NOT use a delimited tag field as source of truth', () => {
  const tickets = schema.lists.Escalations_v2_Tickets;
  for (const f of tickets.fields) {
    assert.notEqual(f.mapsTo, 'tagIds', `Tickets.${f.name} must not map Ticket.tagIds to a column`);
    assert.doesNotMatch(f.name, /^tag(s|keys|ids)$/i, `Tickets.${f.name} looks like a delimited tag field`);
  }
});

test('D12: TicketTags link list joins tickets to tags', () => {
  const tt = schema.lists.Escalations_v2_TicketTags;
  assert.ok(tt, 'Escalations_v2_TicketTags must exist');
  assert.equal(tt.role, 'link');
  const fields = tt.fields;
  assert.ok(fields.some((f) => f.lookupList === 'Escalations_v2_Tickets'), 'must link to Tickets');
  assert.ok(fields.some((f) => f.lookupList === 'Escalations_v2_Tags'), 'must link to Tags');
  // Soft-delete + audit affordances requested by the mission.
  assert.ok(fields.some((f) => f.name === 'IsActive' || f.name === 'RemovedAt'), 'must support soft-delete');
  assert.ok(fields.some((f) => f.name === 'CreatedAt'), 'must record createdAt');
});

test('Tags dictionary still exists and exposes a label', () => {
  const tags = schema.lists.Escalations_v2_Tags;
  assert.equal(tags.role, 'dictionary');
  assert.ok(tags.fields.some((f) => f.mapsTo === 'label'), 'tag dictionary must expose a label');
});

test('required views/indexes exist for tag lookup (both directions)', () => {
  const ttViews = schema.views.filter((v) => v.list === 'Escalations_v2_TicketTags');
  assert.ok(ttViews.some((v) => /TicketKey/.test(v.filter || '')), 'need a tags-by-ticket view');
  assert.ok(ttViews.some((v) => /TagKey/.test(v.filter || '')), 'need a tickets-by-tag view');

  const idx = schema.recommendedIndexes.find((i) => i.list === 'Escalations_v2_TicketTags');
  assert.ok(idx, 'TicketTags must have a recommended index entry');
  assert.ok(['TicketKey', 'TagKey'].every((c) => idx.columns.includes(c)), 'index must cover TicketKey + TagKey');
});

test('schema contains no live URLs, tenant/client IDs, secrets, or Graph/Power Automate strings', () => {
  assert.doesNotMatch(raw, /graph\.microsoft\.com/i, 'no Graph host');
  assert.doesNotMatch(raw, /\bsharepoint\.com/i, 'no live SharePoint host');
  assert.doesNotMatch(raw, /microsoftonline\.com/i, 'no Azure AD login host');
  assert.doesNotMatch(raw, /azurewebsites\.net/i, 'no Azure Functions host');
  assert.doesNotMatch(raw, /_api\/web|\/v1\.0\/sites|\/beta\/sites/i, 'no REST endpoints');
  assert.doesNotMatch(raw, /powerautomate|flow\.microsoft/i, 'no Power Automate references');
  assert.doesNotMatch(raw, /\bmsal\b|PublicClientApplication/i, 'no MSAL');
  assert.doesNotMatch(raw, /Sites\.ReadWrite\.All|Sites\.Read\.All/i, 'no OAuth scopes');
  assert.doesNotMatch(raw, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'no GUIDs');
  assert.doesNotMatch(raw, /(client_secret|clientSecret|api[_-]?key|password|pwd)\s*[:=]/i, 'no secrets');
});

test('validateSharePointSchema() reports OK with no problems', () => {
  const { ok, problems } = validateSharePointSchema();
  assert.deepEqual(problems, [], `validator problems:\n${problems.join('\n')}`);
  assert.equal(ok, true);
});

// ----- Admin build package + dry-run checklist exist and carry safety language -----

test('admin build package doc exists with design-only safety warnings + all lists', () => {
  const doc = readFileSync(ADMIN_PACKAGE, 'utf8');
  assert.match(doc, /design-only/i, 'must state design-only');
  assert.match(doc, /do not run against production/i, 'must warn against running on production');
  assert.match(doc, /legacy/i, 'must reference legacy non-interference');
  for (const list of REQUIRED_LISTS) {
    assert.match(doc, new RegExp(list), `admin package must list ${list}`);
  }
});

test('dry-run checklist exists with no-live / no-legacy / no-flow rules', () => {
  const doc = readFileSync(DRY_RUN, 'utf8');
  assert.match(doc, /legacy/i, 'must confirm target is not the legacy tracker');
  assert.match(doc, /no\s*production\s*write|writeback|write-back/i, 'must confirm no production writeback');
  assert.match(doc, /flow/i, 'must confirm no flows are created');
  assert.match(doc, /graph|live\s*api/i, 'must confirm no Graph/live API call');
  assert.match(doc, /rollback/i, 'must include a rollback path');
});
