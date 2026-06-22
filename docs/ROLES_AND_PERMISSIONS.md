# Roles & Permissions — Escalation System v2

> Planning scaffold. **Does not change any current permission.** Legacy SharePoint
> permissions remain exactly as they are. v2 access is defined independently.

## 1. Principle
v2 manages its own authorization, mapped from Entra identity. We do **not** alter the
legacy Entra app registration, legacy list permissions, or SharePoint sharing. (Hard rule
#3: do not change current permissions.)

## 2. Roles (MVP)

| Role | Capabilities |
|------|--------------|
| **Submitter** | Create escalations; view own; comment on own. |
| **Member** | View own department queue; work tickets assigned to them; update status within allowed transitions; comment; add activity. |
| **Lead** | All Member rights for their department(s); triage unassigned; assign/reassign to people; set priority; manage department tags; view all department tickets. |
| **Admin** | Manage `EscalationTeams`, `EscalationSettings`, tags catalog; run migration (dry-run + apply to v2 only); cross-department visibility. |
| **Viewer/Reporting** | Read-only across permitted scope; export/report. |

Roles are additive; a person may be Member of one department and Lead of another.

## 3. Permission matrix (MVP, generic)

| Action | Submitter | Member | Lead | Admin | Viewer |
|--------|:--:|:--:|:--:|:--:|:--:|
| Create ticket | ✓ | ✓ | ✓ | ✓ | – |
| View own tickets | ✓ | ✓ | ✓ | ✓ | ✓ |
| View dept queue | – | ✓ (own dept) | ✓ (own dept) | ✓ (all) | ✓ (scope) |
| Assign to person | – | – | ✓ | ✓ | – |
| Change status | own | assigned | dept | all | – |
| Comment | own | dept | dept | all | – |
| Edit settings/teams | – | – | – | ✓ | – |
| Run migration (v2 only) | – | – | – | ✓ | – |
| Export/report | – | ✓ | ✓ | ✓ | ✓ |

## 4. Visibility rules
- A ticket assigned to a person is visible **both** in that person's "My Assigned Tickets"
  **and** in the department queue (product req #6).
- Cross-department visibility is Admin-only in MVP (configurable later via routing rules).

## 5. Identity source
- Entra/MSAL SSO. v2 may register a **separate** Entra app so its scopes/permissions are
  independent of the legacy app (see [`ARCHITECTURE.md`](./ARCHITECTURE.md) §5).
- Person ↔ department membership comes from `EscalationTeams`, seeded from the legacy
  "Escalations Dept Leads" + "User Information List" during migration (read-only copy).

## 6. Future (designed-for, not MVP)
- Department-specific role definitions and required-field/quick-action gating via
  `EscalationSettings`.
- Granular field-level permissions.
- Delegation / backup-lead coverage windows.
