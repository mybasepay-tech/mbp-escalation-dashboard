// exportLegacyListReadonly — READ-ONLY full export of ONE legacy SharePoint list
// (Loop 36). COMMITTED, identifier-free.
//
// READ-ONLY BY CONSTRUCTION — the safety contract of this module:
//   * The ONLY HTTP verb in this file is GET; there is no code path that could perform
//     a write of any kind — no write verbs, no write payloads, no verb overrides.
//   * It never touches attachment BINARIES — it collects attachment METADATA only
//     (file name, server-relative url, size via a metadata `$select=Length` lookup).
//   * It holds NO site URL, list name, tenant id, or token: everything is injected at
//     runtime from a git-ignored local config (see run-legacy-readonly-export.js).
//   * Raw output goes ONLY to the git-ignored exports/ folder — never into git, never
//     over the network.
//
// This is the migration-grade replacement for spreadsheet exports, which Loop 35 PROVED
// truncate Status Updates (~195 chars) and Teams Post (100 chars).

const ODATA_NOISE = /^(odata\.|__metadata|FileSystemObjectType$|ServerRedirectedEmbedUri$|ServerRedirectedEmbedUrl$)/;

export function createReadonlyLegacyExporter({ siteUrl, listTitle, getToken, fetchImpl = fetch, log = () => {} }) {
  const site = String(siteUrl ?? '').replace(/\/+$/, '');
  if (!site || !listTitle) throw new Error('exporter REFUSED: siteUrl and listTitle are required (from the git-ignored local config)');
  if (typeof getToken !== 'function') throw new Error('exporter REFUSED: a getToken() provider is required');

  const listUrl = `${site}/_api/web/lists/getbytitle('${encodeURIComponent(String(listTitle)).replace(/'/g, "''")}')`;

  // The single HTTP entry point of this module: GET, JSON, one 401 token refresh.
  async function get(url) {
    let token = await getToken();
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, {
        method: 'GET', // READ-ONLY: the only verb this module can emit
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json;odata=nometadata' },
      });
      if (res.status === 401 && attempt === 0) { token = await getToken({ forceRefresh: true }); continue; }
      if (res.status === 429 || res.status === 503) {
        const wait = (Number(res.headers.get('retry-after')) || 2) * 1000;
        await new Promise((r) => setTimeout(r, wait));
        if (attempt < 6) continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // Sanitized: never echo the URL (it contains the site path).
        throw new Error(`legacy read failed: HTTP ${res.status} :: ${text.slice(0, 160).replace(/https?:\/\/\S+/g, '[url]')}`);
      }
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    }
  }

  async function getAllPaged(firstUrl) {
    const out = [];
    let url = firstUrl;
    while (url) {
      const data = await get(url);
      out.push(...(data?.value ?? []));
      url = data?.['odata.nextLink'] ?? data?.['@odata.nextLink'] ?? null;
      log(`  … ${out.length} record(s)`);
    }
    return out;
  }

  /** Site users (id -> {title,email}) so Author/Editor ids resolve locally. */
  async function fetchSiteUsers() {
    const users = await getAllPaged(`${site}/_api/web/siteusers?$select=Id,Title,Email,LoginName&$top=200`);
    const map = {};
    for (const u of users) map[String(u.Id)] = { title: u.Title ?? null, email: u.Email ?? null, loginName: u.LoginName ?? null };
    return map;
  }

  /** Full field schema snapshot: display/internal/type/required/choices/hidden/readOnly. */
  async function fetchSchema() {
    const fields = await getAllPaged(`${listUrl}/fields?$top=500`);
    return fields.map((f) => ({
      internalName: f.InternalName,
      displayName: f.Title,
      type: f.TypeAsString,
      required: f.Required === true,
      hidden: f.Hidden === true,
      readOnly: f.ReadOnlyField === true,
      choices: Array.isArray(f.Choices) ? f.Choices : (f.Choices?.results ?? null),
    }));
  }

  /** All items with raw fields + attachment metadata (never binaries). */
  async function fetchItems({ pageSize = 200, fetchAttachmentSizes = false } = {}) {
    const raw = await getAllPaged(`${listUrl}/items?$select=*&$expand=AttachmentFiles&$top=${Math.min(pageSize, 500)}`);
    const items = [];
    for (const r of raw) {
      const fields = {};
      for (const [k, v] of Object.entries(r)) {
        if (ODATA_NOISE.test(k) || k === 'AttachmentFiles') continue;
        fields[k] = v;
      }
      const files = (r.AttachmentFiles?.results ?? r.AttachmentFiles ?? []).map((a) => ({
        fileName: a.FileName ?? null,
        serverRelativeUrl: a.ServerRelativeUrl ?? null, // raw LOCAL output only — never committed
        sizeBytes: null, // filled below when fetchAttachmentSizes is enabled (metadata GET only)
      }));
      if (fetchAttachmentSizes) {
        for (const f of files) {
          if (!f.serverRelativeUrl) continue;
          try {
            const meta = await get(`${site}/_api/web/GetFileByServerRelativePath(decodedurl='${encodeURIComponent(f.serverRelativeUrl).replace(/'/g, "''")}')?$select=Length`);
            f.sizeBytes = meta?.Length != null ? Number(meta.Length) : null;
          } catch { f.sizeBytes = null; } // size is best-effort metadata; never blocks the export
        }
      }
      items.push({
        id: String(r.Id ?? r.ID ?? ''),
        fields,
        hasAttachments: r.Attachments === true || files.length > 0,
        attachmentCount: files.length,
        attachments: files,
      });
    }
    return items;
  }

  /** The whole read-only export: items + users + schema + attachment inventory. */
  async function exportAll(opts = {}) {
    log('[export] reading list schema (GET)…');
    const schema = await fetchSchema();
    log(`[export] schema: ${schema.length} field(s)`);
    log('[export] reading site users (GET)…');
    const users = await fetchSiteUsers();
    log(`[export] users: ${Object.keys(users).length}`);
    log('[export] reading ALL items with attachment metadata (GET)…');
    const items = await fetchItems(opts);
    log(`[export] items: ${items.length}`);

    const attachmentInventory = items
      .filter((i) => i.attachmentCount > 0)
      .map((i) => ({ itemId: i.id, count: i.attachmentCount, files: i.attachments }));

    const ids = items.map((i) => Number(i.id)).filter(Number.isFinite);
    const summary = {
      exportedAt: new Date().toISOString(),
      itemCount: items.length,
      idMin: ids.length ? Math.min(...ids) : null,
      idMax: ids.length ? Math.max(...ids) : null,
      itemsWithAttachments: attachmentInventory.length,
      attachmentFileCount: attachmentInventory.reduce((a, e) => a + e.count, 0),
      schemaFieldCount: schema.length,
      readOnly: true,
      writesPerformed: 0, // by construction — this module has no write path
    };
    return { summary, items, users, schema, attachmentInventory };
  }

  return { exportAll, fetchItems, fetchSchema, fetchSiteUsers };
}

export default createReadonlyLegacyExporter;
