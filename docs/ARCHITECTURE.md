# Architecture — Escalation System v2

> Planning scaffold. No production system is modified by this document.

## 1. Guiding principles
- **Parallel + safe:** v2 is built alongside the live legacy tracker. Legacy stays live
  and untouched until an explicitly approved cutover.
- **Cloud/API-ready:** SharePoint may serve as a *temporary* v2 backend, but the app talks
  to a thin **data-access layer (DAL)**, never to SharePoint directly from UI code. The
  backend can be swapped (e.g. to a managed DB + API) without UI rewrites.
- **Official UX:** the app/UI becomes the system of record's front door so users no longer
  edit Microsoft Lists by hand.
- **Generic-now, configurable-later:** department behavior is data-driven (settings),
  not hardcoded.

## 2. High-level shape

```
┌──────────────┐     ┌───────────────────┐     ┌────────────────────────┐
│  v2 Web App  │────▶│  Data Access Layer │────▶│  v2 Backend (pluggable) │
│  (UI/views)  │     │  (interface/ports) │     │  - SharePoint (temp)    │
└──────────────┘     └───────────────────┘     │  - Cloud DB + API (tgt) │
                              │                  └────────────────────────┘
                              │ read-only, one-time
                              ▼
                     ┌───────────────────┐
                     │  Legacy Tracker    │  (SharePoint List, LIVE)
                     │  READ-ONLY source  │  no writes, ever
                     └───────────────────┘
```

## 3. Layers

### 3.1 UI / presentation
- Views: Department Queue panel, My Assigned Tickets, Ticket detail, Intake form,
  Reporting.
- Knows nothing about the storage backend — consumes the DAL's typed models.
- Generic department panel renders from an `EscalationSettings` config object.

### 3.2 Data Access Layer (the seam that makes us API-ready)
- A single interface (`EscalationStore`) with methods like `listTickets(filter)`,
  `getTicket(id)`, `createTicket()`, `updateTicket()`, `addComment()`, `addActivity()`,
  `listTeams()`, `getSettings(dept)`.
- Two implementations planned:
  - `SharePointStore` (temporary backend, via Microsoft Graph).
  - `ApiStore` (target: REST/GraphQL over a managed DB).
- Migration uses a **separate** read-only `LegacyReader` (never the writable store).

### 3.3 Backend options
- **Temporary:** new SharePoint lists dedicated to v2 (see `DATA_MODEL.md` storage list).
  These are **new** lists — not the legacy "Escalation Tracker".
- **Target:** cloud DB (e.g. Postgres/Cosmos) behind an API; Graph/SharePoint dropped.

## 4. Legacy system (as-is, for reference only)
- Frontend: [`escalation-dashboard.html`](../escalation-dashboard.html) — single file,
  MSAL + Microsoft Graph, hosted under
  `mybasepaycom.sharepoint.com/sites/escalations/SiteAssets/`.
- Backend lists (Teri's OneDrive site `mybasepaycom-my.sharepoint.com`):
  - `Escalation Tracker` (main data)
  - `Escalations Dept Leads`
  - `User Information List`
- Auth: Entra app (clientId `c1b03319-…`), Graph scopes `Sites.Read.All`,
  `Sites.ReadWrite.All`, `User.Read`; AI features via an Azure Function.
- **v2 treats all of the above as read-only legacy.** No v2 component writes to it.

## 5. Auth (v2)
- Reuse Entra/MSAL identity for SSO. v2 may register its **own** Entra app + scopes so
  legacy and v2 permissions stay independent (do not alter the legacy app registration).
- Identity → role mapping drives access (see
  [`ROLES_AND_PERMISSIONS.md`](./ROLES_AND_PERMISSIONS.md)).

## 6. Environments
- `local` — demo/mock store, no live data (mirrors today's `file://` demo mode).
- `dev/v2` — v2 SharePoint lists or dev API; isolated from legacy.
- `prod/v2` — only after approved cutover.

## 7. Key decisions deferred
- Final target backend (managed DB vs. continued SharePoint).
- Notification mechanism (replacing legacy Power Automate flows).
- Hosting for the v2 app (SharePoint SiteAssets vs. dedicated static host/SPA).

See [`RISKS_AND_OPEN_QUESTIONS.md`](./RISKS_AND_OPEN_QUESTIONS.md).
