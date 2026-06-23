#!/usr/bin/env node
// vflow task state management — CLI entry point.
//
// v2 pipeline: created -> analyzed -> designed -> implementing -> verified -> archived
// Every transition has mechanical exit-condition checks (R-ID trace chain,
// checklist completion, machine-executed tests). Bypasses are recorded.
//
// Usage:
//   node .vflow/scripts/dist/task.js create <slug> --title "title" [--tier T2]
//   node .vflow/scripts/dist/task.js advance [--skip-check]
//   node .vflow/scripts/dist/task.js back
//   node .vflow/scripts/dist/task.js set risk {low|high}
//   node .vflow/scripts/dist/task.js done --summary "..." [--force]
//   node .vflow/scripts/dist/task.js status
//   node .vflow/scripts/dist/task.js followup <list|close>
//   node .vflow/scripts/dist/task.js quick-log --title "..." [--files a.ts,b.ts]
//   node .vflow/scripts/dist/task.js trace [task-id]

import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
  copyFileSync, statSync, readdirSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import type { TaskJson, VflowConfig, FollowupTask } from './lib/config.js';
import {
  readJson, readText, isoNow, monthDay,
  ROOT, TASKS, RUNTIME, POINTER, CONFIG_PATH, STATES,
} from './lib/config.js';
import { TRANSITION_CHECKS } from './lib/checks.js';
import { isFilled, uncheckedItems, designPath } from './lib/docs.js';
import { checkArchived } from './lib/checks.js';
import { archiveMove, extractFollowupTasks } from './lib/archive.js';
import { pointerPath, isTeamMode, selfUid, reportActivity } from './lib/team.js';
import { appendQuickLog } from './lib/quick.js';
import { generateTraceMatrix, formatTraceMatrix } from './lib/trace.js';
import { buildSteps, buildT1Steps } from './lib/steps-builder.js';
import { writeSteps } from './lib/ralph-store.js';
import { cmdNext } from './lib/cmd-next.js';
import { cmdComplete, type CompleteArgs } from './lib/cmd-complete.js';

// -- helpers --

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function currentTaskDir(): string | null {
  const ptr = pointerPath();
  if (!existsSync(ptr)) return null;
  const name = readText(ptr).trim();
  const d = join(TASKS, name);
  try {
    if (statSync(d).isDirectory()) return d;
  } catch { /* */ }
  return null;
}

function taskState(t: TaskJson): string {
  if (t.state) return t.state;
  const status = t.status ?? '';
  if (status === 'planning') return 'analyzed';
  if (status === 'in_progress') return 'implementing';
  if (status === 'completed') return 'archived';
  return 'created';
}

function isLegacy(t: TaskJson): boolean {
  return !('state' in t);
}

// -- commands --

function cmdCreate(args: { slug: string; title: string; tier: string }): number {
  const name = `${monthDay()}-${args.slug}`;
  const d = join(TASKS, name);
  if (existsSync(d)) {
    console.log(`[vflow] Task already exists: ${name}`);
    return 1;
  }
  mkdirSync(d, { recursive: true });
  const taskData: TaskJson = {
    id: name,
    title: args.title || args.slug,
    tier: args.tier,
    state: 'created',
    risk: 'unset',
    created: isoNow(),
  };
  if (isTeamMode()) {
    const uid = selfUid();
    if (uid) {
      taskData.owner = uid;
      taskData.claimed_at = isoNow();
    }
  }
  // v2 fields
  taskData.current_node = null as unknown as string | undefined;
  taskData.artifacts = [];
  taskData.walker_session = null;

  writeJson(join(d, 'task.json'), taskData);
  const tpl = join(ROOT, 'templates');

  // Prefer v2 templates (task-spec.md + ledger.md + context.md); fall back to v1 if missing.
  const v2Templates = ['task-spec.md', 'ledger.md', 'context.md'];
  const v1Templates = ['requirement.md', 'design.md', 'verify.md'];
  const useV2 = existsSync(join(tpl, 'task-spec.md'));
  const templates = useV2 ? v2Templates : v1Templates;

  for (const f of templates) {
    const src = join(tpl, f);
    if (existsSync(src)) {
      const dst = join(d, f);
      copyFileSync(src, dst);
      const h = createHash('sha256')
        .update(readText(dst), 'utf-8')
        .digest('hex')
        .slice(0, 16);
      writeFileSync(dst + '.hash', h, 'utf-8');
    }
  }
  const cfg = readJson<VflowConfig>(CONFIG_PATH, {} as VflowConfig);
  if (cfg?.execution_log) {
    writeFileSync(join(d, 'execution.log'), '', 'utf-8');
  }
  mkdirSync(RUNTIME, { recursive: true });
  writeFileSync(pointerPath(), name, 'utf-8');
  if (isTeamMode() && pointerPath() !== POINTER) {
    writeFileSync(POINTER, name, 'utf-8');
  }
  reportActivity('create', name, 'created');
  console.log(`[vflow] Created task ${name} (state=created)`);
  console.log('Pipeline: created -> analyzed -> designed -> implementing -> verified -> archived');

  // Generate ralph steps from graph
  try {
    const graphId = args.tier === 'T1' ? null : 't2-standard';
    const steps = args.tier === 'T1' ? buildT1Steps() : buildSteps(graphId!, args.tier);
    if (steps.length > 0) {
      writeSteps(d, steps);
      console.log(`[vflow] Ralph steps generated: ${steps.length} steps from ${graphId || 'T1-default'}`);
    }
  } catch (e) {
    console.log(`[vflow] Warning: could not generate ralph steps: ${e}`);
  }

  return 0;
}

function _recordBypass(task: TaskJson, transition: string): void {
  if (!task.bypasses) task.bypasses = [];
  task.bypasses.push({ transition, time: isoNow() });
}

function cmdAdvance(args: { skipCheck: boolean }): number {
  const d = currentTaskDir();
  if (!d) { console.log('[vflow] No active task'); return 1; }
  const p = join(d, 'task.json');
  const t = readJson<TaskJson>(p)!;
  if (isLegacy(t)) {
    console.log('[vflow] Legacy task (status/phase format). Use legacy commands; advance applies to v2 tasks only.');
    return 1;
  }
  const state = taskState(t);
  if (state === 'archived') { console.log('[vflow] Task already archived'); return 1; }
  if (state === 'verified') { console.log('[vflow] Next step is archival: run task.js done --summary "..."'); return 1; }
  const nxt = STATES[STATES.indexOf(state as typeof STATES[number]) + 1];
  const cfg = readJson<VflowConfig>(CONFIG_PATH, {} as VflowConfig) ?? {} as VflowConfig;

  if (args.skipCheck) {
    _recordBypass(t, `${state}->${nxt}`);
    console.log('[vflow] Check skipped by user request (recorded in task.json bypasses)');
  } else {
    const checkFn = TRANSITION_CHECKS[nxt];
    if (checkFn) {
      const errors = checkFn(d, cfg, t);
      if (errors.length) {
        console.log(`[vflow] ERROR: Cannot advance ${state} -> ${nxt}:`);
        for (const e of errors) console.log(`  - ${e}`);
        console.log('Fix the above, or use --skip-check to bypass (recorded in task.json).');
        return 1;
      }
    }
  }

  t.state = nxt;
  if (nxt === 'implementing') {
    const wl = join(d, 'worklog.md');
    if (!existsSync(wl)) {
      writeFileSync(wl, '# Implementation Log\n\n| Time | File | Change |\n| :--- | :--- | :--- |\n', 'utf-8');
    }
  }
  writeJson(p, t);
  reportActivity('advance', basename(d), nxt);
  console.log(`[vflow] ${state} -> ${nxt}`);
  return 0;
}

function cmdBack(): number {
  const d = currentTaskDir();
  if (!d) { console.log('[vflow] No active task'); return 1; }
  const p = join(d, 'task.json');
  const t = readJson<TaskJson>(p)!;
  if (taskState(t) !== 'verified') {
    console.log(`[vflow] back is only allowed from 'verified' (current: ${taskState(t)})`);
    return 1;
  }
  t.state = 'implementing';
  delete t.verified_at;
  if (!t.backs) t.backs = [];
  t.backs.push(isoNow());
  writeJson(p, t);
  reportActivity('back', basename(d), 'implementing');
  console.log('[vflow] verified -> implementing (re-verify required before archive)');
  return 0;
}

function cmdSet(args: { key: string; value: string }): number {
  const d = currentTaskDir();
  if (!d) { console.log('[vflow] No active task'); return 1; }
  const p = join(d, 'task.json');
  const t = readJson<TaskJson>(p)!;
  const allowed = isLegacy(t) ? ['risk', 'phase', 'test_scope'] : ['risk', 'test_scope'];
  if (!allowed.includes(args.key)) {
    console.log(`[vflow] Only ${allowed.join('/')} can be set`);
    return 1;
  }
  if (args.key === 'risk' && !['low', 'high'].includes(args.value)) {
    console.log("[vflow] risk must be 'low' or 'high'");
    return 1;
  }
  (t as unknown as Record<string, unknown>)[args.key] = args.value;
  writeJson(p, t);
  console.log(`[vflow] ${args.key} = ${args.value}`);
  return 0;
}

function cmdStart(args: { skip: boolean }): number {
  const d = currentTaskDir();
  if (!d) { console.log('[vflow] No active task'); return 1; }
  const p = join(d, 'task.json');
  const t = readJson<TaskJson>(p)!;
  if (!isLegacy(t)) {
    console.log('[vflow] v2 task: use task.js advance instead of start');
    return 1;
  }
  if (args.skip) {
    t.planning_skipped = true;
    console.log('[vflow] Planning skipped by user request (--skip)');
  } else {
    const errors: string[] = [];
    if (!isFilled(join(d, 'requirement.md'))) {
      errors.push('requirement.md is not filled (still template or missing)');
    }
    if (!isFilled(designPath(d))) {
      errors.push('plan/design doc is not filled (still template or missing)');
    }
    if (errors.length) {
      console.log('[vflow] ERROR: Cannot start implementation. Planning docs incomplete:');
      for (const e of errors) console.log(`  - ${e}`);
      return 1;
    }
  }
  t.status = 'in_progress';
  t.phase = 'implement';
  writeJson(p, t);
  const tpl = join(ROOT, 'templates');
  const dst = join(d, 'verify.md');
  const src = join(tpl, 'verify.md');
  if (existsSync(src) && !existsSync(dst)) {
    copyFileSync(src, dst);
    const h = createHash('sha256').update(readText(dst), 'utf-8').digest('hex').slice(0, 16);
    writeFileSync(dst + '.hash', h, 'utf-8');
  }
  const wl = join(d, 'worklog.md');
  if (!existsSync(wl)) {
    writeFileSync(wl, '# Implementation Log\n\n| Time | File | Change |\n| :--- | :--- | :--- |\n', 'utf-8');
  }
  console.log('[vflow] Task entered implementation phase (status=in_progress)');
  return 0;
}

function cmdDone(args: { summary: string; force: boolean }): number {
  const d = currentTaskDir();
  if (!d) { console.log('[vflow] No active task'); return 1; }
  const p = join(d, 'task.json');
  const t = readJson<TaskJson>(p)!;
  const cfg = readJson<VflowConfig>(CONFIG_PATH, {} as VflowConfig) ?? {} as VflowConfig;

  if (isLegacy(t)) {
    if (args.force) {
      t.force_archived = true;
      console.log('[vflow] Archiving with --force (skipping completion checks)');
    } else {
      const errors: string[] = [];
      if (!isFilled(join(d, 'verify.md'))) {
        errors.push('verify.md is not filled (must contain real build/test output)');
      }
      const items = uncheckedItems(d);
      if (items.length) {
        errors.push(`${items.length} unchecked items in plan/design doc:`);
        for (const item of items) errors.push(`  - [ ] ${item}`);
      }
      if (errors.length) {
        console.log('[vflow] ERROR: Cannot archive. Completion checks failed:');
        for (const e of errors) console.log(`  ${e}`);
        return 1;
      }
    }
    t.status = 'completed';
    archiveMove(d, t, args.summary || '');
    return 0;
  }

  const state = taskState(t);
  if (state !== 'verified' && !args.force) {
    console.log(`[vflow] ERROR: done requires state=verified (current: ${state}). Advance through the pipeline first.`);
    return 1;
  }
  if (args.force) {
    t.force_archived = true;
    console.log('[vflow] Archiving with --force (skipping completion checks)');
  } else {
    const errors = checkArchived(d, cfg, t);
    if (errors.length) {
      console.log('[vflow] ERROR: Cannot archive:');
      for (const e of errors) console.log(`  - ${e}`);
      return 1;
    }
  }
  t.state = 'archived';
  const dpText = readText(designPath(d));
  const followups = extractFollowupTasks(dpText);
  if (followups.length) {
    t.followup_tasks = followups;
    console.log(`[vflow] Extracted ${followups.length} followup tasks from design roadmap`);
  }
  archiveMove(d, t, args.summary || '');
  return 0;
}

function cmdStatus(): number {
  const d = currentTaskDir();
  if (!d) { console.log('[vflow] No active task (no_task)'); return 0; }
  const t = readJson<TaskJson>(join(d, 'task.json'), {} as TaskJson)!;
  const state = taskState(t);
  const marker = isLegacy(t) ? ' [legacy]' : '';
  const pipeline = STATES.map((s) => (s === state ? `[${s}]` : s)).join(' -> ');
  console.log(`[vflow] ${t.id} | ${t.title} | state=${state} risk=${t.risk}${marker}`);
  console.log(`  ${pipeline}`);
  return 0;
}

// -- followup management --

function scanFollowups(): Array<{
  source: string;
  path: string;
  task: TaskJson;
  pending: FollowupTask[];
}> {
  const archiveDir = join(TASKS, 'archive');
  if (!existsSync(archiveDir)) return [];
  const results: Array<{
    source: string; path: string; task: TaskJson; pending: FollowupTask[];
  }> = [];
  let monthDirs: string[];
  try {
    monthDirs = readdirSync(archiveDir).sort().reverse().slice(0, 2);
  } catch { return []; }
  for (const month of monthDirs) {
    const mdir = join(archiveDir, month);
    let tasks: string[];
    try { tasks = readdirSync(mdir); } catch { continue; }
    for (const tname of tasks) {
      const tjPath = join(mdir, tname, 'task.json');
      const t = readJson<TaskJson>(tjPath);
      if (!t || !Array.isArray(t.followup_tasks)) continue;
      const pending = t.followup_tasks.filter((f) => !f.done);
      if (pending.length) {
        results.push({ source: tname, path: tjPath, task: t, pending });
      }
    }
  }
  return results;
}

function cmdFollowup(args: {
  sub: string;
  sourceTask?: string;
  itemId?: string;
  implTask?: string;
}): number {
  if (args.sub === 'list') {
    const all = scanFollowups();
    if (!all.length) {
      console.log('[vflow] No pending followup tasks');
      return 0;
    }
    for (const entry of all) {
      console.log(`\n  Source: ${entry.source} (${entry.task.title})`);
      for (const f of entry.pending) {
        console.log(`    [${f.priority}] ${f.id}: ${f.title}`);
      }
    }
    return 0;
  }
  if (args.sub === 'close') {
    if (!args.sourceTask || !args.itemId) {
      console.log('Usage: task.js followup close <source-task-slug> <item-id> [--impl <impl-task-slug>]');
      return 1;
    }
    const archiveDir = join(TASKS, 'archive');
    let found = false;
    let monthDirs: string[];
    try { monthDirs = readdirSync(archiveDir).sort().reverse(); } catch { monthDirs = []; }
    for (const month of monthDirs) {
      const tjPath = join(archiveDir, month, args.sourceTask, 'task.json');
      const t = readJson<TaskJson>(tjPath);
      if (!t || !Array.isArray(t.followup_tasks)) continue;
      const item = t.followup_tasks.find((f) => f.id === args.itemId);
      if (!item) {
        console.log(`[vflow] Item ${args.itemId} not found in ${args.sourceTask}`);
        return 1;
      }
      item.done = true;
      item.impl_task = args.implTask ?? null;
      writeJson(tjPath, t);
      console.log(`[vflow] Followup ${args.itemId} closed in ${args.sourceTask}`);
      found = true;
      break;
    }
    if (!found) {
      console.log(`[vflow] Source task ${args.sourceTask} not found in archive`);
      return 1;
    }
    return 0;
  }
  console.log('Usage: task.js followup <list|close>');
  return 1;
}

function cmdQuickLog(args: { title: string; files: string }): number {
  const filesChanged = args.files ? args.files.split(',').map((f) => f.trim()) : [];
  const entry = appendQuickLog(args.title, filesChanged);
  console.log(`[vflow] Quick log: ${entry.id} — ${entry.title}`);
  return 0;
}

function cmdTrace(args: { taskId?: string }): number {
  let taskDir: string | null;
  if (args.taskId) {
    taskDir = join(TASKS, args.taskId);
    if (!existsSync(taskDir)) {
      // Try archive
      const archiveDir = join(TASKS, 'archive');
      taskDir = null;
      try {
        for (const month of readdirSync(archiveDir).sort().reverse()) {
          const candidate = join(archiveDir, month, args.taskId);
          if (existsSync(candidate)) { taskDir = candidate; break; }
        }
      } catch { /* */ }
    }
  } else {
    taskDir = currentTaskDir();
  }
  if (!taskDir) {
    console.log('[vflow] No task found');
    return 1;
  }
  const rows = generateTraceMatrix(taskDir);
  console.log(formatTraceMatrix(rows));
  return 0;
}

// -- argv parsing --

interface ParsedArgs {
  cmd: string;
  [key: string]: unknown;
}

function parseArgs(): ParsedArgs {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.log('Usage: task.js <create|advance|back|set|start|done|status|followup|quick-log|trace|next|complete> [options]');
    process.exit(1);
  }
  const cmd = argv[0];
  const rest = argv.slice(1);

  function getFlag(names: string[]): boolean {
    return rest.some((a) => names.includes(a));
  }
  function getOption(names: string[], defaultVal = ''): string {
    for (let i = 0; i < rest.length; i++) {
      if (names.includes(rest[i]) && i + 1 < rest.length) return rest[i + 1];
    }
    return defaultVal;
  }
  function positional(index: number): string | undefined {
    let pos = 0;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].startsWith('-')) {
        if (['--title', '--tier', '--summary', '--impl', '--files'].includes(rest[i])) i++;
        continue;
      }
      if (pos === index) return rest[i];
      pos++;
    }
    return undefined;
  }

  switch (cmd) {
    case 'create': {
      const slug = positional(0);
      if (!slug) {
        console.log('Usage: task.js create <slug> [--title TITLE] [--tier TIER]');
        process.exit(1);
      }
      return { cmd, slug, title: getOption(['--title'], ''), tier: getOption(['--tier'], 'T2') };
    }
    case 'advance':
      return { cmd, skipCheck: getFlag(['--skip-check']) };
    case 'back':
      return { cmd };
    case 'set': {
      const key = positional(0);
      const value = positional(1);
      if (!key || !value) { console.log('Usage: task.js set <key> <value>'); process.exit(1); }
      return { cmd, key, value };
    }
    case 'start':
      return { cmd, skip: getFlag(['--skip']) };
    case 'done':
      return { cmd, summary: getOption(['--summary'], ''), force: getFlag(['--force']) };
    case 'status':
      return { cmd };
    case 'followup': {
      const sub = positional(0);
      if (!sub || !['list', 'close'].includes(sub)) {
        console.log('Usage: task.js followup <list|close> [options]');
        process.exit(1);
      }
      if (sub === 'close') {
        const sourceTask = positional(1);
        const itemId = positional(2);
        return { cmd, sub, sourceTask, itemId, implTask: getOption(['--impl'], '') };
      }
      return { cmd, sub };
    }
    case 'quick-log': {
      const title = getOption(['--title'], '');
      if (!title) { console.log('Usage: task.js quick-log --title "..." [--files a.ts,b.ts]'); process.exit(1); }
      return { cmd, title, files: getOption(['--files'], '') };
    }
    case 'trace': {
      return { cmd, taskId: positional(0) };
    }
    case 'next': {
      return { cmd };
    }
    case 'complete': {
      const idx = positional(0);
      if (idx === undefined) { console.log('Usage: task.js complete <index> --status <DONE|DONE_WITH_CONCERNS|NEEDS_RETRY|BLOCKED> [--evidence <path>] [--concerns "..."] [--reason "..."]'); process.exit(1); }
      return {
        cmd,
        index: parseInt(idx, 10),
        status: getOption(['--status'], 'DONE'),
        evidence: getOption(['--evidence'], '').split(',').filter(Boolean),
        concerns: getOption(['--concerns'], ''),
        reason: getOption(['--reason'], ''),
      };
    }
    default:
      console.log(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

// -- main --

function main(): number {
  const args = parseArgs();
  const handlers: Record<string, (a: ParsedArgs) => number> = {
    create: (a) => cmdCreate(a as unknown as { slug: string; title: string; tier: string }),
    advance: (a) => cmdAdvance(a as unknown as { skipCheck: boolean }),
    back: () => cmdBack(),
    set: (a) => cmdSet(a as unknown as { key: string; value: string }),
    start: (a) => cmdStart(a as unknown as { skip: boolean }),
    done: (a) => cmdDone(a as unknown as { summary: string; force: boolean }),
    status: () => cmdStatus(),
    followup: (a) => cmdFollowup(a as unknown as { sub: string; sourceTask?: string; itemId?: string; implTask?: string }),
    'quick-log': (a) => cmdQuickLog(a as unknown as { title: string; files: string }),
    trace: (a) => cmdTrace(a as unknown as { taskId?: string }),
    next: () => cmdNext(),
    complete: (a) => cmdComplete(a as unknown as CompleteArgs),
  };
  return handlers[args.cmd](args);
}

process.exit(main());
