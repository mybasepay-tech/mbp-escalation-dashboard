# Activity & Comments Spec — Escalation System v2

> Planning scaffold.

## 1. Two distinct streams
v2 separates the single legacy `StatusUpdates` rich-text blob into two first-class streams:

| Stream | Entity | Mutable? | Purpose |
|--------|--------|----------|---------|
| **Activity** | `EscalationActivity` | **No (append-only)** | System/audit record of every change. |
| **Comments** | `EscalationComments` | Editable (with `editedAt`) | Human discussion. |

This is the v2 successor to the legacy `StatusUpdates` timeline (which mixed status
updates, follow-ups, and free text in one rich-text field).

## 2. Activity log
- **Append-only and immutable.** Corrections are new entries, never edits/deletes.
- Auto-generated on: ticket creation, status change (incl. assignment-driven auto-status),
  assignment change (person or dept), priority change, key field changes, comments, notes,
  and migration normalization.
- Entry: `type`, `actorId`, `from`, `to`, `note`, `timestamp` (see
  [`DATA_MODEL.md`](./DATA_MODEL.md) §3).
- `type` values (authoritative taxonomy in [`DATA_MODEL.md`](./DATA_MODEL.md) §3):
  `created`, `assignment_change`, `status_change`, `priority_change`, `field_change`,
  `comment`, `note`, `attachment` (attachment metadata added/soft-deleted — Loop 21/D24), `migration_normalization`.
- Assignment + auto-status: an assignment that triggers an auto-status change (see
  [`STATUS_WORKFLOW.md`](./STATUS_WORKFLOW.md) §3) emits **both** `assignment_change` and
  `status_change`.
- `migration_normalization` entries use a system actor and explain any drift correction
  (see [`MIGRATION_SPEC.md`](./MIGRATION_SPEC.md) §4).

## 3. Comments
- Free-form (markdown), authored by a person.
- Support **@-mentions** resolved to identities (legacy resolved tagged emails to
  SharePoint user IDs — preserve this capability).
- Editable by author within policy; edits set `editedAt` (original retained server-side if
  feasible). Deletion is soft (audited).
- Posting a comment writes a `comment` activity entry for timeline unification.

## 4. Unified timeline (UI)
- Ticket detail shows Activity and Comments, filterable to either.
- Visual distinction between system activity and human comments (legacy used
  pale-green/pale-blue styling for follow-up vs status-update entries — carry the spirit
  forward).
- Stale indicator: surface "no update since X" prominently (legacy added stale/last-update
  emphasis).

## 5. Migration of legacy `StatusUpdates`
- Parse the rich-text timeline into discrete entries.
- Map assignee/status updates → `EscalationActivity`; free-text discussion →
  `EscalationComments`.
- **Preserve original text verbatim**; never lose legacy content.
- Entries that can't be cleanly classified become comments with a `migration_normalization`
  activity note.

## 6. Guarantees
- Activity is never silently lost or rewritten.
- Every status/assignment change is traceable to an actor and time.
- Comments and activity are queryable independently for reporting.

