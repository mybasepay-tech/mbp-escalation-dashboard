// appAuthTransport.js — D6 app-auth runtime transport (Loop 33). COMMITTED, identifier-free.
//
// The transport boundary (SharePointLiveClient contract) implemented on top of the D6
// app-only certificate token provider — replacing the operator's git-ignored bootstrap for
// the SharePoint TEST/pre-production path. This file hardcodes NO tenant id, client id,
// site URL, secret, or token; every identifying value arrives at runtime from the
// operator's GIT-IGNORED auth.config.local.json (validated fail-closed by d6AuthConfig.js).
//
// Two EXPLICIT api modes (apiMode in the auth config; default 'graph'):
//   * 'graph'           — Microsoft Graph list-items API. Works with the Graph-resource
//                         `Sites.Selected` application permission granted in the D6 admin
//                         setup. PLATFORM LIMITATION: Graph cannot write SharePoint
//                         Hyperlink columns (LegacyUrl / FileUrl) — see hyperlink policy.
//   * 'sharepoint-rest' — SharePoint REST (full column fidelity, incl. Hyperlink writes).
//                         Requires the SHAREPOINT-resource `Sites.Selected` application
//                         permission (an SPO-audience app token with no roles is refused
//                         by SharePoint). Wired and ready; activates once that consent
//                         exists — no code change needed.
//
// Hyperlink write policy under 'graph' (graphHyperlinkWriteBehavior; default 'refuse'):
//   * 'refuse'          — FAIL-CLOSED: writing a non-null Hyperlink value throws a clear,
//                         sanitized error naming the platform limitation.
//   * 'omit-and-report' — EXPLICIT OPT-IN for validation runs: the Hyperlink value is NOT
//                         written; every omission is COUNTED and retrievable via
//                         `transport.hyperlinkOmissions()` so runners must report it.
//                         Never silent, never the default.
//
// Safety (as everywhere in this package):
//   * refuses any list outside the Escalations_v2_ prefix;
//   * 404/412/429+503 map to the typed errors SharePointStore expects;
//   * every thrown message is sanitized (no URL/GUID/token/thumbprint can escape);
//   * tokens live only inside the injected provider's in-memory cache.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { NotFoundError, ConflictError, ThrottledError } from './SharePointLiveErrors.js';
import { sanitizeAuthError } from './appAuthTokenProvider.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GRAPH = 'https://graph.microsoft.com/v1.0';

export const APP_AUTH_API_MODES = Object.freeze(['graph', 'sharepoint-rest']);
export const HYPERLINK_BEHAVIORS = Object.freeze(['refuse', 'omit-and-report']);

/**
 * Build the app-auth transport.
 * @param {object} opts
 * @param {object} opts.tokenProvider  createAppAuthTokenProvider(...) instance
 * @param {string} opts.siteUrl        the SINGLE granted non-production site (from git-ignored config)
 * @param {string} [opts.apiMode]      'graph' (default) | 'sharepoint-rest'
 * @param {string} [opts.hyperlinkWriteBehavior]  'refuse' (default) | 'omit-and-report' (graph mode only)
 * @param {string} [opts.listPrefix]   defaults to 'Escalations_v2_'
 * @param {Function} [opts.fetchImpl]  injectable for tests
 */
export function createAppAuthTransport(opts) {
  const { tokenProvider } = opts;
  if (!tokenProvider || typeof tokenProvider.getToken !== 'function') {
    throw new Error('appAuthTransport REFUSED: a token provider is required (createAppAuthTokenProvider).');
  }
  const site = String(opts.siteUrl ?? '').replace(/\/+$/, '');
  const siteHost = new URL(site).host;
  const sitePath = new URL(site).pathname.replace(/\/+$/, '');
  const apiMode = opts.apiMode ?? 'graph';
  if (!APP_AUTH_API_MODES.includes(apiMode)) {
    throw new Error(`appAuthTransport REFUSED: apiMode must be one of ${APP_AUTH_API_MODES.join(', ')}`);
  }
  const hyperlinkBehavior = opts.hyperlinkWriteBehavior ?? 'refuse';
  if (!HYPERLINK_BEHAVIORS.includes(hyperlinkBehavior)) {
    throw new Error(`appAuthTransport REFUSED: hyperlinkWriteBehavior must be one of ${HYPERLINK_BEHAVIORS.join(', ')}`);
  }
  const listPrefix = opts.listPrefix ?? 'Escalations_v2_';
  const fetchImpl = opts.fetchImpl ?? fetch;
  const audience = apiMode === 'graph' ? 'graph' : 'sharepoint';

  // ----- schema-driven column metadata (committed design blueprint; no live values) -----
  const schema = JSON.parse(readFileSync(join(HERE, '..', 'schema.sharepoint-v2.json'), 'utf8'));
  const listMeta = {};
  for (const [name, def] of Object.entries(schema.lists)) {
    listMeta[name] = { keyField: def.keyField, cols: new Map(def.fields.map((f) => [f.name, f])) };
  }
  function meta(list) {
    if (!String(list).startsWith(listPrefix)) {
      throw new Error(`appAuthTransport REFUSED: list '${list}' is outside the approved '${listPrefix}' prefix`);
    }
    const m = listMeta[list];
    if (!m) throw new Error(`appAuthTransport: list '${list}' not in schema`);
    return m;
  }

  let omittedHyperlinkWrites = 0;

  // ----- HTTP plumbing (typed errors, sanitized messages, one 401 token refresh) -----
  async function call(method, url, { body, headers } = {}, describe = 'request') {
    let token = await tokenProvider.getToken(audience);
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(headers ?? {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401 && attempt === 0) {
        token = await tokenProvider.getToken(audience, { forceRefresh: true });
        continue;
      }
      if (res.status === 404) throw new NotFoundError(`404 (${describe})`);
      if (res.status === 412) throw new ConflictError();
      if (res.status === 429 || res.status === 503) {
        throw new ThrottledError('throttled', (Number(res.headers.get('retry-after')) || 2) * 1000);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`app-auth ${apiMode} ${res.status} on ${describe}: ${sanitizeAuthError(text.slice(0, 300))}`);
      }
      if (res.status === 204) return null;
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    }
  }

  const escq = (s) => String(s).replace(/'/g, "''");

  // ===================================================================== graph mode
  function graphMode() {
    let siteIdPromise = null;
    function siteId() {
      siteIdPromise ??= call('GET', `${GRAPH}/sites/${siteHost}:${sitePath}`, {}, 'site resolution')
        .then((d) => {
          if (!d?.id) throw new Error('app-auth graph: site resolution returned no id');
          return d.id;
        });
      return siteIdPromise;
    }
    const itemsUrl = async (list) => `${GRAPH}/sites/${await siteId()}/lists/${encodeURIComponent(list)}/items`;

    // key <-> SharePoint item id resolution for Lookup columns (cached both directions)
    const keyToId = new Map();
    const idToKey = new Map();
    function cachePair(list, key, id) {
      if (key == null || id == null) return;
      keyToId.set(`${list}|${key}`, Number(id));
      idToKey.set(`${list}|${id}`, key);
    }
    async function resolveKeyToId(list, keyField, key) {
      const hit = keyToId.get(`${list}|${key}`);
      if (hit != null) return hit;
      const url = `${await itemsUrl(list)}?expand=fields($select=${keyField})&$filter=${encodeURIComponent(`fields/${keyField} eq '${escq(key)}'`)}&$top=1`;
      const data = await call('GET', url, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } }, `lookup ${list}`);
      const item = (data?.value ?? [])[0];
      if (!item) return null;
      cachePair(list, key, item.id);
      return Number(item.id);
    }
    async function resolveIdToKey(list, keyField, id) {
      const hit = idToKey.get(`${list}|${id}`);
      if (hit != null) return hit;
      let item;
      try {
        item = await call('GET', `${await itemsUrl(list)}/${id}?expand=fields($select=${keyField})`, {}, `lookup ${list} item`);
      } catch (e) {
        if (e && e.code === 'notFound') return null;
        throw e;
      }
      const key = item?.fields?.[keyField] ?? null;
      cachePair(list, key, id);
      return key;
    }

    async function encodeFields(list, fields, { isCreate }) {
      const m = meta(list);
      const out = {};
      for (const [name, raw] of Object.entries(fields ?? {})) {
        const col = m.cols.get(name);
        if (!col) { if (raw != null) out[name] = raw; continue; }
        if (raw == null) {
          if (!isCreate) {
            if (col.type === 'Lookup') out[`${name}LookupId`] = null;
            else if (col.type !== 'Hyperlink') out[name] = null;
            // clearing a Hyperlink via graph is as unsupported as writing one — omit silently
            // only for null (no data is lost by not clearing an unset field on our own seeds).
          }
          continue;
        }
        switch (col.type) {
          case 'Lookup': {
            const id = await resolveKeyToId(col.lookupList, col.lookupField, String(raw));
            if (id == null) throw new Error(`app-auth graph: cannot resolve lookup ${list}.${name} -> ${col.lookupList} key`);
            out[`${name}LookupId`] = id;
            break;
          }
          case 'Hyperlink': {
            if (hyperlinkBehavior === 'omit-and-report') {
              omittedHyperlinkWrites += 1;
              break; // counted, surfaced via hyperlinkOmissions(); runners must report it
            }
            throw new Error(
              `app-auth graph REFUSED: Microsoft Graph cannot write Hyperlink column ${list}.${name} ` +
              `(platform limitation). Use apiMode 'sharepoint-rest' (requires the SharePoint-resource ` +
              `Sites.Selected consent) or opt into graphHyperlinkWriteBehavior 'omit-and-report' for validation runs.`);
          }
          case 'Boolean': out[name] = raw === true; break;
          default: out[name] = raw;
        }
      }
      if (isCreate && (out.Title == null || out.Title === '')) {
        out.Title = String(fields?.[m.keyField] ?? fields?.Title ?? 'v2');
      }
      return out;
    }

    async function decodeItem(list, item) {
      const m = meta(list);
      const f = item.fields ?? {};
      const fields = {};
      for (const [name, col] of m.cols) {
        switch (col.type) {
          case 'Lookup': {
            const id = f[`${name}LookupId`] ?? null;
            fields[name] = id == null ? null : await resolveIdToKey(col.lookupList, col.lookupField, id);
            break;
          }
          case 'Hyperlink': fields[name] = f[name]?.Url ?? (typeof f[name] === 'string' ? f[name] : null); break;
          case 'DateTime': fields[name] = f[name] == null ? null : new Date(f[name]).toISOString(); break;
          case 'Boolean': fields[name] = f[name] === true; break;
          default: fields[name] = f[name] ?? null;
        }
      }
      cachePair(list, fields[m.keyField], item.id);
      return { id: String(item.id), etag: item['@odata.etag'] ?? null, fields };
    }

    const NO_MATCH = Symbol('no-match');
    async function buildFilter(list, filter) {
      const m = meta(list);
      const parts = [];
      for (const [name, value] of Object.entries(filter ?? {})) {
        const col = m.cols.get(name);
        if (col?.type === 'Lookup') {
          const id = await resolveKeyToId(col.lookupList, col.lookupField, String(value));
          if (id == null) return NO_MATCH;
          parts.push(`fields/${name}LookupId eq ${id}`);
        } else if (typeof value === 'boolean') {
          // SharePoint Yes/No columns READ as true/false through Graph but the list $filter
          // engine only matches the numeric form (eq 1 / eq 0) — verified live in Loop 33
          // (`eq true` returns 200 with zero matches). Same encoding SPO REST uses.
          parts.push(`fields/${name} eq ${value ? 1 : 0}`);
        } else if (typeof value === 'number') {
          parts.push(`fields/${name} eq ${value}`);
        } else {
          parts.push(`fields/${name} eq '${escq(value)}'`);
        }
      }
      return parts.join(' and ');
    }

    return {
      async createItem(list, fields) {
        const body = { fields: await encodeFields(list, fields, { isCreate: true }) };
        const data = await call('POST', await itemsUrl(list), { body }, `create in ${list}`);
        return decodeItem(list, data);
      },
      async getItem(list, id) {
        meta(list);
        const data = await call('GET', `${await itemsUrl(list)}/${id}?expand=fields`, {}, `get ${list} item`);
        return decodeItem(list, data);
      },
      async updateItem(list, id, fields, updOpts = {}) {
        const body = await encodeFields(list, fields, { isCreate: false });
        await call('PATCH', `${await itemsUrl(list)}/${id}/fields`, {
          body, headers: { 'If-Match': updOpts.ifMatch ?? '*' },
        }, `update ${list} item`);
        return { id: String(id), etag: null, fields: {} };
      },
      async deleteItem(list, id) {
        meta(list);
        await call('DELETE', `${await itemsUrl(list)}/${id}`, {}, `delete ${list} item`);
        return true;
      },
      async query(list, { filter, top, skipToken } = {}) {
        meta(list);
        let url;
        if (typeof skipToken === 'string' && skipToken.startsWith('http')) {
          url = skipToken; // @odata.nextLink continuation
        } else {
          const f = await buildFilter(list, filter);
          if (f === NO_MATCH) return { items: [], nextSkipToken: null };
          url = `${await itemsUrl(list)}?expand=fields&$top=${Math.min(top ?? 100, 999)}`;
          if (f) url += `&$filter=${encodeURIComponent(f)}`;
        }
        const data = await call('GET', url, { headers: { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' } }, `query ${list}`);
        const items = [];
        for (const item of data?.value ?? []) items.push(await decodeItem(list, item));
        return { items, nextSkipToken: data?.['@odata.nextLink'] ?? null };
      },
      listNames() { return Object.keys(schema.lists); },
    };
  }

  // ============================================================ sharepoint-rest mode
  // Full-fidelity SPO REST (Hyperlink writes supported via SP.FieldUrlValue). Requires an
  // SPO-audience app token that actually carries Sites.Selected roles — i.e. the
  // SHAREPOINT-resource application permission must be consented, not just Graph's.
  function spoRestMode() {
    const itemsUrl = (list) => `${site}/_api/web/lists/getbytitle('${encodeURIComponent(list)}')/items`;

    const entityTypes = new Map();
    async function entityType(list) {
      meta(list);
      if (!entityTypes.has(list)) {
        const data = await call('GET',
          `${site}/_api/web/lists/getbytitle('${encodeURIComponent(list)}')?$select=ListItemEntityTypeFullName`,
          { headers: { Accept: 'application/json;odata=nometadata' } }, `entity type of ${list}`);
        entityTypes.set(list, data.ListItemEntityTypeFullName);
      }
      return entityTypes.get(list);
    }

    const keyToId = new Map();
    const idToKey = new Map();
    function cachePair(list, key, id) {
      if (key == null || id == null) return;
      keyToId.set(`${list}|${key}`, id);
      idToKey.set(`${list}|${id}`, key);
    }
    async function resolveKeyToId(list, keyField, key) {
      const hit = keyToId.get(`${list}|${key}`);
      if (hit != null) return hit;
      const filter = encodeURIComponent(`${keyField} eq '${escq(key)}'`);
      const data = await call('GET', `${itemsUrl(list)}?$filter=${filter}&$top=1&$select=Id,${keyField}`,
        { headers: { Accept: 'application/json;odata=nometadata' } }, `lookup ${list}`);
      const item = (data.value ?? [])[0];
      if (!item) return null;
      cachePair(list, key, item.Id);
      return item.Id;
    }
    async function resolveIdToKey(list, keyField, id) {
      const hit = idToKey.get(`${list}|${id}`);
      if (hit != null) return hit;
      let item;
      try {
        item = await call('GET', `${itemsUrl(list)}(${id})?$select=Id,${keyField}`,
          { headers: { Accept: 'application/json;odata=nometadata' } }, `lookup ${list} item`);
      } catch (e) {
        if (e && e.code === 'notFound') return null;
        throw e;
      }
      const key = item?.[keyField] ?? null;
      cachePair(list, key, id);
      return key;
    }

    async function encodeFields(list, fields, { isCreate }) {
      const m = meta(list);
      const out = {};
      for (const [name, raw] of Object.entries(fields ?? {})) {
        const col = m.cols.get(name);
        if (!col) { if (raw != null) out[name] = raw; continue; }
        if (raw == null) {
          if (!isCreate) {
            if (col.type === 'Lookup') out[`${name}Id`] = null;
            else out[name] = null;
          }
          continue;
        }
        switch (col.type) {
          case 'Lookup': {
            const id = await resolveKeyToId(col.lookupList, col.lookupField, String(raw));
            if (id == null) throw new Error(`app-auth rest: cannot resolve lookup ${list}.${name} -> ${col.lookupList} key`);
            out[`${name}Id`] = id;
            break;
          }
          case 'Hyperlink':
            out[name] = { __metadata: { type: 'SP.FieldUrlValue' }, Url: String(raw), Description: String(raw) };
            break;
          case 'Boolean': out[name] = raw === true; break;
          default: out[name] = raw;
        }
      }
      if (isCreate && (out.Title == null || out.Title === '')) {
        out.Title = String(fields?.[m.keyField] ?? fields?.Title ?? 'v2');
      }
      return out;
    }

    async function decodeItem(list, item) {
      const m = meta(list);
      const fields = {};
      for (const [name, col] of m.cols) {
        switch (col.type) {
          case 'Lookup': {
            const id = item[`${name}Id`] ?? null;
            fields[name] = id == null ? null : await resolveIdToKey(col.lookupList, col.lookupField, id);
            break;
          }
          case 'Hyperlink': fields[name] = item[name]?.Url ?? null; break;
          case 'DateTime': fields[name] = item[name] == null ? null : new Date(item[name]).toISOString(); break;
          case 'Boolean': fields[name] = item[name] === true; break;
          default: fields[name] = item[name] ?? null;
        }
      }
      cachePair(list, fields[m.keyField], item.Id);
      return { id: String(item.Id), etag: item['odata.etag'] ?? item['@odata.etag'] ?? null, fields };
    }

    const NO_MATCH = Symbol('no-match');
    async function buildFilter(list, filter) {
      const m = meta(list);
      const parts = [];
      for (const [name, value] of Object.entries(filter ?? {})) {
        const col = m.cols.get(name);
        if (col?.type === 'Lookup') {
          const id = await resolveKeyToId(col.lookupList, col.lookupField, String(value));
          if (id == null) return NO_MATCH;
          parts.push(`${name}Id eq ${id}`);
        } else if (typeof value === 'boolean') {
          parts.push(`${name} eq ${value ? 1 : 0}`);
        } else if (typeof value === 'number') {
          parts.push(`${name} eq ${value}`);
        } else {
          parts.push(`${name} eq '${escq(value)}'`);
        }
      }
      return parts.join(' and ');
    }

    const H = { Accept: 'application/json;odata=nometadata' };
    const HV = { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=verbose' };

    return {
      async createItem(list, fields) {
        const body = await encodeFields(list, fields, { isCreate: true });
        body.__metadata = { type: await entityType(list) };
        const data = await call('POST', itemsUrl(list), { body, headers: HV }, `create in ${list}`);
        return decodeItem(list, data);
      },
      async getItem(list, id) {
        const data = await call('GET', `${itemsUrl(list)}(${id})`, { headers: H }, `get ${list} item`);
        return decodeItem(list, data);
      },
      async updateItem(list, id, fields, updOpts = {}) {
        const body = await encodeFields(list, fields, { isCreate: false });
        body.__metadata = { type: await entityType(list) };
        await call('POST', `${itemsUrl(list)}(${id})`, {
          body, headers: { ...HV, 'If-Match': updOpts.ifMatch ?? '*', 'X-HTTP-Method': 'MERGE' },
        }, `update ${list} item`);
        return { id: String(id), etag: null, fields: {} };
      },
      async deleteItem(list, id) {
        meta(list);
        await call('POST', `${itemsUrl(list)}(${id})`, {
          headers: { ...H, 'If-Match': '*', 'X-HTTP-Method': 'DELETE' },
        }, `delete ${list} item`);
        return true;
      },
      async query(list, { filter, top, skipToken } = {}) {
        let url;
        if (typeof skipToken === 'string' && skipToken.startsWith('http')) {
          url = skipToken;
        } else {
          const f = await buildFilter(list, filter);
          if (f === NO_MATCH) return { items: [], nextSkipToken: null };
          url = `${itemsUrl(list)}?$top=${Math.min(top ?? 100, 999)}`;
          if (f) url += `&$filter=${encodeURIComponent(f)}`;
        }
        const data = await call('GET', url, { headers: H }, `query ${list}`);
        const items = [];
        for (const item of data.value ?? []) items.push(await decodeItem(list, item));
        return { items, nextSkipToken: data['odata.nextLink'] ?? data['@odata.nextLink'] ?? null };
      },
      listNames() { return Object.keys(schema.lists); },
    };
  }

  const impl = apiMode === 'graph' ? graphMode() : spoRestMode();
  return {
    ...impl,
    /** Safe metadata for status/reporting — never an id/URL/token. */
    describe() {
      return { apiMode, authMode: 'app-certificate', hyperlinkWriteBehavior: hyperlinkBehavior, listPrefix };
    },
    /** Count of Hyperlink writes omitted under 'omit-and-report' — runners MUST surface this. */
    hyperlinkOmissions() { return omittedHyperlinkWrites; },
  };
}

export default createAppAuthTransport;
