# Rod Demo Script — Escalation System v2 (Mock MVP)

> A ~10-minute walkthrough of the local mock MVP. **Everything is mock/local — no live
> system is contacted.** Use this to show capability and collect the decisions listed at
> the end.

## 0. Setup (presenter, before the demo)
```bash
cd src/v2
npm run validate   # optional: confirm tests + safety scan are green
npm run ui         # starts a LOCAL server (loopback only)
```
Open the printed URL: **http://127.0.0.1:4173/ui/index.html**

Opening line: *"This is a standalone mock of the new Escalation System. It does not touch
the current tracker, SharePoint, or any live system — it runs entirely on local sample
data. The goal today is to show how it would work and agree on a few decisions before we
build any real backend."*

## 1. Department queue (the main work panel)
- Header shows the **mock-data banner**, a **user** switcher, and a **department** switcher.
- On the **Department queue** tab, point out it lists every ticket in the department —
  **including tickets already assigned to a person** (they don't disappear from the queue).
- Talking point: *"The department queue is the shared work surface; assigning someone keeps
  the ticket visible to the team."*

## 2. Department filters
- Click through the filter chips: **Unassigned in department**, **Assigned to others**,
  **In progress**, **Pending review**, **Resolved awaiting closure**, **Migrated / legacy**,
  **High priority**.
- Talking point: *"These are generic for now; later each department can get its own
  configured columns, filters, and quick actions."* (Decision D9.)

## 3. My Assigned Tickets
- Switch to the **My assigned tickets** tab. Note it shows **only the current user's**
  tickets. Change the **user** in the header to show the view follow the person.
- Talking point: *"Everyone gets a personal queue, separate from the department queue."*

## 4. Open a ticket (detail)
- Click a ticket. Walk through: title, status, priority, department, assignee, submitter,
  issue category/type, dates, days open.

## 5. Assignment + auto-status
- Pick the seeded **New** ticket. Use **Assign dept**, then **Assign person**.
- Show that assigning a person to a New / Not-yet-assigned ticket **auto-moves status to
  Assigned**, and that this is logged. Use **Unassign** to show it reverts to Not yet
  assigned.
- Talking point: *"This prevents the status/assignee drift we saw in the old tracker."*
  (Decision D2 — confirm auto vs. prompt vs. warn-only.)

## 6. Public comment vs. internal note
- In **Public comments**, add a comment (member/requester-facing).
- In **Internal notes**, add a note (staff-only; carries internal-visibility metadata).
- Talking point: *"Comments and notes are separate streams — and separate from the audit
  trail. Notes are modeled as internal so we can enforce who sees them once permissions are
  added."*

## 7. Tags
- Add a tag from the dropdown; remove a tag with the **×** on a chip.
- Talking point: *"Tag changes are recorded in the activity trail."*

## 8. Activity trail
- Scroll to **Activity trail**. Show entries for assignment, status, priority, comment,
  note, and tag changes — each with actor and timestamp.
- Talking point: *"This is an append-only audit log — discrete events, not a free-text
  field that drifts."*

## 9. Reporting
- Click the **Reporting** tab. Show **total**, **by status / department / priority**, and
  the **unassigned**, **assigned-to-me**, **resolved-awaiting-closure**, and
  **legacy/migrated** counts.
- Talking point: *"Reporting is built in and reads the same data — no hand-maintained
  spreadsheets. Today it's mock data."*

## 10. Migrated / legacy metadata
- Open the **Migrated from legacy tracker** ticket. Show the **Legacy metadata** block:
  fake **Legacy ID** and a fake **`.invalid`** Legacy URL, plus the normalization note
  ("status was 'Not yet assigned' with an assignee; normalized to 'Assigned'").
- Talking point: *"When we migrate, every record keeps a link back to its legacy item, and
  any clean-up is recorded — and we never write back to the old tracker."* (Decisions D4,
  D5, D7.)

## Decisions to ask Rod (capture answers in DECISION_LOG.md)
1. **D3 — Backend:** SharePoint (temporary) vs. managed API/DB vs. **Dataverse**? *(blocks
   backend work)*
2. **D6 — Entra app:** new v2 app registration vs. reuse legacy? *(blocks live auth)*
3. **D7 — Migration dry-run input:** provide a **read-only export/sample**, or approve
   read-only Graph access to legacy lists? *(blocks dry-run vs. real data)*
4. **D2 — Auto-status:** keep auto-advance on assignment, or prompt/warn-only?
5. **D4 / D5 — Status mapping:** confirm "Complete" → Closed/Resolved and whether to
   collapse the Pending-* statuses.
6. **D1 / D9 — Stack & generic config:** confirm app stack/hosting and the generic
   required-fields/category set.
7. **Approvals to proceed:** company-owned site/resource confirmation, migration dry-run
   approval (read-only, no write-back), and rollback / no-cutover confirmation
   (see [`../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md`](../harness/BACKEND_ADAPTER_READINESS_CHECKLIST.md)).

## Close
*"Nothing we did today touched production. Once we have these decisions and approvals, the
next loop can stand up a backend adapter behind the same interface — starting with a
read-only migration dry-run, never a write to the old system."*
