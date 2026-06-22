#!/usr/bin/env node
// vflow team collaboration script.
//
// Usage:
//   node .vflow/scripts/dist/collab.js join [--role admin|member]
//   node .vflow/scripts/dist/collab.js whoami
//   node .vflow/scripts/dist/collab.js status [--window N]
//   node .vflow/scripts/dist/collab.js preflight [--task <slug>]
//   node .vflow/scripts/dist/collab.js sync [--dry-run]
//   node .vflow/scripts/dist/collab.js claim <slug>
//   node .vflow/scripts/dist/collab.js release <slug>
//   node .vflow/scripts/dist/collab.js heartbeat [--silent]
//   node .vflow/scripts/dist/collab.js search <query>
//   node .vflow/scripts/dist/collab.js daily
//   node .vflow/scripts/dist/collab.js staging <spec-file> --target <target> --action <append|replace|new> --summary "..."
//   node .vflow/scripts/dist/collab.js review <staging-file> <approve|reject>

import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
  readdirSync, appendFileSync, unlinkSync, statSync,
} from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import type { VflowConfig } from './lib/config.js';
import {
  readJson, readText, isoNow, isoToday,
  ROOT, TASKS, RUNTIME,
} from './lib/config.js';

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

const CONFIG = join(ROOT, 'config.json');
const COLLAB = join(ROOT, 'collab');
const MEMBERS = join(COLLAB, 'members');
const ACTIVITY = join(COLLAB, 'activity.jsonl');
const STAGING = join(COLLAB, 'staging');
const TEAM_SPECS = join(COLLAB, 'specs');

const ACTIVITY_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const DEDUP_WINDOW_MS = 60000; // 60s

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function gitConfig(key: string): string {
  try {
    const r = spawnSync('git', ['config', key], {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    return r.status === 0 ? (r.stdout || '').trim() : '';
  } catch { return ''; }
}

// ---------------------------------------------------------------------------
// Core: identity & team mode
// ---------------------------------------------------------------------------

function isTeamMode(): boolean {
  const cfg = readJson<VflowConfig>(CONFIG, {} as VflowConfig);
  return !!cfg?.team?.enabled;
}

interface MemberJson {
  uid: string;
  name: string;
  email: string;
  host: string;
  role: string;
  joinedAt?: string;
  projectRoles?: string[];
}

function deriveUid(email: string): string {
  const local = email.split('@')[0].toLowerCase();
  if (!existsSync(MEMBERS)) return local;
  const existing = readdirSync(MEMBERS).filter((f) => f.endsWith('.json'));
  for (let suffix = 0; ; suffix++) {
    const candidate = suffix === 0 ? local : `${local}-${suffix + 1}`;
    const memberFile = join(MEMBERS, `${candidate}.json`);
    if (!existsSync(memberFile)) return candidate;
    const m = readJson<MemberJson>(memberFile);
    if (m && m.email === email) return candidate;
  }
}

function resolveSelf(): MemberJson | null {
  const email = gitConfig('user.email');
  if (!email) return null;
  const uid = deriveUid(email);
  const memberFile = join(MEMBERS, `${uid}.json`);
  if (existsSync(memberFile)) return readJson<MemberJson>(memberFile);
  return { uid, email, name: gitConfig('user.name') || uid, host: hostname(), role: 'member' };
}

function selfUid(): string | null {
  const self = resolveSelf();
  return self ? self.uid : null;
}

// ---------------------------------------------------------------------------
// Activity logging
// ---------------------------------------------------------------------------

function rotateActivityIfNeeded(): void {
  try {
    if (!existsSync(ACTIVITY)) return;
    const st = statSync(ACTIVITY);
    if (st.size < ACTIVITY_MAX_SIZE) return;
    const archDir = join(COLLAB, 'activity-archives');
    mkdirSync(archDir, { recursive: true });
    const d = new Date();
    const dayOfYear = Math.floor(
      (d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000,
    );
    const week = Math.ceil((dayOfYear + new Date(d.getFullYear(), 0, 1).getDay() + 1) / 7);
    const dest = join(archDir, `activity-${d.getFullYear()}W${String(week).padStart(2, '0')}.jsonl`);
    const content = readText(ACTIVITY);
    appendFileSync(dest, content, 'utf-8');
    writeFileSync(ACTIVITY, '', 'utf-8');
  } catch { /* fire-and-forget */ }
}

function appendActivity(action: string, task: string | null = null, state: string | null = null): void {
  try {
    if (!isTeamMode()) return;
    const self = resolveSelf();
    if (!self) return;
    mkdirSync(dirname(ACTIVITY), { recursive: true });
    rotateActivityIfNeeded();
    const entry = { ts: isoNow(), user: self.uid, host: self.host || hostname(), action, task, state };
    appendFileSync(ACTIVITY, JSON.stringify(entry) + '\n', 'utf-8');
  } catch { /* fire-and-forget */ }
}

interface ActivityEntry {
  ts: string;
  user: string;
  host?: string;
  action: string;
  task?: string | null;
  state?: string | null;
}

function readActivityLines(maxLines = 500): ActivityEntry[] {
  if (!existsSync(ACTIVITY)) return [];
  const text = readText(ACTIVITY);
  const lines = text.trim().split('\n').filter(Boolean);
  return lines.slice(-maxLines)
    .map((l) => { try { return JSON.parse(l) as ActivityEntry; } catch { return null; } })
    .filter((e): e is ActivityEntry => e !== null);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

interface CmdArgs {
  cmd: string;
  [key: string]: unknown;
}

function cmdJoin(args: CmdArgs): number {
  const email = gitConfig('user.email');
  const name = gitConfig('user.name');
  if (!email) {
    console.log('[collab] Error: git config user.email is not set');
    return 1;
  }
  const uid = deriveUid(email);
  mkdirSync(MEMBERS, { recursive: true });
  const memberFile = join(MEMBERS, `${uid}.json`);

  const memberCount = existsSync(MEMBERS)
    ? readdirSync(MEMBERS).filter((f) => f.endsWith('.json')).length
    : 0;
  const isFirst = memberCount === 0;
  const role = (args.role as string) || (isFirst ? 'admin' : 'member');

  const member: MemberJson = {
    uid,
    name: name || uid,
    email,
    host: hostname(),
    role,
    joinedAt: isoNow(),
    projectRoles: [],
  };

  if (existsSync(memberFile)) {
    const existing = readJson<MemberJson>(memberFile);
    if (existing && existing.email === email) {
      existing.host = hostname();
      existing.name = name || existing.name;
      writeJson(memberFile, existing);
      console.log(`[collab] Updated member ${uid} (host=${hostname()})`);
      return 0;
    }
  }

  writeJson(memberFile, member);

  // enable team mode in config
  const cfg = readJson<VflowConfig>(CONFIG, {} as VflowConfig) ?? {} as VflowConfig;
  if (!cfg.team) cfg.team = { enabled: true };
  cfg.team.enabled = true;
  writeJson(CONFIG, cfg);

  // setup .gitattributes for union merge
  const projectRoot = dirname(ROOT);
  const gaPath = join(projectRoot, '.gitattributes');
  const gaLines = [
    '.vflow/collab/activity.jsonl merge=union',
    '.vflow/collab/members/*.json merge=union',
  ];
  let gaContent = existsSync(gaPath) ? readText(gaPath) : '';
  for (const line of gaLines) {
    if (!gaContent.includes(line)) {
      gaContent += (gaContent.endsWith('\n') || !gaContent ? '' : '\n') + line + '\n';
    }
  }
  writeFileSync(gaPath, gaContent, 'utf-8');

  appendActivity('join', null, null);
  const finalCount = readdirSync(MEMBERS).filter((f) => f.endsWith('.json')).length;
  console.log(`[collab] Joined as ${uid} (${name}, role=${role})`);
  console.log(`[collab] Team mode enabled. ${finalCount} member(s) registered.`);
  return 0;
}

function cmdWhoami(): number {
  if (!isTeamMode()) {
    console.log('[collab] Team mode is not enabled. Run \'collab.js join\' first.');
    return 1;
  }
  const self = resolveSelf();
  if (!self) {
    console.log('[collab] Cannot determine identity. Check git config user.email');
    return 1;
  }
  const memberFile = join(MEMBERS, `${self.uid}.json`);
  const member = existsSync(memberFile) ? readJson<MemberJson>(memberFile) ?? self : self;
  console.log(`uid: ${member.uid}`);
  console.log(`name: ${member.name}`);
  console.log(`email: ${member.email}`);
  console.log(`host: ${member.host || hostname()}`);
  console.log(`role: ${member.role || 'member'}`);
  if (member.joinedAt) console.log(`joined: ${member.joinedAt}`);
  if (member.projectRoles && member.projectRoles.length) {
    console.log(`roles: ${member.projectRoles.join(', ')}`);
  }
  return 0;
}

function cmdStatus(args: CmdArgs): number {
  if (!isTeamMode()) {
    console.log('[collab] Team mode is not enabled.');
    return 1;
  }
  const windowMin = parseInt(args.window as string) || 30;
  const cutoff = new Date(Date.now() - windowMin * 60000).toISOString();
  const entries = readActivityLines();
  const recent = entries.filter((e) => e.ts >= cutoff.replace('Z', ''));

  const byUser: Record<string, ActivityEntry[]> = {};
  for (const e of recent) {
    if (!byUser[e.user]) byUser[e.user] = [];
    byUser[e.user].push(e);
  }

  if (Object.keys(byUser).length === 0) {
    console.log(`[collab] No activity in the last ${windowMin} minutes`);
    return 0;
  }

  console.log(`[collab] Team activity (last ${windowMin} min):`);
  for (const [user, events] of Object.entries(byUser)) {
    const latest = events[events.length - 1];
    const ago = Math.round((Date.now() - new Date(latest.ts).getTime()) / 60000);
    const taskInfo = latest.task ? ` ${latest.state || ''} ${latest.task}` : '';
    console.log(`  ${user}@${latest.host || '?'}:${taskInfo} (${latest.action} ${ago} min ago)`);
  }

  if (existsSync(MEMBERS)) {
    const count = readdirSync(MEMBERS).filter((f) => f.endsWith('.json')).length;
    console.log(`\n  ${count} registered member(s)`);
  }
  return 0;
}

function cmdPreflight(args: CmdArgs): number {
  if (!isTeamMode()) {
    console.log('[collab] Team mode is not enabled.');
    return 1;
  }
  const taskSlug = args.task as string;
  if (!taskSlug) {
    console.log('Usage: collab.js preflight --task <slug>');
    return 1;
  }
  const self = resolveSelf();
  const myUid = self ? self.uid : null;
  const entries = readActivityLines();
  const cutoff = new Date(Date.now() - 30 * 60000).toISOString().replace('Z', '');

  const others = entries.filter((e) => e.task === taskSlug && e.user !== myUid && e.ts >= cutoff);
  if (!others.length) {
    console.log(`[collab] No conflicts: no other users active on ${taskSlug}`);
    return 0;
  }

  const users = [...new Set(others.map((e) => e.user))];
  console.log(`[collab] CONFLICT WARNING: ${users.join(', ')} also working on ${taskSlug}`);
  for (const u of users) {
    const latest = others.filter((e) => e.user === u).pop()!;
    const ago = Math.round((Date.now() - new Date(latest.ts).getTime()) / 60000);
    console.log(`  ${u}: ${latest.action} ${ago} min ago (state: ${latest.state || '?'})`);
  }
  return 1;
}

function cmdSync(args: CmdArgs): number {
  if (!isTeamMode()) {
    console.log('[collab] Team mode is not enabled.');
    return 1;
  }
  const projectRoot = dirname(ROOT);
  const dryRun = !!args.dryRun;

  function run(cmd: string, cmdArgs: string[]) {
    if (dryRun) {
      console.log(`  [dry-run] ${cmd} ${cmdArgs.join(' ')}`);
      return { status: 0, stdout: '' };
    }
    return spawnSync(cmd, cmdArgs, {
      encoding: 'utf-8', cwd: projectRoot, timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  const headCheck = run('git', ['symbolic-ref', '--short', 'HEAD']);
  if (!dryRun && headCheck.status !== 0) {
    console.log('[collab] Error: detached HEAD, cannot sync');
    return 5;
  }

  const stashResult = run('git', ['stash', 'push', '-m', 'vflow-collab-sync']);
  const hasStash = !dryRun && ((stashResult.stdout as string) || '').includes('vflow-collab-sync');

  const pullResult = run('git', ['pull', '--rebase']);
  if (!dryRun && pullResult.status !== 0) {
    console.log('[collab] Error: pull --rebase failed');
    if (hasStash) run('git', ['stash', 'pop']);
    return 2;
  }

  if (hasStash) {
    const popResult = run('git', ['stash', 'pop']);
    if (!dryRun && popResult.status !== 0) {
      console.log('[collab] Error: stash pop conflict');
      return 4;
    }
  }

  const pushResult = run('git', ['push']);
  if (!dryRun && pushResult.status !== 0) {
    const retry = run('git', ['pull', '--rebase']);
    if (retry.status === 0) {
      const pushRetry = run('git', ['push']);
      if (pushRetry.status !== 0) {
        console.log('[collab] Error: push failed after retry');
        return 3;
      }
    } else {
      console.log('[collab] Error: push rejected, retry pull also failed');
      return 3;
    }
  }

  appendActivity('sync', null, null);
  console.log(`[collab] Sync complete${dryRun ? ' (dry-run)' : ''}`);
  return 0;
}

function cmdHeartbeat(): number {
  if (!isTeamMode()) return 0;
  const self = resolveSelf();
  if (!self) return 0;

  const dedupFile = join(RUNTIME, `heartbeat-${self.uid}`);
  if (existsSync(dedupFile)) {
    try {
      const lastTs = parseInt(readText(dedupFile).trim());
      if (Date.now() - lastTs < DEDUP_WINDOW_MS) return 0;
    } catch { /* proceed */ }
  }

  const pointerFile = join(RUNTIME, `current-task-${self.uid}`);
  const fallbackPointer = join(RUNTIME, 'current-task');
  let taskSlug: string | null = null;
  let taskState: string | null = null;
  for (const pf of [pointerFile, fallbackPointer]) {
    if (existsSync(pf)) {
      taskSlug = readText(pf).trim();
      if (taskSlug) {
        const t = readJson<{ state?: string }>(join(TASKS, taskSlug, 'task.json'));
        if (t) taskState = t.state || null;
        break;
      }
    }
  }

  appendActivity('tool', taskSlug, taskState);
  mkdirSync(RUNTIME, { recursive: true });
  writeFileSync(dedupFile, String(Date.now()), 'utf-8');
  return 0;
}

function cmdClaim(args: CmdArgs): number {
  if (!isTeamMode()) {
    console.log('[collab] Team mode is not enabled.');
    return 1;
  }
  const slug = args.slug as string;
  if (!slug) { console.log('Usage: collab.js claim <slug>'); return 1; }

  const taskDir = join(TASKS, slug);
  const tjPath = join(taskDir, 'task.json');
  if (!existsSync(tjPath)) {
    console.log(`[collab] Task not found: ${slug}`);
    return 1;
  }
  const self = resolveSelf();
  if (!self) { console.log('[collab] Cannot determine identity'); return 1; }

  const t = readJson<Record<string, unknown>>(tjPath)!;
  if (t.owner && t.owner !== self.uid) {
    console.log(`[collab] WARNING: Task already owned by ${t.owner}. Overriding.`);
  }
  t.owner = self.uid;
  t.claimed_at = isoNow();
  writeJson(tjPath, t);

  mkdirSync(RUNTIME, { recursive: true });
  writeFileSync(join(RUNTIME, `current-task-${self.uid}`), slug, 'utf-8');

  appendActivity('claim', slug, (t.state as string) || null);
  console.log(`[collab] Claimed ${slug} (owner=${self.uid})`);
  return 0;
}

function cmdRelease(args: CmdArgs): number {
  if (!isTeamMode()) {
    console.log('[collab] Team mode is not enabled.');
    return 1;
  }
  const slug = args.slug as string;
  if (!slug) { console.log('Usage: collab.js release <slug>'); return 1; }

  const tjPath = join(TASKS, slug, 'task.json');
  if (!existsSync(tjPath)) {
    console.log(`[collab] Task not found: ${slug}`);
    return 1;
  }
  const self = resolveSelf();
  const t = readJson<Record<string, unknown>>(tjPath)!;
  if (t.owner && self && t.owner !== self.uid) {
    console.log(`[collab] WARNING: Task owned by ${t.owner}, not you (${self?.uid}). Releasing anyway.`);
  }
  delete t.owner;
  delete t.claimed_at;
  writeJson(tjPath, t);

  if (self) {
    const pointerFile = join(RUNTIME, `current-task-${self.uid}`);
    if (existsSync(pointerFile) && readText(pointerFile).trim() === slug) {
      unlinkSync(pointerFile);
    }
  }

  appendActivity('release', slug, (t.state as string) || null);
  console.log(`[collab] Released ${slug}`);
  return 0;
}

function cmdStaging(args: CmdArgs): number {
  if (!isTeamMode()) {
    console.log('[collab] Team mode is not enabled.');
    return 1;
  }
  const cfg = readJson<VflowConfig>(CONFIG, {} as VflowConfig);
  if (cfg?.team && (cfg.team as Record<string, unknown>).spec_review === false) {
    console.log('[collab] spec_review is disabled, writing directly to spec/');
    return 0;
  }
  const self = resolveSelf();
  if (!self) { console.log('[collab] Cannot determine identity'); return 1; }

  const specFile = args.specFile as string;
  if (!specFile) {
    console.log('Usage: collab.js staging <spec-file-content> --target <path> --action <append|replace|new> --summary \'...\'');
    return 1;
  }

  const target = args.target as string;
  const action = (args.action as string) || 'new';
  const summary = (args.summary as string) || '';

  mkdirSync(STAGING, { recursive: true });
  const hash = createHash('sha256').update(specFile + isoNow(), 'utf-8').digest('hex').slice(0, 8);
  const stagingFile = join(STAGING, `${self.uid}-${hash}.md`);

  const content = `---
author: ${self.uid}
target: ${target}
action: ${action}
created: ${isoNow()}
summary: "${summary}"
---

${specFile}
`;
  writeFileSync(stagingFile, content, 'utf-8');
  appendActivity('spec-staging', null, null);
  console.log(`[collab] Staged spec change: ${basename(stagingFile)}`);
  console.log(`  target: ${target} | action: ${action}`);
  return 0;
}

function cmdReview(args: CmdArgs): number {
  if (!isTeamMode()) {
    console.log('[collab] Team mode is not enabled.');
    return 1;
  }
  const stagingFile = args.stagingFile as string;
  const decision = args.decision as string;
  if (!stagingFile || !decision) {
    console.log('Usage: collab.js review <staging-file> <approve|reject>');
    return 1;
  }

  const fullPath = stagingFile.includes('/') || stagingFile.includes('\\')
    ? stagingFile
    : join(STAGING, stagingFile);
  if (!existsSync(fullPath)) {
    console.log(`[collab] Staging file not found: ${stagingFile}`);
    return 1;
  }

  if (decision === 'reject') {
    unlinkSync(fullPath);
    console.log(`[collab] Rejected and removed: ${basename(fullPath)}`);
    appendActivity('spec-reject', null, null);
    return 0;
  }

  if (decision === 'approve') {
    const text = readText(fullPath);
    const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!fmMatch) {
      console.log('[collab] Invalid staging file format');
      return 1;
    }
    const fm = fmMatch[1];
    const body = fmMatch[2].trim();

    let target = '';
    let action = 'new';
    for (const line of fm.split('\n')) {
      if (line.startsWith('target:')) target = line.slice(7).trim();
      if (line.startsWith('action:')) action = line.slice(7).trim();
    }

    if (!target) {
      console.log('[collab] Staging file missing target');
      return 1;
    }

    let targetPath = target;
    if (!targetPath.startsWith('/') && !targetPath.includes(':')) {
      if (targetPath.startsWith('spec/')) targetPath = join(ROOT, targetPath);
      else targetPath = join(ROOT, 'spec', targetPath);
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    if (action === 'append' && existsSync(targetPath)) {
      const existing = readText(targetPath);
      writeFileSync(targetPath, existing + '\n' + body + '\n', 'utf-8');
    } else {
      writeFileSync(targetPath, body + '\n', 'utf-8');
    }

    unlinkSync(fullPath);
    appendActivity('spec-merge', null, null);
    console.log(`[collab] Approved and merged to ${target}`);
    return 0;
  }

  console.log('[collab] Decision must be \'approve\' or \'reject\'');
  return 1;
}

function cmdSearch(args: CmdArgs): number {
  const query = args.query as string;
  if (!query) { console.log('Usage: collab.js search <query>'); return 1; }

  const archiveDir = join(TASKS, 'archive');
  if (!existsSync(archiveDir)) { console.log('[collab] No archive directory'); return 0; }

  const pattern = query.toLowerCase();
  const results: Array<{
    task: string; title: string; month: string;
    hits: Array<{ file: string; count: number }>;
  }> = [];

  let monthDirs: string[];
  try { monthDirs = readdirSync(archiveDir).sort().reverse(); } catch { return 0; }

  for (const month of monthDirs) {
    const mdir = join(archiveDir, month);
    let tasks: string[];
    try { tasks = readdirSync(mdir); } catch { continue; }
    for (const tname of tasks) {
      const tdir = join(mdir, tname);
      const hits: Array<{ file: string; count: number }> = [];
      for (const fname of ['task.json', 'requirement.md', 'design.md', 'verify.md', 'worklog.md']) {
        const fp = join(tdir, fname);
        if (!existsSync(fp)) continue;
        const content = readText(fp).toLowerCase();
        if (content.includes(pattern)) {
          let count = 0;
          let idx = 0;
          while ((idx = content.indexOf(pattern, idx)) !== -1) { count++; idx += pattern.length; }
          hits.push({ file: fname, count });
        }
      }
      if (hits.length) {
        const t = readJson<{ title?: string }>(join(tdir, 'task.json'), {});
        results.push({ task: tname, title: t?.title || tname, month, hits });
      }
    }
  }

  if (!results.length) {
    console.log(`[collab] No matches for "${query}"`);
    return 0;
  }

  console.log(`[collab] Search results for "${query}" (${results.length} tasks):`);
  for (const r of results) {
    const fileHits = r.hits.map((h) => `${h.file}(${h.count})`).join(', ');
    console.log(`  ${r.month}/${r.task}: ${r.title} [${fileHits}]`);
  }
  return 0;
}

function cmdDaily(): number {
  const today = isoToday();
  const entries = readActivityLines(2000);
  const todayEntries = entries.filter((e) => e.ts.startsWith(today));

  if (!todayEntries.length) {
    console.log(`[collab] No activity today (${today})`);
    return 0;
  }

  const byUser: Record<string, ActivityEntry[]> = {};
  for (const e of todayEntries) {
    if (!byUser[e.user]) byUser[e.user] = [];
    byUser[e.user].push(e);
  }

  console.log(`[collab] Daily summary for ${today}:`);
  for (const [user, events] of Object.entries(byUser)) {
    const actions: Record<string, number> = {};
    const tasks = new Set<string>();
    for (const e of events) {
      actions[e.action] = (actions[e.action] || 0) + 1;
      if (e.task) tasks.add(e.task);
    }
    const actionSummary = Object.entries(actions).map(([a, c]) => `${a}:${c}`).join(' ');
    console.log(`  ${user}: ${actionSummary} | tasks: ${tasks.size ? [...tasks].join(', ') : 'none'}`);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): CmdArgs {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.log('Usage: collab.js <join|whoami|status|preflight|sync|claim|release|heartbeat|search|daily|staging|review> [options]');
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
        if (['--role', '--window', '--task', '--target', '--action', '--summary', '--impl'].includes(rest[i])) i++;
        continue;
      }
      if (pos === index) return rest[i];
      pos++;
    }
    return undefined;
  }

  switch (cmd) {
    case 'join':
      return { cmd, role: getOption(['--role'], '') };
    case 'whoami':
      return { cmd };
    case 'status':
      return { cmd, window: getOption(['--window'], '30') };
    case 'preflight':
      return { cmd, task: getOption(['--task'], '') };
    case 'sync':
      return { cmd, dryRun: getFlag(['--dry-run']) };
    case 'claim':
      return { cmd, slug: positional(0) };
    case 'release':
      return { cmd, slug: positional(0) };
    case 'heartbeat':
      return { cmd, silent: getFlag(['--silent']) };
    case 'search':
      return { cmd, query: rest.join(' ') };
    case 'daily':
      return { cmd };
    case 'staging':
      return {
        cmd,
        specFile: positional(0),
        target: getOption(['--target'], ''),
        action: getOption(['--action'], 'new'),
        summary: getOption(['--summary'], ''),
      };
    case 'review':
      return { cmd, stagingFile: positional(0), decision: positional(1) };
    default:
      console.log(`Unknown command: ${cmd}`);
      process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): number {
  const args = parseArgs();
  const handlers: Record<string, (a: CmdArgs) => number> = {
    join: cmdJoin,
    whoami: () => cmdWhoami(),
    status: cmdStatus,
    preflight: cmdPreflight,
    sync: cmdSync,
    heartbeat: () => cmdHeartbeat(),
    claim: cmdClaim,
    release: cmdRelease,
    search: cmdSearch,
    daily: () => cmdDaily(),
    staging: cmdStaging,
    review: cmdReview,
  };
  return handlers[args.cmd](args);
}

try {
  process.exit(main());
} catch (e: unknown) {
  console.error(`[collab] Fatal: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
