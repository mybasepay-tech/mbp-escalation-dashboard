// Governance/doc-guard tests (Loop 11).
//
// These assert the project's transition governance is documented and consistent: the backend
// decision (SharePoint v2), the parallel-run plan, the legacy mapping plan, the AI autonomy
// guardrails, and the standing "no legacy writeback" rule. They read local docs only — no
// network, no production access — and also verify no live markers leaked into the new docs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const V2_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = dirname(dirname(V2_ROOT));
const DOCS = join(REPO_ROOT, 'docs');
const read = (rel) => readFileSync(join(REPO_ROOT, rel), 'utf8');

test('decision log records SharePoint v2 as the accepted backend target (D3)', () => {
  const log = read('docs/DECISION_LOG.md');
  assert.match(log, /SharePoint List v2 \/ Microsoft List v2/, 'must name the accepted backend');
  assert.match(log, /### D3 —[\s\S]*?DECIDED[\s\S]*?SharePoint List v2/i, 'D3 must be marked DECIDED');
  assert.match(log, /### D14 —/, 'D14 parallel-run must exist');
  assert.match(log, /### D15 —/, 'D15 writeback policy must exist');
});

test('parallel-run & cutover plan exists with phases, rollback, and approval gates', () => {
  const path = join(DOCS, 'PARALLEL_RUN_AND_CUTOVER_PLAN.md');
  assert.ok(existsSync(path), 'PARALLEL_RUN_AND_CUTOVER_PLAN.md must exist');
  const doc = readFileSync(path, 'utf8');
  assert.match(doc, /parallel[- ]run/i);
  assert.match(doc, /cutover/i);
  assert.match(doc, /rollback/i);
  assert.match(doc, /legacy/i);
  assert.match(doc, /approval/i, 'must define Rod approval checkpoints');
  // Legacy stays operational during transition.
  assert.match(doc, /legacy[\s\S]{0,80}operational|operational[\s\S]{0,80}legacy/i);
});

test('legacy → v2 mapping plan exists and is read-only / no-writeback', () => {
  const path = join(DOCS, 'LEGACY_TO_V2_MAPPING_PLAN.md');
  assert.ok(existsSync(path), 'LEGACY_TO_V2_MAPPING_PLAN.md must exist');
  const doc = readFileSync(path, 'utf8');
  assert.match(doc, /read-only/i, 'legacy is read-only during planning');
  assert.match(doc, /\bno\b[\s\S]{0,30}writeback/i, 'must state no writeback to legacy');
  assert.match(doc, /legacyItemId/, 'must map the legacy id');
});

test('AI autonomy guardrails doc exists and separates autonomous vs. approval-gated actions', () => {
  const path = join(DOCS, 'AI_AUTONOMY_GUARDRAILS.md');
  assert.ok(existsSync(path), 'AI_AUTONOMY_GUARDRAILS.md must exist');
  const doc = readFileSync(path, 'utf8');
  assert.match(doc, /without approval|autonomous/i, 'lists autonomous actions');
  assert.match(doc, /approval/i, 'lists approval-gated actions');
  // The non-negotiable gates must be named.
  assert.match(doc, /Power Automate/i);
  assert.match(doc, /cutover/i);
  assert.match(doc, /writeback to legacy/i);
});

test('no legacy writeback is stated across the migration/cutover docs', () => {
  for (const rel of [
    'docs/PARALLEL_RUN_AND_CUTOVER_PLAN.md',
    'docs/LEGACY_TO_V2_MAPPING_PLAN.md',
    'docs/MIGRATION_SPEC.md',
    'docs/CUTOVER_PLAN.md',
  ]) {
    const doc = read(rel);
    assert.match(doc, /writeback|write-back|write back/i, `${rel} must address legacy writeback`);
    assert.match(doc, /\bno\b/i, `${rel} must prohibit it`);
  }
});

test('the Loop 11 docs introduce no live integration markers', () => {
  const FORBIDDEN = [
    /graph\.microsoft\.com/i,
    /\bsharepoint\.com/i,
    /microsoftonline\.com|azurewebsites\.net/i,
    /_api\/web/i,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
    /(client_secret|clientSecret|api[_-]?key)\s*[:=]/i,
  ];
  for (const rel of [
    'docs/PARALLEL_RUN_AND_CUTOVER_PLAN.md',
    'docs/LEGACY_TO_V2_MAPPING_PLAN.md',
    'docs/AI_AUTONOMY_GUARDRAILS.md',
  ]) {
    const doc = read(rel);
    for (const re of FORBIDDEN) assert.doesNotMatch(doc, re, `${rel} must not contain ${re}`);
  }
});
