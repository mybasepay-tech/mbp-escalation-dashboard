// Mapping fidelity tests (Loop 16). Verify the domain<->SharePoint-column translation and the
// field-shape round-trip helpers (Lookup/Person/DateTime/Boolean) so the eventual real-client
// adapter layer translates losslessly. 100% local; pure functions; no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  lookupField, personField, dateTimeField, booleanField,
  ticketToFields, fieldsToTicket, activityToFields, fieldsToActivity, LINK_COLS,
} from '../backend/sharepoint/mapping.js';
import { createTicket, createActivityEvent } from '../domain/models.js';

test('Lookup field round-trips app key <-> shaped value, null-safe', () => {
  assert.equal(lookupField.decode(lookupField.encode('user_x')), 'user_x');
  assert.equal(lookupField.encode(null), null);
  assert.equal(lookupField.decode(null), null);
  // Accepts the real SharePoint object shapes too.
  assert.equal(lookupField.decode({ LookupValue: 'dept_a' }), 'dept_a');
  assert.equal(lookupField.decode({ LookupId: 7 }), 7);
});

test('Person field round-trips app key <-> shaped value, null-safe', () => {
  assert.equal(personField.decode(personField.encode('user_teri')), 'user_teri');
  assert.equal(personField.encode(null), null);
  assert.equal(personField.decode({ Key: 'user_a', Title: 'A' }), 'user_a');
});

test('DateTime field preserves ISO shape and is null-safe', () => {
  const iso = '2026-06-10T12:00:00.000Z';
  assert.equal(dateTimeField.encode(iso), iso);
  assert.equal(dateTimeField.decode(dateTimeField.encode(iso)), iso);
  assert.equal(dateTimeField.encode(null), null);
});

test('Boolean field preserves strict true/false (coerces common surfaces)', () => {
  assert.equal(booleanField.encode(true), true);
  assert.equal(booleanField.encode(false), false);
  assert.equal(booleanField.decode('true'), true);
  assert.equal(booleanField.decode(1), true);
  assert.equal(booleanField.decode(false), false);
});

test('Ticket round-trips through column fields (tagIds carried separately, D12)', () => {
  const t = createTicket({
    id: 'esc_x', title: 'T', status: 'Assigned', priority: 'High',
    assignedDeptId: 'dept_benefits', assigneeId: 'user_sarah', ticketOwner: 'user_teri',
    submitterId: 'user_maggie', escalationDate: '2026-06-01T09:00:00.000Z',
    completedDate: null, createdAt: '2026-06-01T09:00:00.000Z', modifiedAt: '2026-06-01T09:00:00.000Z',
  });
  const fields = ticketToFields(t);
  assert.equal(fields.TicketKey, 'esc_x');
  assert.equal(fields.AssigneeKey, 'user_sarah');
  assert.equal(fields.TicketOwnerKey, 'user_teri');
  assert.equal('tagIds' in fields, false, 'tags are not a ticket column (D12)');
  const back = fieldsToTicket(fields, ['tag_urgent']);
  for (const k of ['id', 'title', 'status', 'priority', 'assignedDeptId', 'assigneeId', 'ticketOwner', 'submitterId']) {
    assert.equal(back[k], t[k], `field ${k} round-trips`);
  }
  assert.deepEqual(back.tagIds, ['tag_urgent']);
});

test('missing/null columns decode to null consistently', () => {
  const back = fieldsToTicket({ TicketKey: 'esc_y' }, []);
  assert.equal(back.id, 'esc_y');
  assert.equal(back.completedDate, null);
  assert.equal(back.assigneeId, null);
  assert.equal(back.legacyUrl, null);
  assert.deepEqual(back.tagIds, []);
});

test('Activity from/to JSON round-trip preserves string and object shapes', () => {
  const statusEv = createActivityEvent({ escalationId: 'esc_x', type: 'status_change', from: 'Assigned', to: 'In Process', timestamp: '2026-06-02T00:00:00.000Z' });
  const back1 = fieldsToActivity(activityToFields(statusEv));
  assert.equal(back1.to, 'In Process');
  assert.equal(back1.from, 'Assigned');

  const tagEv = createActivityEvent({ escalationId: 'esc_x', type: 'field_change', to: { addedTag: 'tag_urgent' }, timestamp: '2026-06-02T00:00:00.000Z' });
  const back2 = fieldsToActivity(activityToFields(tagEv));
  assert.deepEqual(back2.to, { addedTag: 'tag_urgent' });
  assert.equal(back2.from, null);
});

test('TicketTags link column names are stable', () => {
  assert.equal(LINK_COLS.TICKET, 'TicketKey');
  assert.equal(LINK_COLS.TAG, 'TagKey');
  assert.equal(LINK_COLS.ACTIVE, 'IsActive');
  assert.equal(LINK_COLS.REMOVED_AT, 'RemovedAt');
  assert.equal(LINK_COLS.KEY, 'TicketTagKey');
});
