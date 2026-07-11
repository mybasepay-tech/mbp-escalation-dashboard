# D6 — App Registration / Auth Plan (Escalation System v2)

> **Hands-on execution steps:** [`D6_ADMIN_EXECUTION_CHECKLIST.md`](./D6_ADMIN_EXECUTION_CHECKLIST.md)
> (~1 hour of admin work, with capture worksheet, post-execution validation, and rollback).
>
> **Status: ADMIN SETUP EXECUTED (Rodolfo, 2026-07-11) + APP-AUTH WIRED AND LIVE-VALIDATED
> (Loop 33).** The v2 non-production app registration exists with a certificate credential
> (no secrets), admin consent granted, and a single `write` site grant on the approved
> non-production test site (verified by listing the app's site permissions). Loop 33 wired
> committed app-auth modules (token provider + transport) behind the same fail-closed gates:
> the operator's git-ignored `auth.config.local.json` is the ONLY place real values live,
> tokens are minted app-only from the certificate held in the operator's certificate store,
> and **no operator token minting or interactive sign-in is required any more** for the
> SharePoint test path. One deviation from this plan, discovered at validation: consent was
> granted on the **Microsoft Graph** `Sites.Selected` application permission rather than the
> SharePoint-resource one — see §7 note (Graph api mode works end-to-end; the
> SharePoint-resource consent remains an optional follow-up for Hyperlink-column fidelity).

## 1. Problem
Live SharePoint test mode authenticates via an operator-minted, short-lived token from an
interactive PnP sign-in. It works, but it is slow, expires within ~1 hour, stalls when
unattended, and makes every live demo depend on one person's session. D6 is the decision
to replace this with a dedicated, least-privilege app identity.

## 2. Target model (decided by this plan, pending approval)
- **Dedicated Entra app registration** for Escalation v2 non-production work — never the
  legacy dashboard's app, never a shared identity.
- **Certificate-based app-only auth** (client credentials with certificate). **No client
  secrets, ever** — the committed validator refuses secret-style config keys outright.
- **`Sites.Selected` permission model** (SharePoint application permission): the app can
  access **only** the sites an admin explicitly grants — starting with exactly one grant,
  the approved non-production test site. Even a leaked certificate cannot reach the legacy
  tracker or any other site.
- **Local, git-ignored runtime config** referencing (never containing) the identity:
  tenant/client ids entered at runtime, certificate referenced by local file path.

## 3. What is already committed (safe, no identifiers)
- `src/v2/backend/sharepoint/live/d6AuthConfig.js` — fail-closed validation: disabled by
  default; enabling requires certificate mode + `Sites.Selected` + a non-production label +
  non-placeholder references; refuses secret keys, inline key/token material, and
  legacy/production-looking targets. Fully unit-tested (`tests/d6-auth-config.test.js`).
- `src/v2/backend/sharepoint/live/auth.config.example.json` — placeholder template; the
  real file is `auth.config.local.json` (covered by the existing `*.local.json` ignore).

## 4. Manual admin steps (require approval; nothing here is automated)
1. **Create the app registration** in Entra: single-tenant, no redirect URIs needed
   (app-only), name it clearly as the v2 NON-PRODUCTION app.
2. **API permission:** SharePoint → Application → `Sites.Selected`. Remove any default
   delegated Graph permissions. **Grant admin consent.**
3. **Certificate:** generate a key pair locally (admin machine), upload the PUBLIC cert to
   the app registration. The private key/PFX stays on the operator machine, outside git,
   referenced by path from the git-ignored config. No secret is created in the portal.
4. **Site grant:** using an admin tool, grant the app `write` on the ONE approved
   non-production test site (Graph `sites/{site-id}/permissions` or the PnP equivalent).
   Do NOT grant any other site. This single grant is the entire blast radius.
5. Record (outside git): tenant id, app/client id, cert thumbprint, expiry date, and the
   site grant — plus a renewal reminder for the certificate.

## 5. Wiring after admin setup (engineering, later loop)
1. Operator copies `auth.config.example.json` → `auth.config.local.json`, fills the
   references, sets `enableAppAuth: true`.
2. The (git-ignored) runtime transport consumes it **only** when
   `validateD6AuthConfig(...)` returns `ok && enabled` — otherwise it falls back to the
   current interactive flow and reports why.
3. Token acquisition becomes non-interactive (certificate assertion → app-only token for
   the SharePoint audience), removing demo-day minting entirely.
4. Re-run the live store contract (`run-live-contract.js`) under app auth as the
   acceptance gate before relying on it for demos.

## 6. Risks and mitigations
- **Over-permissioning** — mitigated by `Sites.Selected` + a single site grant; the
  validator refuses any other permission model.
- **Certificate leakage** — private key never enters git (ignore rules + guard tests);
  blast radius is the one test site; revoke = delete the app's cert in the portal.
- **Silent scope drift** — any additional site grant is an explicit admin action; document
  each grant in the decision log.
- **Config mistakes** — fail-closed validation refuses placeholders, secrets, inline key
  material, and production-looking values; disabled remains the default.

## 7. Validation checklist (executed 2026-07-11, Loop 33)
- [x] App registration exists, single-tenant, no secrets configured (certificate only).
- [x] `Sites.Selected` application permission, admin-consented; no other permissions.
      **Note:** consent landed on the **Microsoft Graph** resource's `Sites.Selected`
      (an app-only SharePoint-audience token carries no roles). App-auth therefore runs in
      **graph api mode**, which the Loop 33 transport supports end-to-end. Known platform
      limitation in that mode: Microsoft Graph cannot WRITE SharePoint Hyperlink columns
      (v2 uses two: the tickets' legacy-URL field and the attachments' file-URL field —
      both optional metadata). The committed transport fails closed on such writes by
      default; validation runs may explicitly opt into counted-and-reported omission.
      **Optional follow-up** for full column fidelity: also add + consent the
      SHAREPOINT-resource `Sites.Selected` application permission, then set
      `apiMode: "sharepoint-rest"` — the committed transport already implements that mode.
- [x] Exactly ONE site grant (the approved non-production test site), verified by listing
      the app's site permissions (`write`). Probes confirm other sites + the root site are
      refused (access denied) under the app token.
- [x] `auth.config.local.json` validates (`ok: true, enabled: true`) and is git-ignored
      (`*.local.json`); the certificate is referenced by CurrentUser store thumbprint —
      the private key never leaves the certificate store.
- [x] App-auth smoke passes (status, read-only access to all nine v2 lists, namespaced
      CRUD with zero leftovers) and the live store contract runs green under app auth
      (graph mode, hyperlink seed writes explicitly omitted-and-reported); legacy remains
      untouched.
- [ ] Decision log updated (D6 → executed) with the cert expiry/renewal owner
      (cert expires 2028-07; renewal owner: Rodolfo).

## 8. The ask
Approve: (a) creating the dedicated non-production app registration with certificate +
`Sites.Selected`, and (b) the single site grant to the approved test site. Estimated admin
effort: under an hour. Until approved, nothing changes and the current flow remains.
