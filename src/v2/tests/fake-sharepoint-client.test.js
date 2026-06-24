// Tests for the FakeSharePoint simulator itself (the in-memory stand-in the adapter uses).
// 100% local: create/read/update, ETag concurrency, not-found, pagination, throttling hook,
// and the TicketTags active-link pattern. No network, no SDKs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { FakeSharePointClient } from '../backend/sharepoint/fake/FakeSharePointClient.js';
import { NotFoundError, ConflictError, ThrottledError } from '../backend/sharepoint/fake/FakeSharePointErrors.js';

const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FAKE_DIR = join(V2_ROOT, 'backend', 'sharepoint', 'fake');

function client() {
  const c = new FakeSharePointClient();
  c.ensureList('L');
  return c;
}

test('create then read returns the stored fields with an id and etag', () => {
  const c = client();
  const created = c.createItem('L', { Title: 'a' });
  assert.ok(created.id);
  assert.ok(created.etag);
  const got = c.getItem('L', created.id);
  assert.equal(got.fields.Title, 'a');
  assert.equal(got.etag, created.etag);
});

test('update with the matching etag succeeds and bumps the etag', () => {
  const c = client();
  const a = c.createItem('L', { Title: 'a' });
  const b = c.updateItem('L', a.id, { Title: 'b' }, { ifMatch: a.etag });
  assert.equal(b.fields.Title, 'b');
  assert.notEqual(b.etag, a.etag);
});

test('update with a stale etag throws ConflictError (412)', () => {
  const c = client();
  const a = c.createItem('L', { Title: 'a' });
  c.updateItem('L', a.id, { Title: 'b' }, { ifMatch: a.etag }); // bumps etag
  assert.throws(() => c.updateItem('L', a.id, { Title: 'c' }, { ifMatch: a.etag }), ConflictError);
});

test('reading a missing item throws NotFoundError (404)', () => {
  const c = client();
  assert.throws(() => c.getItem('L', 'nope'), NotFoundError);
});

test('pagination returns pages and a skip token until exhausted', () => {
  const c = client();
  for (let i = 0; i < 5; i++) c.createItem('L', { Title: `t${i}`, Group: 'g' });
  const p1 = c.query('L', { filter: { Group: 'g' }, top: 2 });
  assert.equal(p1.items.length, 2);
  assert.equal(p1.nextSkipToken, 2);
  const all = c.queryAll('L', { Group: 'g' }, 2);
  assert.equal(all.length, 5);
});

test('filter by indexed field returns only matching items', () => {
  const c = client();
  c.createItem('L', { Title: 'x', Status: 'New' });
  c.createItem('L', { Title: 'y', Status: 'Complete' });
  const open = c.queryAll('L', { Status: 'New' });
  assert.equal(open.length, 1);
  assert.equal(open[0].fields.Title, 'x');
});

test('throttling hook makes the next op throw a simulated ThrottledError (429)', () => {
  const c = client();
  c.createItem('L', { Title: 'a' });
  c.failNextOn('L', new ThrottledError('slow down', 5));
  assert.throws(() => c.query('L', {}), ThrottledError);
  // One-shot: the following op succeeds.
  assert.equal(c.queryAll('L').length, 1);
});

test('TicketTags-style composite active-link pattern is queryable', () => {
  const c = client();
  c.ensureList('Escalations_v2_TicketTags');
  c.createItem('Escalations_v2_TicketTags', { TicketKey: 'esc_1', TagKey: 'tag_a', IsActive: true });
  c.createItem('Escalations_v2_TicketTags', { TicketKey: 'esc_1', TagKey: 'tag_b', IsActive: true });
  const active = c.queryAll('Escalations_v2_TicketTags', { TicketKey: 'esc_1', IsActive: true });
  assert.equal(active.length, 2);
  // Soft-delete one and confirm the active filter excludes it.
  const link = c.query('Escalations_v2_TicketTags', { filter: { TicketKey: 'esc_1', TagKey: 'tag_a' }, top: 1 }).items[0];
  c.updateItem('Escalations_v2_TicketTags', link.id, { IsActive: false }, { ifMatch: link.etag });
  assert.equal(c.queryAll('Escalations_v2_TicketTags', { TicketKey: 'esc_1', IsActive: true }).length, 1);
});

test('simulator source contains no network calls or live SDK/markers', () => {
  for (const f of readdirSync(FAKE_DIR).filter((n) => n.endsWith('.js'))) {
    const src = readFileSync(join(FAKE_DIR, f), 'utf8');
    assert.doesNotMatch(src, /\bfetch\s*\(/, `${f}: no fetch()`);
    assert.doesNotMatch(src, /XMLHttpRequest/, `${f}: no XMLHttpRequest`);
    assert.doesNotMatch(src, /@microsoft\/|@pnp\/|@azure\//, `${f}: no SDK import`);
    assert.doesNotMatch(src, /graph\.microsoft\.com|\bsharepoint\.com/i, `${f}: no live host`);
    assert.doesNotMatch(src, /https?:\/\/[a-z0-9.-]+/i, `${f}: no live URL`);
    assert.doesNotMatch(src, /process\.env/, `${f}: no env vars`);
  }
});
