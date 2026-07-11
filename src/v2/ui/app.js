// v2 UI shell controller — production-style master→detail layout (Loop 27).
//
// Imports the EXISTING domain rules + stores (no reimplementation) and renders them to the
// DOM. DEFAULT: strictly local MockStore — all data comes from the in-memory seededStore and
// this file makes NO network calls itself (no fetch/XHR here; the scans enforce it).
//
// Opt-in SharePoint TEST backend (Loop 23): with ?backend=sharepoint-test AND the local
// server's git-ignored opt-in (see ui/liveBackendGate.js), the UI uses RemoteStore, which
// talks only to the loopback /api/store endpoints of ui/serve.js. If the opt-in/gate is
// missing the UI shows a VISIBLE error and renders nothing — it never silently falls back.
//
// Loop 27 layout: a left app-nav shell; the queue is a full-width list view; opening a
// ticket navigates to a focused detail view (issue summary + conversation central, ticket
// details / assignment / tags / notes / attachments in a calm sidebar). Business rules and
// store calls are unchanged — this is presentation only.

import { seededStore } from '../mock/seed.js';
import { STATUS } from '../domain/constants.js';
import { newId } from '../domain/models.js';
import {
  loadContext, ticketRows, detailView, activityLines,
  statusOptions, assignmentOptions, PRIORITY_OPTIONS,
  commentView, noteView, attachmentView, availableTags, tagLabel, userName,
  actorCanComplete, buildReport,
  SCOPE_OPTIONS, STATUS_FILTER_OPTIONS, PRIORITY_FILTER_OPTIONS,
  DEFAULT_TICKET_FILTERS, applyTicketFilters,
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
const filters = { ...DEFAULT_TICKET_FILTERS };
let selectedTicketId = null;   // non-null => the detail view is open
let composerMode = 'reply';    // 'reply' | 'note' (conversation composer tab)
let composerDraft = '';        // survives re-renders (tab switches, sidebar toggles)
let showAllActivity = false;
let showAllDetails = false;

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
function daysAgo(iso, now = new Date()) {
  if (!iso) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}
function fmtAgo(iso) {
  const d = daysAgo(iso);
  if (d == null) return '—';
  if (d === 0) return 'today';
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

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

// ----- View switching (master → detail) -----
function renderViewVisibility() {
  const detailOpen = selectedTicketId != null;
  $('viewList').hidden = detailOpen;
  $('viewDetail').hidden = !detailOpen;
}

async function openTicket(id) {
  selectedTicketId = id;
  composerMode = 'reply';
  composerDraft = '';
  showAllActivity = false;
  showAllDetails = false;
  renderViewVisibility();
  await renderDetail();
}

async function backToQueue() {
  selectedTicketId = null;
  renderViewVisibility();
  await renderList();
}

// ----- List / queue view -----
async function getPanelTickets() {
  if (activePanel === 'mine') return store.myAssignedTickets(currentUserId);
  return store.departmentQueue(currentDeptId);
}

function renderToolbarVisibility() {
  $('filterToolbar').hidden = activePanel === 'report';
  $('listActions').hidden = activePanel === 'report';
  $('newTicketRow').hidden = activePanel === 'report';
  $('filterScopeLabel').hidden = activePanel === 'mine';
}

function statusGroup(status) {
  if (status === STATUS.COMPLETE) return 'complete';
  if (status === STATUS.CANCELLED) return 'cancelled';
  if (status === STATUS.PENDING_RESEARCH || status === STATUS.PENDING_MEMBER || status === STATUS.PENDING_CUSTOMER) return 'pending';
  return 'open';
}

function metaPair(label, value, extraClass = '') {
  return el('span', { class: `meta-pair ${extraClass}`.trim() }, [
    el('span', { class: 'meta-label', text: label }),
    el('span', { class: 'meta-value', text: value }),
  ]);
}

function ticketListItem(r) {
  const badges = el('div', { class: 'badges' }, [
    el('span', { class: `badge status ${statusGroup(r.status)}`, text: r.status }),
    el('span', { class: `badge prio ${r.priority.toLowerCase()}`, text: r.priority }),
    r.hasLegacy ? el('span', { class: 'badge legacy', text: 'legacy' }) : null,
    r.reminder?.isCandidate
      ? el('span', {
        class: 'badge attention', text: `no movement ${r.reminder.daysSinceMovement}d`,
        attrs: { title: 'Local indicator only — no notification is sent' },
      })
      : null,
  ]);
  const meta = el('div', { class: 'meta' }, [
    metaPair('Dept', r.deptName),
    metaPair('Assignee', r.assigneeName, r.isUnassignedPerson ? 'meta-warn' : ''),
    metaPair('Owner', r.ownerName),
  ]);
  const children = [
    el('div', { class: 'row1' }, [
      el('span', { class: 'title', text: r.title }),
      el('span', { class: 'days-open', text: `${r.daysOpen}d`, attrs: { title: `${r.daysOpen} days open` } }),
    ]),
    badges,
    meta,
  ];
  if (r.tags.length) {
    children.push(el('div', { class: 'tags' }, r.tags.map((t) => el('span', { class: 'chip mini', text: t.label }))));
  }
  const item = el('li', {
    class: 'ticket-item',
    attrs: { 'data-id': r.id, role: 'button', tabindex: '0' },
  }, children);
  item.addEventListener('click', () => openTicket(r.id));
  item.addEventListener('keydown', (e) => { if (e.key === 'Enter') openTicket(r.id); });
  return item;
}

const PANEL_TITLES = { dept: 'Department queue', mine: 'My assigned tickets', report: 'Reporting' };

async function renderList() {
  for (const [id, key] of [['tabDept', 'dept'], ['tabMine', 'mine'], ['tabReport', 'report']]) {
    $(id).setAttribute('aria-current', activePanel === key ? 'page' : 'false');
  }
  $('listTitle').textContent = PANEL_TITLES[activePanel];
  renderToolbarVisibility();

  const list = $('ticketList');
  const report = $('report');

  if (activePanel === 'report') {
    list.hidden = true; report.hidden = false;
    $('listHint').textContent = 'Summary over all tickets in the active backend.';
    await renderReport();
    return;
  }
  list.hidden = false; report.hidden = true;

  list.setAttribute('aria-busy', 'true');
  $('listHint').textContent = 'Loading tickets…';
  let all;
  try {
    all = await getPanelTickets();
  } catch (err) {
    list.removeAttribute('aria-busy');
    clear(list);
    list.appendChild(el('li', { class: 'empty error', text: `Could not load tickets — ${err.message}` }));
    $('listHint').textContent = 'The backend did not respond. See the banner above for backend state.';
    return;
  }
  list.removeAttribute('aria-busy');

  const criteria = activePanel === 'mine' ? { ...filters, scope: 'all' } : filters;
  const tickets = applyTicketFilters(all, criteria, { currentUserId });

  const where = activePanel === 'dept'
    ? `${ctx.deptsById.get(currentDeptId)?.name ?? currentDeptId} queue (includes person-assigned)`
    : `assigned to ${ctx.usersById.get(currentUserId)?.displayName ?? currentUserId}`;
  $('listHint').textContent = `${tickets.length} of ${all.length} tickets — ${where}.`;

  const rows = ticketRows(tickets, ctx);
  clear(list);
  if (rows.length === 0) {
    const anyFilter = all.length > 0;
    list.appendChild(el('li', {
      class: 'empty',
      text: anyFilter ? 'No tickets match the current filters.' : 'No tickets in this view yet.',
    }));
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

// ----- Detail view -----

// Run a store action then re-render the detail (and keep errors visible, never half-drawn).
async function act(fn) {
  try {
    await fn();
  } catch (err) {
    window.alert(String(err?.message ?? err));
  }
  await renderDetail();
}

function sectionCard(title, count, children = [], opts = {}) {
  const head = el('div', { class: 'card-head' }, [
    el('h3', { text: title }),
    count != null ? el('span', { class: 'count-pill', text: String(count) }) : null,
    opts.headExtra ?? null,
  ]);
  return el('section', { class: `card ${opts.class ?? ''}`.trim() }, [head, ...children]);
}

function detailHeader(dv) {
  const movement = dv.reminder?.daysSinceMovement;
  const ageBits = [`Opened ${fmtAgo(dv.escalationDate)}`];
  if (movement != null && movement > 0) ageBits.push(`No movement for ${movement} day${movement === 1 ? '' : 's'}`);
  return el('header', { class: 'detail-head' }, [
    el('div', { class: 'detail-id mono', text: dv.id }),
    el('h2', { text: dv.title }),
    el('div', { class: 'detail-meta-row' }, [
      el('span', { class: `badge status ${statusGroup(dv.status)}`, text: dv.status }),
      el('span', { class: `badge prio ${dv.priority.toLowerCase()}`, text: dv.priority }),
      el('span', { class: 'age-line', text: ageBits.join(' · ') }),
    ]),
  ]);
}

function issueSummaryCard(dv) {
  const paragraphs = String(dv.description ?? '').split(/\n{2,}|\r\n\r\n/).map((p) => p.trim()).filter(Boolean);
  const body = paragraphs.length
    ? paragraphs.map((p) => el('p', { text: p }))
    : [el('p', { class: 'empty', text: 'No description was provided for this ticket.' })];
  return sectionCard('Issue summary', null, [el('div', { class: 'issue-body' }, body)], { class: 'issue-card' });
}

function messageBubble(item, { isRequester = false, internal = false } = {}) {
  const initial = (item.author || '?').trim().charAt(0).toUpperCase();
  const roleTag = internal
    ? el('span', { class: 'msg-role internal', text: 'internal note' })
    : (isRequester ? el('span', { class: 'msg-role', text: 'Requester' }) : null);
  return el('div', { class: `msg${internal ? ' internal' : ''}` }, [
    el('span', { class: 'avatar', text: initial, attrs: { 'aria-hidden': 'true' } }),
    el('div', { class: 'msg-main' }, [
      el('div', { class: 'msg-head' }, [
        el('span', { class: 'who', text: item.author }),
        roleTag,
        el('span', { class: 'when', text: fmtAgo(item.createdAt), attrs: { title: fmtDate(item.createdAt) } }),
      ]),
      el('div', { class: 'msg-body', text: item.body }),
    ]),
  ]);
}

function conversationCard(ticket, comments) {
  const items = comments.map((c) => messageBubble(c, { isRequester: c.authorId === ticket.submitterId }));
  const thread = el('div', { class: 'thread' },
    items.length ? items : [el('p', { class: 'empty', text: 'No public conversation yet.' })]);

  // Composer with Reply / Internal note tabs — the visibility difference is explicit.
  const replyTab = el('button', { class: 'composer-tab', text: 'Public reply', attrs: { 'aria-pressed': String(composerMode === 'reply') } });
  const noteTab = el('button', { class: 'composer-tab', text: 'Internal note', attrs: { 'aria-pressed': String(composerMode === 'note') } });
  const ta = el('textarea', {
    attrs: {
      placeholder: composerMode === 'reply'
        ? 'Write a public reply (visible to the requester)…'
        : 'Add an internal note (not member-facing)…',
      'aria-label': composerMode === 'reply' ? 'Public reply' : 'Internal note',
    },
  });
  ta.value = composerDraft; // drafts survive tab switches and sidebar toggles
  ta.addEventListener('input', () => { composerDraft = ta.value; });
  const send = el('button', {
    class: `btn primary${composerMode === 'note' ? ' note-btn' : ''}`,
    text: composerMode === 'reply' ? 'Send reply' : 'Add internal note',
  });
  replyTab.addEventListener('click', () => { composerMode = 'reply'; renderDetail(); });
  noteTab.addEventListener('click', () => { composerMode = 'note'; renderDetail(); });
  send.addEventListener('click', () => {
    const body = ta.value.trim();
    if (!body) return;
    composerDraft = '';
    act(() => (composerMode === 'reply'
      ? store.addComment(ticket.id, { authorId: currentUserId, body })
      : store.addNote(ticket.id, { authorId: currentUserId, body })));
  });
  const composer = el('div', { class: `composer${composerMode === 'note' ? ' internal' : ''}` }, [
    el('div', { class: 'composer-tabs', attrs: { role: 'tablist' } }, [replyTab, noteTab]),
    ta,
    el('div', { class: 'composer-foot' }, [
      el('span', {
        class: 'hint',
        text: composerMode === 'reply' ? 'Visible in the public conversation.' : 'Internal only — never member-facing.',
      }),
      send,
    ]),
  ]);

  return sectionCard('Public conversation', comments.length, [thread, composer]);
}

function activityCard(ticket, events) {
  const lines = activityLines(events, ctx).slice().reverse(); // newest first
  const visible = showAllActivity ? lines : lines.slice(0, 6);
  const ul = el('ul', { class: 'timeline' });
  for (const line of visible) {
    ul.appendChild(el('li', {}, [
      el('span', { class: 'dot', attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'type-tag', text: line.type }),
      el('div', { class: 'timeline-main' }, [
        el('span', { text: line.summary }),
        el('span', { class: 'timeline-sub' }, [
          el('span', { class: 'who', text: line.actor }),
          el('span', { class: 'when', text: fmtDate(line.timestamp) }),
        ]),
      ]),
    ]));
  }
  const children = [ul];
  if (lines.length > 6) {
    const toggle = el('button', {
      class: 'link-btn',
      text: showAllActivity ? 'Show recent only' : `View full activity (${lines.length})`,
    });
    toggle.addEventListener('click', () => { showAllActivity = !showAllActivity; renderDetail(); });
    children.push(toggle);
  }
  return sectionCard('Activity', events.length, children, { class: 'activity-card' });
}

function ticketDetailsCard(dv) {
  const dl = el('dl');
  const row = (k, v) => { dl.appendChild(el('dt', { text: k })); dl.appendChild(el('dd', { text: v })); };
  row('Department / queue', dv.deptName);
  row('Ticket owner', dv.ownerName);
  row('Requester', dv.submitterName);
  row('Requesting dept', dv.requestingDept || '—');
  row('Days open', String(dv.daysOpen));
  row('Escalated', fmtDate(dv.escalationDate));
  row('Last movement', fmtDate(dv.lastActivityAt));
  if (showAllDetails) {
    row('Issue category', dv.issueCategory || '—');
    row('Issue type', dv.issueType || '—');
    row('Amount involved', dv.amountInvolved == null ? '— (optional)' : `${dv.amountInvolved.toFixed(2)} ${dv.amountCurrency}`);
    row('Expected resolution', fmtDate(dv.expectedResolutionDate));
    row('Completed', fmtDate(dv.completedDate));
  }
  const toggle = el('button', { class: 'link-btn', text: showAllDetails ? 'Show fewer details' : 'View all details' });
  toggle.addEventListener('click', () => { showAllDetails = !showAllDetails; renderDetail(); });

  const children = [dl, toggle];
  if (dv.legacy) {
    children.push(el('div', { class: 'legacy-box' }, [
      el('h3', { text: 'Legacy metadata (migrated)' }),
      el('div', { class: 'mono', text: `Legacy ID: ${dv.legacy.legacyItemId ?? '—'}` }),
      el('div', { class: 'mono', text: `Legacy URL: ${dv.legacy.legacyUrl ?? '—'}` }),
      dv.legacy.migrationNotes ? el('div', { class: 'note', text: dv.legacy.migrationNotes }) : null,
    ]));
  }
  return sectionCard('Ticket details', null, children, { class: 'side-card' });
}

// Assignment & status: one compact card, staged edits, a single "Save changes" button.
// Each changed field is applied through the SAME store calls as before (rules unchanged);
// failures surface individually and nothing is retried or faked.
function assignmentCard(ticket) {
  const opts = assignmentOptions(ctx);
  const deptSel = el('select', { attrs: { 'aria-label': 'Department / queue' } });
  // An unrouted ticket gets an explicit "not routed" option — otherwise the browser would
  // preselect the first department and a blind Save would silently route the ticket.
  fillSelect(deptSel,
    ticket.assignedDeptId ? opts.departments : [{ id: '', label: '— not routed —' }, ...opts.departments],
    ticket.assignedDeptId ?? '');
  const personSel = el('select', { attrs: { 'aria-label': 'Assigned person' } });
  fillSelect(personSel, [{ id: '', label: '— unassigned —' }, ...opts.people], ticket.assigneeId ?? '');
  const statusSel = el('select', { attrs: { 'aria-label': 'Status' } });
  fillSelect(statusSel, statusOptions(ticket, { currentUserId }).map((s) => ({ id: s, label: s })), ticket.status);
  const prioSel = el('select', { attrs: { 'aria-label': 'Priority' } });
  fillSelect(prioSel, PRIORITY_OPTIONS.map((p) => ({ id: p, label: p })), ticket.priority);
  const amountInput = el('input', {
    attrs: { type: 'number', min: '0', step: '0.01', placeholder: 'Enter amount', 'aria-label': 'Amount involved (USD, optional)' },
  });
  if (ticket.amountInvolved != null) amountInput.value = String(ticket.amountInvolved);

  const closureTa = el('textarea', {
    attrs: { placeholder: 'Final closing comment (required to Complete)…', 'aria-label': 'Final closing comment' },
  });
  const closureRow = el('div', { class: 'field closure-row' }, [
    el('span', { class: 'field-label', text: 'Closing comment' }),
    closureTa,
  ]);
  closureRow.hidden = true;
  const refreshClosureVisibility = () => {
    closureRow.hidden = !(statusSel.value === STATUS.COMPLETE && ticket.status !== STATUS.COMPLETE);
  };
  statusSel.addEventListener('change', refreshClosureVisibility);
  refreshClosureVisibility();

  const canCompleteHere = actorCanComplete(ticket, currentUserId);
  const completeHint = canCompleteHere
    ? 'You submitted this ticket — completing requires a final closing comment.'
    : `Only the requester (${userName(ctx, ticket.submitterId)}) can move this ticket to Complete.`;

  const saveBtn = el('button', { class: 'btn primary save-btn', text: 'Save changes' });
  saveBtn.addEventListener('click', () => act(async () => {
    const errors = [];
    const attempt = async (label, fn) => {
      try { await fn(); } catch (e) { errors.push(`${label}: ${e.message}`); }
    };
    if (deptSel.value && deptSel.value !== (ticket.assignedDeptId ?? '')) {
      await attempt('Department', () => store.assignDepartment(ticket.id, deptSel.value, { actorId: currentUserId }));
    }
    const person = personSel.value || null;
    if (person !== (ticket.assigneeId ?? null)) {
      await attempt('Assignee', () => (person
        ? store.assignPerson(ticket.id, person, { actorId: currentUserId })
        : store.clearAssignee(ticket.id, { actorId: currentUserId })));
    }
    if (statusSel.value !== ticket.status) {
      await attempt('Status', () => store.setStatus(ticket.id, statusSel.value, {
        actorId: currentUserId, closureNote: closureTa.value,
      }));
    }
    if (prioSel.value !== ticket.priority) {
      await attempt('Priority', () => store.setPriority(ticket.id, prioSel.value, { actorId: currentUserId }));
    }
    const raw = amountInput.value.trim();
    const amount = raw === '' ? null : Number(raw);
    if (amount !== (ticket.amountInvolved ?? null)) {
      await attempt('Amount', () => store.setAmount(ticket.id, amount, { actorId: currentUserId }));
    }
    if (errors.length) throw new Error(errors.join('\n'));
  }));

  const field = (label, control, hint) => el('div', { class: 'field' }, [
    el('span', { class: 'field-label', text: label }),
    control,
    hint ? el('span', { class: 'hint', text: hint }) : null,
  ]);

  return sectionCard('Assignment & status', null, [
    field('Department / queue', deptSel),
    field('Assign to', personSel),
    field('Status', statusSel, completeHint),
    closureRow,
    field('Priority', prioSel),
    field('Amount (optional, USD)', amountInput),
    saveBtn,
  ], { class: 'side-card assignment-card' });
}

function tagsCard(ticket) {
  const chips = el('div', { class: 'tags' });
  for (const tagId of ticket.tagIds) {
    const x = el('button', { class: 'x', text: '×', attrs: { title: 'Remove tag', 'aria-label': `Remove tag ${tagLabel(ctx, tagId)}` } });
    x.addEventListener('click', () => act(() => store.removeTag(ticket.id, tagId, { actorId: currentUserId })));
    chips.appendChild(el('span', { class: 'chip' }, [el('span', { text: tagLabel(ctx, tagId) }), x]));
  }
  if (!ticket.tagIds.length) chips.appendChild(el('span', { class: 'empty', text: 'No tags.' }));

  const children = [chips];
  const avail = availableTags(ticket, ctx);
  if (avail.length) {
    const sel = el('select', { attrs: { 'aria-label': 'Tag to add' } });
    fillSelect(sel, avail, avail[0].id);
    const btn = el('button', { class: 'btn', text: 'Add' });
    btn.addEventListener('click', () => act(() => store.addTag(ticket.id, sel.value, { actorId: currentUserId })));
    children.push(el('div', { class: 'add-row' }, [sel, btn]));
  }
  return sectionCard('Tags', ticket.tagIds.length, children, { class: 'side-card' });
}

function notesCard(notes) {
  const items = notes.length
    ? notes.map((n) => messageBubble(n, { internal: true }))
    : [el('p', { class: 'empty', text: 'No internal notes yet. Use the composer’s "Internal note" tab.' })];
  return sectionCard('Internal notes', notes.length, items, { class: 'side-card notes-card' });
}

function attachmentsCard(ticket, attachments) {
  const children = [el('p', { class: 'hint', text: 'No file uploads — only metadata is tracked (by design).' })];
  if (!attachments.length) {
    children.push(el('p', { class: 'empty', text: 'No attachments.' }));
  }
  for (const a of attachments) {
    const size = a.sizeBytes != null ? `${Math.round(a.sizeBytes / 1024)} KB` : 'size n/a';
    const x = el('button', { class: 'x', text: '×', attrs: { title: 'Remove attachment metadata (soft delete)', 'aria-label': `Remove attachment ${a.fileName}` } });
    x.addEventListener('click', () => act(() => store.removeAttachment(ticket.id, a.id, { actorId: currentUserId })));
    children.push(el('div', { class: 'attachment-row' }, [
      el('div', { class: 'attachment-main' }, [
        el('span', { class: 'attachment-name', text: a.fileName }),
        el('span', { class: 'attachment-sub', text: `${a.mimeType ?? 'file'} · ${size} · ${a.uploadedBy} · ${fmtDate(a.uploadedAt)}` }),
      ]),
      x,
    ]));
  }
  const nameInput = el('input', { attrs: { type: 'text', placeholder: 'File name (metadata only)…', 'aria-label': 'Attachment file name' } });
  const btn = el('button', { class: 'btn', text: 'Add' });
  btn.addEventListener('click', () => {
    const fileName = nameInput.value.trim();
    if (fileName) act(() => store.addAttachment(ticket.id, { fileName, uploadedBy: currentUserId, source: 'manual' }));
  });
  children.push(el('div', { class: 'add-row' }, [nameInput, btn]));
  return sectionCard('Attachments (metadata only)', attachments.length, children, { class: 'side-card' });
}

async function renderDetail() {
  if (selectedTicketId == null) return;
  const detail = $('detail');
  const ticket = await store.getTicket(selectedTicketId);
  if (!ticket) {
    clear(detail);
    detail.appendChild(el('p', { class: 'empty error', text: 'This ticket could not be loaded.' }));
    return;
  }
  const [comments, notes, attachments, events] = await Promise.all([
    store.listComments(ticket.id),
    store.listNotes(ticket.id),
    store.listAttachments(ticket.id),
    store.listActivity(ticket.id),
  ]);
  const dv = detailView(ticket, ctx);
  clear(detail);

  detail.appendChild(detailHeader(dv));

  // Prominent-but-composed alerts, above the two-column split.
  if (dv.reminder?.isCandidate) {
    detail.appendChild(el('div', { class: 'alert alert-attention', attrs: { role: 'note' } }, [
      el('h3', { text: 'Needs attention — no movement' }),
      el('div', {
        class: 'note',
        text: `No movement for ${dv.reminder.daysSinceMovement} days (threshold for ${dv.priority} priority: ${dv.reminder.thresholdDays} days). Local indicator only — no notification is sent.`,
      }),
    ]));
  }
  if (dv.finalClosureNote) {
    detail.appendChild(el('div', { class: 'alert alert-closure', attrs: { role: 'note' } }, [
      el('h3', { text: 'Final closing comment' }),
      el('div', { class: 'note', text: dv.finalClosureNote }),
    ]));
  }

  const main = el('div', { class: 'detail-main' }, [
    issueSummaryCard(dv),
    conversationCard(ticket, comments.map((c) => commentView(c, ctx))),
    activityCard(ticket, events),
  ]);
  const side = el('aside', { class: 'detail-side' }, [
    ticketDetailsCard(dv),
    assignmentCard(ticket),
    tagsCard(ticket),
    notesCard(notes.map((n) => noteView(n, ctx))),
    attachmentsCard(ticket, attachments.map((a) => attachmentView(a, ctx))),
  ]);
  detail.appendChild(el('div', { class: 'detail-grid' }, [main, side]));
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
  $('filterToolbar').hidden = true;
  $('listActions').hidden = true;
  $('newTicketRow').hidden = true;
}

// ----- Wiring -----
function fillFilterSelect(id, options, selectedKey) {
  fillSelect($(id), options.map((o) => ({ id: o.key, label: o.label })), selectedKey);
}

function wireEvents() {
  const goPanel = (key) => { activePanel = key; selectedTicketId = null; renderViewVisibility(); renderList(); };
  $('tabDept').addEventListener('click', () => goPanel('dept'));
  $('tabMine').addEventListener('click', () => goPanel('mine'));
  $('tabReport').addEventListener('click', () => goPanel('report'));
  $('backToQueue').addEventListener('click', backToQueue);
  $('userSelect').addEventListener('change', (e) => {
    currentUserId = e.target.value;
    if (selectedTicketId != null) renderDetail(); else renderList();
  });
  $('deptSelect').addEventListener('change', (e) => {
    currentDeptId = e.target.value;
    if (selectedTicketId == null) renderList();
  });

  // Structured filter toolbar (Loop 26).
  fillFilterSelect('filterScope', SCOPE_OPTIONS, filters.scope);
  fillFilterSelect('filterStatus', STATUS_FILTER_OPTIONS, filters.status);
  fillFilterSelect('filterPriority', PRIORITY_FILTER_OPTIONS, filters.priority);
  $('filterScope').addEventListener('change', (e) => { filters.scope = e.target.value; renderList(); });
  $('filterStatus').addEventListener('change', (e) => { filters.status = e.target.value; renderList(); });
  $('filterPriority').addEventListener('change', (e) => { filters.priority = e.target.value; renderList(); });
  $('filterAttention').addEventListener('change', (e) => { filters.needsAttention = e.target.checked; renderList(); });
  $('searchInput').addEventListener('input', (e) => { filters.search = e.target.value; renderList(); });

  // Minimal demo create form (Loop 24): namespaced esc_demo_loop24_* ids, requester = current user.
  $('newTicketBtn').addEventListener('click', async () => {
    const title = $('newTicketTitle').value.trim();
    if (!title) return;
    try {
      const created = await store.createTicket({
        id: newId('esc_demo_loop24'), title,
        submitterId: currentUserId, requestingDept: 'Demo (test only)',
      });
      $('newTicketTitle').value = '';
      await openTicket(created.id);
    } catch (err) {
      window.alert(err.message);
    }
  });
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
  renderViewVisibility();
  await renderList();
}

main();
