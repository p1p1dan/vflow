// store.ts — All IO: proposal CRUD, state.json CRUD, ledger.md read/parse, repo index, item helpers.
import { existsSync, mkdirSync, writeFileSync, renameSync, readdirSync, } from 'node:fs';
import { join } from 'node:path';
import { PROPOSALS_DIR, REPO_INDEX_PATH, isoNow, todayCompact, readJson, readText, } from './config.js';
// --- ID generation ---
export function nextProposalId() {
    const today = todayCompact();
    const prefix = `P-${today}-`;
    const index = readRepoIndex();
    let max = 0;
    for (const entry of index.proposals) {
        if (entry.id.startsWith(prefix)) {
            const n = parseInt(entry.id.slice(prefix.length), 10);
            if (n > max)
                max = n;
        }
    }
    // Also scan directory for IDs not yet in index
    if (existsSync(PROPOSALS_DIR)) {
        for (const name of readdirSync(PROPOSALS_DIR)) {
            if (name.startsWith(prefix)) {
                const seg = name.slice(prefix.length).split('-')[0];
                const n = parseInt(seg, 10);
                if (n > max)
                    max = n;
            }
        }
    }
    return `${prefix}${String(max + 1).padStart(3, '0')}`;
}
export function proposalDir(id, slug) {
    return join(PROPOSALS_DIR, `${id}-${slug}`);
}
export function findProposalDir(id) {
    if (!existsSync(PROPOSALS_DIR))
        return null;
    for (const name of readdirSync(PROPOSALS_DIR)) {
        if (name.startsWith(id)) {
            return join(PROPOSALS_DIR, name);
        }
    }
    return null;
}
// --- Atomic write helper ---
function atomicWrite(path, data) {
    const dir = join(path, '..');
    mkdirSync(dir, { recursive: true });
    const tmp = path + '.tmp';
    writeFileSync(tmp, data, 'utf-8');
    renameSync(tmp, path);
}
// --- Proposal ---
export function readProposal(dir) {
    return readJson(join(dir, 'proposal.json'));
}
export function writeProposal(dir, proposal) {
    proposal.updated_at = isoNow();
    mkdirSync(dir, { recursive: true });
    atomicWrite(join(dir, 'proposal.json'), JSON.stringify(proposal, null, 2) + '\n');
}
// --- State (T2/T3 only; every field participates in a gate, so this is the only
// I/O surface — the CLI is the sole writer, never AI Write/Edit) ---
export function readState(dir) {
    return readJson(join(dir, 'state.json'));
}
export function writeState(dir, state) {
    mkdirSync(dir, { recursive: true });
    atomicWrite(join(dir, 'state.json'), JSON.stringify(state, null, 2) + '\n');
}
// --- Ledger (T2/T3 only; CLI only writes the initial header — every transition/
// checkpoint entry after that is hand-written by the AI via Write/Edit) ---
export function initLedger(dir, id, title) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ledger.md'), `# Ledger: ${title} (${id})\n`, 'utf-8');
}
export function readLedgerText(dir) {
    return readText(join(dir, 'ledger.md'));
}
const TRANSITION_HEADING = /^## \[(.+?)\] (\S+) -> (\S+)$/;
// Parses every "## [ts] from -> to" heading (transitions, including self-loops
// like "decide -> decide") plus its "- Satisfied:" line. CHECKPOINT headings
// don't match this shape and are ignored here.
export function parseLedgerTransitions(dir) {
    const lines = readLedgerText(dir).split('\n');
    const entries = [];
    for (let i = 0; i < lines.length; i++) {
        const m = TRANSITION_HEADING.exec(lines[i].trim());
        if (!m)
            continue;
        let satisfied = '';
        for (let j = i + 1; j < lines.length && !lines[j].startsWith('## '); j++) {
            const sm = /^- Satisfied:\s*(.*)$/.exec(lines[j].trim());
            if (sm) {
                satisfied = sm[1];
                break;
            }
        }
        entries.push({ ts: m[1], from: m[2], to: m[3], satisfied });
    }
    return entries;
}
export function lastLedgerTransition(dir) {
    const entries = parseLedgerTransitions(dir);
    return entries.length ? entries[entries.length - 1] : null;
}
export function lastDecideRelatedTransition(dir) {
    const entries = parseLedgerTransitions(dir);
    for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].from === 'decide' || entries[i].to === 'decide')
            return entries[i];
    }
    return null;
}
// --- Repo Index ---
export function readRepoIndex() {
    return readJson(REPO_INDEX_PATH) ?? { schema_version: 1, proposals: [] };
}
export function writeRepoIndex(index) {
    atomicWrite(REPO_INDEX_PATH, JSON.stringify(index, null, 2) + '\n');
}
export function upsertRepoIndex(entry) {
    const index = readRepoIndex();
    const idx = index.proposals.findIndex(e => e.id === entry.id);
    if (idx >= 0) {
        index.proposals[idx] = entry;
    }
    else {
        index.proposals.push(entry);
    }
    writeRepoIndex(index);
}
export function removeFromIndex(id) {
    const index = readRepoIndex();
    index.proposals = index.proposals.filter(e => e.id !== id);
    writeRepoIndex(index);
}
// --- State item helpers (serial "one doing at a time" invariant; no DAG) ---
export function activeItem(state) {
    return state.items.find(i => i.status === 'doing') ?? null;
}
export function findItem(state, itemId) {
    return state.items.find(i => i.id === itemId) ?? null;
}
export function setItemStatus(state, itemId, status) {
    const item = state.items.find(i => i.id === itemId);
    if (item)
        item.status = status;
    return item ?? null;
}
//# sourceMappingURL=store.js.map