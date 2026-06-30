// proposal-pathb.test.mjs — Path B tests: 3-D spec-review gating + four-category
// knowledge suggest. Run with: node --test ../tests/proposal-pathb.test.mjs
//
// Dev-only: NOT in cli.mjs MANAGED_VFLOW, so it is not copied into user projects.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, '..', 'scripts');
const CLI = join(SCRIPTS_DIR, 'dist', 'proposal.js');
const VFLOW_ROOT = join(__dirname, '..');
const PROPOSALS_DIR = join(VFLOW_ROOT, 'proposals');
const REPO_INDEX = join(VFLOW_ROOT, 'repo.json');
const SESSIONS_DIR = join(VFLOW_ROOT, 'runtime', 'sessions');

function run(...args) {
  const lastArg = args[args.length - 1];
  let extraEnv = {};
  let stdinInput = undefined;
  if (lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg)) {
    args.pop();
    if ('input' in lastArg || 'env' in lastArg) {
      stdinInput = lastArg.input;
      extraEnv = lastArg.env || {};
    } else {
      extraEnv = lastArg;
    }
  }
  try {
    return execFileSync('node', [CLI, ...args], {
      cwd: join(VFLOW_ROOT, '..'),
      encoding: 'utf-8',
      input: stdinInput,
      env: { ...process.env, CLAUDE_SESSION_ID: 'test-session-pathb', ...extraEnv },
    });
  } catch (e) {
    return (e.stdout || '') + '\n' + (e.stderr || '');
  }
}

const TEST_ACCEPT_OPTS = { input: 'yes\n' };
const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'));
const writeJson = (p, d) => writeFileSync(p, JSON.stringify(d, null, 2) + '\n', 'utf-8');

function findDir(id) {
  for (const name of readdirSync(PROPOSALS_DIR)) {
    if (name.startsWith(id)) return join(PROPOSALS_DIR, name);
  }
  return null;
}

function cleanState() {
  if (existsSync(PROPOSALS_DIR)) rmSync(PROPOSALS_DIR, { recursive: true, force: true });
  mkdirSync(PROPOSALS_DIR, { recursive: true });
  mkdirSync(join(PROPOSALS_DIR, 'archive'), { recursive: true });
  if (existsSync(SESSIONS_DIR)) rmSync(SESSIONS_DIR, { recursive: true, force: true });
  writeJson(REPO_INDEX, { schema_version: 1, proposals: [] });
}

function createAndGetDir(slug, opts = {}) {
  const out = run('create', slug, '--title', opts.title || slug, '--type', opts.type || 'feature', '--tier', opts.tier || 'T2');
  const id = out.match(/P-\d{8}-\d{3}/)?.[0];
  if (!id) throw new Error(`Failed to create proposal: ${out}`);
  return { id, dir: findDir(id) };
}

// Drive a proposal to verify stage with one passing gating check V1.
function advanceToVerifyPassing(dir) {
  writeJson(join(dir, 'analysis.json'), { problem: 'P', scope: 'S', constraints: [], investigation: '' });
  run('advance');
  writeJson(join(dir, 'design.json'), { decisions: [{ id: 'D1', decision: 'D', rationale: 'R', tradeoffs: 'T' }] });
  run('advance');
  writeJson(join(dir, 'plan.json'), { execution_outline: 'O', verify_plan: { checks: [{ id: 'V1', description: 'C', gating: true }], evidence_required: [] } });
  run('advance');
  writeJson(join(dir, 'execution.json'), { items: [{ id: 'E-001', title: 'X', status: 'todo', depends_on: [], evidence: [] }] });
  run('advance');
  run('execution', 'start-item', '--item', 'E-001');
  run('execution', 'complete-item', '--item', 'E-001', '--evidence', 'done');
  run('advance'); // → verify
  run('verify', 'run');
  run('verify', 'check', '--check', 'V1', '--passed', '--evidence', 'ok');
  run('verify', 'run');
}

describe('vflow2 path B — spec review + knowledge', () => {
  beforeEach(() => cleanState());

  test('1. un-waived CRITICAL spec_review finding gates verify→pending_acceptance', () => {
    const { dir } = createAndGetDir('pathb-critical', { title: 'Critical gates' });
    advanceToVerifyPassing(dir);

    // Plan check passed, so all_gating_passed=true so far.
    let v = readJson(join(dir, 'verify.json'));
    assert.equal(v.all_gating_passed, true, 'baseline should pass before spec review');

    // Add a CRITICAL spec-review finding, then record it.
    v = readJson(join(dir, 'verify.json'));
    v.spec_review = {
      reviewed: false,
      scope_files: ['a.ts'],
      findings: [{ level: 'CRITICAL', dimension: 'consistency', file: 'a.ts', line: 42, issue: 'violates rule', spec_ref: 'cpp.md#57' }],
    };
    writeJson(join(dir, 'verify.json'), v);

    const recordOut = run('verify', 'review');
    assert.match(recordOut, /1 CRITICAL/);
    assert.match(recordOut, /un-waived CRITICAL/);

    v = readJson(join(dir, 'verify.json'));
    assert.equal(v.all_gating_passed, false, 'CRITICAL must force all_gating_passed=false');
    assert.equal(v.spec_review.reviewed, true, 'reviewed flag should be set');

    // Advance must be blocked by the CRITICAL gate.
    assert.match(run('advance'), /CRITICAL|all_gating_passed is not true/);
    assert.equal(readJson(join(dir, 'proposal.json')).stage, 'verify');
  });

  test('2. waiving the CRITICAL finding unblocks gating', () => {
    const { dir } = createAndGetDir('pathb-waive', { title: 'Waive critical' });
    advanceToVerifyPassing(dir);

    let v = readJson(join(dir, 'verify.json'));
    v.spec_review = {
      reviewed: false,
      scope_files: ['a.ts'],
      findings: [{ level: 'CRITICAL', dimension: 'correctness', file: 'a.ts', issue: 'edge case', waived: false }],
    };
    writeJson(join(dir, 'verify.json'), v);
    run('verify', 'review');
    assert.equal(readJson(join(dir, 'verify.json')).all_gating_passed, false);

    // Mark the finding waived, re-record.
    v = readJson(join(dir, 'verify.json'));
    v.spec_review.findings[0].waived = true;
    writeJson(join(dir, 'verify.json'), v);
    const out = run('verify', 'review');
    assert.match(out, /No un-waived CRITICAL/);
    assert.equal(readJson(join(dir, 'verify.json')).all_gating_passed, true);

    // Now advance succeeds.
    assert.match(run('advance'), /verify → pending_acceptance/);
  });

  test('3. WARNING/SUGGESTION findings do not gate', () => {
    const { dir } = createAndGetDir('pathb-warn', { title: 'Warn no gate' });
    advanceToVerifyPassing(dir);

    const v = readJson(join(dir, 'verify.json'));
    v.spec_review = {
      reviewed: false,
      scope_files: ['a.ts', 'b.ts'],
      findings: [
        { level: 'WARNING', dimension: 'consistency', file: 'a.ts', issue: 'style' },
        { level: 'SUGGESTION', dimension: 'completeness', file: 'b.ts', issue: 'doc' },
      ],
    };
    writeJson(join(dir, 'verify.json'), v);
    run('verify', 'review');

    assert.equal(readJson(join(dir, 'verify.json')).all_gating_passed, true, 'non-CRITICAL should not gate');
    assert.match(run('advance'), /verify → pending_acceptance/);
  });

  test('4. spec_review_recorded event captures level counts', () => {
    const { dir } = createAndGetDir('pathb-event', { title: 'Event counts' });
    advanceToVerifyPassing(dir);

    const v = readJson(join(dir, 'verify.json'));
    v.spec_review = {
      reviewed: false,
      scope_files: ['a.ts'],
      findings: [
        { level: 'CRITICAL', dimension: 'consistency', file: 'a.ts', issue: 'x', waived: true },
        { level: 'WARNING', dimension: 'correctness', file: 'a.ts', issue: 'y' },
      ],
    };
    writeJson(join(dir, 'verify.json'), v);
    run('verify', 'review');

    const events = readFileSync(join(dir, 'events.jsonl'), 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    const ev = events.find(e => e.type === 'spec_review_recorded');
    assert.ok(ev, 'spec_review_recorded event should exist');
    assert.match(ev.detail, /CRITICAL=1/);
    assert.match(ev.detail, /WARNING=1/);
    assert.match(ev.detail, /unwaived_critical=0/);
  });

  test('5. knowledge suggest organizes by four categories with target spec hint', () => {
    const { dir } = createAndGetDir('pathb-knowledge', { title: 'Four category' });
    advanceToVerifyPassing(dir);
    run('advance'); // → pending_acceptance
    run('accept', TEST_ACCEPT_OPTS); // → done

    const out = run('knowledge', 'suggest');
    assert.match(out, /Convention/);
    assert.match(out, /Pattern/);
    assert.match(out, /Forbidden/);
    assert.match(out, /Gotcha/);
    assert.match(out, /target/i, 'should hint a target spec file');
    // Design decision D1 should surface as a candidate.
    assert.match(out, /Decision D1/);
  });

  test('6. knowledgeSuggest returns empty when nothing to capture (auto-skip)', async () => {
    const { dir } = createAndGetDir('pathb-empty', { title: 'Empty knowledge', type: 'bug' });
    // Fresh proposal: no design.json, no verify.json → no candidates at all.
    const derivePath = pathToFileURL(join(SCRIPTS_DIR, 'dist', 'lib', 'derive.js')).href;
    const { knowledgeSuggest } = await import(derivePath);
    assert.deepEqual(knowledgeSuggest(dir), [], 'no decisions/findings → empty, so suggest auto-skips');
  });

  test('7. knowledgeSuggest surfaces spec_review CRITICAL as a categorized candidate', async () => {
    const { dir } = createAndGetDir('pathb-review-knowledge', { title: 'Review feeds knowledge' });
    advanceToVerifyPassing(dir);
    const v = readJson(join(dir, 'verify.json'));
    v.spec_review = {
      reviewed: true,
      scope_files: ['a.ts'],
      findings: [{ level: 'CRITICAL', dimension: 'consistency', file: 'a.ts', issue: 'rule break', spec_ref: 'cpp.md#57', waived: true }],
    };
    writeJson(join(dir, 'verify.json'), v);

    const derivePath = pathToFileURL(join(SCRIPTS_DIR, 'dist', 'lib', 'derive.js')).href;
    const { knowledgeSuggest } = await import(derivePath);
    const out = knowledgeSuggest(dir).join('\n');
    assert.match(out, /Convention\/Forbidden\?/, 'consistency finding → convention/forbidden category');
    assert.match(out, /cpp\.md#57/, 'should cite the existing spec ref');
  });
});
