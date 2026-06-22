// Local inspection script — `npm run demo` (or `node mock/demo.js`).
//
// Prints the seeded department queue and a person's "My Assigned Tickets", then exercises
// an assignment to show auto-status + activity. 100% in-memory; no network.

import { seededStore } from './seed.js';
import { daysOpen } from '../domain/models.js';

const store = seededStore();

function line(t) {
  const who = t.assigneeId ?? '—';
  return `  [${t.status.padEnd(16)}] ${t.title}  (assignee: ${who}, days open: ${daysOpen(t)})`;
}

console.log('=== Benefits Ops department queue (includes person-assigned) ===');
for (const t of await store.departmentQueue('dept_benefits')) console.log(line(t));

console.log('\n=== Sarah\'s My Assigned Tickets ===');
for (const t of await store.myAssignedTickets('user_sarah')) console.log(line(t));

console.log('\n=== Assign the New ticket to Maggie (expect auto-status -> Assigned) ===');
await store.assignDepartment('esc_new', 'dept_benefits', { actorId: 'user_teri' });
await store.assignPerson('esc_new', 'user_maggie', { actorId: 'user_teri' });
const updated = await store.getTicket('esc_new');
console.log(`  esc_new status is now: ${updated.status}`);
console.log('  activity:');
for (const e of await store.listActivity('esc_new')) {
  console.log(`    - ${e.type}${e.to ? ` -> ${JSON.stringify(e.to)}` : ''}`);
}
