// D6 app-auth runtime tests (Loop 33) — token provider + transport, 100% LOCAL.
//
// Everything here runs with INJECTED signing and fetch fakes: no network, no certificate
// store, no real identifier. Values that look like identifiers below are OBVIOUSLY FAKE
// test fixtures (repeating hex, .invalid hosts) confined to this test file.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAppAuthTokenProvider, sanitizeAuthError, decodeJwtPayload,
} from '../backend/sharepoint/live/appAuthTokenProvider.js';
import {
  createAppAuthTransport, APP_AUTH_API_MODES, HYPERLINK_BEHAVIORS,
} from '../backend/sharepoint/live/appAuthTransport.js';
import { validateD6AuthConfig, parseCertificateStoreRef } from '../backend/sharepoint/live/d6AuthConfig.js';
import { NotFoundError, ConflictError, ThrottledError } from '../backend/sharepoint/live/SharePointLiveErrors.js';

// ---------- fixtures (clearly fake; tests dir is excluded from live-marker scans) ----------
const FAKE_THUMB = 'A'.repeat(40);
const fakeCfg = (over = {}) => ({
  enableAppAuth: true,
  authMode: 'app-certificate',
  environmentLabel: 'nonprod-test',
  tenantIdRef: 'fake-tenant-ref-not-real',
  clientIdRef: 'fake-client-ref-not-real',
  certificateRef: `store:CurrentUser/My/${FAKE_THUMB}`,
  siteScopeRef: 'https://unit-test.example.invalid/sites/faketestsite',
  permissionModel: 'Sites.Selected',
  ...over,
});

const okTokenResponse = (token = 'eyJfake.eyJmYWtlIjoxfQ.sig', expires = 3600) => ({
  ok: true, status: 200,
  json: async () => ({ access_token: token, expires_in: expires }),
});

function fakeSign() { return Buffer.from('fake-signature'); }

// ============================== validator extensions (Workstream A) ==============================

test('validator: certificate-store refs parse only as exact CurrentUser/My + 40-hex thumbprint', () => {
  const good = parseCertificateStoreRef(`store:CurrentUser/My/${FAKE_THUMB}`);
  assert.deepEqual(good, { storeLocation: 'CurrentUser', storeName: 'My', thumbprint: FAKE_THUMB });
  assert.equal(parseCertificateStoreRef(`store:CurrentUser\\My\\${FAKE_THUMB}`)?.thumbprint, FAKE_THUMB, 'backslashes accepted');
  for (const bad of [
    `store:LocalMachine/My/${FAKE_THUMB}`, // machine store refused
    'store:CurrentUser/My/', // missing thumbprint
    'store:CurrentUser/My/ABC123', // short thumbprint
    `store:CurrentUser/Root/${FAKE_THUMB}`, // wrong store name
    'local-cert.pfx', // not a store ref at all
    null, undefined, '',
  ]) {
    assert.equal(parseCertificateStoreRef(bad), null, `must reject ${JSON.stringify(bad)}`);
  }
});

test('validator: an enabled config with a malformed store ref is refused (missing thumbprint rejected)', () => {
  for (const certificateRef of [
    'store:CurrentUser/My/', 'store:CurrentUser/My/TOO-SHORT',
    `store:LocalMachine/My/${FAKE_THUMB}`,
  ]) {
    const res = validateD6AuthConfig(fakeCfg({ certificateRef }));
    assert.equal(res.ok, false, `${certificateRef} must be refused`);
    assert.ok(res.problems.some((p) => /thumbprint|CurrentUser/i.test(p)));
  }
  // A well-formed store ref (or the legacy file reference) still validates.
  assert.equal(validateD6AuthConfig(fakeCfg()).ok, true);
});

test('validator: apiMode and graphHyperlinkWriteBehavior are validated strictly when present', () => {
  assert.equal(validateD6AuthConfig(fakeCfg({ apiMode: 'graph' })).ok, true);
  assert.equal(validateD6AuthConfig(fakeCfg({ apiMode: 'sharepoint-rest' })).ok, true);
  assert.equal(validateD6AuthConfig(fakeCfg({ apiMode: 'rest-of-the-world' })).ok, false);
  assert.equal(validateD6AuthConfig(fakeCfg({ graphHyperlinkWriteBehavior: 'refuse' })).ok, true);
  assert.equal(validateD6AuthConfig(fakeCfg({ graphHyperlinkWriteBehavior: 'omit-and-report' })).ok, true);
  assert.equal(validateD6AuthConfig(fakeCfg({ graphHyperlinkWriteBehavior: 'silently-drop' })).ok, false);
});

// ============================== token provider (Workstream B) ==============================

test('provider: refuses disabled, invalid, placeholder, and non-store-ref configs (fail-closed)', () => {
  assert.throws(() => createAppAuthTokenProvider({ enableAppAuth: false }), /REFUSED/);
  assert.throws(() => createAppAuthTokenProvider(fakeCfg({ tenantIdRef: '<TENANT_ID_PLACEHOLDER>' })), /REFUSED/);
  assert.throws(() => createAppAuthTokenProvider(fakeCfg({ authMode: 'client-secret' })), /REFUSED/);
  // A file-path certificateRef passes the generic validator but THIS provider requires the
  // private key to stay in the certificate store.
  assert.throws(() => createAppAuthTokenProvider(fakeCfg({ certificateRef: 'local-cert.pfx' })), /certificate store|store:CurrentUser/i);
});

test('provider: mints an app-only token via a signed JWT client assertion (no client secret anywhere)', async () => {
  const fetches = [];
  const provider = createAppAuthTokenProvider(fakeCfg(), {
    sign: fakeSign,
    fetchImpl: async (url, opts) => { fetches.push({ url, opts }); return okTokenResponse(); },
    now: () => 1_750_000_000_000,
  });

  const token = await provider.getToken('sharepoint');
  assert.equal(token, 'eyJfake.eyJmYWtlIjoxfQ.sig');
  assert.equal(fetches.length, 1);
  assert.match(fetches[0].url, /^https:\/\/login\.microsoftonline\.com\/fake-tenant-ref-not-real\/oauth2\/v2\.0\/token$/);

  const body = new URLSearchParams(fetches[0].opts.body);
  assert.equal(body.get('grant_type'), 'client_credentials');
  assert.equal(body.get('client_assertion_type'), 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
  assert.equal(body.get('client_id'), 'fake-client-ref-not-real');
  assert.equal(body.get('scope'), 'https://unit-test.example.invalid/.default', 'sharepoint audience = site host .default');
  assert.equal(body.get('client_secret'), null, 'no client secret — certificate assertion only');

  // The assertion is a real 3-part JWT: header carries RS256 + x5t (thumbprint bytes,
  // base64url); payload aud/iss/sub are the token endpoint + client ref.
  const assertion = body.get('client_assertion');
  const [h] = assertion.split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
  assert.equal(header.alg, 'RS256');
  assert.equal(header.x5t, Buffer.from(FAKE_THUMB, 'hex').toString('base64url'));
  const payload = decodeJwtPayload(assertion);
  assert.equal(payload.iss, 'fake-client-ref-not-real');
  assert.equal(payload.sub, 'fake-client-ref-not-real');
  assert.match(payload.aud, /login\.microsoftonline\.com/);
  assert.ok(payload.exp > payload.nbf, 'assertion carries a validity window');

  // graph audience swaps only the scope
  await provider.getToken('graph');
  const body2 = new URLSearchParams(fetches[1].opts.body);
  assert.equal(body2.get('scope'), 'https://graph.microsoft.com/.default');
});

test('provider: caches per audience in memory; forceRefresh re-mints', async () => {
  let calls = 0;
  const provider = createAppAuthTokenProvider(fakeCfg(), {
    sign: fakeSign,
    fetchImpl: async () => { calls += 1; return okTokenResponse(); },
    now: () => 1_750_000_000_000,
  });
  await provider.getToken('graph');
  await provider.getToken('graph');
  assert.equal(calls, 1, 'second call is served from the in-memory cache');
  await provider.getToken('graph', { forceRefresh: true });
  assert.equal(calls, 2, 'forceRefresh bypasses the cache');
});

test('provider: identity-platform failures throw SANITIZED errors (no GUID/URL/token can escape)', async () => {
  const provider = createAppAuthTokenProvider(fakeCfg(), {
    sign: fakeSign,
    fetchImpl: async () => ({
      ok: false, status: 401,
      json: async () => ({
        error: 'invalid_client',
        error_description: 'AADSTS700016: app 12345678-abcd-4ef0-9876-1234567890ab not found; see https://login.microsoftonline.com/error?code=700016 token eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ.x',
      }),
    }),
  });
  await assert.rejects(() => provider.getToken('graph'), (e) => {
    assert.match(e.message, /REFUSED|401/i, 'failure stays visible');
    assert.doesNotMatch(e.message, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, 'no GUID');
    assert.doesNotMatch(e.message, /https?:\/\//, 'no URL');
    assert.doesNotMatch(e.message, /eyJ[A-Za-z0-9_-]{10,}/, 'no token material');
    return true;
  });
});

test('provider: describe() returns fixed-vocabulary metadata only — never an identifier', () => {
  const provider = createAppAuthTokenProvider(fakeCfg(), { sign: fakeSign, fetchImpl: async () => okTokenResponse() });
  const d = provider.describe();
  assert.deepEqual(d, {
    authMode: 'app-certificate',
    permissionModel: 'Sites.Selected',
    environmentLabel: 'nonprod-test',
    certificateSource: 'windows-certificate-store',
  });
  const raw = JSON.stringify(d);
  assert.doesNotMatch(raw, /fake-tenant|fake-client|AAAA|example\.invalid/, 'no config value leaks through describe()');
});

test('sanitizeAuthError redacts GUIDs, URLs, JWTs, and 40-hex thumbprints', () => {
  const dirty = `id 12345678-abcd-4ef0-9876-1234567890ab thumb ${'B'.repeat(40)} at https://x.example.invalid/y token eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ.p.s`;
  const clean = sanitizeAuthError(dirty);
  for (const [why, re] of [
    ['GUID', /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
    ['thumbprint', /B{40}/], ['URL', /https?:\/\//], ['JWT', /eyJ[A-Za-z0-9_-]{10,}/],
  ]) assert.doesNotMatch(clean, re, `must redact ${why}`);
});

// ============================== transport (Workstream B/C) ==============================

const FAKE_PROVIDER = { getToken: async () => 'eyJfake.tok.sig' };

/** Response-shaped fake for the transport's fetch. */
function resp(status, data, headers = {}) {
  return {
    status, ok: status >= 200 && status < 300,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => (data == null ? '' : JSON.stringify(data)),
    json: async () => data,
  };
}

/** Graph-mode transport with a scripted fetch. Routes are matched by substring. */
function graphTransport(routes, opts = {}) {
  const seen = [];
  const transport = createAppAuthTransport({
    tokenProvider: FAKE_PROVIDER,
    siteUrl: 'https://unit-test.example.invalid/sites/faketestsite',
    apiMode: 'graph',
    fetchImpl: async (url, o) => {
      seen.push({ url, method: o.method, body: o.body ? JSON.parse(o.body) : null, headers: o.headers });
      for (const [substr, r] of routes) {
        if (url.includes(substr)) return typeof r === 'function' ? r(url, o) : r;
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    ...opts,
  });
  return { transport, seen };
}

const SITE_ROUTE = ['/sites/unit-test.example.invalid:', resp(200, { id: 'fake-site-id' })];

test('transport: constructor is fail-closed (provider required; modes validated)', () => {
  assert.throws(() => createAppAuthTransport({ siteUrl: 'https://x.example.invalid/s' }), /token provider/i);
  assert.throws(() => createAppAuthTransport({ tokenProvider: FAKE_PROVIDER, siteUrl: 'https://x.example.invalid/s', apiMode: 'soap' }), /apiMode/);
  assert.throws(() => createAppAuthTransport({ tokenProvider: FAKE_PROVIDER, siteUrl: 'https://x.example.invalid/s', hyperlinkWriteBehavior: 'ignore' }), /hyperlinkWriteBehavior/);
  assert.deepEqual(APP_AUTH_API_MODES, ['graph', 'sharepoint-rest']);
  assert.deepEqual(HYPERLINK_BEHAVIORS, ['refuse', 'omit-and-report']);
});

test('transport: refuses lists outside the Escalations_v2_ prefix', async () => {
  const { transport } = graphTransport([SITE_ROUTE]);
  await assert.rejects(() => transport.createItem('LegacyTracker', { Title: 'x' }), /REFUSED.*prefix/);
  await assert.rejects(() => transport.query('SomeOtherList', {}), /REFUSED.*prefix/);
});

test('transport(graph): createItem resolves the site once, encodes scalars + autofills Title, bears the app token', async () => {
  const { transport, seen } = graphTransport([
    SITE_ROUTE,
    ['/lists/Escalations_v2_Tickets/items', resp(201, {
      id: '42', '@odata.etag': 'W/"42,1"',
      fields: { TicketKey: 'esc_unit1', Title: 'esc_unit1', Status: 'New', Priority: 'Low' },
    })],
  ]);
  const rec = await transport.createItem('Escalations_v2_Tickets', {
    TicketKey: 'esc_unit1', Status: 'New', Priority: 'Low',
  });
  assert.equal(rec.id, '42');
  assert.equal(rec.etag, 'W/"42,1"');
  assert.equal(rec.fields.TicketKey, 'esc_unit1');
  const create = seen.find((s) => s.method === 'POST');
  assert.equal(create.body.fields.Title, 'esc_unit1', 'Title autofilled from the key field');
  assert.equal(create.headers.Authorization, 'Bearer eyJfake.tok.sig');
});

test('transport(graph): Lookup columns encode to <Name>LookupId via key resolution', async () => {
  const { transport, seen } = graphTransport([
    SITE_ROUTE,
    // key->id resolution query against the Tickets list
    ['Escalations_v2_Tickets/items?expand=fields($select=TicketKey)', resp(200, { value: [{ id: '7', fields: { TicketKey: 'esc_parent' } }] })],
    ['Escalations_v2_Users/items?expand=fields($select=UserKey)', resp(200, { value: [{ id: '9', fields: { UserKey: 'user_fake' } }] })],
    ['/lists/Escalations_v2_Comments/items', resp(201, { id: '8', fields: { CommentKey: 'cmt_unit1' } })],
  ]);
  await transport.createItem('Escalations_v2_Comments', {
    CommentKey: 'cmt_unit1', EscalationKey: 'esc_parent', AuthorKey: 'user_fake',
    Body: 'b', Visibility: 'public', CreatedAt: '2026-07-11T00:00:00.000Z',
  });
  const create = seen.find((s) => s.method === 'POST');
  assert.equal(create.body.fields.EscalationKeyLookupId, 7, 'lookup key resolved to item id');
  assert.equal(create.body.fields.AuthorKeyLookupId, 9);
  assert.equal(create.body.fields.EscalationKey, undefined, 'raw key never sent for a Lookup column');
});

test('transport(graph): Hyperlink writes REFUSE by default with an actionable, sanitized error', async () => {
  const { transport } = graphTransport([SITE_ROUTE]);
  await assert.rejects(
    () => transport.createItem('Escalations_v2_Tickets', { TicketKey: 'esc_unit2', LegacyUrl: 'https://legacy.example.invalid/x' }),
    (e) => {
      assert.match(e.message, /Hyperlink/i);
      assert.match(e.message, /sharepoint-rest|omit-and-report/, 'error names both remediations');
      assert.doesNotMatch(e.message, /legacy\.example\.invalid/, 'the attempted value is not echoed');
      return true;
    });
  assert.equal(transport.hyperlinkOmissions(), 0);
});

test('transport(graph): omit-and-report skips Hyperlink writes and COUNTS every omission', async () => {
  const { transport, seen } = graphTransport([
    SITE_ROUTE,
    ['/lists/Escalations_v2_Tickets/items', resp(201, { id: '5', fields: { TicketKey: 'esc_unit3' } })],
  ], { hyperlinkWriteBehavior: 'omit-and-report' });
  await transport.createItem('Escalations_v2_Tickets', {
    TicketKey: 'esc_unit3', Status: 'New', Priority: 'Low',
    LegacyUrl: 'https://legacy.example.invalid/x',
  });
  const create = seen.find((s) => s.method === 'POST');
  assert.equal(create.body.fields.LegacyUrl, undefined, 'hyperlink value not sent');
  assert.equal(create.body.fields.TicketKey, 'esc_unit3', 'other fields unaffected');
  assert.equal(transport.hyperlinkOmissions(), 1, 'omission is counted for mandatory reporting');
});

test('transport(graph): 404/412/429 map to the typed errors SharePointStore expects', async () => {
  const { transport } = graphTransport([
    SITE_ROUTE,
    ['/items/404', resp(404, { error: { code: 'itemNotFound' } })],
    ['/items/412/fields', resp(412, { error: { code: 'resourceModified' } })],
    ['/items/429', resp(429, { error: { code: 'tooManyRetries' } }, { 'retry-after': '3' })],
  ]);
  await assert.rejects(() => transport.getItem('Escalations_v2_Tickets', '404'), NotFoundError);
  await assert.rejects(() => transport.updateItem('Escalations_v2_Tickets', '412', { Priority: 'Low' }), ConflictError);
  await assert.rejects(() => transport.deleteItem('Escalations_v2_Tickets', '429'), (e) => {
    assert.ok(e instanceof ThrottledError);
    assert.equal(e.retryAfterMs, 3000, 'Retry-After honored');
    return true;
  });
});

test('transport(graph): other HTTP failures throw with SANITIZED bodies (no URL/GUID leaks)', async () => {
  const { transport } = graphTransport([
    SITE_ROUTE,
    ['/lists/Escalations_v2_Tickets/items', resp(400, {
      error: { code: 'invalidRequest', message: 'bad field at https://unit-test.example.invalid/x for app 12345678-abcd-4ef0-9876-1234567890ab' },
    })],
  ]);
  await assert.rejects(() => transport.createItem('Escalations_v2_Tickets', { TicketKey: 'esc_unit4' }), (e) => {
    assert.match(e.message, /400/, 'status stays visible');
    assert.doesNotMatch(e.message, /https?:\/\//, 'no URL');
    assert.doesNotMatch(e.message, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, 'no GUID');
    return true;
  });
});

test('transport(graph): decode restores DateTime ISO, Boolean strictness, and Hyperlink reads', async () => {
  const { transport } = graphTransport([
    SITE_ROUTE,
    ['/items/11', resp(200, {
      id: '11', '@odata.etag': 'W/"11,2"',
      fields: {
        AttachmentKey: 'att_unit1', EscalationKeyLookupId: null, FileName: 'f.txt',
        FileUrl: { Description: 'f', Url: 'https://files.example.invalid/f.txt' },
        IsDeleted: false, UploadedAt: '2026-07-11T10:00:00Z',
      },
    })],
  ]);
  const rec = await transport.getItem('Escalations_v2_Attachments', '11');
  assert.equal(rec.fields.FileUrl, 'https://files.example.invalid/f.txt', 'hyperlink object decodes to its Url');
  assert.equal(rec.fields.UploadedAt, '2026-07-11T10:00:00.000Z', 'DateTime normalized to ISO with ms');
  assert.equal(rec.fields.IsDeleted, false);
  assert.equal(rec.fields.EscalationKey, null, 'null lookup decodes to null');
});

test('transport(graph): boolean filters encode as eq 1/0 — Graph matches the numeric form only (live-verified)', async () => {
  const { transport, seen } = graphTransport([
    SITE_ROUTE,
    ['/lists/Escalations_v2_TicketTags/items?expand=fields&', resp(200, { value: [] })],
  ]);
  await transport.query('Escalations_v2_TicketTags', { filter: { TicketTagKey: 'tt_unit1', IsActive: true } });
  const q = seen.find((s) => s.url.includes('$filter='));
  const filter = decodeURIComponent(q.url.split('$filter=')[1]);
  assert.match(filter, /fields\/IsActive eq 1\b/, 'true encodes as eq 1');
  assert.doesNotMatch(filter, /eq true/, 'never the literal true (matches nothing live)');

  await transport.query('Escalations_v2_TicketTags', { filter: { IsActive: false } });
  const q2 = seen.filter((s) => s.url.includes('$filter=')).at(-1);
  assert.match(decodeURIComponent(q2.url.split('$filter=')[1]), /fields\/IsActive eq 0\b/, 'false encodes as eq 0');
});

test('transport: describe() exposes fixed labels only', () => {
  const { transport } = graphTransport([SITE_ROUTE]);
  assert.deepEqual(transport.describe(), {
    apiMode: 'graph', authMode: 'app-certificate',
    hyperlinkWriteBehavior: 'refuse', listPrefix: 'Escalations_v2_',
  });
});
