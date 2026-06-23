// Tests for comments, internal notes, and tags — separation of streams and activity events.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seededStore } from '../mock/seed.js';
import { ACTIVITY_TYPE } from '../domain/constants.js';

const NOW = '2026-06-22T00:00:00.000Z';

test('public comments and internal notes are separate streams', async () => {
  const store = seededStore();
  const comments = await store.listComments('esc_in_process');
  const notes = await store.listNotes('esc_in_process');
  assert.ok(comments.length >= 1);
  assert.ok(notes.length >= 1);
  // No id overlap between the two streams.
  const overlap = comments.filter((c) => notes.some((n) => n.id === c.id));
  assert.equal(overlap.length, 0);
  // Visibility metadata is modeled for future permissions.
  assert.ok(comments.every((c) => c.visibility === 'public'));
  assert.ok(notes.every((n) => n.visibility === 'internal'));
});

test('comments and notes are NOT part of the activity stream (no giant text field)', async () => {
  const store = seededStore();
  const activity = await store.listActivity('esc_in_process');
  // Activity holds typed events, not comment/note bodies.
  for (const e of activity) {
    assert.ok(!('body' in e), 'activity events must not carry comment/note bodies');
  }
  // The ticket itself stores no monolithic history blob.
  const t = await store.getTicket('esc_in_process');
  assert.equal(t.statusUpdates, undefined);
  assert.equal(t.history, undefined);
});

test('creating a public comment creates a comment activity event', async () => {
  const store = seededStore();
  const before = (await store.listActivity('esc_person')).length;
  await store.addComment('esc_person', { authorId: 'user_sarah', body: 'Following up with the member.', createdAt: NOW });
  const comments = await store.listComments('esc_person');
  assert.ok(comments.some((c) => c.body === 'Following up with the member.'));
  const activity = await store.listActivity('esc_person');
  assert.equal(activity.length, before + 1);
  assert.equal(activity.at(-1).type, ACTIVITY_TYPE.COMMENT);
});

test('creating an internal note creates a note activity event', async () => {
  const store = seededStore();
  await store.addNote('esc_person', { authorId: 'user_sarah', body: 'Internal: double-check eligibility dates.', createdAt: NOW });
  const notes = await store.listNotes('esc_person');
  assert.ok(notes.some((n) => n.body.startsWith('Internal:')));
  const activity = await store.listActivity('esc_person');
  assert.equal(activity.at(-1).type, ACTIVITY_TYPE.NOTE);
});

test('a comment does not leak into notes and vice versa', async () => {
  const store = seededStore();
  await store.addComment('esc_new', { authorId: 'user_maggie', body: 'public hello', createdAt: NOW });
  await store.addNote('esc_new', { authorId: 'user_maggie', body: 'internal hello', createdAt: NOW });
  const comments = await store.listComments('esc_new');
  const notes = await store.listNotes('esc_new');
  assert.equal(comments.length, 1);
  assert.equal(notes.length, 1);
  assert.equal(comments[0].body, 'public hello');
  assert.equal(notes[0].body, 'internal hello');
});

test('adding a tag is idempotent and records a field_change activity event', async () => {
  const store = seededStore();
  await store.addTag('esc_new', 'tag_urgent', { actorId: 'user_teri', now: NOW });
  await store.addTag('esc_new', 'tag_urgent', { actorId: 'user_teri', now: NOW }); // duplicate no-op
  const t = await store.getTicket('esc_new');
  assert.deepEqual(t.tagIds, ['tag_urgent']);
  const tagEvents = (await store.listActivity('esc_new'))
    .filter((e) => e.type === ACTIVITY_TYPE.FIELD_CHANGE && e.to?.addedTag === 'tag_urgent');
  assert.equal(tagEvents.length, 1, 'only one tag-add event despite duplicate add');
});

test('removing a tag updates the ticket and records a field_change activity event', async () => {
  const store = seededStore();
  // esc_in_process is seeded with tag_financial + tag_member_impact.
  await store.removeTag('esc_in_process', 'tag_financial', { actorId: 'user_maggie', now: NOW });
  const t = await store.getTicket('esc_in_process');
  assert.ok(!t.tagIds.includes('tag_financial'));
  assert.ok(t.tagIds.includes('tag_member_impact'));
  const removed = (await store.listActivity('esc_in_process'))
    .some((e) => e.type === ACTIVITY_TYPE.FIELD_CHANGE && e.to?.removedTag === 'tag_financial');
  assert.ok(removed);
});

test('removing an absent tag is a no-op (no event)', async () => {
  const store = seededStore();
  const before = (await store.listActivity('esc_new')).length;
  await store.removeTag('esc_new', 'tag_financial', { now: NOW });
  assert.equal((await store.listActivity('esc_new')).length, before);
});
