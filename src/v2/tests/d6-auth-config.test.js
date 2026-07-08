// D6 auth-config validation tests (Loop 26) — the fail-closed contract for the FUTURE
// app-registration auth config. No auth is performed; no identifiers exist here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateD6AuthConfig, D6_AUTH_MODES } from '../backend/sharepoint/live/d6AuthConfig.js';

const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EXAMPLE = join(V2_ROOT, 'backend', 'sharepoint', 'live', 'auth.config.example.json');

const validEnabled = () => ({
  enableAppAuth: true,
  authMode: 'app-certificate',
  environmentLabel: 'nonprod-test',
  tenantIdRef: 'runtime-tenant-ref',
  clientIdRef: 'runtime-client-ref',
  certificateRef: 'local-cert.pfx',
  // NOTE: the scope check is a strict substring refusal, so even 'nonprod' would trip on
  // 'prod' — deliberately fail-closed. Use a token-free reference, as real configs must.
  siteScopeRef: 'approved-team-testsite',
  permissionModel: 'Sites.Selected',
});

test('the committed example is DISABLED, placeholder-only, and valid as a disabled config', () => {
  const example = JSON.parse(readFileSync(EXAMPLE, 'utf8'));
  assert.equal(example.enableAppAuth, false, 'example must be fail-closed');
  const res = validateD6AuthConfig(example);
  assert.equal(res.enabled, false);
  assert.equal(res.ok, true, `disabled example must validate: ${res.problems.join('; ')}`);
  // And it must contain no real-looking identifiers.
  const raw = readFileSync(EXAMPLE, 'utf8');
  assert.doesNotMatch(raw, /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, 'no GUIDs');
  assert.doesNotMatch(raw, /https?:\/\//i, 'no URLs');
});

test('disabled is the valid default; enabling with placeholders is refused', () => {
  assert.equal(validateD6AuthConfig({ enableAppAuth: false }).ok, true);
  const res = validateD6AuthConfig({ ...validEnabled(), tenantIdRef: '<TENANT_ID_PLACEHOLDER>' });
  assert.equal(res.ok, false);
  assert.ok(res.problems.some((p) => /placeholder/i.test(p)));
});

test('a fully-referenced non-production certificate config validates as enabled', () => {
  const res = validateD6AuthConfig(validEnabled());
  assert.deepEqual(res, { ok: true, enabled: true, problems: [] });
});

test('enabling requires every reference, the certificate mode, and Sites.Selected', () => {
  for (const missing of ['tenantIdRef', 'clientIdRef', 'certificateRef', 'siteScopeRef']) {
    const cfg = validEnabled(); delete cfg[missing];
    const res = validateD6AuthConfig(cfg);
    assert.equal(res.ok, false, `${missing} must be required`);
  }
  assert.equal(validateD6AuthConfig({ ...validEnabled(), authMode: 'device-code' }).ok, false);
  assert.equal(validateD6AuthConfig({ ...validEnabled(), permissionModel: 'Sites.FullControl.All' }).ok, false);
  assert.deepEqual(D6_AUTH_MODES, ['app-certificate'], 'certificate-only by design');
});

test('production/legacy-looking values are refused', () => {
  assert.equal(validateD6AuthConfig({ ...validEnabled(), environmentLabel: 'production' }).ok, false);
  assert.equal(validateD6AuthConfig({ ...validEnabled(), siteScopeRef: 'legacy-escalation-tracker' }).ok, false);
  assert.equal(validateD6AuthConfig({ ...validEnabled(), siteScopeRef: 'company-prod-site' }).ok, false);
});

test('secret-style keys and inline key material are refused — even when disabled', () => {
  const secretKey = { enableAppAuth: false, ['client' + 'Secret']: 'x' };
  const res = validateD6AuthConfig(secretKey);
  assert.equal(res.ok, false);
  assert.ok(res.problems.some((p) => /certificate-based/.test(p)));

  const inlinePem = { enableAppAuth: false, note: '-----BEGIN PRIVATE KEY----- abc' };
  assert.equal(validateD6AuthConfig(inlinePem).ok, false);

  const inlineJwt = { enableAppAuth: false, note: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ' };
  assert.equal(validateD6AuthConfig(inlineJwt).ok, false);
});

test('non-object configs are refused', () => {
  for (const bad of [null, [], 'x', 42]) {
    assert.equal(validateD6AuthConfig(bad).ok, false);
  }
});
