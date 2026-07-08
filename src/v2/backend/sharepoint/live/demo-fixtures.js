// Loop 24 demo fixtures — SAFE, NAMESPACED, TEST-ONLY reference data for the SharePoint
// test backend, plus the idempotent seed / exact-key cleanup engine.
//
// PURE + DEPENDENCY-INJECTED: no network, no SDK, no config, no identifiers in this file.
// The engine works against any injected client with the shared surface
// (findBy/createItem/deleteItem — FakeSharePointClient in tests, SharePointLiveClient at
// runtime via the gated CLI in seed-demo-fixtures.js).
//
// SAFETY INVARIANTS (enforced here, not just documented):
//   * every fixture id starts with DEMO_NAMESPACE — obviously non-production;
//   * seeding REFUSES any record whose key is not namespaced;
//   * cleanup deletes ONLY exact fixture keys plus explicitly-passed namespaced ticket keys
//     (and rows referencing those tickets) — never lists, never anything else.

import { createDepartment, createUser, createTag } from '../../../domain/models.js';
import {
  LISTS, LINK_COLS, deptToFields, userToFields, tagToFields,
} from '../mapping.js';

/** Every Loop 24 demo record key starts with this. */
export const DEMO_NAMESPACE = 'esc_demo_loop24_';

export function isDemoKey(key) {
  return typeof key === 'string' && key.startsWith(DEMO_NAMESPACE);
}

/** The small, fixed demo fixture set (reference data only — no tickets). */
export function buildDemoFixtures() {
  return {
    departments: [
      createDepartment({
        id: `${DEMO_NAMESPACE}dept_it`,
        name: 'Demo IT Department (Loop 24 — TEST ONLY)',
        leadIds: [`${DEMO_NAMESPACE}user_assignee`],
        memberIds: [`${DEMO_NAMESPACE}user_requester`, `${DEMO_NAMESPACE}user_assignee`],
      }),
    ],
    users: [
      createUser({
        id: `${DEMO_NAMESPACE}user_requester`,
        displayName: 'Demo Requester (TEST ONLY)',
        email: 'demo.requester@example.invalid',
        departmentIds: [`${DEMO_NAMESPACE}dept_it`],
      }),
      createUser({
        id: `${DEMO_NAMESPACE}user_assignee`,
        displayName: 'Demo Assignee (TEST ONLY)',
        email: 'demo.assignee@example.invalid',
        departmentIds: [`${DEMO_NAMESPACE}dept_it`],
      }),
    ],
    tags: [
      createTag({
        id: `${DEMO_NAMESPACE}tag_urgent_review`,
        label: 'demo-urgent-review (test only)',
      }),
    ],
  };
}

// [list, keyColumn, toFields] per fixture kind, in dependency-safe creation order.
function fixturePlan(fixtures) {
  return [
    [LISTS.DEPARTMENTS, 'DeptKey', fixtures.departments, deptToFields],
    [LISTS.USERS, 'UserKey', fixtures.users, userToFields],
    [LISTS.TAGS, 'TagKey', fixtures.tags, tagToFields],
  ];
}

/**
 * Idempotently seed the demo fixtures: existing rows (by exact key) are REUSED, missing
 * ones are created. Refuses any non-namespaced id.
 * @returns {Promise<{created: string[], reused: string[]}>}
 */
export async function seedDemoFixtures(client, fixtures = buildDemoFixtures()) {
  const created = [];
  const reused = [];
  for (const [list, keyCol, records, toFields] of fixturePlan(fixtures)) {
    for (const record of records) {
      if (!isDemoKey(record.id)) {
        throw new Error(`seedDemoFixtures REFUSED: '${record.id}' is not ${DEMO_NAMESPACE}-namespaced`);
      }
      const existing = await client.findBy(list, { [keyCol]: record.id });
      if (existing) { reused.push(record.id); continue; }
      await client.createItem(list, toFields(record));
      created.push(record.id);
    }
  }
  return { created, reused };
}

/** Report which fixture records are currently present / missing (read-only). */
export async function verifyDemoFixtures(client, fixtures = buildDemoFixtures()) {
  const present = [];
  const missing = [];
  for (const [list, keyCol, records] of fixturePlan(fixtures)) {
    for (const record of records) {
      const found = await client.findBy(list, { [keyCol]: record.id });
      (found ? present : missing).push(record.id);
    }
  }
  return { present, missing };
}

// Delete every row matching an exact-key filter (loops for duplicates); returns count.
async function deleteWhere(client, list, filter) {
  let deleted = 0;
  for (;;) {
    const rec = await client.findBy(list, filter);
    if (!rec) break;
    await client.deleteItem(list, rec.id);
    deleted += 1;
  }
  return deleted;
}

/**
 * EXACT-KEY cleanup of Loop 24 demo records: the fixture reference rows plus any explicitly
 * passed demo ticket keys — including each ticket's tag links, activity, comments, notes,
 * and attachment metadata. Children are removed BEFORE their ticket (live lookup filters
 * need the target row to still exist), tickets before the reference rows they point at.
 * Refuses non-namespaced ticket keys. Never deletes lists or unrelated rows.
 * @returns {Promise<{deleted: number, leftovers: string[]}>}
 */
export async function cleanupDemoRecords(client, { ticketKeys = [], fixtures = buildDemoFixtures() } = {}) {
  let deleted = 0;
  for (const key of ticketKeys) {
    if (!isDemoKey(key)) {
      throw new Error(`cleanupDemoRecords REFUSED: ticket key '${key}' is not ${DEMO_NAMESPACE}-namespaced`);
    }
    deleted += await deleteWhere(client, LISTS.TICKET_TAGS, { [LINK_COLS.TICKET]: key });
    deleted += await deleteWhere(client, LISTS.ACTIVITY, { EscalationKey: key });
    deleted += await deleteWhere(client, LISTS.COMMENTS, { EscalationKey: key });
    deleted += await deleteWhere(client, LISTS.NOTES, { EscalationKey: key });
    deleted += await deleteWhere(client, LISTS.ATTACHMENTS, { EscalationKey: key });
    deleted += await deleteWhere(client, LISTS.TICKETS, { TicketKey: key });
  }
  for (const [list, keyCol, records] of fixturePlan(fixtures)) {
    for (const record of records) {
      deleted += await deleteWhere(client, list, { [keyCol]: record.id });
    }
  }
  // Honest leftover check: anything from this cleanup scope still present?
  const leftovers = [];
  for (const key of ticketKeys) {
    if (await client.findBy(LISTS.TICKETS, { TicketKey: key })) leftovers.push(key);
  }
  const { present } = await verifyDemoFixtures(client, fixtures);
  leftovers.push(...present);
  return { deleted, leftovers };
}
