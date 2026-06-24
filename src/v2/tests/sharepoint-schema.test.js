// Tests for the design-only SharePoint v2 schema + its validator.
//
// These run entirely locally: they read the JSON blueprint and assert its shape. Nothing
// here connects to SharePoint, Graph, Azure, Dataverse, or any network endpoint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateSharePointSchema, SCHEMA_PATH, REQUIRED_LISTS, REQUIRED_TICKET_MAPPINGS,
} from '../scripts/validateSharePointSchema.js';
import { createTicket } from '../domain/models.js';

const raw = readFileSync(SCHEMA_PATH, 'utf8');

test('schema file parses as JSON and is marked design-only', () => {
  const schema = JSON.parse(raw); // throws if not valid JSON
  assert.equal(schema.designOnly, true);
  assert.equal(schema.status, 'design-only');
  assert.equal(typeof schema.lists, 'object');
});

test('all required v2 lists exist', () => {
  const schema = JSON.parse(raw);
  for (const list of REQUIRED_LISTS) {
    assert.ok(schema.lists[list], `missing required list: ${list}`);
    assert.ok(Array.isArray(schema.lists[list].fields) && schema.lists[list].fields.length > 0,
      `${list} must have fields`);
  }
});

test('ticket schema covers every field of the current Ticket data model', () => {
  const schema = JSON.parse(raw);
  const tickets = schema.lists.Escalations_v2_Tickets;
  const mapped = new Set((tickets.fields || []).map((f) => f.mapsTo).filter(Boolean));

  // The validator's required list and the real model must agree — guards drift in either.
  const modelFields = Object.keys(createTicket({ title: 'x' }));
  for (const field of modelFields) {
    assert.ok(REQUIRED_TICKET_MAPPINGS.includes(field),
      `Ticket model field "${field}" is not in REQUIRED_TICKET_MAPPINGS — update the validator`);
    assert.ok(mapped.has(field),
      `Escalations_v2_Tickets has no column mapping to Ticket.${field}`);
  }
});

test('schema contains no live URLs, tenant/client IDs, secrets, or Graph/Power Automate strings', () => {
  // Real production hosts and endpoints.
  assert.doesNotMatch(raw, /graph\.microsoft\.com/i, 'no Graph host');
  assert.doesNotMatch(raw, /\bsharepoint\.com/i, 'no live SharePoint host');
  assert.doesNotMatch(raw, /microsoftonline\.com/i, 'no Azure AD login host');
  assert.doesNotMatch(raw, /azurewebsites\.net/i, 'no Azure Functions host');
  assert.doesNotMatch(raw, /_api\/web|\/v1\.0\/sites|\/beta\/sites/i, 'no REST endpoints');
  assert.doesNotMatch(raw, /powerautomate|flow\.microsoft/i, 'no Power Automate references');
  assert.doesNotMatch(raw, /\bmsal\b|PublicClientApplication/i, 'no MSAL');
  assert.doesNotMatch(raw, /Sites\.ReadWrite\.All|Sites\.Read\.All/i, 'no OAuth scopes');
  // GUIDs (tenant/client ids) and secret-like assignments.
  assert.doesNotMatch(raw, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'no GUIDs');
  assert.doesNotMatch(raw, /(client_secret|clientSecret|api[_-]?key|password|pwd)\s*[:=]/i, 'no secrets');
});

test('validateSharePointSchema() reports OK with no problems', () => {
  const { ok, problems } = validateSharePointSchema();
  assert.deepEqual(problems, [], `validator problems:\n${problems.join('\n')}`);
  assert.equal(ok, true);
});
