// run-live-contract.js — GATED runner: the FULL store contract against the live test site.
//
// This executes the reusable EscalationStore contract (tests/store-contract/contract.js) against
// SharePointStore + SharePointLiveClient + an operator-supplied runtime transport, on the
// approved NON-PRODUCTION test site only. It is the D13/D21 acceptance gate made executable.
//
// FAIL-CLOSED, like run-testsite-contract.js:
//   * refuses to run without the git-ignored config + approval flags (assertSafe);
//   * refuses legacy/production targets;
//   * the committed code holds NO site URL, client/tenant ID, secret, or SDK import — the
//     transport bootstrap is operator-provided at runtime and git-ignored.
//
// DATA SAFETY (only run-created records are ever touched):
//   * every item CREATED through the transport is tracked (list + item id);
//   * before each contract test and after the whole run, exactly those tracked items are
//     deleted — nothing else, never a list, never pre-existing rows;
//   * pre-existing item counts are captured up front and re-checked at the end so the run can
//     honestly report that it left the lists as it found them;
//   * every operation goes through the Escalations_v2_* lists only (transport should also
//     enforce the prefix as defense in depth).
//
// Usage (operator, at runtime, with a git-ignored config):
//   node run-live-contract.js ./testsite.config.json
//
// The process exit code is non-zero if any contract test fails (node:test direct execution).

import { test, after } from 'node:test';

import { loadConfig, assertSafe, loadTransport, DEFAULT_CONFIG_PATH } from './run-testsite-contract.js';
import { SharePointLiveClient } from './SharePointLiveClient.js';
import { SharePointStore } from '../../../store/SharePointStore.js';
import { runStoreContract } from '../../../tests/store-contract/contract.js';
import { buildSeed } from '../../../mock/seed.js';
import { newId } from '../../../domain/models.js';
import {
  LISTS, ALL_LISTS, LINK_COLS,
  ticketToFields, activityToFields, commentToFields, noteToFields,
  deptToFields, userToFields, tagToFields, attachmentToFields,
} from '../mapping.js';

// ---------- gate ----------
const cfgPath = process.argv[2] ?? DEFAULT_CONFIG_PATH;
const cfg = loadConfig(cfgPath);
assertSafe(cfg);
console.log(`[gate] Safety + approvals passed. runNamespace=${cfg.runNamespace ?? '(none)'} (non-production only; no legacy writeback; no Power Automate).`);

// ---------- transport with create-tracking (enables precise, run-only cleanup) ----------
const rawTransport = await loadTransport(cfg);
/** @type {{list: string, id: string}[]} every item created by THIS run, in creation order */
const createdByRun = [];
let totalCreated = 0; // lifetime count (seed + records the store creates during tests)
const transport = {
  ...rawTransport,
  createItem: async (list, fields) => {
    const rec = await rawTransport.createItem(list, fields);
    createdByRun.push({ list, id: rec.id });
    totalCreated += 1;
    return rec;
  },
};

const client = new SharePointLiveClient({ transport, siteRef: cfg.siteReferencePlaceholder });
// Real backoff for live throttling (the default test sleep is a no-op by design).
const store = new SharePointStore({
  client,
  retry: { maxAttempts: 6, baseDelayMs: 800, sleep: (ms) => new Promise((r) => setTimeout(r, ms || 800)) },
});

// ---------- self-heal: sweep STALE CONTRACT FIXTURES from a previously interrupted run ----------
// If an earlier run was killed before its final cleanup, its seeded fixture rows remain. Those
// rows are identified by the contract's OWN fixed fixture keys (buildSeed ids like esc_new /
// user_maggie / tag_urgent) or by referencing those fixture tickets — they can never be real
// operational data. ONLY such rows are removed; nothing else is ever matched or deleted.
//
// OPT-IN ONLY (`"staleFixtureSweep": true` in the git-ignored config): because this deletes by
// fixture-key query rather than by ids tracked in this process, an OPERATOR must explicitly
// approve it. Without the flag, stale fixtures are reported and left in place (they are
// clearly fixture-keyed and harmless to enumerate).
async function sweepStaleSeedFixtures() {
  const seed = buildSeed();
  let swept = 0;
  const delWhere = async (list, filter) => {
    for (;;) {
      const rec = await client.findBy(list, filter);
      if (!rec) break;
      try { await rawTransport.deleteItem(list, rec.id); swept += 1; }
      catch (e) { if (e && e.code === 'notFound') continue; throw e; }
    }
  };
  // Children first (rows referencing fixture tickets — includes store-written rows with
  // generated ids from the interrupted test), then the fixtures themselves.
  for (const t of seed.tickets) {
    await delWhere(LISTS.TICKET_TAGS, { [LINK_COLS.TICKET]: t.id });
    await delWhere(LISTS.ACTIVITY, { EscalationKey: t.id });
    await delWhere(LISTS.COMMENTS, { EscalationKey: t.id });
    await delWhere(LISTS.NOTES, { EscalationKey: t.id });
    await delWhere(LISTS.ATTACHMENTS, { EscalationKey: t.id });
  }
  for (const a of seed.activity) await delWhere(LISTS.ACTIVITY, { ActivityKey: a.id });
  for (const t of seed.tickets) await delWhere(LISTS.TICKETS, { TicketKey: t.id });
  for (const g of seed.tags) await delWhere(LISTS.TAGS, { TagKey: g.id });
  for (const u of seed.users) await delWhere(LISTS.USERS, { UserKey: u.id });
  for (const d of seed.departments) await delWhere(LISTS.DEPARTMENTS, { DeptKey: d.id });
  if (swept > 0) console.warn(`[sweep] removed ${swept} stale contract-fixture row(s) left by a previously interrupted run.`);
}
if (cfg.staleFixtureSweep === true) {
  await sweepStaleSeedFixtures();
} else {
  console.log('[sweep] staleFixtureSweep not enabled in config — any stale fixture rows from a previously interrupted run are left in place (reported below as pre-existing).');
}

// ---------- pre-run snapshot: never touch anything that was already there ----------
const preExisting = {};
for (const list of ALL_LISTS) {
  preExisting[list] = (await client.queryAll(list)).length;
}
const preTotal = Object.values(preExisting).reduce((a, b) => a + b, 0);
if (preTotal > 0) {
  console.warn(`[pre] WARNING: ${preTotal} pre-existing item(s) found across Escalations_v2_* lists — they will NOT be touched (cleanup deletes only run-created items):`);
  for (const [l, n] of Object.entries(preExisting)) if (n > 0) console.warn(`[pre]   ${l}: ${n}`);
} else {
  console.log('[pre] All Escalations_v2_* lists are empty — clean slate.');
}

// ---------- cleanup: delete exactly the tracked run-created items (newest first) ----------
let totalDeleted = 0;
const deleteFailures = [];
async function cleanupRun() {
  while (createdByRun.length) {
    const { list, id } = createdByRun.pop();
    for (let attempt = 0; ; attempt++) {
      try {
        await transport.deleteItem(list, id);
        totalDeleted += 1;
        break;
      } catch (e) {
        if (e && e.code === 'notFound') break; // already gone — fine
        if (e && e.code === 'throttled' && attempt < 5) {
          await new Promise((r) => setTimeout(r, e.retryAfterMs ?? 1000));
          continue;
        }
        deleteFailures.push({ list, id, error: String(e?.message ?? e) });
        break;
      }
    }
  }
}

// ---------- live seeding (mirrors fake/seed.js, through the live client) ----------
async function seedLive(seed) {
  const { departments = [], users = [], tags = [], tickets = [], activity = [], comments = [], notes = [], attachments = [] } = seed;
  for (const d of departments) await client.createItem(LISTS.DEPARTMENTS, deptToFields(d));
  for (const u of users) await client.createItem(LISTS.USERS, userToFields(u));
  for (const t of tags) await client.createItem(LISTS.TAGS, tagToFields(t));
  const labelByTag = new Map(tags.map((t) => [t.id, t.label]));
  for (const ticket of tickets) {
    await client.createItem(LISTS.TICKETS, ticketToFields(ticket));
    for (const tagId of ticket.tagIds ?? []) {
      await client.createItem(LISTS.TICKET_TAGS, {
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
  for (const a of activity) await client.createItem(LISTS.ACTIVITY, activityToFields(a));
  for (const c of comments) await client.createItem(LISTS.COMMENTS, commentToFields(c));
  for (const n of notes) await client.createItem(LISTS.NOTES, noteToFields(n));
  for (const a of attachments) await client.createItem(LISTS.ATTACHMENTS, attachmentToFields(a));
}

// ---------- run the FULL store contract against the live store ----------
let freshCount = 0;
runStoreContract('SharePointStore(live-testsite)', async (seed) => {
  freshCount += 1;
  await cleanupRun();           // wipe the previous test's records (run-created only)
  await seedLive(seed);
  return store;
});

// ---------- final cleanup + honest verification ----------
after(async () => {
  await cleanupRun();
  const leftovers = [];
  for (const list of ALL_LISTS) {
    const now = (await client.queryAll(list)).length;
    if (now !== preExisting[list]) leftovers.push(`${list}: ${preExisting[list]} -> ${now}`);
  }
  console.log('\n==== live contract run summary ====');
  console.log(`  fresh seeds        : ${freshCount}`);
  console.log(`  items created      : ${totalCreated} (seed + store-written records, all tracked)`);
  console.log(`  items deleted      : ${totalDeleted} (run-created only; lists + pre-existing rows untouched)`);
  console.log(`  delete failures    : ${deleteFailures.length}`);
  for (const f of deleteFailures) console.log(`    FAILED delete ${f.list} item ${f.id}: ${f.error}`);
  // Loop 33: the app-auth graph transport can be explicitly opted into omitting Hyperlink
  // column writes (a Microsoft Graph platform limitation). NEVER silent: surface the count.
  if (typeof rawTransport.hyperlinkOmissions === 'function' && rawTransport.hyperlinkOmissions() > 0) {
    console.log(`  hyperlink writes omitted: ${rawTransport.hyperlinkOmissions()} (graph apiMode cannot write Hyperlink columns; explicit 'omit-and-report' opt-in — full fidelity requires apiMode 'sharepoint-rest')`);
  }
  if (leftovers.length) {
    console.log('  LEFTOVER DELTAS (should be empty; investigate):');
    for (const l of leftovers) console.log(`    ${l}`);
  } else {
    console.log('  post-run item counts match pre-run exactly — lists left as found.');
  }
  console.log('==== end summary ====');
});
