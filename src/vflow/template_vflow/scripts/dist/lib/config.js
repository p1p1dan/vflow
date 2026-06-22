// vflow config — path constants and configuration loading.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Resolve the .vflow/ root regardless of whether we're running from source or dist.
// Source: lib/config.ts → scripts/ → .vflow/
// Compiled: dist/lib/config.js → dist/ → scripts/ → .vflow/
function resolveRoot() {
    // Walk up from current directory until we find config.json (the .vflow/ marker)
    let dir = __dirname;
    for (let i = 0; i < 5; i++) {
        const parent = dirname(dir);
        if (existsSync(join(parent, 'config.json')) && existsSync(join(parent, 'workflow.md'))) {
            return parent;
        }
        dir = parent;
    }
    // Fallback: assume source layout (lib/ → scripts/ → .vflow/)
    return dirname(dirname(__dirname));
}
export const ROOT = resolveRoot(); // .vflow/
export const SCRIPTS_DIR = join(ROOT, 'scripts');
export const PROJECT_ROOT = dirname(ROOT); // project root
export const TASKS = join(ROOT, 'tasks');
export const RUNTIME = join(ROOT, '.runtime');
export const POINTER = join(RUNTIME, 'current-task');
export const JOURNAL_DIR = join(ROOT, 'journal');
export const CONFIG_PATH = join(ROOT, 'config.json');
export const GRAPHS_DIR = join(ROOT, 'graphs');
export const TEMPLATES_DIR = join(ROOT, 'templates');
export const STATES = ['created', 'analyzed', 'designed', 'implementing', 'verified', 'archived'];
// New 4-state model (Trellis-inspired)
export const STATES_V2 = ['no_task', 'planning', 'executing', 'completed'];
export const TEST_OUTPUT_TAIL = 3000;
export const TEST_TIMEOUT = 600;
export const MACHINE_BLOCK_HEADER = '## 机器执行记录（task.mjs 写入，请勿手改）';
// -- helpers --
export function readJson(path, defaultVal = null) {
    try {
        return JSON.parse(readFileSync(path, 'utf-8'));
    }
    catch {
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
// Local ISO timestamp truncated to seconds
export function isoNow() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().replace(/\.\d{3}Z$/, '');
}
// ISO date only (YYYY-MM-DD)
export function isoToday() {
    const d = new Date();
    const off = d.getTimezoneOffset();
    const local = new Date(d.getTime() - off * 60000);
    return local.toISOString().slice(0, 10);
}
// MM-DD prefix for task names
export function monthDay() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}-${dd}`;
}
// YYYY-MM for archive directory
export function yearMonth() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}`;
}
