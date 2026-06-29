// store.ts — All IO: proposal CRUD, artifacts, events, repo index, item helpers.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync, readdirSync, } from 'node:fs';
import { join } from 'node:path';
import { PROPOSALS_DIR, REPO_INDEX_PATH, isoNow, todayCompact, readJson, } from './config.js';
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
            const full = join(PROPOSALS_DIR, name);
            return full;
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
export function readArtifact(dir, name) {
    return readJson(join(dir, `${name}.json`));
}
export function writeArtifact(dir, name, data) {
    mkdirSync(dir, { recursive: true });
    atomicWrite(join(dir, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
}
// --- Events ---
export function appendEvent(dir, event) {
    mkdirSync(dir, { recursive: true });
    const line = JSON.stringify(event) + '\n';
    appendFileSync(join(dir, 'events.jsonl'), line, 'utf-8');
}
export function readEvents(dir) {
    const path = join(dir, 'events.jsonl');
    if (!existsSync(path))
        return [];
    const lines = readFileSync(path, 'utf-8').split('\n').filter(l => l.trim());
    return lines.map(l => JSON.parse(l));
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
// --- Execution item helpers ---
export function readExecution(dir) {
    return readArtifact(dir, 'execution');
}
export function readyItems(exec) {
    const doneIds = new Set(exec.items.filter(i => i.status === 'done').map(i => i.id));
    return exec.items.filter(i => i.status === 'todo' && i.depends_on.every(dep => doneIds.has(dep)));
}
export function activeItem(exec) {
    return exec.items.find(i => i.status === 'doing') ?? null;
}
export function findItem(exec, itemId) {
    return exec.items.find(i => i.id === itemId) ?? null;
}
export function setItemStatus(exec, itemId, status) {
    const item = exec.items.find(i => i.id === itemId);
    if (item)
        item.status = status;
    return item ?? null;
}
// --- DAG validation ---
export function detectCycle(items) {
    const ids = new Set(items.map(i => i.id));
    const visited = new Set();
    const stack = new Set();
    function dfs(id) {
        if (stack.has(id))
            return true;
        if (visited.has(id))
            return false;
        visited.add(id);
        stack.add(id);
        const item = items.find(i => i.id === id);
        if (item) {
            for (const dep of item.depends_on) {
                if (ids.has(dep) && dfs(dep))
                    return true;
            }
        }
        stack.delete(id);
        return false;
    }
    for (const id of ids) {
        if (dfs(id))
            return true;
    }
    return false;
}
//# sourceMappingURL=store.js.map