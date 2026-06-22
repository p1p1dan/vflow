// vflow config — path constants and configuration loading.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve the .vflow/ root regardless of whether we're running from source or dist.
// Source: lib/config.ts → scripts/ → .vflow/
// Compiled: dist/lib/config.js → dist/ → scripts/ → .vflow/
function resolveRoot(): string {
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

export const STATES = ['created', 'analyzed', 'designed', 'implementing', 'verified', 'archived'] as const;
export type TaskState = typeof STATES[number];

// New 4-state model (Trellis-inspired)
export const STATES_V2 = ['no_task', 'planning', 'executing', 'completed'] as const;
export type TaskStateV2 = typeof STATES_V2[number];

export const TEST_OUTPUT_TAIL = 3000;
export const TEST_TIMEOUT = 600;

export const MACHINE_BLOCK_HEADER = '## 机器执行记录（task.mjs 写入，请勿手改）';

export interface VflowConfig {
  project: string;
  enabled: boolean;
  language: string;
  features: Record<string, boolean>;
  build: {
    command: string;
    test_command: string;
  };
  core_paths: string[];
  journal: {
    notebook_path: string | null;
  };
  test_required: boolean;
  execution_log: boolean;
  team?: {
    enabled: boolean;
    [key: string]: unknown;
  };
  module_spec_map?: Record<string, string[]>;
}

export interface TaskJson {
  id: string;
  title: string;
  tier?: string;
  state?: string;
  status?: string;
  phase?: string;
  risk?: string;
  created?: string;
  owner?: string;
  claimed_at?: string;
  verified_at?: string;
  completed?: string;
  test_scope?: string;
  bypasses?: Array<{ transition: string; time: string }>;
  backs?: string[];
  force_archived?: boolean;
  planning_skipped?: boolean;
  followup_tasks?: FollowupTask[];
  // v2 fields
  current_node?: string;
  artifacts?: ArtifactEntry[];
  walker_session?: string | null;
}

export interface FollowupTask {
  id: string;
  title: string;
  priority: string;
  done: boolean;
  impl_task: string | null;
}

export interface ArtifactEntry {
  id: string;
  type: string;
  path?: string;
  status: string;
  rid?: string;
  depends_on?: string | string[] | null;
  commit?: string;
}

// -- helpers --

export function readJson<T = unknown>(path: string, defaultVal: T | null = null): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return defaultVal;
  }
}

export function readText(path: string): string {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return '';
  }
}

export function loadConfig(): VflowConfig {
  return readJson<VflowConfig>(CONFIG_PATH, {} as VflowConfig) ?? {} as VflowConfig;
}

// Local ISO timestamp truncated to seconds
export function isoNow(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().replace(/\.\d{3}Z$/, '');
}

// ISO date only (YYYY-MM-DD)
export function isoToday(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

// MM-DD prefix for task names
export function monthDay(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

// YYYY-MM for archive directory
export function yearMonth(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}`;
}
