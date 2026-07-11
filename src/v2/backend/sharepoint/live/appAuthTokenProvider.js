// appAuthTokenProvider.js — D6 app-only certificate auth (Loop 33). COMMITTED, identifier-free.
//
// Acquires app-only access tokens for the v2 SharePoint TEST/pre-production path using the
// D6 app registration's CERTIFICATE credential. Replaces operator token minting: no
// interactive sign-in, no pre-minted token file, no client secret — the OAuth2
// client-credentials flow with a signed JWT client assertion (RFC 7523).
//
// Security posture:
//   * This file holds NO tenant id, client id, thumbprint, URL, secret, or token. Everything
//     comes from the operator's GIT-IGNORED auth.config.local.json, validated fail-closed by
//     d6AuthConfig.js (certificate mode only, Sites.Selected, non-production target).
//   * The private key NEVER leaves the Windows certificate store (CurrentUser/My). Signing is
//     delegated to a short PowerShell invocation that calls RSA SignData on the store-held
//     key; only the signature (not the key) crosses the process boundary. Nothing is
//     exported to disk; no PFX/PEM file is read or written.
//   * Tokens are cached IN MEMORY only (per audience, with expiry headroom) — no token cache
//     file, nothing logged. Error messages are sanitized (GUIDs/URLs/JWTs redacted) before
//     they can propagate toward logs or the browser.
//   * FAIL-CLOSED: refuses any config that does not validate as `ok && enabled`, and refuses
//     certificate references that are not CurrentUser/My store thumbprint refs.

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { validateD6AuthConfig, parseCertificateStoreRef } from './d6AuthConfig.js';

const AAD_HOST = 'login.microsoftonline.com';
const GRAPH_SCOPE = 'https://graph.microsoft.com/.default';

/** Redact anything identifying/secret-shaped from an error message (defense in depth). */
export function sanitizeAuthError(message) {
  return String(message ?? '')
    .replace(/eyJ[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]+)*/g, '[redacted-token]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[redacted-id]')
    .replace(/\b[0-9A-Fa-f]{40}\b/g, '[redacted-thumbprint]')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]');
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** Decode a JWT payload WITHOUT verification — local inspection only (roles/aud/exp). */
export function decodeJwtPayload(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length < 2) throw new Error('not a JWT');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

// Default signer: sign SHA-256/PKCS1 with the store-held private key via PowerShell.
// The signing INPUT is the public JWT header.payload (not secret); only the signature
// returns on stdout. The key material itself is never read, exported, or printed.
function signWithWindowsCertStore({ thumbprint }, dataB64) {
  const script = [
    `$ErrorActionPreference='Stop'`,
    `$cert = Get-Item "Cert:\\CurrentUser\\My\\${thumbprint}"`,
    `if (-not $cert.HasPrivateKey) { throw 'certificate found but has no private key' }`,
    `$rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)`,
    `if (-not $rsa) { throw 'certificate private key is not RSA-accessible' }`,
    `$sig = $rsa.SignData([Convert]::FromBase64String('${dataB64}'), [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)`,
    `[Convert]::ToBase64String($sig)`,
  ].join('; ');
  const out = execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', timeout: 60000, windowsHide: true,
  });
  const sig = out.trim().split(/\r?\n/).pop().trim();
  if (!/^[A-Za-z0-9+/]+=*$/.test(sig)) throw new Error('certificate-store signing returned no signature');
  return Buffer.from(sig, 'base64');
}

/**
 * Create an app-only token provider from a VALIDATED D6 auth config.
 *
 * @param {object} authCfg  parsed auth.config.local.json (git-ignored; caller loads it)
 * @param {object} [deps]   injectable for tests: { sign(certRef, dataB64) -> Buffer,
 *                          fetchImpl, now() -> ms }
 * @returns {{ getToken(audience: 'sharepoint'|'graph') -> Promise<string>,
 *             describe() -> object }}  describe() returns ONLY safe metadata.
 */
export function createAppAuthTokenProvider(authCfg, deps = {}) {
  const res = validateD6AuthConfig(authCfg);
  if (!res.ok || !res.enabled) {
    throw new Error(
      'app-auth REFUSED (fail-closed): config did not validate as enabled. Problems: ' +
      sanitizeAuthError(res.problems.join('; ') || 'enableAppAuth is not true'));
  }
  const certRef = parseCertificateStoreRef(authCfg.certificateRef);
  if (!certRef) {
    throw new Error("app-auth REFUSED: this provider requires a 'store:CurrentUser/My/<thumbprint>' certificate reference — the private key must stay in the certificate store (never a key file).");
  }

  const tenantId = String(authCfg.tenantIdRef);
  const clientId = String(authCfg.clientIdRef);
  const siteHost = new URL(String(authCfg.siteScopeRef)).host;
  const sign = deps.sign ?? signWithWindowsCertStore;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => Date.now());

  // x5t = base64url of the raw SHA-1 thumbprint bytes (JWT cert-binding header).
  const x5t = b64url(Buffer.from(certRef.thumbprint, 'hex'));
  const tokenEndpoint = `https://${AAD_HOST}/${tenantId}/oauth2/v2.0/token`;

  function buildAssertion() {
    const nowSec = Math.floor(now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', x5t }));
    const payload = b64url(JSON.stringify({
      aud: tokenEndpoint, iss: clientId, sub: clientId,
      jti: randomUUID(), nbf: nowSec - 60, exp: nowSec + 600,
    }));
    const signingInput = `${header}.${payload}`;
    const signature = sign(certRef, Buffer.from(signingInput, 'utf8').toString('base64'));
    return `${signingInput}.${b64url(signature)}`;
  }

  // In-memory cache only — never written to disk, never logged.
  const cache = new Map(); // audience -> { token, expMs }

  async function getToken(audience = 'sharepoint', { forceRefresh = false } = {}) {
    const scope = audience === 'graph' ? GRAPH_SCOPE : `https://${siteHost}/.default`;
    const hit = forceRefresh ? null : cache.get(audience);
    if (hit && hit.expMs > now() + 300000) return hit.token; // 5-min headroom

    let assertion;
    try {
      assertion = buildAssertion();
    } catch (e) {
      throw new Error(`app-auth certificate signing failed (cert lookup/signature): ${sanitizeAuthError(e.message)}`);
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      scope,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
    });
    let resToken;
    try {
      resToken = await fetchImpl(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch (e) {
      throw new Error(`app-auth token request failed (network): ${sanitizeAuthError(e.message)}`);
    }
    const data = await resToken.json().catch(() => ({}));
    if (!resToken.ok || !data.access_token) {
      throw new Error(
        `app-auth token acquisition REFUSED by the identity platform (${resToken.status} ` +
        `${sanitizeAuthError(data.error ?? '')}): ${sanitizeAuthError(data.error_description ?? 'no detail')}`);
    }
    const expMs = now() + Math.max(60, Number(data.expires_in ?? 3600) - 60) * 1000;
    cache.set(audience, { token: data.access_token, expMs });
    return data.access_token;
  }

  return {
    getToken,
    /** Safe metadata ONLY — no tenant/client id, thumbprint, URL, or token. */
    describe() {
      return {
        authMode: 'app-certificate',
        permissionModel: String(authCfg.permissionModel),
        environmentLabel: String(authCfg.environmentLabel),
        certificateSource: 'windows-certificate-store',
      };
    },
  };
}

export default createAppAuthTokenProvider;
