# No-Production-Modification Checklist

> **Prime directive gate.** Every work item that touches anything near the legacy system,
> SharePoint, Graph, flows, or permissions must pass this checklist before it is done.
> If any box cannot be checked, **stop** and escalate to Rod.

## Hard rules (from project charter)
1. Do **not** modify, delete, disable, migrate, restrict access, or replace the current
   production tracker unless Rod explicitly approves.
2. The legacy tracker remains **live and open to users** until cutover is explicitly
   approved.
3. Do **not** change current permissions.
4. Do **not** rely on legacy flows as the long-term system.
5. Build v2 **independently and safely in parallel**.
6. Preserve legacy IDs, legacy URLs, and migration traceability.

## Checklist

### Legacy data & lists
- [ ] No write/update/delete call targets the legacy `Escalation Tracker` list.
- [ ] No write targets `Escalations Dept Leads` or `User Information List`.
- [ ] All legacy access uses **read-only** scopes / a read-only `LegacyReader`.
- [ ] No legacy list schema/columns/views were changed.

### Permissions & identity
- [ ] No SharePoint/site/list permission was changed.
- [ ] No sharing link, group membership, or role assignment was altered.
- [ ] Legacy Entra app registration untouched (v2 uses its own app/scopes).

### Flows & integrations
- [ ] No Power Automate flow was disabled, edited, or triggered as a side effect.
- [ ] No legacy webhook/integration was modified.

### Writes & traceability
- [ ] Any writes go to **v2 storage only**.
- [ ] `legacyItemId` and `legacyUrl` preserved on migrated records.
- [ ] Migration/transform decisions recorded in `migrationNotes` / activity.

### Scope confirmation
- [ ] This change does **not** declare v2 the official system / initiate cutover.
- [ ] This change does **not** restrict or decommission legacy.
- [ ] If any of the above are required → flagged as **BLOCKED pending Rod approval**.

## Sign-off
- Item: ____________________
- Verified by: ____________________   Date: __________
- Result: ☐ Pass  ☐ Blocked (reason: ____________________)
