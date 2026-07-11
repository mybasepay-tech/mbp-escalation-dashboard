# D6 — App Registration / Auth Plan (Escalation System v2)

> **Hands-on execution steps:** [`D6_ADMIN_EXECUTION_CHECKLIST.md`](./D6_ADMIN_EXECUTION_CHECKLIST.md)
> (~1 hour of admin work, with capture worksheet, post-execution validation, and rollback).
>
> **Status: READY FOR APPROVAL + ADMIN SETUP — not complete.** Nothing in this plan has
> been executed against Entra/Azure. The committed code contains the fail-closed
> validation contract and placeholder templates only; the registration itself is a manual,
> admin-approved step. Until it lands, live test mode keeps the current (working but
> operator-dependent) interactive token flow, which remains a documented limitation.

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

## 7. Validation checklist (when executed)
- [ ] App registration exists, single-tenant, no secrets configured (certificate only).
- [ ] `Sites.Selected` application permission, admin-consented; no other permissions.
- [ ] Exactly ONE site grant (the approved non-production test site), verified by listing
      the app's site permissions.
- [ ] `auth.config.local.json` validates (`ok: true, enabled: true`) and is git-ignored.
- [ ] Live store contract passes under app auth; legacy remains untouched.
- [ ] Decision log updated (D6 → executed) with the cert expiry/renewal owner.

## 8. The ask
Approve: (a) creating the dedicated non-production app registration with certificate +
`Sites.Selected`, and (b) the single site grant to the approved test site. Estimated admin
effort: under an hour. Until approved, nothing changes and the current flow remains.
