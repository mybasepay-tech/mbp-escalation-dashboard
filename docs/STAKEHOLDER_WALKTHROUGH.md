# Stakeholder Walkthrough — Escalation System v2 (Demo Package)

> **Loop 25.** Everything a presenter (Rodolfo/Rod) needs to demonstrate v2 safely to
> decision-makers: what to say, what to show, what to check, and what NOT to promise.
> Operator commands and troubleshooting live in [`MVP_DEMO_GUIDE.md`](./MVP_DEMO_GUIDE.md).
>
> **Ground truth for every demo:** the legacy Escalation Tracker remains the operational
> system of record. v2 has **no cutover**, **no real/migrated data**, **no production
> users**, **no notifications**, **no Power Automate**, and attachments are
> **metadata-only**. The live demo runs against an approved, non-production SharePoint
> test site containing only namespaced, disposable test records.

## 1. What the v2 system is
A purpose-built escalation application designed to replace working directly in the legacy
SharePoint list, built in parallel and behind safety gates:
- **Domain rules as code, proven by tests:** status workflow with auto-status on
  assignment, requester-only closure with a required final closing comment, reopen
  behavior, priority-based no-movement reminder readiness, optional amount involved,
  attachment metadata, and an append-only activity trail. 259 automated tests pass,
  including the full store contract executed against real SharePoint (Loop 22, 30/30).
- **A swappable backend seam:** the same UI runs on an in-memory mock (default) or the
  SharePoint test backend (opt-in), with identical business behavior — that seam is the
  future migration path.
- **Safety-first engineering:** every live capability is fail-closed, opt-in, namespaced,
  and cleanup-capable; the legacy system is untouched by design and by automated guard.

## 2. What is safe to demo now
- The full ticket lifecycle on **mock data** (zero risk, works anywhere).
- The same lifecycle on the **SharePoint test backend** with disposable
  `esc_demo_loop24_*` fixtures: create a demo ticket, assign, comment, note, tag, watch
  the closure rules refuse the wrong actor and the missing closing comment, complete,
  reopen, and show the activity trail — all against real SharePoint columns.
- The **backend banner** itself is demo-worthy: it proves the system always states which
  backend is live and warns in test mode.

## 3. What is NOT production-ready yet
Say this plainly (see the script below):
- No real data — nothing has been migrated from the legacy tracker.
- No production users, permissions, or directory identities (demo users are fixtures).
- Auth for live mode is operator-minted and short-lived (D6 app-registration story is the
  named next step).
- No notifications are sent (reminder logic computes candidates locally only).
- Attachments are metadata records — no real files are stored.
- No cutover plan is in motion; legacy remains the source of truth.

## 4. Running the demo

### 4.1 MockStore mode (default — start here)
1. `cd src/v2 && npm run validate` (expect READY) then `npm run ui`.
2. Open `http://127.0.0.1:4173/ui/index.html`.
3. Confirm the indicator reads **“Mock backend”** and the banner says mock data only.
4. Walk the lifecycle on seeded mock tickets (see flow in §5).

### 4.2 SharePoint test mode (opt-in, supervised)
1. Complete the pre-demo prep in `MVP_DEMO_GUIDE.md` §0 (server restart, fresh token,
   cleanup-first verify).
2. Seed fixtures: `node seed-demo-fixtures.js` from `src/v2/backend/sharepoint/live`
   (idempotent — the report shows created vs reused; 4 records total).
3. Open `http://127.0.0.1:4173/ui/index.html?backend=sharepoint-test`.
4. **Confirm out loud, on screen:** indicator **“SharePoint test backend”** and the
   warning banner **“Test SharePoint backend enabled — non-production only.”** If instead
   you see “UNAVAILABLE”, stop — the fail-closed gate is doing its job; nothing connected.

### 4.3 Demo flow (both modes; ~5 minutes)
1. **Create** a ticket with the “New demo ticket” form (ids are `esc_demo_loop24_*` —
   point out the namespace: every demo record is unmistakable and deletable).
2. **Assign** a department, then a person — the status advances automatically and each
   step lands in the activity trail.
3. **Comment** (public) and **note** (internal) — two separate streams; add a **tag**.
4. **Try to complete it the wrong way** — as the assignee, or without a closing comment.
   The system refuses with a plain-language reason. This is the stakeholder rule from
   Loop 21, enforced live.
5. **Complete correctly** — switch to the requester, enter the final closing comment;
   completed date and the note are stored and audited. **Reopen** to show closure history
   survives in the activity trail.
6. End on the **Reporting** tab (counts, reminder candidates) and the activity trail.

### 4.4 Cleanup and verification (test mode)
1. `node seed-demo-fixtures.js --cleanup --ticket <each esc_demo_loop24_* ticket you created>`
2. The report prints **records deleted** and **leftovers** — leftovers must be **0**.
3. `node seed-demo-fixtures.js --verify` → fixtures present: 0. The test site is exactly
   as it was before the demo. Cleanup only ever touches `esc_demo_loop24_*` keys; it
   refuses anything else.

## 5. Presenter script (Rodolfo/Rod)

**Opening (30 seconds).**
> “This is Escalation System v2 — the replacement we're building for working directly in
> the escalation list. What you'll see is real, working software with the business rules
> we agreed on enforced by the system itself. Two important framings before I start:
> the legacy tracker is still our system of record and hasn't been touched, and nothing
> you'll see is production data — v2 runs on test data in a walled-off test site.”

**During the demo (talk track).**
- On the banner: “The system always tells you which backend it's on. This yellow banner
  means the non-production test backend — it can't appear silently.”
- On auto-status: “Assigning someone moves the status for you — the status drift we fight
  in the legacy list can't happen here.”
- On the refusals (the highlight): “Notice the system just told me no. Only the person who
  submitted a ticket can officially close it, and never without a final closing comment.
  That's policy as code — not a training slide.”
- On the activity trail: “Every change is recorded automatically — who, what, when —
  including the closing comment, even after a reopen.”

**Safe language — say / don't say.**
- Say: “ready for a supervised demo”, “the foundation is proven against real SharePoint”,
  “cutover would be a separate, planned decision.”
- Don't say: “ready to roll out”, “we can switch next week”, “the data is already in.”
- If asked “when can we use it?”: “That's exactly the decision we're preparing for — the
  next steps are the auth story, a controlled pilot plan, and a data-import strategy.
  Each is a gated step, not a switch we've already flipped.”

**Closing statements (must be said).**
> “To be explicit: the legacy tracker remains the source of truth today. v2 has no cutover
> scheduled, and no real data has been migrated — everything you saw was namespaced test
> data, which we delete after this session.”

## 6. Demo checklist

**Pre-demo**
- [ ] `npm run validate` is READY (259 tests green).
- [ ] UI server restarted; startup log states the backend gate result.
- [ ] Fresh local token minted (test-mode demos); `.auth/` stays git-ignored.
- [ ] `--verify` run; leftover demo records from prior sessions cleaned first.
- [ ] Fixtures seeded; report shows 4 present.
- [ ] Mock tab open and showing **“Mock backend”**; test tab open and showing the warning
      banner. No “UNAVAILABLE” error.

**During demo**
- [ ] Banner/indicator confirmed out loud before touching data.
- [ ] Only `esc_demo_loop24_*` records created.
- [ ] Both closure refusals shown (wrong actor; missing closing comment).
- [ ] Closing statements from §5 delivered.

**Post-demo**
- [ ] `--cleanup --ticket <keys>` run for every demo ticket created.
- [ ] Cleanup report: **leftovers 0** (non-zero exits with an error — investigate, don't
      shrug).
- [ ] `--verify` shows 0 fixtures present.
- [ ] No screenshots/recordings containing tokens, URLs, or IDs are shared or committed.

## 7. Risks and limitations (current, honest)
- **Auth is operator-dependent:** live mode needs a locally-minted, short-lived token and
  interactive sign-in that can stall when unattended — the main operational risk during a
  live demo, and the reason D6 (dedicated app registration/auth) is the top follow-up.
- **No production users or permissions** — identity is fixture data; role enforcement is
  application-layer only.
- **No real attachments** — metadata records only, by design (D24).
- **No notifications** — reminder candidates are computed and displayed locally only (D25).
- **No data migration has occurred** — the migration/mapping plan exists on paper (read-only,
  no writeback), but no real record has been imported.
- **No Power Automate** — none created, none touched.
- **No cutover** — parallel-run and cutover remain a separately-approved future plan
  (D14); legacy is operational and untouched.

## 8. Recommended decision-maker ask
At the end of the walkthrough, ask for three approvals — none of which start a pilot or
cutover by themselves:
1. **Approve continuing toward controlled pilot planning** — scoping a small, supervised
   pilot on the test site (participants, duration, success criteria) as a plan to be
   brought back for sign-off.
2. **Approve resolving the D6 app-registration/auth story** — a dedicated, least-privilege
   app identity so live mode stops depending on operator token minting.
3. **Approve planning a controlled data-import strategy** — design-first, read-only against
   legacy, no writeback, to be executed only after its own review.

*(This document deliberately contains no site URLs, tenant/client IDs, tokens, or other
live identifiers; runtime configuration stays git-ignored on the operator machine.)*
