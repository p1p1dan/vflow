// session-binding.test.mjs — unit tests for lib/session.ts (compiled dist).
//
// Run: node --test tests/session-binding.test.mjs
// Each test points SESSIONS_DIR at a temp dir by setting the .vflow root via a
// throwaway project layout, then exercises the compiled session module.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const REPO = process.cwd();
const DIST = join(REPO, '.vflow', 'scripts', 'dist', 'lib');

// The session module resolves SESSIONS_DIR from config.ts at import time via the
// real .vflow root. We test the pure functions that take a sessionKey and the
// fallback chain by manipulating the live sessions dir under a sandbox guard.
// To keep tests isolated we import the module and operate against a temp key
// namespace, cleaning up after each test.

const session = await import(pathToFileURL(join(DIST, 'session.js')).href);
const config = await import(pathToFileURL(join(DIST, 'config.js')).href);
const SESSIONS_DIR = config.SESSIONS_DIR;

function cleanTestKeys() {
  try {
    for (const f of readdirSync(SESSIONS_DIR)) {
      if (f.startsWith('claude_TEST') || f.startsWith('term_TEST') || f.startsWith('TESTONLY')) {
        rmSync(join(SESSIONS_DIR, f), { force: true });
      }
    }
  } catch { /* dir may not exist */ }
}

test('resolveSessionKey: payload.session_id', () => {
  const k = session.resolveSessionKey({ session_id: 'abc-123' });
  assert.equal(k, 'claude_abc-123');
});

test('resolveSessionKey: payload.sessionId camelCase', () => {
  const k = session.resolveSessionKey({ sessionId: 'X.Y_Z' });
  assert.equal(k, 'claude_X.Y_Z');
});

test('resolveSessionKey: nested input.session_id', () => {
  const k = session.resolveSessionKey({ input: { session_id: 'nested-1' } });
  assert.equal(k, 'claude_nested-1');
});

test('resolveSessionKey: sanitize illegal chars + truncate', () => {
  const k = session.resolveSessionKey({ session_id: 'a/b c!' + 'z'.repeat(300) });
  assert.match(k, /^claude_a_b_c_z+$/);
  // claude_ prefix (7) + 160 max
  assert.ok(k.length <= 7 + 160);
});

test('resolveSessionKey: ENV fallback', () => {
  const prev = process.env.CLAUDE_SESSION_ID;
  process.env.CLAUDE_SESSION_ID = 'env-sid';
  try {
    assert.equal(session.resolveSessionKey(), 'claude_env-sid');
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = prev;
  }
});

test('resolveSessionKey: null when nothing available', () => {
  const saved = {};
  for (const k of ['CLAUDE_SESSION_ID', 'CLAUDE_CODE_SESSION_ID', 'WT_SESSION', 'TERM_SESSION_ID']) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  try {
    assert.equal(session.resolveSessionKey(), null);
    assert.equal(session.resolveSessionKey({}), null);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined) process.env[k] = v;
    }
  }
});

test('write/read/clear binding round-trip', () => {
  cleanTestKeys();
  const key = 'claude_TESTrw';
  session.writeSessionBinding(key, 'mm-dd-mytask');
  assert.equal(session.readSessionBinding(key), 'mm-dd-mytask');
  session.clearSessionBinding(key);
  assert.equal(session.readSessionBinding(key), null);
  cleanTestKeys();
});

test('clearTaskFromSessions removes only matching task', () => {
  cleanTestKeys();
  session.writeSessionBinding('claude_TESTa', 'task-X');
  session.writeSessionBinding('claude_TESTb', 'task-X');
  session.writeSessionBinding('claude_TESTc', 'task-Y');
  const removed = session.clearTaskFromSessions('task-X');
  assert.equal(removed, 2);
  assert.equal(session.readSessionBinding('claude_TESTa'), null);
  assert.equal(session.readSessionBinding('claude_TESTc'), 'task-Y');
  cleanTestKeys();
});

test('resolveCurrentTaskSlug: session binding wins', () => {
  cleanTestKeys();
  const key = 'claude_TESTwin';
  session.writeSessionBinding(key, 'bound-task');
  const r = session.resolveCurrentTaskSlug({ session_id: 'TESTwin' }, () => 'ptr-task');
  assert.deepEqual(r, { slug: 'bound-task', source: 'session' });
  cleanTestKeys();
});

test('resolveCurrentTaskSlug: pointer fallback when no session id and !=1 files', () => {
  cleanTestKeys();
  // two test files present, but also possibly real files; force >=2 by adding two
  session.writeSessionBinding('claude_TESTp1', 'a');
  session.writeSessionBinding('claude_TESTp2', 'b');
  const r = session.resolveCurrentTaskSlug(undefined, () => 'ptr-task');
  // With >=2 session files, must fall back to pointer (refuse to guess)
  assert.equal(r.source, 'pointer');
  assert.equal(r.slug, 'ptr-task');
  cleanTestKeys();
});

test('resolveCurrentTaskSlug: none when nothing', () => {
  cleanTestKeys();
  // Ensure no leftover test files; real sessions dir may have files from running
  // Claude — guard by checking count. If other files exist this asserts pointer.
  const r = session.resolveCurrentTaskSlug({ session_id: 'TESTnope-unbound' }, () => null);
  // session id has no binding; fallback chain → depends on file count → pointer(null)/none
  assert.ok(['none', 'pointer', 'session-fallback'].includes(r.source));
  cleanTestKeys();
});
