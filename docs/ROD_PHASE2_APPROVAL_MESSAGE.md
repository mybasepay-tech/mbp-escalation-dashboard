# Rod — Phase-2 Approval Message (draft)

> A short message Rod can approve/forward. Full detail:
> [`PHASE2_TEST_SITE_APPROVAL_REQUEST.md`](./PHASE2_TEST_SITE_APPROVAL_REQUEST.md). Design-only
> until approved — no production change.

---

## Draft (copy/paste)

**Subject:** Approval to build a non-production SharePoint *test* site for Escalation v2

Hi Rod,

The Escalation System v2 work is at the point where the next step is a **non-production
SharePoint test site** — a throwaway, company-owned site with new `Escalations_v2_*` lists,
**completely separate from the legacy tracker**. I'd like your go-ahead to proceed.

To be clear about scope:

- **Legacy stays exactly as-is** — operational, untouched, no changes to its lists,
  permissions, or flows. **No writeback to legacy.**
- **No Power Automate flows** — automation stays deferred for now.
- **No production cutover, no real users, no production data** — the test site uses sample
  data only.
- Everything so far is local/design-only and reversible; rolling back is just deleting the
  test site.

What I need approved to start:

1. **D6** — a dedicated, least-privilege v2 app/permissions, isolated from the legacy app.
2. **D7** — a legacy read/export method, **ideally a one-time offline export** (CSV/JSON).
3. **A non-production SharePoint test site** (company-owned, disposable).
4. **Phase-2 go-ahead** to run the already-prepared build runbook.

After that, I'll build the lists on the test site, wire up the adapter, and run our automated
contract tests. The **first green test run** is the checkpoint before anything else — I'll
bring results back to you before any further step.

Thanks,
[name]

---

## One-line chat version
> Ready for Phase 2: requesting approval to build a **non-production** SharePoint **test** site
> (new `Escalations_v2_*` lists) — legacy untouched, no Power Automate, no cutover, no real
> users. Need D6 (v2 app/permissions), D7 (legacy read/export, ideally offline), and the test
> site. OK to proceed?
