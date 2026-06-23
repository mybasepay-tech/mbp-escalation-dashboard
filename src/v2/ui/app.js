// Mock UI shell controller.
//
// Imports the EXISTING domain rules + MockStore + mock seed (no reimplementation) and
// renders them to the DOM. Strictly local: all data comes from the in-memory seededStore.
// There are NO network calls (no fetch/XHR), no Graph, no SharePoint, no credentials.

import { seededStore } from '../mock/seed.js';
import {
  loadContext, ticketRows, detailView, activityLines,
  statusOptions, assignmentOptions, PRIORITY_OPTIONS,
} from './viewModel.js';

// ----- State -----
const store = seededStore();
let ctx;                       // { usersById, deptsById, users, departments }
let currentUserId = 'user_sarah';
let currentDeptId = 'dept_benefits';
let activePanel = 'dept';      // 'dept' | 'mine'
let selectedTicketId = null;

// ----- DOM helpers (textContent only — no innerHTML, no injection) -----
const $ = (id) => document.getElementById(id);
function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  for (const c of children) if (c) node.appendChild(c);
  return node;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
function fmtDate(iso) { return iso ? String(iso).slice(0, 10) : '—'; }

// ----- Context selectors -----
function fillSelect(select, options, selectedId) {
  clear(select);
  for (const o of options) {
    const opt = el('option', { text: o.label, attrs: { value: o.id } });
    if (o.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  }
}

async function renderContextControls() {
  fillSelect($('userSelect'), ctx.users.map((u) => ({ id: u.id, label: u.displayName })), currentUserId);
  fillSelect($('deptSelect'), ctx.departments.map((d) => ({ id: d.id, label: d.name })), currentDeptId);
}

// ----- List panel -----
async function getPanelTickets() {
  if (activePanel === 'mine') return store.myAssignedTickets(currentUserId);
  return store.departmentQueue(currentDeptId);
}

async function renderList() {
  $('tabDept').setAttribute('aria-selected', String(activePanel === 'dept'));
  $('tabMine').setAttribute('aria-selected', String(activePanel === 'mine'));
  $('listHint').textContent = activePanel === 'mine'
    ? `Tickets assigned to ${ctx.usersById.get(currentUserId)?.displayName ?? currentUserId} only.`
    : `All tickets in ${ctx.deptsById.get(currentDeptId)?.name ?? currentDeptId} — including those assigned to a person.`;

  const tickets = await getPanelTickets();
  const rows = ticketRows(tickets, ctx);
  const list = $('ticketList');
  clear(list);

  if (rows.length === 0) {
    list.appendChild(el('li', { class: 'empty', text: 'No tickets in this view.' }));
    return;
  }

  for (const r of rows) {
    const badges = el('div', {}, [
      el('span', { class: 'badge status', text: r.status }),
      el('span', { class: 'badge prio', text: r.priority }),
      r.hasLegacy ? el('span', { class: 'badge legacy', text: 'legacy' }) : null,
    ]);
    const meta = el('div', { class: 'meta' }, [
      el('span', { text: `Dept: ${r.deptName}` }),
      el('span', { class: r.isUnassignedPerson ? 'badge unassigned' : '', text: `Assignee: ${r.assigneeName}` }),
      el('span', { text: `${r.daysOpen}d open` }),
    ]);
    const item = el('li', {
      class: `ticket-item${r.id === selectedTicketId ? ' selected' : ''}`,
      attrs: { 'data-id': r.id, role: 'button', tabindex: '0' },
    }, [
      el('div', { class: 'row1' }, [el('span', { class: 'title', text: r.title }), badges]),
      meta,
    ]);
    item.addEventListener('click', () => selectTicket(r.id));
    item.addEventListener('keydown', (e) => { if (e.key === 'Enter') selectTicket(r.id); });
    list.appendChild(item);
  }
}

// ----- Detail panel -----
async function selectTicket(id) {
  selectedTicketId = id;
  await renderList();
  await renderDetail();
}

function controlBlock(labelText, selectEl, buttonEl) {
  return el('div', { class: 'control' }, [
    el('span', { text: labelText }),
    el('div', { class: 'actions' }, [selectEl, buttonEl]),
  ]);
}

async function renderDetail() {
  const detail = $('detail');
  const empty = $('detailEmpty');
  if (!selectedTicketId) { detail.hidden = true; empty.hidden = false; return; }

  const ticket = await store.getTicket(selectedTicketId);
  if (!ticket) { detail.hidden = true; empty.hidden = false; return; }
  empty.hidden = true; detail.hidden = false;
  clear(detail);

  const dv = detailView(ticket, ctx);

  detail.appendChild(el('h2', { text: dv.title }));
  detail.appendChild(el('div', { class: 'sub', text: `${dv.id} · ${dv.status} · ${dv.priority}` }));

  // Field grid
  const dl = el('dl');
  const pairs = [
    ['Department', dv.deptName],
    ['Assignee', dv.assigneeName],
    ['Requesting dept', dv.requestingDept || '—'],
    ['Submitter', dv.submitterName],
    ['Issue category', dv.issueCategory || '—'],
    ['Escalated', fmtDate(dv.escalationDate)],
    ['Expected resolution', fmtDate(dv.expectedResolutionDate)],
    ['Resolved', fmtDate(dv.resolvedDate)],
    ['Days open', String(dv.daysOpen)],
  ];
  for (const [k, v] of pairs) { dl.appendChild(el('dt', { text: k })); dl.appendChild(el('dd', { text: v })); }
  detail.appendChild(dl);

  // Legacy metadata — shown only when present
  if (dv.legacy) {
    const box = el('div', { class: 'legacy-box' }, [
      el('h3', { text: 'Legacy metadata (migrated)' }),
      el('div', { class: 'mono', text: `Legacy ID: ${dv.legacy.legacyItemId ?? '—'}` }),
      el('div', { class: 'mono', text: `Legacy URL: ${dv.legacy.legacyUrl ?? '—'}` }),
    ]);
    if (dv.legacy.migrationNotes) box.appendChild(el('div', { class: 'note', text: dv.legacy.migrationNotes }));
    detail.appendChild(box);
  }

  detail.appendChild(await buildControls(ticket));
  detail.appendChild(await buildActivity(ticket));
}

async function buildControls(ticket) {
  const wrap = el('div', { class: 'controls' });
  const opts = assignmentOptions(ctx);

  // Assign department
  const deptSel = el('select');
  fillSelect(deptSel, opts.departments, ticket.assignedDeptId);
  const deptBtn = el('button', { class: 'btn', text: 'Assign dept' });
  deptBtn.addEventListener('click', () => act(() => store.assignDepartment(ticket.id, deptSel.value, { actorId: currentUserId })));
  wrap.appendChild(controlBlock('Department / queue', deptSel, deptBtn));

  // Assign person (+ unassign)
  const personSel = el('select');
  fillSelect(personSel, opts.people, ticket.assigneeId);
  const personBtn = el('button', { class: 'btn primary', text: 'Assign person' });
  personBtn.addEventListener('click', () => act(() => store.assignPerson(ticket.id, personSel.value, { actorId: currentUserId })));
  const clearBtn = el('button', { class: 'btn', text: 'Unassign' });
  clearBtn.addEventListener('click', () => act(() => store.clearAssignee(ticket.id, { actorId: currentUserId })));
  wrap.appendChild(el('div', { class: 'control' }, [
    el('span', { text: 'Assigned person (auto-status to Assigned)' }),
    el('div', { class: 'actions' }, [personSel, personBtn, clearBtn]),
  ]));

  // Status
  const statusSel = el('select');
  fillSelect(statusSel, statusOptions(ticket).map((s) => ({ id: s, label: s })), ticket.status);
  const statusBtn = el('button', { class: 'btn', text: 'Set status' });
  statusBtn.addEventListener('click', () => act(async () => {
    try { await store.setStatus(ticket.id, statusSel.value, { actorId: currentUserId }); }
    catch (err) { window.alert(err.message); }
  }));
  wrap.appendChild(controlBlock('Status', statusSel, statusBtn));

  // Priority
  const prioSel = el('select');
  fillSelect(prioSel, PRIORITY_OPTIONS.map((p) => ({ id: p, label: p })), ticket.priority);
  const prioBtn = el('button', { class: 'btn', text: 'Set priority' });
  prioBtn.addEventListener('click', () => act(() => store.setPriority(ticket.id, prioSel.value, { actorId: currentUserId })));
  wrap.appendChild(controlBlock('Priority', prioSel, prioBtn));

  return wrap;
}

async function buildActivity(ticket) {
  const events = await store.listActivity(ticket.id);
  const lines = activityLines(events, ctx).slice().reverse(); // newest first
  const ul = el('ul');
  for (const line of lines) {
    ul.appendChild(el('li', {}, [
      el('span', { class: 'type-tag', text: line.type }),
      el('span', { text: line.summary }),
      el('span', { class: 'who', text: line.actor }),
      el('span', { class: 'when', text: fmtDate(line.timestamp) }),
    ]));
  }
  return el('div', { class: 'activity' }, [el('h3', { text: 'Activity trail' }), ul]);
}

// Run a store action then re-render the affected views.
async function act(fn) {
  await fn();
  await renderList();
  await renderDetail();
}

// ----- Wiring -----
function wireEvents() {
  $('tabDept').addEventListener('click', () => { activePanel = 'dept'; renderList(); });
  $('tabMine').addEventListener('click', () => { activePanel = 'mine'; renderList(); });
  $('userSelect').addEventListener('change', (e) => { currentUserId = e.target.value; renderList(); });
  $('deptSelect').addEventListener('change', (e) => { currentDeptId = e.target.value; renderList(); });
}

async function main() {
  ctx = await loadContext(store);
  await renderContextControls();
  wireEvents();
  await renderList();
  await renderDetail();
}

main();
