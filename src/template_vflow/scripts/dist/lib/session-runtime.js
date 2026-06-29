// session-runtime.ts — Session binding layer (hint only, never writes proposal truth).
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, } from 'node:fs';
import { join } from 'node:path';
import { SESSIONS_DIR, RUNTIME_DIR, isoNow, readJson } from './config.js';
const LAST_ACTIVE_SESSION = join(RUNTIME_DIR, 'last-active-session');
const NESTED_KEYS = ['input', 'event', 'hook_input', 'hookInput', 'properties'];
const ENV_SESSION_KEYS = ['CLAUDE_SESSION_ID', 'CLAUDE_CODE_SESSION_ID'];
const ENV_TERMINAL_KEYS = ['WT_SESSION', 'TERM_SESSION_ID'];
function sanitize(raw) {
    const safe = raw.trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._-]+|[._-]+$/g, '');
    return safe.slice(0, 160);
}
function stringField(obj, key) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim())
        return v.trim();
    return null;
}
function lookupSessionId(payload) {
    const direct = stringField(payload, 'session_id') ?? stringField(payload, 'sessionId');
    if (direct)
        return direct;
    for (const nk of NESTED_KEYS) {
        const nested = payload[nk];
        if (nested && typeof nested === 'object') {
            const found = lookupSessionId(nested);
            if (found)
                return found;
        }
    }
    return null;
}
export function resolveSessionKey(payload) {
    if (payload) {
        const sid = lookupSessionId(payload);
        if (sid)
            return `claude_${sanitize(sid)}`;
    }
    for (const k of ENV_SESSION_KEYS) {
        const v = process.env[k];
        if (v && v.trim())
            return `claude_${sanitize(v)}`;
    }
    for (const k of ENV_TERMINAL_KEYS) {
        const v = process.env[k];
        if (v && v.trim())
            return `term_${sanitize(v)}`;
    }
    return null;
}
export function writeLastActiveSession(sessionKey) {
    mkdirSync(RUNTIME_DIR, { recursive: true });
    const tmp = LAST_ACTIVE_SESSION + '.tmp';
    writeFileSync(tmp, sessionKey, 'utf-8');
    renameSync(tmp, LAST_ACTIVE_SESSION);
}
export function readLastActiveSession() {
    try {
        const v = readFileSync(LAST_ACTIVE_SESSION, 'utf-8').trim();
        return v || null;
    }
    catch {
        return null;
    }
}
export function sessionFilePath(sessionKey) {
    return join(SESSIONS_DIR, `${sessionKey}.json`);
}
export function readSession(sessionKey) {
    return readJson(sessionFilePath(sessionKey));
}
export function writeSession(session) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
    session.last_seen_at = isoNow();
    const path = sessionFilePath(session.session_id);
    const tmp = path + '.tmp';
    writeFileSync(tmp, JSON.stringify(session, null, 2) + '\n', 'utf-8');
    renameSync(tmp, path);
}
export function bindSession(sessionKey, proposalId) {
    const session = {
        session_id: sessionKey,
        active_proposal_id: proposalId,
        active_execution_item_id: null,
        pending_user_confirmation: false,
        last_seen_at: isoNow(),
    };
    writeSession(session);
}
export function updateSessionExecutionItem(sessionKey, itemId) {
    const session = readSession(sessionKey);
    if (!session)
        return;
    session.active_execution_item_id = itemId;
    writeSession(session);
}
export function updateSessionConfirmation(sessionKey, pending) {
    const session = readSession(sessionKey);
    if (!session)
        return;
    session.pending_user_confirmation = pending;
    writeSession(session);
}
export function clearSessionBinding(sessionKey) {
    const path = sessionFilePath(sessionKey);
    if (existsSync(path)) {
        try {
            unlinkSync(path);
        }
        catch { /* */ }
    }
}
export function clearProposalFromSessions(proposalId) {
    let cleared = 0;
    if (!existsSync(SESSIONS_DIR))
        return cleared;
    for (const name of readdirSync(SESSIONS_DIR)) {
        if (!name.endsWith('.json'))
            continue;
        const path = join(SESSIONS_DIR, name);
        const data = readJson(path);
        if (data?.active_proposal_id === proposalId) {
            try {
                unlinkSync(path);
                cleared++;
            }
            catch { /* */ }
        }
    }
    return cleared;
}
export function resolveActiveProposalId(payload, repoFallback) {
    const sessionKey = resolveSessionKey(payload);
    if (sessionKey) {
        writeLastActiveSession(sessionKey);
        const session = readSession(sessionKey);
        if (session?.active_proposal_id) {
            return { id: session.active_proposal_id, source: 'session' };
        }
    }
    // Single-session fallback
    if (existsSync(SESSIONS_DIR)) {
        const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
        if (files.length === 1) {
            const data = readJson(join(SESSIONS_DIR, files[0]));
            if (data?.active_proposal_id) {
                return { id: data.active_proposal_id, source: 'session-fallback' };
            }
        }
    }
    const fallback = repoFallback();
    if (fallback)
        return { id: fallback, source: 'repo-single-active' };
    return { id: null, source: 'none' };
}
export function resolveCliProposalId(repoFallback) {
    // Try env-based session key
    for (const k of ENV_SESSION_KEYS) {
        const v = process.env[k];
        if (v && v.trim()) {
            const key = `claude_${sanitize(v)}`;
            const session = readSession(key);
            if (session?.active_proposal_id) {
                return { id: session.active_proposal_id, source: 'session' };
            }
        }
    }
    // last-active-session bridge
    const bridged = readLastActiveSession();
    if (bridged) {
        const session = readSession(bridged);
        if (session?.active_proposal_id) {
            return { id: session.active_proposal_id, source: 'session-fallback' };
        }
    }
    const fallback = repoFallback();
    if (fallback)
        return { id: fallback, source: 'repo-single-active' };
    return { id: null, source: 'none' };
}
//# sourceMappingURL=session-runtime.js.map