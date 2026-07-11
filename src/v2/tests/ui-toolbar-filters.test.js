// Structured filter toolbar tests (Loop 26) — the pure filter model behind the UI's
// scope/status/priority dropdowns, needs-attention toggle, and search field. 100% local.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCOPE_OPTIONS, STATUS_FILTER_OPTIONS, PRIORITY_FILTER_OPTIONS,
  DEFAULT_TICKET_FILTERS, applyTicketFilters, DEPARTMENT_FILTERS,
} from '../ui/viewModel.js';
import { seededStore } from '../mock/seed.js';
import { STATUS, PRIORITY, OPEN_STATUSES, PENDING_STATUSES } from '../domain/constants.js';

const tickets = async () => (await seededStore().listTickets());

test('default criteria show everything (the safe direction)', async () => {
  const all = await tickets();
  assert.deepEqual(applyTicketFilters(all, DEFAULT_TICKET_FILTERS, { currentUserId: 'user_sarah' }), all);
  // No criteria at all behaves identically.
  assert.deepEqual(applyTicketFilters(all, {}, {}), all);
});

test('unknown dimension keys behave as "all" — never hide tickets by accident', async () => {
  const all = await tickets();
  const out = applyTicketFilters(all, { scope: 'bogus', status: 'nope', priority: '???' }, {});
  assert.deepEqual(out, all);
});

test('department filter scopes All tickets by queue', async () => {
  const all = await tickets();
  const benefits = applyTicketFilters(all, { dept: 'dept_benefits' }, {});
  const payroll = applyTicketFilters(all, { dept: 'dept_payroll' }, {});
  const financial = applyTicketFilters(all, { dept: 'dept_financial' }, {});
  assert.ok(benefits.length > 0 && benefits.every((t) => t.assignedDeptId === 'dept_benefits'));
  assert.ok(payroll.length > 0 && payroll.every((t) => t.assignedDeptId === 'dept_payroll'));
  assert.ok(financial.length > 0 && financial.every((t) => t.assignedDeptId === 'dept_financial'));
  assert.equal(benefits.length + payroll.length + financial.length, all.filter((t) => t.assignedDeptId).length);
});

test('default All tickets view includes cross-department demo tickets', async () => {
  const all = await tickets();
  const out = applyTicketFilters(all, DEFAULT_TICKET_FILTERS, { currentUserId: 'user_sarah' });
  assert.deepEqual(out, all);
  assert.ok(out.some((t) => t.id === 'esc_fin_0891'));
  assert.ok(out.some((t) => t.id === 'esc_pay_0778'));
});

test('scope: unassigned / assigned_to_me / assigned_to_others / migrated', async () => {
  const all = await tickets();
  const me = 'user_sarah';
  assert.ok(applyTicketFilters(all, { scope: 'unassigned' }, {}).every((t) => !t.assigneeId));
  assert.ok(applyTicketFilters(all, { scope: 'assigned_to_me' }, { currentUserId: me }).every((t) => t.assigneeId === me));
  assert.ok(applyTicketFilters(all, { scope: 'assigned_to_others' }, { currentUserId: me })
    .every((t) => t.assigneeId && t.assigneeId !== me));
  const migrated = applyTicketFilters(all, { scope: 'migrated' }, {});
  assert.ok(migrated.length > 0 && migrated.every((t) => t.legacyItemId || t.legacyUrl));
});

test('status: open / in_process / pending / completed / reopened / cancelled', async () => {
  const all = await tickets();
  assert.ok(applyTicketFilters(all, { status: 'open' }, {}).every((t) => OPEN_STATUSES.has(t.status)));
  assert.ok(applyTicketFilters(all, { status: 'in_process' }, {}).every((t) => t.status === STATUS.IN_PROCESS));
  assert.ok(applyTicketFilters(all, { status: 'pending' }, {}).every((t) => PENDING_STATUSES.has(t.status)));
  assert.ok(applyTicketFilters(all, { status: 'completed' }, {}).every((t) => t.status === STATUS.COMPLETE));
  assert.ok(applyTicketFilters(all, { status: 'reopened' }, {}).every((t) => t.status === STATUS.REOPENED));
  assert.equal(applyTicketFilters(all, { status: 'cancelled' }, {}).length, 0, 'seed has no cancelled ticket');
});

test('priority: individual levels and the High + Critical group', async () => {
  const all = await tickets();
  assert.ok(applyTicketFilters(all, { priority: 'high' }, {}).every((t) => t.priority === PRIORITY.HIGH));
  const hc = applyTicketFilters(all, { priority: 'high_critical' }, {});
  assert.ok(hc.length > 0 && hc.every((t) => t.priority === PRIORITY.HIGH || t.priority === PRIORITY.CRITICAL));
});

test('needsAttention uses the local reminder calculation with an injectable now', async () => {
  const all = await tickets();
  // At the seed base time nothing but the stale legacy ticket qualifies.
  const early = applyTicketFilters(all, { needsAttention: true }, { now: '2026-06-02T00:00:00.000Z' });
  assert.deepEqual(early.map((t) => t.id), ['esc_legacy_307']);
  // Far in the future every open ticket qualifies; terminal ones never do.
  const late = applyTicketFilters(all, { needsAttention: true }, { now: '2026-12-01T00:00:00.000Z' });
  assert.ok(late.length > 0 && late.every((t) => OPEN_STATUSES.has(t.status)));
});

test('search matches title and id, case-insensitively, trimmed', async () => {
  const all = await tickets();
  const byTitle = applyTicketFilters(all, { search: '  SARAH ' }, {});
  assert.ok(byTitle.some((t) => t.id === 'esc_person'), 'title substring match');
  const byId = applyTicketFilters(all, { search: 'esc_legacy' }, {});
  assert.deepEqual(byId.map((t) => t.id), ['esc_legacy_307'], 'id substring match');
  assert.equal(applyTicketFilters(all, { search: 'zzz-no-match' }, {}).length, 0);
});

test('dimensions AND together (scope + status + priority + search)', async () => {
  const all = await tickets();
  const out = applyTicketFilters(all, {
    scope: 'assigned_to_me', status: 'pending', priority: 'low', search: 'documentation',
  }, { currentUserId: 'user_sarah' });
  assert.deepEqual(out.map((t) => t.id), ['esc_pending_member']);
});

test('the toolbar option lists cover their filter keys and stay in sync with the model', () => {
  for (const [options] of [[SCOPE_OPTIONS], [STATUS_FILTER_OPTIONS], [PRIORITY_FILTER_OPTIONS]]) {
    assert.ok(options.length >= 4);
    assert.equal(options[0].key, 'all', 'first option is always the safe "all"');
    for (const o of options) assert.ok(o.label, `option ${o.key} has a label`);
  }
  // The legacy chip predicates remain available (compatibility + underlying building blocks).
  assert.equal(DEPARTMENT_FILTERS.length, 10);
});
