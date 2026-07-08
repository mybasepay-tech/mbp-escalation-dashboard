// v2 UI shell controller.
//
// Imports the EXISTING domain rules + stores (no reimplementation) and renders them to the
// DOM. DEFAULT: strictly local MockStore — all data comes from the in-memory seededStore and
// this file makes NO network calls itself (no fetch/XHR here; the scans enforce it).
//
// Loop 23 — opt-in SharePoint TEST backend: with ?backend=sharepoint-test AND the local
// server's git-ignored opt-in (see ui/liveBackendGate.js), the UI uses RemoteStore, which
// talks only to the loopback /api/store endpoints of ui/serve.js. If the opt-in/gate is
// missing the UI shows a VISIBLE error and renders nothing — it never silently falls back.

import { seededStore } from '../mock/seed.js';
import { STATUS } from '../domain/constants.js';
import {
  loadContext, ticketRows, detailView, activityLines,
  statusOptions, assignmentOptions, PRIORITY_OPTIONS,
  commentView, noteView, attachmentView, availableTags, tagLabel, userName,
  actorCanComplete, DEPARTMENT_FILTERS, applyDepartmentFilter, buildReport,
} from './viewModel.js';
import {
  selectBackend, BACKEND, INDICATOR_TEXT, MOCK_BANNER_TEXT, SHAREPOINT_TEST_WARNING,
} from './backendSelect.js';
import { connectRemoteStore } from './remoteStore.js';

// ----- State -----
const backendSelection = selectBackend(window.location.search);
let store;                     // MockStore (default) or RemoteStore (opt-in test backend)
let ctx;                       // { usersById, deptsById, tagsById, users, departments, tags }
let currentUserId = 'user_sarah';
let currentDeptId = 'dept_benefits';
let activePanel = 'dept';      // 'dept' | 'mine' | 'report'
let activeFilter = 'all';      // department-panel filter key
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

function renderFilterBar() {
  const bar = $('filterBar');
  clear(bar);
  if (activePanel !== 'dept') { bar.hidden = true; return; }
  bar.hidden = false;
  for (const f of DEPARTMENT_FILTERS) {
    const btn = el('button', {
      class: 'filter-btn', text: f.label,
      attrs: { 'aria-pressed': String(f.key === activeFilter), 'data-key': f.key },
    });
    btn.addEventListener('click', () => { activeFilter = f.key; renderList(); });
    bar.appendChild(btn);
  }
}

function ticketListItem(r) {
  const badges = el('div', {}, [
    el('span', { class: 'badge status', text: r.status }),
    el('span', { class: 'badge prio', text: r.priority }),
    r.hasLegacy ? el('span', { class: 'badge legacy', text: 'legacy' }) : null,
    // No-movement reminder candidate (local indicator only — nothing is sent).
    r.reminder?.isCandidate
      ? el('span', { class: 'badge unassigned', text: `no movement ${r.reminder.daysSinceMovement}d` })
      : null,
  ]);
  const meta = el('div', { class: 'meta' }, [
    el('span', { text: `Dept: ${r.deptName}` }),
    el('span', { class: r.isUnassignedPerson ? 'badge unassigned' : '', text: `Assignee: ${r.assigneeName}` }),
    el('span', { text: `Owner: ${r.ownerName}` }),
    el('span', { text: `${r.daysOpen}d open` }),
  ]);
  const children = [
    el('div', { class: 'row1' }, [el('span', { class: 'title', text: r.title }), badges]),
    meta,
  ];
  if (r.tags.length) {
    children.push(el('div', { class: 'tags' }, r.tags.map((t) => el('span', { class: 'chip mini', text: t.label }))));
  }
  const item = el('li', {
    class: `ticket-item${r.id === selectedTicketId ? ' selected' : ''}`,
    attrs: { 'data-id': r.id, role: 'button', tabindex: '0' },
  }, children);
  item.addEventListener('click', () => selectTicket(r.id));
  item.addEventListener('keydown', (e) => { if (e.key === 'Enter') selectTicket(r.id); });
  return item;
}

async function renderList() {
  $('tabDept').setAttribute('aria-selected', String(activePanel === 'dept'));
  $('tabMine').setAttribute('aria-selected', String(activePanel === 'mine'));
  $('tabReport').setAttribute('aria-selected', String(activePanel === 'report'));
  renderFilterBar();

  const list = $('ticketList');
  const report = $('report');

  if (activePanel === 'report') {
    list.hidden = true; report.hidden = false;
    $('listHint').textContent = 'Summary over all mock tickets.';
    await renderReport();
    return;
  }
  list.hidden = false; report.hidden = true;

  let tickets = await getPanelTickets();
  if (activePanel === 'dept') {
    tickets = applyDepartmentFilter(tickets, activeFilter, { currentUserId });
    const label = DEPARTMENT_FILTERS.find((f) => f.key === activeFilter)?.label ?? '';
    $('listHint').textContent = `${ctx.deptsById.get(currentDeptId)?.name ?? currentDeptId} — ${label} (includes person-assigned).`;
  } else {
    $('listHint').textContent = `Tickets assigned to ${ctx.usersById.get(currentUserId)?.displayName ?? currentUserId} only.`;
  }

  const rows = ticketRows(tickets, ctx);
  clear(list);
  if (rows.length === 0) {
    list.appendChild(el('li', { class: 'empty', text: 'No tickets in this view.' }));
    return;
  }
  for (const r of rows) list.appendChild(ticketListItem(r));
}

function kv(label, value) {
  return el('div', { class: 'kv' }, [el('span', { text: label }), el('span', { text: String(value) })]);
}

function breakdownCard(title, obj) {
  return el('div', { class: 'card' }, [el('h4', { text: title }), ...Object.entries(obj).map(([k, v]) => kv(k, v))]);
}

async function renderReport() {
  const all = await store.listTickets();
  const rep = buildReport(all, ctx, { currentUserId });
  const report = $('report');
  clear(report);
  report.appendChild(el('div', { class: 'card' }, [
    el('h4', { text: 'Total tickets' }), el('div', { class: 'big', text: String(rep.total) }),
  ]));
  report.appendChild(el('div', { class: 'card' }, [
    el('h4', { text: 'At a glance' }),
    kv('Unassigned', rep.unassignedCount),
    kv(`Assigned to ${ctx.usersById.get(currentUserId)?.displayName ?? 'me'}`, rep.assignedToCurrentUser),
    kv('Completed', rep.completedCount),
    kv('Legacy / migrated', rep.legacyCount),
    kv('Reminder candidates (no movement)', rep.reminderCandidateCount),
  ]));
  report.appendChild(breakdownCard('By status', rep.byStatus));
  report.appendChild(breakdownCard('By department', rep.byDepartment));
  report.appendChild(breakdownCard('By priority', rep.byPriority));
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
  const amountText = dv.amountInvolved == null
    ? '— (optional)'
    : `${dv.amountInvolved.toFixed(2)} ${dv.amountCurrency}`;
  const pairs = [
    ['Department / queue', dv.deptName],
    ['Assigned person', dv.assigneeName],
    ['Ticket owner', dv.ownerName],
    ['Requesting dept', dv.requestingDept || '—'],
    ['Requester / submitter', dv.submitterName],
    ['Issue category', dv.issueCategory || '—'],
    ['Amount involved', amountText],
    ['Escalated', fmtDate(dv.escalationDate)],
    ['Expected resolution', fmtDate(dv.expectedResolutionDate)],
    ['Completed', fmtDate(dv.completedDate)],
    ['Last movement', fmtDate(dv.lastActivityAt)],
    ['Days open', String(dv.daysOpen)],
  ];
  for (const [k, v] of pairs) { dl.appendChild(el('dt', { text: k })); dl.appendChild(el('dd', { text: v })); }
  detail.appendChild(dl);

  // No-movement reminder indicator (local calculation only — nothing is sent).
  if (dv.reminder?.isCandidate) {
    detail.appendChild(el('div', { class: 'legacy-box' }, [
      el('h3', { text: 'Reminder candidate' }),
      el('div', {
        class: 'note',
        text: `No movement for ${dv.reminder.daysSinceMovement} days (threshold for ${dv.priority} priority: ${dv.reminder.thresholdDays} days). Local indicator only — no notification is sent.`,
      }),
    ]));
  }

  // Final closure note (present only on completed tickets).
  if (dv.finalClosureNote) {
    detail.appendChild(el('div', { class: 'legacy-box' }, [
      el('h3', { text: 'Final closing comment' }),
      el('div', { class: 'note', text: dv.finalClosureNote }),
    ]));
  }

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
  detail.appendChild(await buildTags(ticket));
  detail.appendChild(await buildAttachments(ticket));
  detail.appendChild(await buildComments(ticket));
  detail.appendChild(await buildNotes(ticket));
  detail.appendChild(await buildActivity(ticket));
}

function entry(item) {
  return el('div', { class: 'entry' }, [
    el('div', { class: 'head' }, [
      el('span', { class: 'who', text: item.author }),
      el('span', { class: 'vis', text: item.visibility }),
      el('span', { class: 'when', text: fmtDate(item.createdAt) }),
    ]),
    el('div', { class: 'body', text: item.body }),
  ]);
}

async function buildTags(ticket) {
  const wrap = el('div', { class: 'section' }, [el('h3', { text: 'Tags' })]);
  const chips = el('div', { class: 'tags' });
  for (const tagId of ticket.tagIds) {
    const x = el('button', { class: 'x', text: '×', attrs: { title: 'Remove tag', 'aria-label': 'Remove tag' } });
    x.addEventListener('click', () => act(() => store.removeTag(ticket.id, tagId, { actorId: currentUserId })));
    chips.appendChild(el('span', { class: 'chip' }, [el('span', { text: tagLabel(ctx, tagId) }), x]));
  }
  if (!ticket.tagIds.length) chips.appendChild(el('span', { class: 'empty', text: 'No tags.' }));
  wrap.appendChild(chips);

  const avail = availableTags(ticket, ctx);
  if (avail.length) {
    const sel = el('select');
    fillSelect(sel, avail, avail[0].id);
    const btn = el('button', { class: 'btn', text: 'Add tag' });
    btn.addEventListener('click', () => act(() => store.addTag(ticket.id, sel.value, { actorId: currentUserId })));
    wrap.appendChild(el('div', { class: 'add-row' }, [sel, btn]));
  }
  return wrap;
}

// Attachment METADATA only (Loop 21): no real file is uploaded and no document library is
// touched — the "Add attachment" control records a metadata row with a placeholder ref.
async function buildAttachments(ticket) {
  const items = (await store.listAttachments(ticket.id)).map((a) => attachmentView(a, ctx));
  const wrap = el('div', { class: 'section' }, [el('h3', { text: 'Attachments (metadata only)' })]);
  if (!items.length) wrap.appendChild(el('p', { class: 'empty', text: 'No attachments. File upload is deferred — only metadata is tracked in the MVP.' }));
  for (const a of items) {
    const size = a.sizeBytes != null ? `${Math.round(a.sizeBytes / 1024)} KB` : 'size n/a';
    const x = el('button', { class: 'x', text: '×', attrs: { title: 'Remove attachment (soft delete)', 'aria-label': 'Remove attachment' } });
    x.addEventListener('click', () => act(() => store.removeAttachment(ticket.id, a.id, { actorId: currentUserId })));
    wrap.appendChild(el('div', { class: 'entry' }, [
      el('div', { class: 'head' }, [
        el('span', { class: 'who', text: a.fileName }),
        el('span', { class: 'vis', text: `${a.mimeType ?? 'file'} · ${size}` }),
        el('span', { class: 'when', text: `${a.uploadedBy} · ${fmtDate(a.uploadedAt)}` }),
        x,
      ]),
    ]));
  }
  const nameInput = el('input', { attrs: { type: 'text', placeholder: 'File name (metadata only — no upload)…' } });
  const btn = el('button', { class: 'btn', text: 'Add attachment metadata' });
  btn.addEventListener('click', () => {
    const fileName = nameInput.value.trim();
    if (fileName) {
      act(() => store.addAttachment(ticket.id, { fileName, uploadedBy: currentUserId, source: 'manual' }));
    }
  });
  wrap.appendChild(el('div', { class: 'add-row' }, [nameInput, btn]));
  return wrap;
}

async function buildComments(ticket) {
  const items = (await store.listComments(ticket.id)).map((c) => commentView(c, ctx));
  const wrap = el('div', { class: 'section' }, [el('h3', { text: 'Public comments' })]);
  if (!items.length) wrap.appendChild(el('p', { class: 'empty', text: 'No public comments yet.' }));
  for (const c of items) wrap.appendChild(entry(c));

  const ta = el('textarea', { attrs: { placeholder: 'Write a public comment…' } });
  const btn = el('button', { class: 'btn primary', text: 'Add comment' });
  btn.addEventListener('click', () => {
    const body = ta.value.trim();
    if (body) act(() => store.addComment(ticket.id, { authorId: currentUserId, body }));
  });
  wrap.appendChild(el('div', { class: 'add-row' }, [ta, btn]));
  return wrap;
}

async function buildNotes(ticket) {
  const items = (await store.listNotes(ticket.id)).map((n) => noteView(n, ctx));
  const wrap = el('div', { class: 'section notes-section' }, [el('h3', { text: 'Internal notes' })]);
  if (!items.length) wrap.appendChild(el('p', { class: 'empty', text: 'No internal notes yet.' }));
  for (const n of items) wrap.appendChild(entry(n));

  const ta = el('textarea', { attrs: { placeholder: 'Add an internal note (not member-facing)…' } });
  const btn = el('button', { class: 'btn', text: 'Add note' });
  btn.addEventListener('click', () => {
    const body = ta.value.trim();
    if (body) act(() => store.addNote(ticket.id, { authorId: currentUserId, body }));
  });
  wrap.appendChild(el('div', { class: 'add-row' }, [ta, btn]));
  return wrap;
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

  // Status. Complete is REQUESTER-only (Loop 21): the option is shown only when the current
  // mock user submitted the ticket (the store rule enforces this too — the UI just avoids
  // dead options), and completing requires a final closing comment.
  const statusSel = el('select');
  fillSelect(statusSel, statusOptions(ticket, { currentUserId }).map((s) => ({ id: s, label: s })), ticket.status);
  const closureTa = el('textarea', { attrs: { placeholder: 'Final closing comment (required to Complete)…' } });
  const validationMsg = el('span', { class: 'hint', text: '' });
  const statusBtn = el('button', { class: 'btn', text: 'Set status' });
  statusBtn.addEventListener('click', () => act(async () => {
    validationMsg.textContent = '';
    try {
      await store.setStatus(ticket.id, statusSel.value, {
        actorId: currentUserId, closureNote: closureTa.value,
      });
    } catch (err) {
      validationMsg.textContent = err.message;
      window.alert(err.message);
    }
  }));
  const submitterName = userName(ctx, ticket.submitterId);
  const completeHint = actorCanComplete(ticket, currentUserId)
    ? 'You submitted this ticket — you can Complete it (a final closing comment is required).'
    : `Only the requester (${submitterName}) can move this ticket to Complete.`;
  const statusChildren = [
    el('span', { text: 'Status' }),
    el('div', { class: 'actions' }, [statusSel, statusBtn]),
    el('span', { class: 'hint', text: completeHint }),
  ];
  // The closure-comment input only makes sense for the requester (Complete is in their list).
  if (actorCanComplete(ticket, currentUserId) && statusOptions(ticket, { currentUserId }).includes(STATUS.COMPLETE)) {
    statusChildren.push(el('div', { class: 'add-row' }, [closureTa]));
  }
  statusChildren.push(validationMsg);
  wrap.appendChild(el('div', { class: 'control' }, statusChildren));

  // Priority
  const prioSel = el('select');
  fillSelect(prioSel, PRIORITY_OPTIONS.map((p) => ({ id: p, label: p })), ticket.priority);
  const prioBtn = el('button', { class: 'btn', text: 'Set priority' });
  prioBtn.addEventListener('click', () => act(() => store.setPriority(ticket.id, prioSel.value, { actorId: currentUserId })));
  wrap.appendChild(controlBlock('Priority', prioSel, prioBtn));

  // Amount involved (optional money field — clear by leaving the input empty).
  const amountInput = el('input', {
    attrs: { type: 'number', min: '0', step: '0.01', placeholder: 'Amount (optional)' },
  });
  if (ticket.amountInvolved != null) amountInput.value = String(ticket.amountInvolved);
  const amountBtn = el('button', { class: 'btn', text: 'Set amount' });
  amountBtn.addEventListener('click', () => act(async () => {
    const raw = amountInput.value.trim();
    const amount = raw === '' ? null : Number(raw);
    try { await store.setAmount(ticket.id, amount, { actorId: currentUserId }); }
    catch (err) { window.alert(err.message); }
  }));
  wrap.appendChild(el('div', { class: 'control' }, [
    el('span', { text: 'Amount involved (USD, optional)' }),
    el('div', { class: 'actions' }, [amountInput, amountBtn]),
  ]));

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
  $('tabReport').addEventListener('click', () => { activePanel = 'report'; renderList(); });
  $('userSelect').addEventListener('change', (e) => { currentUserId = e.target.value; renderList(); renderDetail(); });
  $('deptSelect').addEventListener('change', (e) => { currentDeptId = e.target.value; renderList(); });
}

// ----- Backend bootstrap (Loop 23) -----
function applyBackendChrome(mode) {
  const indicator = $('backendIndicator');
  const banner = $('backendBanner');
  indicator.textContent = INDICATOR_TEXT[mode] ?? INDICATOR_TEXT[BACKEND.MOCK];
  if (mode === BACKEND.SHAREPOINT_TEST) {
    indicator.classList.add('live-test');
    banner.classList.add('live-warning');
    banner.textContent = SHAREPOINT_TEST_WARNING;
  } else {
    banner.textContent = MOCK_BANNER_TEXT;
  }
}

// Visible, fail-closed error: the test backend was explicitly requested but is unavailable.
// No data is rendered and there is NO silent fallback to mock data.
function renderBackendError(message) {
  const banner = $('backendBanner');
  banner.classList.add('live-error');
  banner.textContent = `SharePoint test backend UNAVAILABLE — ${message}`;
  $('listHint').textContent = 'No backend connected. Remove ?backend=sharepoint-test to use the default mock backend.';
  $('detailEmpty').textContent = 'No backend connected.';
}

async function main() {
  applyBackendChrome(backendSelection.mode);
  if (backendSelection.mode === BACKEND.SHAREPOINT_TEST) {
    try {
      ({ store } = await connectRemoteStore());
    } catch (err) {
      renderBackendError(String(err?.message ?? err));
      return; // fail closed — nothing else boots
    }
  } else {
    store = seededStore(); // the unchanged default: 100% local mock data
  }
  ctx = await loadContext(store);
  await renderContextControls();
  wireEvents();
  await renderList();
  await renderDetail();
}

main();
