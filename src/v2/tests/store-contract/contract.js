// Reusable EscalationStore contract.
//
// This module defines the behavioral contract that EVERY EscalationStore implementation must
// satisfy — today MockStore, tomorrow a SharePointStore adapter (run against a disposable
// test site). It is backend-agnostic: it only uses the public EscalationStore interface and a
// standard seed dataset, never any implementation internals.
//
// Usage (see store-contract.test.js):
//   runStoreContract('MockStore', (seed) => new MockStore().load(seed));
//   // future: runStoreContract('SharePointStore(test-site)', async (seed) => {...});
//
// `makeStore(seed)` must return (or resolve to) a store preloaded with the given seed dataset.
// 100% local: no network, no production integration. `now` values are fixed for determinism.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSeed } from '../../mock/seed.js';
import { STATUS, ACTIVITY_TYPE, OPEN_STATUSES, TERMINAL_STATUSES } from '../../domain/constants.js';

const NOW = '2026-06-22T00:00:00.000Z';
const LATER = '2026-06-23T00:00:00.000Z';

/**
 * Register the full store contract as node:test cases, prefixed with `label`.
 * @param {string} label - identifies the implementation under test.
 * @param {(seed: object) => (object|Promise<object>)} makeStore - returns a preloaded store.
 */
export function runStoreContract(label, makeStore) {
  const fresh = () => Promise.resolve(makeStore(buildSeed()));
  const t = (name, fn) => test(`[contract:${label}] ${name}`, fn);

  // ----- load / list -----
  t('load + listTickets returns the full seeded dataset', async () => {
    const store = await fresh();
    const all = await store.listTickets();
    assert.ok(all.length >= 10, 'seed should expose all scenario tickets');
    assert.ok(all.some((x) => x.id === 'esc_new'));
    assert.ok(all.every((x) => valid(x.status)), 'every ticket has a valid status');
  });

  t('getTicket returns a ticket by id, and null for an unknown id', async () => {
    const store = await fresh();
    assert.equal((await store.getTicket('esc_person')).id, 'esc_person');
    assert.equal(await store.getTicket('does_not_exist'), null);
  });

  // ----- create -----
  t('createTicket persists the ticket and records a `created` activity event', async () => {
    const store = await fresh();
    const before = (await store.listTickets()).length;
    const created = await store.createTicket({ title: 'Brand new', submitterId: 'user_maggie', createdAt: NOW });
    assert.ok(created.id, 'created ticket has an id');
    assert.equal((await store.listTickets()).length, before + 1);
    const activity = await store.listActivity(created.id);
    assert.ok(activity.some((e) => e.type === ACTIVITY_TYPE.CREATED), 'created event recorded');
  });

  // ----- assignment -----
  t('assignPerson records assignment activity and auto-advances New/Not-yet → Assigned', async () => {
    const store = await fresh();
    await store.assignPerson('esc_dept_only', 'user_sarah', { actorId: 'user_teri', now: NOW });
    const t1 = await store.getTicket('esc_dept_only');
    assert.equal(t1.assigneeId, 'user_sarah');
    assert.equal(t1.status, STATUS.ASSIGNED, 'Not yet assigned auto-advances to Assigned');
    const types = (await store.listActivity('esc_dept_only')).map((e) => e.type);
    assert.ok(types.includes(ACTIVITY_TYPE.ASSIGNMENT_CHANGE));
    assert.ok(types.includes(ACTIVITY_TYPE.STATUS_CHANGE));
  });

  t('clearAssignee on an Assigned ticket reverts status to Not yet assigned', async () => {
    const store = await fresh();
    await store.clearAssignee('esc_person', { actorId: 'user_teri', now: NOW });
    const t1 = await store.getTicket('esc_person');
    assert.equal(t1.assigneeId, null);
    assert.equal(t1.status, STATUS.NOT_YET_ASSIGNED);
  });

  // ----- department queue -----
  t('assignDepartment routes a ticket into that department queue', async () => {
    const store = await fresh();
    await store.assignDepartment('esc_new', 'dept_payroll', { actorId: 'user_jennifer', now: NOW });
    const queue = await store.departmentQueue('dept_payroll');
    assert.ok(queue.some((x) => x.id === 'esc_new'), 'newly routed ticket appears in the dept queue');
    assert.ok(queue.every((x) => x.assignedDeptId === 'dept_payroll'));
  });

  t('department queue includes person-assigned tickets (not just unassigned ones)', async () => {
    const store = await fresh();
    const ids = (await store.departmentQueue('dept_benefits')).map((x) => x.id);
    assert.ok(ids.includes('esc_person'), 'person-assigned ticket stays in the dept queue');
    assert.ok(ids.includes('esc_dept_only'));
  });

  t('myAssignedTickets returns only the given person\'s tickets', async () => {
    const store = await fresh();
    const mine = await store.myAssignedTickets('user_sarah');
    assert.ok(mine.length > 0);
    assert.ok(mine.every((x) => x.assigneeId === 'user_sarah'));
  });

  // ----- ticket owner / requester / status -----
  t('owner, assignee, and requester are distinct roles (requester is the closure authority)', async () => {
    const store = await fresh();
    const t1 = await store.getTicket('esc_person');
    assert.equal(t1.ticketOwner, 'user_teri');
    assert.equal(t1.assigneeId, 'user_sarah');
    assert.equal(t1.submitterId, 'user_maggie');
    assert.notEqual(t1.ticketOwner, t1.assigneeId);
    assert.notEqual(t1.submitterId, t1.ticketOwner);
  });

  t('setStatus performs a legal transition and records a status_change event', async () => {
    const store = await fresh();
    await store.setStatus('esc_person', STATUS.IN_PROCESS, { actorId: 'user_sarah', now: NOW });
    const t1 = await store.getTicket('esc_person');
    assert.equal(t1.status, STATUS.IN_PROCESS);
    const ev = (await store.listActivity('esc_person')).filter((e) => e.type === ACTIVITY_TYPE.STATUS_CHANGE);
    assert.ok(ev.some((e) => e.to === STATUS.IN_PROCESS));
  });

  t('setStatus rejects an illegal transition', async () => {
    const store = await fresh();
    // esc_complete is Complete; the only legal move is Reopened. Assigned is illegal.
    await assert.rejects(
      () => store.setStatus('esc_complete', STATUS.ASSIGNED, { actorId: 'user_teri', now: NOW }),
      /Illegal status transition/,
    );
  });

  // ----- requester-only Complete + required final closing comment (Loop 21) -----
  // esc_person: submitter=user_maggie (requester), assignee=user_sarah, owner=user_teri.
  t('the requester can move a ticket to Complete with a final closing comment', async () => {
    const store = await fresh();
    await store.setStatus('esc_person', STATUS.COMPLETE, {
      actorId: 'user_maggie', now: NOW, closureNote: 'Claim reprocessed; member confirmed.',
    });
    const t1 = await store.getTicket('esc_person');
    assert.equal(t1.status, STATUS.COMPLETE);
    assert.equal(t1.finalClosureNote, 'Claim reprocessed; member confirmed.');
  });

  t('the requester cannot Complete without a final closing comment', async () => {
    const store = await fresh();
    await assert.rejects(
      () => store.setStatus('esc_person', STATUS.COMPLETE, { actorId: 'user_maggie', now: NOW }),
      /requires a final closing comment/,
    );
    await assert.rejects(
      () => store.setStatus('esc_person', STATUS.COMPLETE, { actorId: 'user_maggie', now: NOW, closureNote: '   ' }),
      /requires a final closing comment/,
    );
    assert.equal((await store.getTicket('esc_person')).status, STATUS.ASSIGNED, 'status unchanged after rejection');
  });

  t('a non-requester cannot Complete — not the assignee, not the ticket owner', async () => {
    const store = await fresh();
    for (const actorId of ['user_sarah', 'user_teri']) {
      await assert.rejects(
        () => store.setStatus('esc_person', STATUS.COMPLETE, { actorId, now: NOW, closureNote: 'attempt' }),
        /Only the requester who submitted the ticket/,
      );
    }
    assert.equal((await store.getTicket('esc_person')).status, STATUS.ASSIGNED, 'status unchanged after rejection');
  });

  t('Complete sets completedDate and creates a status_change event carrying the closing comment', async () => {
    const store = await fresh();
    await store.setStatus('esc_person', STATUS.COMPLETE, {
      actorId: 'user_maggie', now: NOW, closureNote: 'Root cause fixed.',
    });
    const t1 = await store.getTicket('esc_person');
    assert.equal(t1.completedDate, NOW);
    const ev = await store.listActivity('esc_person');
    const closing = ev.find((e) => e.type === ACTIVITY_TYPE.STATUS_CHANGE && e.to === STATUS.COMPLETE);
    assert.ok(closing, 'status_change event to Complete recorded');
    assert.match(closing.note, /Root cause fixed\./, 'closing comment preserved in the activity event');
  });

  t('Reopened clears completedDate', async () => {
    const store = await fresh();
    const completed = await store.getTicket('esc_complete');
    assert.ok(completed.completedDate, 'precondition: seeded Complete ticket has a completedDate');
    await store.setStatus('esc_complete', STATUS.REOPENED, { actorId: 'user_teri', now: LATER });
    const t1 = await store.getTicket('esc_complete');
    assert.equal(t1.status, STATUS.REOPENED);
    assert.equal(t1.completedDate, null, 'Reopened clears completedDate');
  });

  // ----- terminal behavior -----
  t('Cancelled is terminal — no further transition is allowed', async () => {
    const store = await fresh();
    await store.setStatus('esc_new', STATUS.CANCELLED, { actorId: 'user_teri', now: NOW });
    assert.ok(TERMINAL_STATUSES.has(STATUS.CANCELLED));
    await assert.rejects(
      () => store.setStatus('esc_new', STATUS.IN_PROCESS, { actorId: 'user_teri', now: LATER }),
      /Illegal status transition/,
    );
  });

  // ----- comments / notes -----
  t('addComment stores a public comment and emits a comment activity event', async () => {
    const store = await fresh();
    await store.addComment('esc_person', { authorId: 'user_sarah', body: 'public hello', createdAt: NOW });
    const comments = await store.listComments('esc_person');
    assert.ok(comments.some((c) => c.body === 'public hello' && c.visibility === 'public'));
    assert.equal((await store.listActivity('esc_person')).at(-1).type, ACTIVITY_TYPE.COMMENT);
  });

  t('addNote stores an internal note and emits a note activity event; streams stay separate', async () => {
    const store = await fresh();
    await store.addNote('esc_person', { authorId: 'user_sarah', body: 'internal hello', createdAt: NOW });
    const notes = await store.listNotes('esc_person');
    const comments = await store.listComments('esc_person');
    assert.ok(notes.some((n) => n.body === 'internal hello' && n.visibility === 'internal'));
    assert.ok(!comments.some((c) => c.body === 'internal hello'), 'note must not leak into comments');
    assert.equal((await store.listActivity('esc_person')).at(-1).type, ACTIVITY_TYPE.NOTE);
  });

  // ----- tags -----
  t('addTag is idempotent and records a field_change event', async () => {
    const store = await fresh();
    await store.addTag('esc_new', 'tag_urgent', { actorId: 'user_teri', now: NOW });
    await store.addTag('esc_new', 'tag_urgent', { actorId: 'user_teri', now: NOW });
    const t1 = await store.getTicket('esc_new');
    assert.deepEqual(t1.tagIds, ['tag_urgent']);
    const added = (await store.listActivity('esc_new'))
      .filter((e) => e.type === ACTIVITY_TYPE.FIELD_CHANGE && e.to?.addedTag === 'tag_urgent');
    assert.equal(added.length, 1, 'exactly one add event despite the duplicate');
  });

  t('removeTag removes the tag and records a field_change event (no-op when absent)', async () => {
    const store = await fresh();
    // esc_in_process is seeded with tag_financial + tag_member_impact.
    await store.removeTag('esc_in_process', 'tag_financial', { actorId: 'user_maggie', now: NOW });
    const t1 = await store.getTicket('esc_in_process');
    assert.ok(!t1.tagIds.includes('tag_financial'));
    assert.ok(t1.tagIds.includes('tag_member_impact'), 'other tags survive');
    // Removing an absent tag is a no-op (no new activity).
    const before = (await store.listActivity('esc_in_process')).length;
    await store.removeTag('esc_in_process', 'tag_financial', { now: LATER });
    assert.equal((await store.listActivity('esc_in_process')).length, before);
  });

  // ----- activity ordering + append-only expectation -----
  t('listActivity is ordered ascending by timestamp', async () => {
    const store = await fresh();
    const ev = await store.listActivity('esc_in_process');
    const stamps = ev.map((e) => e.timestamp);
    const sorted = [...stamps].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(stamps, sorted, 'activity must be returned in chronological order');
  });

  t('activity is append-only — prior events are unchanged after a new action', async () => {
    const store = await fresh();
    const before = await store.listActivity('esc_person');
    const snapshot = before.map((e) => ({ id: e.id, type: e.type, timestamp: e.timestamp }));
    await store.addComment('esc_person', { authorId: 'user_sarah', body: 'new', createdAt: LATER });
    const after = await store.listActivity('esc_person');
    assert.equal(after.length, before.length + 1, 'exactly one event appended');
    // The earlier events are preserved verbatim (no edits, no reordering of the prefix).
    const afterPrefix = after.slice(0, snapshot.length).map((e) => ({ id: e.id, type: e.type, timestamp: e.timestamp }));
    assert.deepEqual(afterPrefix, snapshot, 'existing activity is immutable');
  });

  // ----- store-level filtering -----
  t('listTickets supports status / deptId / assigneeId / openOnly filters', async () => {
    const store = await fresh();
    const complete = await store.listTickets({ status: STATUS.COMPLETE });
    assert.ok(complete.length > 0 && complete.every((x) => x.status === STATUS.COMPLETE));

    const benefits = await store.listTickets({ deptId: 'dept_benefits' });
    assert.ok(benefits.every((x) => x.assignedDeptId === 'dept_benefits'));

    const sarah = await store.listTickets({ assigneeId: 'user_sarah' });
    assert.ok(sarah.every((x) => x.assigneeId === 'user_sarah'));

    const open = await store.listTickets({ openOnly: true });
    assert.ok(open.every((x) => OPEN_STATUSES.has(x.status)), 'openOnly excludes terminal tickets');
    assert.ok(!open.some((x) => x.status === STATUS.COMPLETE));
  });

  // ----- optional amount involved (Loop 21) -----
  t('amount involved is optional and settable/clearable via setAmount (with activity)', async () => {
    const store = await fresh();
    const before = await store.getTicket('esc_new');
    assert.equal(before.amountInvolved, null, 'amount defaults to null (optional)');
    await store.setAmount('esc_new', 987.65, { actorId: 'user_teri', now: NOW });
    const after = await store.getTicket('esc_new');
    assert.equal(after.amountInvolved, 987.65);
    assert.equal(after.amountCurrency, 'USD');
    const ev = await store.listActivity('esc_new');
    assert.ok(ev.some((e) => e.type === ACTIVITY_TYPE.FIELD_CHANGE && e.to?.amountInvolved === 987.65));
    await store.setAmount('esc_new', null, { actorId: 'user_teri', now: LATER });
    assert.equal((await store.getTicket('esc_new')).amountInvolved, null, 'amount can be cleared');
  });

  // ----- attachments: metadata-first (Loop 21) -----
  t('attachment metadata can be added and listed (no file bytes involved)', async () => {
    const store = await fresh();
    const added = await store.addAttachment('esc_person', {
      fileName: 'evidence.png', mimeType: 'image/png', sizeBytes: 2048,
      uploadedBy: 'user_sarah', uploadedAt: NOW, source: 'manual',
    });
    assert.ok(added.id, 'attachment gets an id');
    const list = await store.listAttachments('esc_person');
    assert.equal(list.length, 1);
    assert.equal(list[0].fileName, 'evidence.png');
    assert.equal(list[0].isDeleted, false);
    const ev = await store.listActivity('esc_person');
    assert.ok(ev.some((e) => e.type === ACTIVITY_TYPE.ATTACHMENT), 'attachment activity recorded');
  });

  t('removeAttachment soft-deletes: hidden from the active list, metadata preserved', async () => {
    const store = await fresh();
    const added = await store.addAttachment('esc_person', {
      fileName: 'to-remove.txt', uploadedBy: 'user_sarah', uploadedAt: NOW,
    });
    await store.removeAttachment('esc_person', added.id, { actorId: 'user_sarah', now: LATER });
    assert.equal((await store.listAttachments('esc_person')).length, 0, 'soft-deleted attachment is not listed');
    // Removing again is a no-op that returns null.
    assert.equal(await store.removeAttachment('esc_person', added.id, { now: LATER }), null);
  });

  t('seeded attachment metadata is exposed (esc_in_process)', async () => {
    const store = await fresh();
    const list = await store.listAttachments('esc_in_process');
    assert.ok(list.some((a) => a.fileName === 'billing-statement-march.pdf'));
  });

  // ----- lastActivityAt movement stamp (Loop 21) -----
  t('lastActivityAt updates on status change, comment, note, and attachment', async () => {
    const store = await fresh();
    await store.setStatus('esc_person', STATUS.IN_PROCESS, { actorId: 'user_sarah', now: NOW });
    assert.equal((await store.getTicket('esc_person')).lastActivityAt, NOW, 'status change bumps lastActivityAt');
    await store.addComment('esc_person', { authorId: 'user_sarah', body: 'update', createdAt: LATER });
    assert.equal((await store.getTicket('esc_person')).lastActivityAt, LATER, 'comment bumps lastActivityAt');
    const evenLater = '2026-06-24T00:00:00.000Z';
    await store.addNote('esc_person', { authorId: 'user_sarah', body: 'internal', createdAt: evenLater });
    assert.equal((await store.getTicket('esc_person')).lastActivityAt, evenLater, 'note bumps lastActivityAt');
    const latest = '2026-06-25T00:00:00.000Z';
    await store.addAttachment('esc_person', { fileName: 'f.txt', uploadedBy: 'user_sarah', uploadedAt: latest });
    assert.equal((await store.getTicket('esc_person')).lastActivityAt, latest, 'attachment bumps lastActivityAt');
  });

  // ----- reference data -----
  t('reference lists (departments / users / tags) are available', async () => {
    const store = await fresh();
    assert.ok((await store.listDepartments()).length > 0);
    assert.ok((await store.listUsers()).length > 0);
    assert.ok((await store.listTags()).length > 0);
  });
}

function valid(status) {
  return OPEN_STATUSES.has(status) || TERMINAL_STATUSES.has(status);
}
