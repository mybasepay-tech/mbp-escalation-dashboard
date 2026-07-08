// Loop 24 demo-fixture tests — namespacing, seed idempotency, exact-key cleanup to zero,
// and the legacy-untouched guard. 100% local: the engine runs against the in-memory
// FakeSharePointClient; no network, no live config, no secrets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

import {
  DEMO_NAMESPACE, isDemoKey, buildDemoFixtures, seedDemoFixtures, verifyDemoFixtures,
  cleanupDemoRecords,
} from '../backend/sharepoint/live/demo-fixtures.js';
import { createSeededFakeClient } from '../backend/sharepoint/fake/seed.js';
import { SharePointStore } from '../store/SharePointStore.js';
import { LISTS } from '../backend/sharepoint/mapping.js';

const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const emptyClient = () => createSeededFakeClient({}); // all 9 lists provisioned, zero rows

// ----- namespacing: obviously test-only records -----

test('every demo fixture id is namespaced and obviously test-only', () => {
  const f = buildDemoFixtures();
  const all = [...f.departments, ...f.users, ...f.tags];
  assert.equal(all.length, 4, 'small fixed set: 1 department, 2 users, 1 tag');
  for (const record of all) {
    assert.ok(isDemoKey(record.id), `${record.id} must start with ${DEMO_NAMESPACE}`);
    const label = record.name ?? record.displayName ?? record.label;
    assert.match(label, /demo/i, `${record.id} label must say demo`);
    assert.match(label, /test/i, `${record.id} label must say test(-only)`);
  }
  for (const u of f.users) assert.match(u.email, /@example\.invalid$/, 'demo emails use .invalid');
});

test('the demo requester and assignee are distinct users (closure-rule demo needs both)', () => {
  const f = buildDemoFixtures();
  const ids = f.users.map((u) => u.id);
  assert.ok(ids.includes(`${DEMO_NAMESPACE}user_requester`));
  assert.ok(ids.includes(`${DEMO_NAMESPACE}user_assignee`));
});

// ----- seed idempotency -----

test('seedDemoFixtures is idempotent: first run creates 4, second run reuses 4', async () => {
  const client = emptyClient();
  const first = await seedDemoFixtures(client);
  assert.equal(first.created.length, 4);
  assert.equal(first.reused.length, 0);
  const second = await seedDemoFixtures(client);
  assert.equal(second.created.length, 0);
  assert.equal(second.reused.length, 4);
  const { present, missing } = await verifyDemoFixtures(client);
  assert.equal(present.length, 4);
  assert.equal(missing.length, 0);
});

test('seedDemoFixtures refuses a non-namespaced record (defense in depth)', async () => {
  const client = emptyClient();
  const fixtures = buildDemoFixtures();
  fixtures.tags[0] = { ...fixtures.tags[0], id: 'tag_totally_real' };
  await assert.rejects(() => seedDemoFixtures(client, fixtures), /REFUSED.*not esc_demo_loop24_/);
});

// ----- exact-key cleanup to zero -----

test('cleanupDemoRecords removes fixtures + a demo ticket with ALL its children; leftover 0; unrelated rows survive', async () => {
  const client = emptyClient();
  await seedDemoFixtures(client);

  // An UNRELATED row that must survive cleanup untouched.
  client.createItem(LISTS.TAGS, { TagKey: 'tag_unrelated', Label: 'not a demo tag' });

  // Drive a full demo-ticket lifecycle through the real store (same seam as the UI).
  const store = new SharePointStore({ client });
  const ticketId = `${DEMO_NAMESPACE}smoke_test_ticket`;
  await store.createTicket({
    id: ticketId, title: 'demo smoke (test only)',
    submitterId: `${DEMO_NAMESPACE}user_requester`, requestingDept: 'Demo (test only)',
  });
  await store.assignDepartment(ticketId, `${DEMO_NAMESPACE}dept_it`, { now: '2026-07-08T00:00:00.000Z' });
  await store.assignPerson(ticketId, `${DEMO_NAMESPACE}user_assignee`, { now: '2026-07-08T00:01:00.000Z' });
  await store.addTag(ticketId, `${DEMO_NAMESPACE}tag_urgent_review`, { now: '2026-07-08T00:02:00.000Z' });
  await store.addComment(ticketId, { authorId: `${DEMO_NAMESPACE}user_assignee`, body: 'demo comment', createdAt: '2026-07-08T00:03:00.000Z' });
  await store.addNote(ticketId, { authorId: `${DEMO_NAMESPACE}user_assignee`, body: 'demo note', createdAt: '2026-07-08T00:04:00.000Z' });
  await store.addAttachment(ticketId, { fileName: 'demo.txt', uploadedBy: `${DEMO_NAMESPACE}user_assignee`, uploadedAt: '2026-07-08T00:05:00.000Z' });

  const { deleted, leftovers } = await cleanupDemoRecords(client, { ticketKeys: [ticketId] });
  assert.equal(leftovers.length, 0, 'leftover count must be 0 after cleanup');
  // 4 fixtures + 1 ticket + 1 link + 1 comment + 1 note + 1 attachment + >=6 activity rows.
  assert.ok(deleted >= 15, `expected a full sweep of demo records, deleted=${deleted}`);

  // Every demo-scoped list is empty of demo rows...
  assert.equal(await client.findBy(LISTS.TICKETS, { TicketKey: ticketId }), null);
  assert.equal(await client.findBy(LISTS.USERS, { UserKey: `${DEMO_NAMESPACE}user_requester` }), null);
  assert.equal(await client.findBy(LISTS.DEPARTMENTS, { DeptKey: `${DEMO_NAMESPACE}dept_it` }), null);
  assert.equal(await client.findBy(LISTS.TAGS, { TagKey: `${DEMO_NAMESPACE}tag_urgent_review` }), null);
  assert.equal((await client.queryAll(LISTS.ACTIVITY, { EscalationKey: ticketId })).length, 0);
  // ...while the unrelated row is untouched.
  assert.ok(await client.findBy(LISTS.TAGS, { TagKey: 'tag_unrelated' }), 'non-demo rows must survive');
});

test('cleanupDemoRecords refuses non-namespaced ticket keys (never deletes outside the namespace)', async () => {
  const client = emptyClient();
  await assert.rejects(
    () => cleanupDemoRecords(client, { ticketKeys: ['esc_person'] }),
    /REFUSED.*not esc_demo_loop24_/,
  );
});

// ----- legacy stays untouched: v2 source never references the legacy dashboard file -----

test('v2 source (.js) never references the legacy dashboard file', () => {
  const offenders = [];
  const walk = (abs) => {
    for (const entry of readdirSync(abs)) {
      const p = join(abs, entry);
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.js')) continue;
      // The legacy FILE (escalation-dashboard.html), not the repo folder name
      // (mbp-escalation-dashboard), which legitimately appears in path comments.
      if (/escalation-dashboard\.html/i.test(readFileSync(p, 'utf8'))) offenders.push(relative(V2_ROOT, p));
    }
  };
  for (const dir of ['domain', 'store', 'mock', 'ui', 'backend', 'scripts']) walk(join(V2_ROOT, dir));
  assert.deepEqual(offenders, [], 'no v2 runtime code may reference the legacy dashboard');
});
