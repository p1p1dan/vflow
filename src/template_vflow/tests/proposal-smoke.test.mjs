// proposal-smoke.test.mjs — install/hook smoke tests for the 3.0.1 hardening.
// Covers the three behaviors the lifecycle suite does not exercise:
//   - pre-tool-gate hook: block/allow logic + features.gate config toggle
//   - set command guards: done/archived and T3 tier changes are recovery-only
//   - accept audit trail: accepted_at/by/source are written on acceptance
// Run with: node --test tests/proposal-smoke.test.mjs

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, '..', 'scripts');
const CLI = join(SCRIPTS_DIR, 'dist', 'proposal.js');
const GATE = join(SCRIPTS_DIR, 'dist', 'pre-tool-gate.js');
const VFLOW_ROOT = join(__dirname, '..');
const PROPOSALS_DIR = join(VFLOW_ROOT, 'proposals');
const REPO_INDEX = join(VFLOW_ROOT, 'repo.json');
const CONFIG_PATH = join(VFLOW_ROOT, 'config.json');
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
  const result = spawnSync('node', [CLI, ...args], {
    cwd: join(VFLOW_ROOT, '..'),
    encoding: 'utf-8',
    input: stdinInput,
    env: { ...process.env, CLAUDE_SESSION_ID: 'test-smoke-001', ...extraEnv },
  });
  return `${result.stdout || ''}\n${result.stderr || ''}`;
}

// Spawns the PreToolUse gate directly with a JSON payload on stdin and returns
// the exit code + streams. Exit 0 = allow, exit 2 = block.
function runGate(toolName) {
  const result = spawnSync('node', [GATE], {
    cwd: join(VFLOW_ROOT, '..'),
    encoding: 'utf-8',
    input: toolName === undefined ? '' : JSON.stringify({ tool_name: toolName }),
  });
  return { code: result.status, stderr: result.stderr || '', stdout: result.stdout || '' };
}

const TEST_ACCEPT_OPTS = { input: 'yes\n' };

function readJson(path) { return JSON.parse(readFileSync(path, 'utf-8')); }
function writeJson(path, data) { writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8'); }

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
  const out = run('create', slug, '--title', opts.title || slug,
    '--type', opts.type || 'feature', '--tier', opts.tier || 'T2');
  const id = out.match(/P-\d{8}-\d{3}/)?.[0];
  if (!id) throw new Error(`Failed to create proposal: ${out}`);
  return { id, dir: findDir(id) };
}

function appendLedger(dir, from, to, satisfied) {
  appendFileSync(join(dir, 'ledger.md'),
    `\n## [${new Date().toISOString()}] ${from} -> ${to}\n- Satisfied: ${satisfied}\n`, 'utf-8');
}

// Drives a fresh T2 proposal all the way to `check`, hand-writing ledger entries.
function advanceToCheck(dir) {
  run('move', '--to', 'decide');
  appendLedger(dir, 'understand', 'decide', 'moved to decide');
  run('spec-ref', 'none', '--reason', 'n/a');
  run('move', '--to', 'build', '--scope', 'smoke scope');
  appendLedger(dir, 'decide', 'build', 'entered build');
  run('item', 'add', '--title', 'Do the thing');
  run('item', 'start', '--item', 'E-001');
  run('item', 'complete', '--item', 'E-001', '--note', 'done');
  run('move', '--to', 'check');
  appendLedger(dir, 'build', 'check', 'moved to check');
}

// --- Group A: pre-tool-gate hook ---
describe('smoke: pre-tool-gate hook', () => {
  beforeEach(() => cleanState());
  afterEach(() => { writeJson(CONFIG_PATH, { ...readJson(CONFIG_PATH), features: { gate: true } }); });

  test('A1. blocks Write when no active proposal exists (exit 2)', () => {
    const { code, stderr } = runGate('Write');
    assert.equal(code, 2);
    assert.match(stderr, /No active proposal exists/);
  });

  test('A2. allows Write when an active proposal exists (exit 0)', () => {
    createAndGetDir('smoke-gate-active');
    const { code } = runGate('Write');
    assert.equal(code, 0);
  });

  test('A3. allows Write when features.gate=false even with no proposal (exit 0)', () => {
    // no proposal created — gate would block by default
    writeJson(CONFIG_PATH, { ...readJson(CONFIG_PATH), features: { gate: false } });
    const { code } = runGate('Write');
    assert.equal(code, 0);
  });

  test('A4. never gates non-write tools (Read/Bash) regardless of proposal state', () => {
    assert.equal(runGate('Read').code, 0);
    assert.equal(runGate('Bash').code, 0);
  });
});

// --- Group B: set command recovery-only guards ---
describe('smoke: set command guards', () => {
  beforeEach(() => cleanState());

  test('B1. set lifecycle --value done is rejected without --recovery', () => {
    const { dir } = createAndGetDir('smoke-set-done');
    const out = run('set', 'lifecycle', '--value', 'done');
    assert.match(out, /Cannot set lifecycle to 'done' directly/);
    assert.match(out, /proposal\.js accept/);
    assert.equal(readJson(join(dir, 'proposal.json')).lifecycle_status, 'active');
  });

  test('B2. set lifecycle --value archived is rejected without --recovery', () => {
    const { dir } = createAndGetDir('smoke-set-archived');
    const out = run('set', 'lifecycle', '--value', 'archived');
    assert.match(out, /Cannot set lifecycle to 'archived' directly/);
    assert.match(out, /proposal\.js archive/);
    assert.equal(readJson(join(dir, 'proposal.json')).lifecycle_status, 'active');
  });

  test('B3. set lifecycle --value done --recovery true is allowed (escape hatch)', () => {
    const { dir } = createAndGetDir('smoke-set-recovery');
    const out = run('set', 'lifecycle', '--value', 'done', '--recovery', 'true');
    assert.match(out, /Lifecycle: active -> done \(recovery mode\)/);
    assert.equal(readJson(join(dir, 'proposal.json')).lifecycle_status, 'done');
  });

  test('B4. set lifecycle to a non-protected value (on_hold) works without --recovery', () => {
    const { dir } = createAndGetDir('smoke-set-onhold');
    const out = run('set', 'lifecycle', '--value', 'on_hold');
    assert.match(out, /Lifecycle: active -> on_hold/);
    assert.equal(readJson(join(dir, 'proposal.json')).lifecycle_status, 'on_hold');
  });

  test('B5. set tier into T3 is rejected without --recovery, allowed with it', () => {
    const { dir } = createAndGetDir('smoke-set-tier', { tier: 'T2' });
    let out = run('set', 'tier', '--value', 'T3');
    assert.match(out, /Cannot change tier from T2 to T3 without --recovery/);
    assert.equal(readJson(join(dir, 'proposal.json')).tier, 'T2');

    out = run('set', 'tier', '--value', 'T3', '--recovery', 'true');
    assert.match(out, /Tier: T2 -> T3 \(recovery mode\)/);
    assert.equal(readJson(join(dir, 'proposal.json')).tier, 'T3');
  });

  test('B6. set tier between non-T3 tiers (T2 <-> T1) needs no --recovery', () => {
    const { dir } = createAndGetDir('smoke-set-tier-low', { tier: 'T2' });
    const out = run('set', 'tier', '--value', 'T1');
    assert.match(out, /Tier: T2 -> T1/);
    assert.equal(readJson(join(dir, 'proposal.json')).tier, 'T1');
  });
});

// --- Group C: accept audit trail ---
describe('smoke: accept audit trail', () => {
  beforeEach(() => cleanState());

  test('C1. interactive accept records source=user_terminal', () => {
    const { dir } = createAndGetDir('smoke-accept-user');
    advanceToCheck(dir);
    const out = run('accept', TEST_ACCEPT_OPTS);
    assert.match(out, /Accepted\./);
    assert.match(out, /Audit: accepted_by=user source=user_terminal/);
    const p = readJson(join(dir, 'proposal.json'));
    assert.equal(p.accepted_source, 'user_terminal');
    assert.equal(p.accepted_by, 'user');
    assert.match(p.accepted_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  test('C2. relayed accept (--user-approved) records source=ai_relay', () => {
    const { dir } = createAndGetDir('smoke-accept-relay');
    advanceToCheck(dir);
    const out = run('accept', '--user-approved', 'true');
    assert.match(out, /Audit: accepted_by=ai source=ai_relay/);
    const p = readJson(join(dir, 'proposal.json'));
    assert.equal(p.accepted_source, 'ai_relay');
    assert.equal(p.accepted_by, 'ai');
  });
});
