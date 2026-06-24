// session.ts — session-scoped task binding.
//
// Each Claude Code session (terminal window) binds its own active task so that
// concurrent windows do not clobber each other's current-task pointer. The
// session id is provided by the host platform via the hook stdin payload
// (session_id) or, for CLI subprocesses, via environment variables.
//
// Resolution falls back to the legacy current-task pointer when no session
// identity is available, keeping single-terminal behaviour identical.

import {
  existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync,
  renameSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { SESSIONS_DIR, RUNTIME, isoNow } from './config.js';

export type TaskSource = 'session' | 'session-fallback' | 'last-active' | 'pointer' | 'none';

// Bridge file: the prompt hook (inject.ts) knows the session id every turn and
// writes the resolved session key here. CLI subcommands (task.js) never receive
// the session id on stdin, so they read this file to learn which session they
// belong to. Within one turn the host serializes a session's hook + tool calls,
// so this is the correct session for any CLI command Claude runs that turn.
const LAST_ACTIVE_SESSION = join(RUNTIME, 'last-active-session');

interface SessionFile {
  current_task?: string;
  platform?: string;
  last_seen_at?: string;
}

// Nested payload keys some platforms wrap the real fields under.
const NESTED_KEYS = ['input', 'event', 'hook_input', 'hookInput', 'properties'];
const ENV_SESSION_KEYS = ['CLAUDE_SESSION_ID', 'CLAUDE_CODE_SESSION_ID'];
const ENV_TERMINAL_KEYS = ['WT_SESSION', 'TERM_SESSION_ID'];

function sanitize(raw: string): string {
  const safe = raw.trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._-]+|[._-]+$/g, '');
  return safe.slice(0, 160);
}

function stringField(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}

function lookupSessionId(payload: Record<string, unknown>): string | null {
  const direct = stringField(payload, 'session_id') ?? stringField(payload, 'sessionId');
  if (direct) return direct;
  for (const nk of NESTED_KEYS) {
    const nested = payload[nk];
    if (nested && typeof nested === 'object') {
      const found = lookupSessionId(nested as Record<string, unknown>);
      if (found) return found;
    }
  }
  return null;
}

// Resolve a stable session key from the hook payload, or environment variables
// when running as a CLI subprocess (no stdin payload). Returns null when no
// session identity is available.
export function resolveSessionKey(payload?: Record<string, unknown>): string | null {
  if (payload) {
    const sid = lookupSessionId(payload);
    if (sid) return `claude_${sanitize(sid)}`;
  }
  for (const k of ENV_SESSION_KEYS) {
    const v = process.env[k];
    if (v && v.trim()) return `claude_${sanitize(v)}`;
  }
  for (const k of ENV_TERMINAL_KEYS) {
    const v = process.env[k];
    if (v && v.trim()) return `term_${sanitize(v)}`;
  }
  return null;
}

export function sessionFilePath(sessionKey: string): string {
  return join(SESSIONS_DIR, `${sessionKey}.json`);
}

// -- last-active-session bridge --

// Called by the prompt hook every turn to record which session is active, so
// that CLI subcommands run during this turn can resolve the same session.
export function writeLastActiveSession(sessionKey: string): void {
  mkdirSync(RUNTIME, { recursive: true });
  const tmp = LAST_ACTIVE_SESSION + '.tmp';
  writeFileSync(tmp, sessionKey, 'utf-8');
  renameSync(tmp, LAST_ACTIVE_SESSION);
}

export function readLastActiveSession(): string | null {
  try {
    const v = readFileSync(LAST_ACTIVE_SESSION, 'utf-8').trim();
    return v || null;
  } catch {
    return null;
  }
}

// Resolve a session key from a real Claude session id exported into the CLI
// environment, if any. Unlike resolveSessionKey, this does NOT fall back to
// terminal-emulator vars (WT_SESSION etc.): those are stable per terminal but
// are a DIFFERENT key space than the hook's session_id, so binding under them
// and reading via the hook's `claude_<session_id>` key would never match.
function envClaudeSessionKey(): string | null {
  for (const k of ENV_SESSION_KEYS) {
    const v = process.env[k];
    if (v && v.trim()) return `claude_${sanitize(v)}`;
  }
  return null;
}

// Resolve the session key for a CLI subcommand (no stdin payload). Priority:
//   1. real Claude session id exported into env (rare, but authoritative)
//   2. last-active-session bridge written by the inject hook this turn — this
//      is the SAME `claude_<session_id>` key the hook resolves the task under,
//      so it keeps concurrent terminals isolated
//   3. terminal-emulator env vars (WT_SESSION etc.) as a last-resort fallback
//      for hosts that never run the inject hook
export function resolveCliSessionKey(): string | null {
  const envKey = envClaudeSessionKey();
  if (envKey) return envKey;
  const bridged = readLastActiveSession();
  if (bridged) return bridged;
  for (const k of ENV_TERMINAL_KEYS) {
    const v = process.env[k];
    if (v && v.trim()) return `term_${sanitize(v)}`;
  }
  return null;
}

function readSessionFile(path: string): SessionFile | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as SessionFile;
  } catch {
    return null;
  }
}

export function readSessionBinding(sessionKey: string): string | null {
  const data = readSessionFile(sessionFilePath(sessionKey));
  const t = data?.current_task;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

export function writeSessionBinding(sessionKey: string, taskSlug: string): void {
  mkdirSync(SESSIONS_DIR, { recursive: true });
  const path = sessionFilePath(sessionKey);
  const data: SessionFile = {
    current_task: taskSlug,
    platform: sessionKey.split('_', 1)[0],
    last_seen_at: isoNow(),
  };
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  renameSync(tmp, path);
}

export function clearSessionBinding(sessionKey: string): void {
  const path = sessionFilePath(sessionKey);
  if (existsSync(path)) {
    try { unlinkSync(path); } catch { /* */ }
  }
}

export function listSessionFiles(): string[] {
  try {
    return readdirSync(SESSIONS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => join(SESSIONS_DIR, f));
  } catch {
    return [];
  }
}

// Delete every session file bound to the given task. Called on archive so that
// stale bindings do not linger. Returns the number of files removed.
export function clearTaskFromSessions(taskSlug: string): number {
  let cleared = 0;
  for (const path of listSessionFiles()) {
    const data = readSessionFile(path);
    if (data?.current_task === taskSlug) {
      try { unlinkSync(path); cleared++; } catch { /* */ }
    }
  }
  return cleared;
}

// Resolve the active task slug for the current session, applying the fallback
// chain: session binding -> single-session fallback -> legacy pointer -> none.
// `pointerFallback` is injected to avoid a circular dependency on team.ts.
export function resolveCurrentTaskSlug(
  payload: Record<string, unknown> | undefined,
  pointerFallback: () => string | null,
): { slug: string | null; source: TaskSource } {
  const sessionKey = resolveSessionKey(payload);
  if (sessionKey) {
    const bound = readSessionBinding(sessionKey);
    if (bound) return { slug: bound, source: 'session' };
  }

  // No session id, or session id had no binding: try single-session fallback
  // (covers sub-agents that do not inherit the parent's session id). Refuse to
  // guess when 0 or >=2 session files exist.
  const files = listSessionFiles();
  if (files.length === 1) {
    const data = readSessionFile(files[0]);
    const t = data?.current_task;
    if (typeof t === 'string' && t.trim()) {
      return { slug: t.trim(), source: 'session-fallback' };
    }
  }

  const ptr = pointerFallback();
  if (ptr) return { slug: ptr, source: 'pointer' };
  return { slug: null, source: 'none' };
}

// Resolve the active task slug for a CLI subcommand (no stdin payload). Order:
//   1. session binding via CLI session key (ENV or last-active bridge)
//   2. single-session fallback (exactly one session file)
//   3. legacy pointer
//   4. none
// This is the counterpart to resolveCurrentTaskSlug for the hook side, so that
// task.js commands resolve the SAME task the user's session is bound to instead
// of the last-written global pointer.
export function resolveCliTaskSlug(
  pointerFallback: () => string | null,
): { slug: string | null; source: TaskSource } {
  const sessionKey = resolveCliSessionKey();
  if (sessionKey) {
    const bound = readSessionBinding(sessionKey);
    if (bound) {
      return {
        slug: bound,
        source: envClaudeSessionKey() ? 'session' : 'last-active',
      };
    }
  }

  const files = listSessionFiles();
  if (files.length === 1) {
    const data = readSessionFile(files[0]);
    const t = data?.current_task;
    if (typeof t === 'string' && t.trim()) {
      return { slug: t.trim(), source: 'session-fallback' };
    }
  }

  const ptr = pointerFallback();
  if (ptr) return { slug: ptr, source: 'pointer' };
  return { slug: null, source: 'none' };
}
