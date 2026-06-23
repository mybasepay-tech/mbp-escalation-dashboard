// Tiny zero-dependency LOCAL static file server for the mock UI.
//
// Serves files from src/v2 over http://127.0.0.1 so the browser can load ES modules
// (module imports are blocked over file://). This is a local dev convenience ONLY — it
// binds to loopback, serves local files, and makes no outbound/production calls.
//
// Usage:  node ui/serve.js        (or: npm run ui)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const UI_DIR = dirname(fileURLToPath(import.meta.url)); // .../src/v2/ui
const ROOT = dirname(UI_DIR);                            // .../src/v2  (serve root)
const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    // Default to the UI entry point.
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
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

server.listen(PORT, HOST, () => {
  console.log(`Mock UI shell:  http://${HOST}:${PORT}/ui/index.html`);
  console.log('Local only. Ctrl+C to stop.');
});
