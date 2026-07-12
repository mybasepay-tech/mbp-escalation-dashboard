// Read-only legacy exporter + JSON/API analyzer tests (Loop 36) — 100% offline with
// injected fake fetch and obviously-fake fixtures. Proves: GET-only behavior, pagination,
// attachment METADATA (never binaries), schema snapshot parsing, analyzer JSON support,
// and the sanitization contract on API-shaped exports.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createReadonlyLegacyExporter } from '../tools/migration/exportLegacyListReadonly.js';
import {
  analyzeLegacyExport, analyzeAttachmentInventory, summarizeSchemaSnapshot,
} from '../tools/migration/analyzeLegacyExport.js';
import { jsonContainerToRows, internalToDisplayMap, runAnalysis } from '../tools/migration/run-legacy-export-analysis.js';

const SITE = 'https://legacy-test.example.invalid/personal/fake_owner';

/** Route-scripted fake fetch that RECORDS every call (method + url). */
function fakeFetch(routes, calls) {
  return async (url, opts) => {
    calls.push({ url, method: opts?.method ?? 'GET' });
    for (const [substr, data] of routes) {
      if (url.includes(substr)) {
        return {
          ok: true, status: 200, headers: { get: () => null },
          text: async () => JSON.stringify(typeof data === 'function' ? data(url) : data),
        };
      }
    }
    return { ok: false, status: 404, headers: { get: () => null }, text: async () => '{}' };
  };
}

const SCHEMA_ROUTE = ['/fields?', {
  value: [
    { InternalName: 'Title', Title: 'Title', TypeAsString: 'Text', Required: true, Hidden: false, ReadOnlyField: false },
    { InternalName: 'Status', Title: 'Status', TypeAsString: 'Choice', Required: true, Hidden: false, ReadOnlyField: false, Choices: ['Assigned', 'Complete'] },
    { InternalName: 'StatusUpdates', Title: 'Status Updates', TypeAsString: 'Note', Required: false, Hidden: false, ReadOnlyField: false },
    { InternalName: '_Hidden1', Title: 'internal hidden', TypeAsString: 'Computed', Required: false, Hidden: true, ReadOnlyField: true },
  ],
}];
const USERS_ROUTE = ['/siteusers', { value: [{ Id: 7, Title: 'Fake User A', Email: 'a@example.invalid', LoginName: 'fake|a' }] }];

test('exporter: GET-only, paginated items, attachment metadata without binaries', async () => {
  const calls = [];
  const page2 = `${SITE}/_api/web/lists/getbytitle('Escalations')/items?page2`;
  const routes = [
    SCHEMA_ROUTE, USERS_ROUTE,
    ['items?page2', {
      value: [{ Id: 2, Title: 'fake two', Status: 'Complete', Attachments: false, AttachmentFiles: [] }],
    }],
    ['/items?$select=*', {
      value: [{
        Id: 1, Title: 'fake one', Status: 'Assigned', StatusUpdates: 'fake blob '.repeat(40),
        Attachments: true,
        AttachmentFiles: [{ FileName: 'fake-evidence.png', ServerRelativeUrl: '/personal/fake_owner/Lists/att/1/fake-evidence.png' }],
      }],
      'odata.nextLink': page2,
    }],
  ];
  const exporter = createReadonlyLegacyExporter({
    siteUrl: SITE, listTitle: 'Escalations', getToken: async () => 'eyJfake.tok.sig', fetchImpl: fakeFetch(routes, calls),
  });
  const result = await exporter.exportAll();

  assert.equal(result.summary.itemCount, 2, 'pagination followed odata.nextLink');
  assert.equal(result.summary.writesPerformed, 0);
  assert.ok(calls.every((c) => c.method === 'GET'), 'EVERY call is a GET');
  const withAtt = result.items.find((i) => i.id === '1');
  assert.equal(withAtt.hasAttachments, true);
  assert.equal(withAtt.attachmentCount, 1);
  assert.equal(withAtt.attachments[0].fileName, 'fake-evidence.png');
  assert.equal(withAtt.attachments[0].sizeBytes, null, 'no size fetch unless enabled');
  assert.ok(!calls.some((c) => /GetFileByServerRelativePath/.test(c.url)), 'no per-file call without opt-in');
  assert.equal(result.items.find((i) => i.id === '2').hasAttachments, false);
  // schema snapshot mapped
  assert.equal(result.schema.length, 4);
  assert.deepEqual(result.schema[1].choices, ['Assigned', 'Complete']);
  assert.equal(result.schema[3].hidden, true);
  // users resolved locally
  assert.equal(result.users['7'].email, 'a@example.invalid');
});

test('exporter: attachment size lookups are metadata-only GETs when explicitly enabled', async () => {
  const calls = [];
  const routes = [
    SCHEMA_ROUTE, USERS_ROUTE,
    ['GetFileByServerRelativePath', { Length: '2048' }],
    ['/items?$select=*', {
      value: [{ Id: 3, Attachments: true, AttachmentFiles: [{ FileName: 'f.txt', ServerRelativeUrl: '/personal/fake_owner/f.txt' }] }],
    }],
  ];
  const exporter = createReadonlyLegacyExporter({
    siteUrl: SITE, listTitle: 'Escalations', getToken: async () => 'eyJfake.tok.sig', fetchImpl: fakeFetch(routes, calls),
  });
  const result = await exporter.exportAll({ fetchAttachmentSizes: true });
  assert.equal(result.items[0].attachments[0].sizeBytes, 2048);
  const sizeCalls = calls.filter((c) => /GetFileByServerRelativePath/.test(c.url));
  assert.equal(sizeCalls.length, 1);
  assert.ok(sizeCalls[0].url.includes('$select=Length'), 'size lookup selects Length metadata only');
  assert.ok(calls.every((c) => c.method === 'GET'));
});

test('exporter: refuses to construct without site/list/token provider (fail-closed)', () => {
  assert.throws(() => createReadonlyLegacyExporter({ listTitle: 'X', getToken: () => 't' }), /siteUrl/);
  assert.throws(() => createReadonlyLegacyExporter({ siteUrl: SITE, getToken: () => 't' }), /listTitle/);
  assert.throws(() => createReadonlyLegacyExporter({ siteUrl: SITE, listTitle: 'X' }), /getToken/);
});

test('exporter: HTTP failures throw sanitized errors (no URL echoed)', async () => {
  const exporter = createReadonlyLegacyExporter({
    siteUrl: SITE,
    listTitle: 'Escalations',
    getToken: async () => 'eyJfake.tok.sig',
    fetchImpl: async () => ({
      ok: false, status: 403, headers: { get: () => null },
      text: async () => JSON.stringify({ error: `denied at ${SITE}/_api/web` }),
    }),
  });
  await assert.rejects(() => exporter.fetchSchema(), (e) => {
    assert.match(e.message, /403/);
    assert.doesNotMatch(e.message, /example\.invalid/, 'site host never echoed');
    return true;
  });
});

// ---------- analyzer JSON/API support ----------

const API_CONTAINER = {
  items: [
    {
      id: '10',
      fields: {
        Title: 'fake ten', Status: 'Assigned', Urgency: 'High',
        StatusUpdates: 'first fake history entry\nsecond longer fake history entry with detail',
        TeamsPost: 'https://teams.example.invalid/l/message/aaaa', CreatedBy: 'Fake Author A',
      },
      hasAttachments: true,
    },
    {
      id: '12',
      fields: {
        Title: 'fake twelve', Status: 'Complete', Urgency: 'Low',
        StatusUpdates: 'short', TeamsPost: 'https://teams.example.invalid/l/message/bbbbbbbbbbbbbbbb',
        CreatedBy: 'Fake Author B',
      },
      hasAttachments: false,
    },
  ],
};

test('jsonContainerToRows maps INTERNAL names to display headers and synthesizes Attachments', () => {
  const rows = jsonContainerToRows(API_CONTAINER);
  assert.equal(rows[0]['Status Updates'], API_CONTAINER.items[0].fields.StatusUpdates);
  assert.equal(rows[0]['Teams Post'], API_CONTAINER.items[0].fields.TeamsPost);
  assert.equal(rows[0]['Created By'], 'Fake Author A');
  assert.equal(rows[0].Attachments, '1');
  assert.equal(rows[1].Attachments, '0');
  const map = internalToDisplayMap([{ internalName: 'Odd_x0020_Internal', displayName: 'Status Updates' }]);
  assert.equal(map.Odd_x0020_Internal, 'Status Updates', 'schema snapshot overrides win');
});

test('API export with natural length variation reports NO truncation (the Loop 35 caps are gone)', () => {
  const rows = jsonContainerToRows(API_CONTAINER);
  const r = analyzeLegacyExport(rows);
  assert.equal(r.statusUpdates.truncationSuspected, false);
  assert.equal(r.teamsPost.truncationSuspected, false);
  assert.equal(r.statusUpdates.multilineCount, 1, 'multiline blob detected in JSON path');
});

test('runAnalysis(json) merges attachment + schema summaries and stays value-free', () => {
  const inventory = [
    { itemId: '10', count: 2, files: [{ fileName: 'fake-a.pdf', serverRelativeUrl: '/personal/fake_owner/a.pdf', sizeBytes: 1000 }, { fileName: 'fake-b.png', serverRelativeUrl: '/personal/fake_owner/b.png', sizeBytes: null }] },
  ];
  const schema = [
    { internalName: 'Status', displayName: 'Status', type: 'Choice', required: true, hidden: false, readOnly: false, choices: ['Assigned', 'Complete'] },
    { internalName: 'StatusUpdates', displayName: 'Status Updates', type: 'Note', required: false, hidden: false, readOnly: false, choices: null },
    { internalName: '_H', displayName: 'h', type: 'Computed', required: false, hidden: true, readOnly: true, choices: null },
  ];
  const { report } = runAnalysis(JSON.stringify(API_CONTAINER), { format: 'json', schema, attachments: inventory });
  assert.deepEqual(report.attachments, {
    itemsWithAttachments: 1, totalFiles: 2, maxFilesPerItem: 2,
    sizeKnownFiles: 1, totalKnownBytes: 1000, maxFileBytes: 1000,
  });
  assert.equal(report.schema.fieldCount, 3);
  assert.equal(report.schema.hiddenCount, 1);
  assert.deepEqual(report.schema.requiredFields, ['Status']);
  assert.deepEqual(report.schema.choiceFields.Status, ['Assigned', 'Complete']);
  const text = JSON.stringify(report);
  assert.doesNotMatch(text, /fake-a\.pdf|fake-b\.png/, 'file names never emitted');
  assert.doesNotMatch(text, /fake_owner|personal\//, 'paths never emitted');
  assert.doesNotMatch(text, /teams\.example\.invalid|https?:\/\//, 'URLs never emitted');
  assert.doesNotMatch(text, /Fake Author/, 'names never emitted');
  assert.doesNotMatch(text, /fake history/, 'blob text never emitted');
  assert.equal(report.distinctCounts['Created By'].distinctCount, 2, 'people appear as counts only');
});

test('analyzeAttachmentInventory and summarizeSchemaSnapshot tolerate empty/missing input', () => {
  assert.equal(analyzeAttachmentInventory([]).totalFiles, 0);
  assert.equal(analyzeAttachmentInventory(null).itemsWithAttachments, 0);
  assert.equal(summarizeSchemaSnapshot([]).fieldCount, 0);
  assert.equal(summarizeSchemaSnapshot(null).visibleFieldCount, 0);
});
