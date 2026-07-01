// config.ts — Path constants, configuration types, and time helpers.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function resolveRoot() {
    let dir = __dirname;
    for (let i = 0; i < 5; i++) {
        const parent = dirname(dir);
        if (existsSync(join(parent, 'config.json')) && existsSync(join(parent, 'repo.json'))) {
            return parent;
        }
        dir = parent;
    }
    return dirname(dirname(__dirname));
}
export const ROOT = resolveRoot();
export const SCRIPTS_DIR = join(ROOT, 'scripts');
export const PROJECT_ROOT = dirname(ROOT);
export const PROPOSALS_DIR = join(ROOT, 'proposals');
export const ARCHIVE_DIR = join(PROPOSALS_DIR, 'archive');
export const RUNTIME_DIR = join(ROOT, 'runtime');
export const SESSIONS_DIR = join(RUNTIME_DIR, 'sessions');
export const KNOWLEDGE_DIR = join(ROOT, 'knowledge');
export const SPEC_DIR = join(ROOT, 'spec');
export const CONFIG_PATH = join(ROOT, 'config.json');
export const REPO_INDEX_PATH = join(ROOT, 'repo.json');
export const WORKFLOW_PATH = join(ROOT, 'workflow.md');
export function readJson(path, defaultVal = null) {
    if (!existsSync(path))
        return defaultVal;
    try {
        return JSON.parse(readFileSync(path, 'utf-8'));
    }
    catch (e) {
        console.error(`WARNING: corrupt JSON in ${path}: ${e.message}`);
        return defaultVal;
    }
}
export function readText(path) {
    try {
        return readFileSync(path, 'utf-8');
    }
    catch {
        return '';
    }
}
export function loadConfig() {
    return readJson(CONFIG_PATH, {}) ?? {};
}
export function isoNow() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().replace(/\.\d{3}Z$/, '');
}
export function isoToday() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 10);
}
export function yearMonth() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}`;
}
export function todayCompact() {
    return isoToday().replace(/-/g, '');
}
//# sourceMappingURL=config.js.map