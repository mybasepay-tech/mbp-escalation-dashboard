# D6 Admin Execution Checklist (Loop 32)

> The hands-on companion to [`D6_AUTH_APP_REGISTRATION_PLAN.md`](./D6_AUTH_APP_REGISTRATION_PLAN.md).
> **Status: awaiting admin execution — nothing here has been run.** Estimated effort:
> ~1 hour for an Entra + SharePoint admin. Everything stays scoped to the **non-production
> v2 work**; the legacy tracker, its site, and its flows are never touched.
>
> ⚠️ Values captured during execution (tenant id, app id, thumbprint, site id) are runtime
> facts for the operator's GIT-IGNORED config only. **None of them may ever be committed** —
> this checklist deliberately uses `<PLACEHOLDERS>`.

## 1. Prerequisites
- [ ] Entra role able to create app registrations + grant admin consent.
- [ ] SharePoint admin able to grant `Sites.Selected` site permission.
- [ ] The approved non-production test-site URL at hand (operator knows it; not written here).
- [ ] A workstation with OpenSSL/PowerShell for certificate generation.

## 2. Create the app registration (~10 min)
- [ ] Entra admin center → App registrations → New registration.
- [ ] Name: clearly non-production, e.g. `Escalations-v2-NONPROD-app-auth`.
- [ ] Supported account types: **single tenant**. No redirect URI (app-only).
- [ ] Record privately: `<TENANT_ID>`, `<APP_CLIENT_ID>`.

## 3. Permissions (~10 min)
- [ ] API permissions → Add → **SharePoint** → **Application** → `Sites.Selected`. Nothing else.
- [ ] Remove any default delegated permission (e.g. Graph `User.Read`) so the app carries
      exactly one permission.
- [ ] **Grant admin consent** for the tenant.
- [ ] Verify the permissions list shows ONLY `Sites.Selected (Application)` — consented.

## 4. Certificate credential (~15 min)
- [ ] Generate a key pair LOCALLY on the operator/admin machine (never in the portal):
      self-signed cert, 1-year validity suggested, exportable private key kept local.
- [ ] Upload the PUBLIC certificate (.cer) to the app registration → Certificates & secrets.
- [ ] **Create NO client secret** — certificate only (the committed validator refuses
      secret-style config outright).
- [ ] Record privately: `<CERT_THUMBPRINT>`, local path to the private key/PFX, expiry date,
      renewal owner.

## 5. Single-site grant (~10 min)
- [ ] Grant the app `write` on the ONE approved non-production test site — via Graph
      `POST /sites/<SITE_ID>/permissions` or `Grant-PnPAzureADAppSitePermission`.
- [ ] Verify by LISTING the app's site permissions: exactly one site appears.
- [ ] Explicitly confirm: no grant on any other site, and nothing on the legacy site.

## 6. Capture worksheet (record OUTSIDE git; placeholders shown)
| Item | Value (private) |
|---|---|
| Tenant id | `<TENANT_ID>` |
| App (client) id | `<APP_CLIENT_ID>` |
| Cert thumbprint | `<CERT_THUMBPRINT>` |
| Cert expiry / renewal owner | `<DATE>` / `<NAME>` |
| Granted site | `<TEST_SITE_REFERENCE>` |
| Grant verified on (date) | `<DATE>` |

## 7. Operator wiring + validation (engineering, after admin steps)
- [ ] Copy `src/v2/backend/sharepoint/live/auth.config.example.json` →
      `auth.config.local.json` (git-ignored via `*.local.json`); fill references; set
      `enableAppAuth: true`.
- [ ] Config passes the fail-closed validator (`d6AuthConfig.js` → `ok: true, enabled: true`).
- [ ] The runtime transport (git-ignored) acquires an app-only token via the certificate —
      **no interactive sign-in, no operator token minting**.
- [ ] `node run-testsite-contract.js` smoke passes under app auth.
- [ ] `node run-live-contract.js` — full store contract green under app auth (the
      acceptance re-run).
- [ ] UI SharePoint test mode works with the banner and without a pre-minted token.
- [ ] Confirm zero access outside the granted site (attempt on another site must 403 —
      read-only probe).
- [ ] Legacy untouched throughout (no legacy site permission exists to begin with).

## 8. Rollback / deactivation (any time, ~5 min)
- [ ] Set `enableAppAuth: false` (or delete `auth.config.local.json`) — v2 immediately
      falls back to the current interactive test mode (or stays fully mock).
- [ ] Revoke the site permission (delete the app's permission on the test site).
- [ ] Remove the certificate credential from the app registration (or delete the app
      registration entirely).
- [ ] Destroy the local private key if no longer needed.
- [ ] Record the rollback in the decision log.

## 9. Definition of done
All of §2–§5 executed and §6 captured privately; §7 fully green including the live-contract
re-run; D6 marked **executed** in the decision log with cert expiry + renewal owner noted.
Until then, D6 remains "ready for approval/admin setup" and the operator-token limitation
stands (documented in the stakeholder walkthrough).
