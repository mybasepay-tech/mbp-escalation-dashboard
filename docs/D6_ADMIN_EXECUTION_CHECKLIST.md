# D6 Admin Execution Checklist (Loop 32)

> The hands-on companion to [`D6_AUTH_APP_REGISTRATION_PLAN.md`](./D6_AUTH_APP_REGISTRATION_PLAN.md).
> **Status: EXECUTED — admin setup completed manually by Rodolfo (2026-07-11); operator
> wiring + validation completed in Loop 33.** One deviation: the `Sites.Selected`
> application permission was consented on the **Microsoft Graph** resource rather than the
> SharePoint resource (§3 note below). Everything stays scoped to the **non-production
> v2 work**; the legacy tracker, its site, and its flows were never touched.
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
- [x] Entra admin center → App registrations → New registration.
- [x] Name: clearly non-production (v2 PreProd SharePoint app).
- [x] Supported account types: **single tenant**. No redirect URI (app-only).
- [x] Record privately: `<TENANT_ID>`, `<APP_CLIENT_ID>`.

## 3. Permissions (~10 min)
- [x] API permissions → Application → `Sites.Selected`. Nothing else.
      **Executed with a deviation:** consent was granted on **Microsoft Graph** →
      Application → `Sites.Selected` (not the SharePoint resource). Validated working
      end-to-end via Graph api mode. Consequence: an app-only SharePoint-REST-audience
      token carries no roles, and Microsoft Graph cannot write Hyperlink columns (a
      platform limitation affecting two optional metadata fields). **Optional follow-up:**
      also add + consent **SharePoint** → Application → `Sites.Selected` to unlock
      `apiMode: "sharepoint-rest"` (already implemented in the committed transport).
- [x] Remove any default delegated permission (e.g. Graph `User.Read`) so the app carries
      exactly one permission.
- [x] **Grant admin consent** for the tenant.
- [x] Verify the permissions list shows ONLY `Sites.Selected (Application)` — consented.

## 4. Certificate credential (~15 min)
- [x] Generate a key pair LOCALLY on the operator/admin machine (never in the portal):
      self-signed cert generated into the operator's CurrentUser certificate store
      (2-year validity, expires 2028-07). The private key never leaves the store — no
      PFX/PEM export is needed (Loop 33's provider signs via the store).
- [x] Upload the PUBLIC certificate (.cer) to the app registration → Certificates & secrets.
- [x] **Create NO client secret** — certificate only (the committed validator refuses
      secret-style config outright).
- [x] Record privately: `<CERT_THUMBPRINT>` (referenced from the git-ignored config as a
      certificate-store ref), expiry date, renewal owner (Rodolfo).

## 5. Single-site grant (~10 min)
- [x] Grant the app `write` on the ONE approved non-production test site — executed via
      `Grant-PnPAzureADAppSitePermission` (delegated PnP admin utility connection).
- [x] Verify by LISTING the app's site permissions: `Get-PnPAzureADAppSitePermission`
      returned `Roles: {write}` for the v2 app on exactly that site.
- [x] Explicitly confirm: no grant on any other site, and nothing on the legacy site.
      Loop 33 probes additionally confirmed access to any OTHER site (including the root
      site) is refused under the app token.

## 6. Capture worksheet (record OUTSIDE git; placeholders shown)
| Item | Value (private) |
|---|---|
| Tenant id | `<TENANT_ID>` |
| App (client) id | `<APP_CLIENT_ID>` |
| Cert thumbprint | `<CERT_THUMBPRINT>` |
| Cert expiry / renewal owner | `<DATE>` / `<NAME>` |
| Granted site | `<TEST_SITE_REFERENCE>` |
| Grant verified on (date) | `<DATE>` |

## 7. Operator wiring + validation (engineering — executed in Loop 33)
- [x] Copy `src/v2/backend/sharepoint/live/auth.config.example.json` →
      `auth.config.local.json` (git-ignored via `*.local.json`); fill references; set
      `enableAppAuth: true`. The certificate is referenced by CurrentUser store thumbprint.
- [x] Config passes the fail-closed validator (`d6AuthConfig.js` → `ok: true, enabled: true`).
- [x] The COMMITTED app-auth modules (`appAuthTokenProvider.js` + `appAuthTransport.js`,
      identifier-free) acquire an app-only token via the certificate — **no interactive
      sign-in, no operator token minting**. The old operator transport path remains
      available as the documented rollback (`enableAppAuth: false`).
- [x] `node run-appauth-smoke.js` passes under app auth: status, read-only access to all
      nine v2 lists, namespaced CRUD (`esc_d6_loop33_*`) with zero leftovers.
- [x] `node run-testsite-contract.js` smoke passes under app auth.
- [x] `node run-live-contract.js` — full store contract green under app auth (graph api
      mode; the two optional Hyperlink metadata fields are omitted-and-reported in that
      mode — see §3 note and the plan's §7).
- [ ] UI SharePoint test mode works with the banner and without a pre-minted token
      (wired — the status endpoint reports `authMode: app-auth-certificate`; verify at the
      next supervised UI session).
- [x] Confirm zero access outside the granted site (another site + the root site were
      probed read-only and refused under the app token).
- [x] Legacy untouched throughout (no legacy site permission exists to begin with).

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
