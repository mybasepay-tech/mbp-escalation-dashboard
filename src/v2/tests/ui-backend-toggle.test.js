// UI backend toggle tests (Loop 23).
//
// Prove the four safety properties of the opt-in SharePoint TEST backend:
//   1. MockStore is the DEFAULT — anything but the exact opt-in query selects mock.
//   2. The live gate FAILS CLOSED — no opt-in file, no flag, unsafe config, or transport
//      failure all leave it disabled with a clear reason, and NO live module is loaded
//      before the explicit opt-in flag is verified.
//   3. The browser RemoteStore only talks to relative loopback /api/ endpoints and
//      surfaces server-side business-rule errors verbatim.
//   4. The served UI boots in mock mode with the live API returning a clear 503
//      (integration: a real serve.js process with a deterministically-absent opt-in file).
// 100% local — no SharePoint, no live config, no secrets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  selectBackend, BACKEND, INDICATOR_TEXT, MOCK_BANNER_TEXT, SHAREPOINT_TEST_WARNING,
} from '../ui/backendSelect.js';
import { resolveLiveBackend, STORE_METHODS, sanitizeErrorMessage } from '../ui/liveBackendGate.js';
import { EscalationStore } from '../store/EscalationStore.js';
import { RemoteStore, connectRemoteStore } from '../ui/remoteStore.js';

const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// ----- 1. backend selection: MockStore is the default -----

test('selectBackend defaults to MockStore (no query, empty query, unrelated params)', () => {
  for (const search of [undefined, '', '?', '?foo=1', '?backend=', '?backend=mock']) {
    const sel = selectBackend(search);
    assert.equal(sel.mode, BACKEND.MOCK, `search '${search}' must select mock`);
    assert.equal(sel.explicitlyRequested, false);
  }
});

test('selectBackend enables the test backend ONLY for the exact opt-in value', () => {
  const sel = selectBackend('?backend=sharepoint-test');
  assert.equal(sel.mode, BACKEND.SHAREPOINT_TEST);
  assert.equal(sel.explicitlyRequested, true);
});

test('selectBackend treats unknown/typo values as MockStore (safe direction) and surfaces them', () => {
  for (const v of ['sharepoint', 'live', 'SHAREPOINT-TEST', 'sharepoint-test2', 'prod']) {
    const sel = selectBackend(`?backend=${v}`);
    assert.equal(sel.mode, BACKEND.MOCK, `'${v}' must fall back to mock`);
    assert.equal(sel.ignoredValue, v, 'the ignored value is surfaced for a UI hint');
  }
});

test('backend indicator + banner texts are distinct and carry the required warning', () => {
  assert.equal(INDICATOR_TEXT[BACKEND.MOCK], 'Mock backend');
  assert.equal(INDICATOR_TEXT[BACKEND.SHAREPOINT_TEST], 'SharePoint test backend');
  assert.equal(SHAREPOINT_TEST_WARNING, 'Test SharePoint backend enabled — non-production only');
  assert.notEqual(MOCK_BANNER_TEXT, SHAREPOINT_TEST_WARNING);
});

// ----- 2. the live gate fails closed -----

function spyDeps(overrides = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      readUiLiveConfig: () => { calls.push('readUiLiveConfig'); throw new Error('no such file'); },
      resolveConfigPath: (p) => p,
      importRunner: async () => { calls.push('importRunner'); return { loadConfig: () => ({}), assertSafe: () => {}, loadTransport: async () => ({}) }; },
      importClient: async () => { calls.push('importClient'); return { SharePointLiveClient: class {} }; },
      importStore: async () => { calls.push('importStore'); return { SharePointStore: class {} }; },
      ...overrides,
    },
  };
}

test('gate: disabled (with reason) when the opt-in file is absent; NO live module is imported', async () => {
  const { deps, calls } = spyDeps();
  const res = await resolveLiveBackend(deps);
  assert.equal(res.enabled, false);
  assert.match(res.reason, /disabled/i);
  assert.match(res.reason, /MockStore remains/i);
  assert.deepEqual(calls, ['readUiLiveConfig'], 'no import may happen without the opt-in file');
});

test('gate: disabled when the file exists but the flag is not exactly true (runtime files alone never enable live)', async () => {
  for (const flag of [false, 'true', 1, undefined]) {
    const { deps, calls } = spyDeps({
      readUiLiveConfig: () => JSON.stringify({ enableSharePointTestBackend: flag, testsiteConfig: './x.json' }),
    });
    const res = await resolveLiveBackend(deps);
    assert.equal(res.enabled, false, `flag ${JSON.stringify(flag)} must stay disabled`);
    assert.ok(!calls.includes('importRunner'), 'live modules must not load without the explicit true flag');
  }
});

test('gate: disabled when testsiteConfig is missing or a placeholder', async () => {
  for (const testsiteConfig of [undefined, '', '<PATH_TO_GIT_IGNORED_TESTSITE_CONFIG>']) {
    const { deps } = spyDeps({
      readUiLiveConfig: () => JSON.stringify({ enableSharePointTestBackend: true, testsiteConfig }),
    });
    const res = await resolveLiveBackend(deps);
    assert.equal(res.enabled, false);
    assert.match(res.reason, /testsiteConfig/);
  }
});

test('gate: REFUSED when the fail-closed safety gate (assertSafe) rejects; transport never loads', async () => {
  let transportLoaded = false;
  const { deps } = spyDeps({
    readUiLiveConfig: () => JSON.stringify({ enableSharePointTestBackend: true, testsiteConfig: './testsite.config.json' }),
    importRunner: async () => ({
      loadConfig: () => ({ environmentLabel: 'production' }),
      assertSafe: () => { throw new Error('FAIL-CLOSED: live runner rejected: environmentLabel'); },
      loadTransport: async () => { transportLoaded = true; return {}; },
    }),
  });
  const res = await resolveLiveBackend(deps);
  assert.equal(res.enabled, false);
  assert.match(res.reason, /REFUSED|FAIL-CLOSED/i);
  assert.equal(transportLoaded, false, 'transport must not load when the safety gate rejects');
});

test('gate: disabled when the transport fails to initialize (no half-enabled state)', async () => {
  const { deps } = spyDeps({
    readUiLiveConfig: () => JSON.stringify({ enableSharePointTestBackend: true, testsiteConfig: './testsite.config.json' }),
    importRunner: async () => ({
      loadConfig: () => ({ environmentLabel: 'nonprod-test', runNamespace: 'x' }),
      assertSafe: () => {},
      loadTransport: async () => { throw new Error('auth unavailable'); },
    }),
  });
  const res = await resolveLiveBackend(deps);
  assert.equal(res.enabled, false);
  assert.match(res.reason, /unavailable|auth/i);
  assert.equal(res.store, undefined);
});

test('gate: enabled only when every step passes — and exposes NO site/client/token fields', async () => {
  const { deps } = spyDeps({
    readUiLiveConfig: () => JSON.stringify({ enableSharePointTestBackend: true, testsiteConfig: './testsite.config.json' }),
    importRunner: async () => ({
      loadConfig: () => ({
        environmentLabel: 'nonprod-test', runNamespace: 'ui-live', listPrefix: 'Escalations_v2_',
        siteReferencePlaceholder: 'https://fake.invalid/sites/x', clientId: 'not-a-real-id',
      }),
      assertSafe: () => {},
      loadTransport: async () => ({}),
    }),
  });
  const res = await resolveLiveBackend(deps);
  assert.equal(res.enabled, true);
  assert.ok(res.store, 'a connected store is returned');
  assert.equal(res.environmentLabel, 'nonprod-test');
  assert.equal(res.runNamespace, 'ui-live');
  const exposed = Object.keys(res).join(',');
  assert.doesNotMatch(exposed, /site|client|token|url/i, 'no live identifiers leak through the gate result');
});

test('gate: reports a SANITIZED auth-mode label — app-auth when the transport self-describes, operator-token otherwise (Loop 33)', async () => {
  const mk = (transport) => spyDeps({
    readUiLiveConfig: () => JSON.stringify({ enableSharePointTestBackend: true, testsiteConfig: './testsite.config.json' }),
    importRunner: async () => ({
      loadConfig: () => ({ environmentLabel: 'nonprod-test', runNamespace: 'ui-live', listPrefix: 'Escalations_v2_' }),
      assertSafe: () => {},
      loadTransport: async () => transport,
    }),
  }).deps;

  const appAuth = await resolveLiveBackend(mk({
    describe: () => ({ authMode: 'app-certificate', apiMode: 'graph' }),
  }));
  assert.equal(appAuth.enabled, true);
  assert.equal(appAuth.authMode, 'app-auth-certificate');

  const operator = await resolveLiveBackend(mk({}));
  assert.equal(operator.enabled, true);
  assert.equal(operator.authMode, 'operator-token');

  // The label is a fixed vocabulary — never a value derived from config/identifiers.
  for (const r of [appAuth, operator]) {
    assert.ok(['app-auth-certificate', 'operator-token'].includes(r.authMode));
  }
});

// ----- 2b. error sanitization: nothing sensitive can reach browser copy (Loop 26) -----

test('sanitizeErrorMessage redacts URLs, GUID-shaped ids, tokens, and local paths — keeps the actionable class', () => {
  const dirty = 'SharePoint REST 401 GET https://tenant.example.invalid/sites/x/_stuff :: token eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ.eyJhdWQiOiJ4In0 id 12345678-abcd-4ef0-9876-1234567890ab at C:\\Users\\op\\repo\\file.json and ./relative/path/file';
  const clean = sanitizeErrorMessage(dirty);
  assert.doesNotMatch(clean, /https?:\/\//, 'no URLs');
  assert.doesNotMatch(clean, /eyJ[A-Za-z0-9_-]{10,}/, 'no token material');
  assert.doesNotMatch(clean, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, 'no GUID-shaped ids');
  assert.doesNotMatch(clean, /C:\\Users/, 'no windows paths');
  assert.doesNotMatch(clean, /\.\/relative\/path/, 'no relative paths');
  assert.match(clean, /SharePoint REST 401/, 'the actionable error class survives');
});

test('sanitizeErrorMessage leaves business-rule messages untouched', () => {
  for (const msg of [
    'Only the requester who submitted the ticket can move it to Complete',
    'Completing a ticket requires a final closing comment',
    'Illegal status transition: New -> In Process',
    'Unknown ticket: esc_demo_loop24_x',
  ]) {
    assert.equal(sanitizeErrorMessage(msg), msg);
  }
});

test('gate reasons are sanitized: a config error carrying a path/URL cannot leak it', async () => {
  const { deps } = spyDeps({
    readUiLiveConfig: () => { throw new Error("ENOENT: no such file, open 'C:\\dev\\repo\\src\\v2\\ui\\ui-live.local.json'"); },
  });
  const res = await resolveLiveBackend(deps);
  assert.equal(res.enabled, false);
  assert.doesNotMatch(res.reason, /C:\\dev/, 'local path redacted');
  assert.match(res.reason, /\[local-path\]|disabled/i);

  const { deps: deps2 } = spyDeps({
    readUiLiveConfig: () => JSON.stringify({ enableSharePointTestBackend: true, testsiteConfig: './testsite.config.json' }),
    importRunner: async () => ({
      loadConfig: () => ({}),
      assertSafe: () => { throw new Error('refused target https://real.example.invalid/sites/prod'); },
      loadTransport: async () => ({}),
    }),
  });
  const res2 = await resolveLiveBackend(deps2);
  assert.equal(res2.enabled, false);
  assert.doesNotMatch(res2.reason, /https?:\/\//, 'URL redacted from gate reason');
});

// ----- 3. whitelist + RemoteStore -----

test('STORE_METHODS whitelist exactly covers the EscalationStore surface', () => {
  const surface = Object.getOwnPropertyNames(EscalationStore.prototype)
    .filter((n) => n !== 'constructor')
    .sort();
  assert.deepEqual([...STORE_METHODS].sort(), surface, 'whitelist must stay in sync with the store contract');
});

test('RemoteStore posts whitelisted calls to the relative /api endpoint and unwraps results', async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    seen.push({ url, opts });
    return { ok: true, status: 200, json: async () => ({ result: [{ id: 'esc_x' }] }) };
  };
  try {
    const store = new RemoteStore();
    const out = await store.listTickets({ openOnly: true });
    assert.deepEqual(out, [{ id: 'esc_x' }]);
    assert.equal(seen[0].url, '/api/store/call', 'relative loopback path only');
    assert.deepEqual(JSON.parse(seen[0].opts.body), { method: 'listTickets', args: [{ openOnly: true }] });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('RemoteStore surfaces server-side business-rule errors verbatim (fail closed, no retry)', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false, status: 400,
    json: async () => ({ error: 'Only the requester who submitted the ticket can move it to Complete' }),
  });
  try {
    const store = new RemoteStore();
    await assert.rejects(
      () => store.setStatus('esc_x', 'Complete', { actorId: 'u' }),
      /Only the requester who submitted the ticket/,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('connectRemoteStore fails closed (throws the server reason) when the backend is disabled', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ enabled: false, mode: 'mock', reason: 'no opt-in present' }),
  });
  try {
    await assert.rejects(() => connectRemoteStore(), /no opt-in present/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ----- 4. integration: real serve.js boots mock-only with the live API disabled -----

test('serve.js: default boot serves the UI, reports mock mode, and 503s live calls (no live init)', async () => {
  // Wide pseudo-random range to dodge collisions with parallel/leaked test servers.
  const port = 4300 + ((process.pid + Date.now()) % 600);
  const child = spawn(process.execPath, [join(V2_ROOT, 'ui', 'serve.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      // Deterministic: point the opt-in at a file that cannot exist.
      UI_LIVE_CONFIG: join(V2_ROOT, 'ui', 'definitely-missing.ui-live.test.json'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('serve.js did not start in time')), 30000);
      child.stdout.on('data', (d) => { if (String(d).includes('UI shell')) { clearTimeout(timer); resolve(); } });
      child.on('exit', (code) => reject(new Error(`serve.js exited early (${code})`)));
    });

    const status = await (await fetch(`http://127.0.0.1:${port}/api/store/status`)).json();
    assert.equal(status.enabled, false, 'live backend must be disabled by default');
    assert.equal(status.mode, BACKEND.MOCK);
    assert.match(status.reason, /disabled/i);

    const call = await fetch(`http://127.0.0.1:${port}/api/store/call`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'listTickets', args: [] }),
    });
    assert.equal(call.status, 503, 'live store calls must be refused while disabled');

    const page = await fetch(`http://127.0.0.1:${port}/ui/index.html`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /backendIndicator/, 'UI carries the backend indicator');
    assert.match(html, /backendBanner/, 'UI carries the backend banner');
  } finally {
    child.kill();
  }
});
