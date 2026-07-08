# MVP Demo Guide — Escalation System v2

> How to run the v2 UI locally, which backend it uses, and how to read the backend banner.
> **MockStore is the default.** The SharePoint TEST backend is strictly opt-in, local-only,
> and non-production. No production or cutover has occurred; no Power Automate flows exist;
> no notifications are sent; attachments are metadata-only (no real files).

## 1. Default demo (MockStore — safe anywhere)

```bash
cd src/v2
npm run validate    # confirm green (runs the full suite + safety scans)
npm run ui          # local loopback server
# open http://127.0.0.1:4173/ui/index.html
```

- Backend indicator (top-left): **“Mock backend”**.
- Banner: *“Mock data only — not connected to any live system …”*.
- All data is the in-memory seed; nothing touches the network. This mode requires no config
  and can never connect to SharePoint — the live path isn’t even loaded by the server.

## 2. Opt-in SharePoint TEST backend (non-production test site only)

**Always confirm the backend via the banner before demoing.** The test backend requires
BOTH of the following — either one alone does nothing:

1. **Server-side opt-in (git-ignored):** copy `src/v2/ui/ui-live.example.json` to
   `src/v2/ui/ui-live.local.json`, set `enableSharePointTestBackend: true`, and point
   `testsiteConfig` at the (separately git-ignored) `backend/sharepoint/live/testsite.config.json`
   used by the Loop 22 live contract run. The server then re-runs the same fail-closed
   safety gate (approvals, non-production label, `Escalations_v2_` prefix, legacy/production
   refusal) and loads the git-ignored runtime transport. Restart `npm run ui` and check its
   startup log line.
2. **Browser-side explicit request:** open
   `http://127.0.0.1:4173/ui/index.html?backend=sharepoint-test`.

- Backend indicator: **“SharePoint test backend”**.
- Warning banner: **“Test SharePoint backend enabled — non-production only”**.
- If the opt-in/config/gate is missing or unsafe, the page shows a visible
  **“SharePoint test backend UNAVAILABLE — …”** error and renders **no data** — it never
  silently falls back to mock (and plain `?backend=` typos fall back to mock, which never
  connects anywhere).

### How it works (and why it’s safe)
- The browser never talks to SharePoint. It calls loopback-only `/api/store/*` endpoints on
  the local `ui/serve.js`; the server holds `SharePointStore` + `SharePointLiveClient` + the
  git-ignored transport/token. **No site URL, client ID, or token ever reaches the browser
  or git.**
- The transport hard-refuses any list outside `Escalations_v2_*`.
- Reference data (users/departments/tags) is read-only through the UI seam; identity lookups
  that don’t resolve to existing `Escalations_v2_Users` rows are refused (fail-closed).

## 3. Demo fixtures for the SharePoint test backend (Loop 24)
The live lists are kept empty by default. For a supervised demo, seed the small, obviously
test-only fixture set (1 department, 2 users, 1 tag — all keys prefixed
`esc_demo_loop24_`, names marked "TEST ONLY", emails on `.invalid`):

```bash
cd src/v2/backend/sharepoint/live
node seed-demo-fixtures.js               # idempotent: reports created vs reused
node seed-demo-fixtures.js --verify      # read-only presence report
node seed-demo-fixtures.js --cleanup --ticket <esc_demo_loop24_...>   # exact-key cleanup
```
- Seeding is idempotent (second run reuses, never duplicates).
- Cleanup deletes ONLY the exact fixture keys plus explicitly named `esc_demo_loop24_*`
  tickets (with their activity/comments/notes/tag links/attachment metadata) and reports a
  leftover count — 0 means the site is exactly as before. Non-namespaced keys are refused.
- The **"New demo ticket"** form in the UI creates tickets with `esc_demo_loop24_*` ids and
  the current user as requester, so every demo record stays unmistakable and cleanable.

## 4. Current status (Loop 24)
- MockStore: default, unchanged, fully demoable.
- SharePoint test backend: full supervised lifecycle smoke passed through the UI seam —
  create (demo form path), read, priority, department/person assignment with auto-status,
  public comment, internal note, tag, **Complete refused without a closing note**,
  **Complete refused for the non-requester (assignee)**, Complete by requester with note
  (completedDate + finalClosureNote set), Reopen (both cleared), 11-event activity chain.
  All records cleaned up afterwards (19 deleted, 0 leftovers).
- Deferred by design: notifications/flows, real attachment files, production users, cutover.
