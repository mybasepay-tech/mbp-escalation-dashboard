// seed-demo-fixtures.js — GATED CLI for the Loop 24 demo fixture set on the live,
// NON-PRODUCTION test site. Same fail-closed gate as every live runner: git-ignored config,
// approval flags, non-production label, Escalations_v2_ prefix, legacy/production refusal.
// The committed code holds no site URL, client/tenant ID, secret, or SDK import.
//
// Usage (operator, at runtime):
//   node seed-demo-fixtures.js [configPath]                      # idempotent seed + report
//   node seed-demo-fixtures.js [configPath] --verify             # read-only presence report
//   node seed-demo-fixtures.js [configPath] --cleanup [--ticket <key>]...
//       exact-key cleanup of the fixtures (+ explicitly named demo tickets and their
//       activity/comments/notes/tag links/attachment metadata). Exits non-zero if anything
//       in scope is left over.
//
// All fixture records are obviously TEST-ONLY and namespaced (see demo-fixtures.js).

import { loadConfig, assertSafe, loadTransport, DEFAULT_CONFIG_PATH } from './run-testsite-contract.js';
import { SharePointLiveClient } from './SharePointLiveClient.js';
import {
  buildDemoFixtures, seedDemoFixtures, verifyDemoFixtures, cleanupDemoRecords, DEMO_NAMESPACE,
} from './demo-fixtures.js';

const argv = process.argv.slice(2);
const flags = new Set();
const positional = [];
const ticketKeys = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === '--ticket') {
    const key = argv[i + 1];
    if (!key || key.startsWith('--')) throw new Error('--ticket requires a namespaced ticket key');
    ticketKeys.push(key);
    i += 1;
  } else if (argv[i].startsWith('--')) {
    flags.add(argv[i]);
  } else {
    positional.push(argv[i]);
  }
}

const cfgPath = positional[0] ?? DEFAULT_CONFIG_PATH;
const cfg = loadConfig(cfgPath);
assertSafe(cfg);
console.log(`[gate] Safety + approvals passed (non-production only; no legacy writeback; no Power Automate). namespace=${DEMO_NAMESPACE}`);

const transport = await loadTransport(cfg);
const client = new SharePointLiveClient({ transport, siteRef: cfg.siteReferencePlaceholder });
const fixtures = buildDemoFixtures();
const total = fixtures.departments.length + fixtures.users.length + fixtures.tags.length;

if (flags.has('--cleanup')) {
  const { deleted, leftovers } = await cleanupDemoRecords(client, { ticketKeys, fixtures });
  console.log('==== demo fixture cleanup report ====');
  console.log(`  ticket keys in scope : ${ticketKeys.length ? ticketKeys.join(', ') : '(none)'}`);
  console.log(`  records deleted      : ${deleted}`);
  console.log(`  leftovers            : ${leftovers.length}${leftovers.length ? ' — ' + leftovers.join(', ') : ' (clean)'}`);
  console.log('==== end report ====');
  if (leftovers.length > 0) process.exitCode = 1;
} else if (flags.has('--verify')) {
  const { present, missing } = await verifyDemoFixtures(client, fixtures);
  console.log('==== demo fixture verify report (read-only) ====');
  console.log(`  fixtures defined : ${total}`);
  console.log(`  present          : ${present.length}${present.length ? ' — ' + present.join(', ') : ''}`);
  console.log(`  missing          : ${missing.length}${missing.length ? ' — ' + missing.join(', ') : ''}`);
  console.log('==== end report ====');
} else {
  const { created, reused } = await seedDemoFixtures(client, fixtures);
  console.log('==== demo fixture seed report (idempotent) ====');
  console.log(`  fixtures defined : ${total}`);
  console.log(`  created          : ${created.length}${created.length ? ' — ' + created.join(', ') : ''}`);
  console.log(`  reused (existing): ${reused.length}${reused.length ? ' — ' + reused.join(', ') : ''}`);
  console.log('==== end report ====');
}
