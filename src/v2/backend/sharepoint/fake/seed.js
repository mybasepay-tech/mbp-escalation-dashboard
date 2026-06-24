// Seed a FakeSharePointClient from a standard seed dataset (the same shape buildSeed() emits).
//
// Translates domain objects into SharePoint column items using the shared mapping, and turns
// each ticket's tagIds into ACTIVE Escalations_v2_TicketTags link rows (D12). 100% local; no
// network. Used by the simulated store-contract test to load identical data into the adapter.

import { FakeSharePointClient } from './FakeSharePointClient.js';
import { newId } from '../../../domain/models.js';
import {
  LISTS, ALL_LISTS, LINK_COLS,
  ticketToFields, activityToFields, commentToFields, noteToFields,
  deptToFields, userToFields, tagToFields,
} from '../mapping.js';

/** Build a FakeSharePointClient with the eight v2 lists provisioned and the seed loaded. */
export function createSeededFakeClient(seed = {}) {
  const {
    departments = [], users = [], tags = [], tickets = [], activity = [], comments = [], notes = [],
  } = seed;

  const client = new FakeSharePointClient();
  for (const name of ALL_LISTS) client.ensureList(name);

  for (const d of departments) client.createItem(LISTS.DEPARTMENTS, deptToFields(d));
  for (const u of users) client.createItem(LISTS.USERS, userToFields(u));
  for (const t of tags) client.createItem(LISTS.TAGS, tagToFields(t));

  const labelByTag = new Map(tags.map((t) => [t.id, t.label]));

  for (const ticket of tickets) {
    client.createItem(LISTS.TICKETS, ticketToFields(ticket));
    for (const tagId of ticket.tagIds ?? []) {
      client.createItem(LISTS.TICKET_TAGS, {
        [LINK_COLS.KEY]: newId('tt'),
        [LINK_COLS.TICKET]: ticket.id,
        [LINK_COLS.TAG]: tagId,
        [LINK_COLS.ACTIVE]: true,
        [LINK_COLS.REMOVED_AT]: null,
        [LINK_COLS.LABEL_SNAPSHOT]: labelByTag.get(tagId) ?? null,
        [LINK_COLS.SOURCE]: 'migration',
        [LINK_COLS.CREATED_AT]: ticket.createdAt,
        [LINK_COLS.CREATED_BY]: null,
      });
    }
  }

  for (const a of activity) client.createItem(LISTS.ACTIVITY, activityToFields(a));
  for (const c of comments) client.createItem(LISTS.COMMENTS, commentToFields(c));
  for (const n of notes) client.createItem(LISTS.NOTES, noteToFields(n));

  return client;
}
