// Tiny zero-dependency LOCAL server for the v2 UI.
//
// Serves files from src/v2 over http://127.0.0.1 so the browser can load ES modules
// (module imports are blocked over file://). Binds to LOOPBACK ONLY and makes no
// outbound/production calls of its own.
//
// Loop 23 — OPT-IN SharePoint TEST backend (disabled by default):
//   * By default this is a plain static server and the UI uses MockStore. No live module is
//     even imported.
//   * Only when the operator's GIT-IGNORED ui-live.local.json sets
//     enableSharePointTestBackend=true AND the referenced git-ignored testsite config passes
//     the same fail-closed safety gate as the live contract runner (non-production label,
//     Escalations_v2_ prefix, legacy/production refusal, approval flags), this server mounts
//     loopback-only JSON endpoints:
//       GET  /api/store/status  -> { enabled, mode, ... }   (never a URL/client id/token)
//       POST /api/store/call    -> { result } for whitelisted EscalationStore methods
//     The browser-side RemoteStore uses them same-origin; secrets/tokens stay in this Node
//     process (via the git-ignored transport) and never reach the browser.
//   * Every gate failure leaves the API returning a clear 503 — nothing silently connects.
//
// Usage:  node ui/serve.js        (or: npm run ui)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname, isAbsolute, resolve } from 'node:path';

import { resolveLiveBackend, STORE_METHODS, UI_LIVE_CONFIG_BASENAME, sanitizeErrorMessage } from './liveBackendGate.js';
import { BACKEND, SHAREPOINT_TEST_WARNING } from './backendSelect.js';

const UI_DIR = dirname(fileURLToPath(import.meta.url)); // .../src/v2/ui
const ROOT = dirname(UI_DIR);                            // .../src/v2  (serve root)
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 4173;
// Overridable so tests can point at a nonexistent file for a deterministic disabled state.
const UI_LIVE_CONFIG = process.env.UI_LIVE_CONFIG || join(UI_DIR, UI_LIVE_CONFIG_BASENAME);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// ----- opt-in live backend state (fail-closed default) -----
let live = { enabled: false, reason: 'SharePoint test backend not initialized.' };

async function initLiveBackend() {
  live = await resolveLiveBackend({
    readUiLiveConfig: () => readFileSync(UI_LIVE_CONFIG, 'utf8'),
    resolveConfigPath: (ref) => (isAbsolute(ref) ? ref : resolve(dirname(UI_LIVE_CONFIG), ref)),
    // Live modules are ONLY imported past the explicit opt-in (see liveBackendGate.js).
    importRunner: () => import('../backend/sharepoint/live/run-testsite-contract.js'),
    importClient: () => import('../backend/sharepoint/live/SharePointLiveClient.js'),
    importStore: () => import('../store/SharePointStore.js'),
  });
}

function statusPayload() {
  // NEVER include the site reference, client id, config paths, or any token here.
  return live.enabled
    ? {
      enabled: true,
      mode: BACKEND.SHAREPOINT_TEST,
      warning: SHAREPOINT_TEST_WARNING,
      environmentLabel: live.environmentLabel,
      runNamespace: live.runNamespace,
    }
    : { enabled: false, mode: BACKEND.MOCK, reason: live.reason };
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': MIME['.json'] });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit = 1_000_000) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('request body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleApi(req, res, urlPath) {
  if (urlPath === '/api/store/status') {
    sendJson(res, 200, statusPayload());
    return true;
  }
  if (urlPath === '/api/store/call') {
    if (req.method !== 'POST') { sendJson(res, 405, { error: 'POST required' }); return true; }
    if (!live.enabled) {
      sendJson(res, 503, { error: live.reason ?? 'SharePoint test backend is disabled.' });
      return true;
    }
    let payload;
    try {
      payload = JSON.parse(await readBody(req));
    } catch (e) {
      sendJson(res, 400, { error: `invalid request body: ${e.message}` });
      return true;
    }
    const { method, args } = payload ?? {};
    if (!STORE_METHODS.includes(method)) {
      sendJson(res, 400, { error: `method '${method}' is not in the store whitelist` });
      return true;
    }
    try {
      const result = await live.store[method](...(Array.isArray(args) ? args : []));
      sendJson(res, 200, { result: result ?? null });
    } catch (e) {
      // Business-rule rejections (illegal transition, requester-only Complete, missing
      // closure note, …) surface with their original message so the UI behaves identically
      // to MockStore. Transport/infra failures are sanitized so no URL/path/id/token can
      // leak into browser copy. Nothing is retried or faked here.
      sendJson(res, 400, { error: sanitizeErrorMessage(e?.message ?? e) });
    }
    return true;
  }
  return false;
}

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

    if (urlPath.startsWith('/api/')) {
      if (await handleApi(req, res, urlPath)) return;
      sendJson(res, 404, { error: 'unknown api endpoint' });
      return;
    }

    // Default to the UI entry point.
    if (urlPath === '/') urlPath = '/ui/index.html';

    // Resolve safely within ROOT — reject path traversal.
    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }

    const body = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});

await initLiveBackend();
server.listen(PORT, HOST, () => {
  console.log(`v2 UI shell:  http://${HOST}:${PORT}/ui/index.html`);
  if (live.enabled) {
    console.log(`[backend] SharePoint TEST backend ENABLED (opt-in, ${live.environmentLabel}) — non-production only.`);
    console.log(`[backend] Open http://${HOST}:${PORT}/ui/index.html?backend=sharepoint-test to use it; the default page stays on MockStore.`);
  } else {
    console.log(`[backend] MockStore (default). ${live.reason}`);
  }
  console.log('Local only. Ctrl+C to stop.');
});
