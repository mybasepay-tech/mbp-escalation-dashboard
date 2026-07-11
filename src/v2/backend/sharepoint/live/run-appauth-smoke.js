// run-appauth-smoke.js — GATED D6 app-auth smoke (Loop 33). COMMITTED, identifier-free.
//
// Proves, against the approved NON-PRODUCTION test site only, that the D6 app registration +
// certificate can do everything the v2 store needs WITHOUT operator token minting:
//   1. app-auth status  — config validates, token provider constructs, transport is app-auth;
//   2. read-only access — every Escalations_v2_* list is queryable (counts only reported);
//   3. namespaced CRUD  — create/read/update/comment/delete using ONLY esc_d6_loop33_* keys,
//                         then verify ZERO leftovers by querying those exact keys back.
//
// FAIL-CLOSED like every runner here: refuses to run without the git-ignored config +
// approval flags (assertSafe), refuses legacy/production targets, and REFUSES to run if the
// resolved transport is not the D6 app-auth transport (this runner exists to validate that
// path — an operator-token transport passing would prove nothing).
//
// Usage (operator, at runtime, with git-ignored configs in place):
//   node run-appauth-smoke.js [./testsite.config.json]

import { pathToFileURL } from 'node:url';

import { loadConfig, assertSafe, loadTransport, DEFAULT_CONFIG_PATH } from './run-testsite-contract.js';
import { SharePointLiveClient } from './SharePointLiveClient.js';

const NAMESPACE = 'esc_d6_loop33_';
const LIST_TICKETS = 'Escalations_v2_Tickets';
const LIST_COMMENTS = 'Escalations_v2_Comments';
const LIST_USERS = 'Escalations_v2_Users';

export async function main(argv = []) {
  // ---------- gate ----------
  const cfg = loadConfig(argv[2] ?? DEFAULT_CONFIG_PATH);
  assertSafe(cfg);
  console.log('[gate] Safety + approvals passed (non-production, no legacy writeback, no Power Automate).');

  // ---------- 1. app-auth status ----------
  const transport = await loadTransport(cfg);
  const desc = typeof transport.describe === 'function' ? transport.describe() : null;
  if (desc?.authMode !== 'app-certificate') {
    throw new Error('app-auth smoke REFUSED: the resolved transport is not the D6 app-auth transport. Enable auth.config.local.json (enableAppAuth=true) — this runner validates the app-auth path only.');
  }
  console.log(`[status] app-auth transport ready: apiMode=${desc.apiMode} hyperlinkWriteBehavior=${desc.hyperlinkWriteBehavior} listPrefix=${desc.listPrefix}`);

  const client = new SharePointLiveClient({ transport, siteRef: cfg.siteReferencePlaceholder });

  // ---------- 2. read-only list access ----------
  for (const list of transport.listNames()) {
    const count = (await client.queryAll(list)).length;
    console.log(`[read] ${list}: ${count} item(s)`);
  }

  // ---------- 3. namespaced CRUD (exact-key cleanup; zero leftovers required) ----------
  const ticketKey = `${NAMESPACE}smoke1`;
  const commentKey = `${NAMESPACE}comment1`;
  const userKey = `${NAMESPACE}user1`;
  const created = []; // { list, id } — deleted in reverse order below

  try {
    // A comment requires an author (Lookup to Users) — create a clearly-namespaced FAKE
    // reference-user row first (no real person, no directory data).
    const u = await client.createItem(LIST_USERS, {
      UserKey: userKey, DisplayName: 'D6 Loop33 smoke user (fake, safe to delete)',
    });
    created.push({ list: LIST_USERS, id: u.id });
    console.log(`[crud] created fake reference user ${userKey}`);

    const t = await client.createItem(LIST_TICKETS, {
      TicketKey: ticketKey,
      Title: 'D6 Loop33 app-auth smoke (safe namespaced test record)',
      Status: 'New', Priority: 'Low',
      CreatedAt: new Date().toISOString(),
    });
    created.push({ list: LIST_TICKETS, id: t.id });
    console.log(`[crud] created ticket ${ticketKey}`);

    const back = await client.getItem(LIST_TICKETS, t.id);
    if (back.fields.TicketKey !== ticketKey) throw new Error('read-back TicketKey mismatch');
    console.log('[crud] read-back OK (key + etag present:', Boolean(back.etag), ')');

    await client.updateItem(LIST_TICKETS, t.id, { Priority: 'Medium' }, { ifMatch: '*' });
    const upd = await client.getItem(LIST_TICKETS, t.id);
    if (upd.fields.Priority !== 'Medium') throw new Error('update did not persist');
    console.log('[crud] safe-field update OK (Priority Low -> Medium)');

    const c = await client.createItem(LIST_COMMENTS, {
      CommentKey: commentKey, EscalationKey: ticketKey, AuthorKey: userKey,
      Body: 'D6 Loop33 app-auth smoke comment (safe namespaced test record)',
      Visibility: 'public',
      CreatedAt: new Date().toISOString(),
    });
    created.push({ list: LIST_COMMENTS, id: c.id });
    console.log(`[crud] created comment ${commentKey}`);

    const found = await client.findBy(LIST_TICKETS, { TicketKey: ticketKey });
    if (!found) throw new Error('filtered query did not find the namespaced ticket');
    console.log('[crud] filtered query OK');
  } finally {
    // ---------- cleanup: exactly the records this run created, newest first ----------
    let deleted = 0;
    while (created.length) {
      const { list, id } = created.pop();
      try { await client.deleteItem(list, id); deleted += 1; }
      catch (e) { if (e?.code !== 'notFound') console.error(`[cleanup] FAILED delete ${list} item: ${e.message}`); }
    }
    const leftT = await client.findBy(LIST_TICKETS, { TicketKey: ticketKey });
    const leftC = await client.findBy(LIST_COMMENTS, { CommentKey: commentKey });
    const leftU = await client.findBy(LIST_USERS, { UserKey: userKey });
    const leftovers = (leftT ? 1 : 0) + (leftC ? 1 : 0) + (leftU ? 1 : 0);
    console.log(`[cleanup] deleted=${deleted} leftovers=${leftovers}`);
    if (leftovers > 0) throw new Error(`app-auth smoke left ${leftovers} namespaced record(s) behind — investigate and remove.`);
  }

  console.log('[done] D6 app-auth smoke PASSED: status, read-only access, namespaced CRUD, zero leftovers.');
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main(process.argv).catch((e) => { console.error(String(e.message ?? e)); process.exitCode = 1; });
}
