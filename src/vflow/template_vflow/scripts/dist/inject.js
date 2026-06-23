#!/usr/bin/env node
// vflow hook injection script.
//
// Usage (registered in .claude/settings.json, cwd = project root):
//   node .vflow/scripts/dist/inject.js prompt   # UserPromptSubmit: inject current state breadcrumb
//   node .vflow/scripts/dist/inject.js session  # SessionStart: inject project context + spec index
// Output to stdout is added to conversation context. Errors exit silently.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, readText, ROOT, TASKS, RUNTIME, STATES, } from './lib/config.js';
import { isTeamMode, selfUid } from './lib/team.js';
import { designPath, uncheckedItems } from './lib/docs.js';
import { stepsSummary, hasRalphSession } from './lib/ralph-store.js';
// ---------------------------------------------------------------------------
// Path constants (relative to ROOT = .vflow/)
// ---------------------------------------------------------------------------
const POINTER = join(RUNTIME, 'current-task');
const WORKFLOW = join(ROOT, 'workflow.md');
const SPEC_INDEX = join(ROOT, 'spec', 'index.md');
const CONFIG = join(ROOT, 'config.json');
const COLLAB = join(ROOT, 'collab');
const ACTIVITY = join(COLLAB, 'activity.jsonl');
const MEMBERS = join(COLLAB, 'members');
const TEAM_SPECS = join(COLLAB, 'specs');
const PIPELINE = STATES;
const LEGACY_MAP = {
    planning: 'analyzed',
    in_progress: 'implementing',
};
const SKIP_DETECTION_SUMMARY = 'Skip signals: ONLY "skip"|"直接做"|"跳过"|' +
    '"不用规划"|"不走流程". ' +
    'Other phrases (urgency, strategy, confirmation) are NOT skips.';
const SUGGEST_ENABLE = `<vflow-auto-init>
vflow 已安装但尚未进行项目配置探测（config.json 为模板默认值）。
处理用户第一条消息前，先判断它是否需要项目上下文：
- 需要（改代码/查代码/排查问题/做开发任务）→ 先调用 /vflow:init 完成探测，再处理消息
- 不需要（关于 vflow/Claude Code 工具本身的元问题、通用知识问答、纯数学/语言/闲聊）→ 直接处理，不必探测
无需用 AskUserQuestion 询问"是否启用"——用户已通过 vflow init 表达启用意愿；探测阶段 C 会展示结果让用户确认，这是唯一需要用户干预的步骤。
若用户明确跳过探测（如"跳过"、"不用了"），用 node 将 .vflow/config.json 的 enabled 设为 true，然后正常处理用户消息。
</vflow-auto-init>`;
function readConfigFlags(cfg) {
    const enabled = cfg.enabled;
    return {
        enabled: enabled !== false,
        initialized: cfg.initialized === true,
    };
}
function scanPendingFollowups() {
    const archiveDir = join(TASKS, 'archive');
    if (!existsSync(archiveDir))
        return [];
    const results = [];
    let monthDirs;
    try {
        monthDirs = readdirSync(archiveDir).sort().reverse().slice(0, 2);
    }
    catch {
        return [];
    }
    for (const month of monthDirs) {
        const mdir = join(archiveDir, month);
        let tasks;
        try {
            tasks = readdirSync(mdir);
        }
        catch {
            continue;
        }
        for (const tname of tasks) {
            const t = readJson(join(mdir, tname, 'task.json'));
            if (!t || !Array.isArray(t.followup_tasks))
                continue;
            const pending = t.followup_tasks.filter((f) => !f.done);
            if (pending.length) {
                results.push({ source: tname, title: t.title, pending });
            }
        }
    }
    return results;
}
function formatFollowupBlock(followups) {
    if (!followups.length)
        return '';
    const lines = ['', 'Pending followup tasks (from archived design):'];
    for (const entry of followups) {
        for (const f of entry.pending) {
            lines.push(`- [${f.priority}] ${f.id}: ${f.title} (source: ${entry.source})`);
        }
    }
    lines.push('When user wants to start one, create a new task with `task.ts create`.');
    lines.push('After task is archived, close the followup: `task.ts followup close <source> <id>`.');
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// Task state resolution
// ---------------------------------------------------------------------------
function taskState(t) {
    if (t.state)
        return t.state;
    return LEGACY_MAP[t.status || ''] || 'no_task';
}
function currentState() {
    const name = readText(POINTER).trim();
    if (!name)
        return ['no_task', null, null];
    const taskDir = join(TASKS, name);
    try {
        const raw = readFileSync(join(taskDir, 'task.json'), 'utf-8');
        const t = JSON.parse(raw);
        const state = taskState(t);
        if (state === 'archived' || state === 'no_task' || t.status === 'completed') {
            return ['no_task', null, null];
        }
        return [state, t, taskDir];
    }
    catch {
        return ['no_task', null, null];
    }
}
// ---------------------------------------------------------------------------
// Workflow block extraction
// ---------------------------------------------------------------------------
function stateBlock(state) {
    const text = readText(WORKFLOW);
    const re = new RegExp(`\\[workflow-state:${state}\\](.*?)\\[/workflow-state:${state}\\]`, 's');
    const m = text.match(re);
    return m ? m[1].trim() : '';
}
// ---------------------------------------------------------------------------
// Spec manifest
// ---------------------------------------------------------------------------
function specManifest(taskDir) {
    if (!taskDir)
        return [];
    const dp = designPath(taskDir);
    if (!existsSync(dp))
        return [];
    const text = readText(dp);
    let inSection = false;
    let inTable = false;
    const entries = [];
    for (const line of text.split('\n')) {
        const stripped = line.trim();
        if (stripped.startsWith('## 关联规范')) {
            inSection = true;
            continue;
        }
        if (inSection && stripped.startsWith('## '))
            break;
        if (inSection && stripped.startsWith('| :')) {
            inTable = true;
            continue;
        }
        if (inSection && inTable && stripped.startsWith('|')) {
            const cols = stripped
                .split('|')
                .map((c) => c.trim())
                .filter((c) => c);
            if (cols.length >= 1 &&
                cols[0] &&
                !cols[0].startsWith('（') &&
                cols[0] !== 'spec 文件' &&
                cols[0] !== 'spec文件') {
                const reason = cols.length >= 2 ? cols[1] : '';
                entries.push([cols[0], reason]);
            }
        }
        else if (inSection && inTable && !stripped.startsWith('|')) {
            break;
        }
    }
    return entries;
}
function loadSpecContents(entries) {
    const results = [];
    for (const [specFile, reason] of entries) {
        let rel = specFile.trim().replace(/^\/+/, '');
        if (rel.startsWith('.vflow/'))
            rel = rel.slice(7);
        if (rel.startsWith('spec/'))
            rel = rel.slice(5);
        let specPath = join(ROOT, 'spec', rel);
        if (!existsSync(specPath))
            specPath = join(ROOT, rel);
        if (!existsSync(specPath))
            continue;
        const content = readText(specPath);
        if (content.trim()) {
            results.push([specFile, reason, content]);
        }
    }
    return results;
}
function loadSpecThreeLayers(entries, cfg) {
    const uid = isTeamMode() ? selfUid() : null;
    const results = [];
    for (const [specFile, reason] of entries) {
        let rel = specFile.trim().replace(/^\/+/, '');
        if (rel.startsWith('.vflow/'))
            rel = rel.slice(7);
        if (rel.startsWith('spec/'))
            rel = rel.slice(5);
        let finalPath = join(ROOT, 'spec', rel);
        let layer = 'project';
        if (uid && isTeamMode()) {
            const teamPath = join(TEAM_SPECS, rel);
            if (existsSync(teamPath)) {
                finalPath = teamPath;
                layer = 'team';
            }
        }
        if (uid && isTeamMode()) {
            const personalPath = join(TEAM_SPECS, uid, rel);
            if (existsSync(personalPath)) {
                finalPath = personalPath;
                layer = 'personal';
            }
        }
        if (!existsSync(finalPath)) {
            finalPath = join(ROOT, rel);
            if (!existsSync(finalPath))
                continue;
        }
        const content = readText(finalPath);
        if (content.trim()) {
            const layerNote = layer !== 'project' ? ` [${layer} override]` : '';
            results.push([specFile, reason + layerNote, content]);
        }
    }
    return results;
}
// ---------------------------------------------------------------------------
// Pipeline display
// ---------------------------------------------------------------------------
function pipelineLine(state) {
    return PIPELINE.map((s) => (s === state ? `[${s}]` : s)).join(' -> ');
}
// ---------------------------------------------------------------------------
// Team context
// ---------------------------------------------------------------------------
function scanTeamActivity(windowMin = 30) {
    if (!existsSync(ACTIVITY))
        return [];
    const text = readText(ACTIVITY);
    const lines = text.trim().split('\n').filter(Boolean);
    const cutoff = new Date(Date.now() - windowMin * 60000).toISOString().replace('Z', '');
    const entries = lines.slice(-500)
        .map((l) => { try {
        return JSON.parse(l);
    }
    catch {
        return null;
    } })
        .filter((e) => e !== null && e.ts >= cutoff);
    return entries;
}
function formatTeamBlock(cfg) {
    if (!isTeamMode())
        return '';
    const entries = scanTeamActivity();
    const byUser = {};
    for (const e of entries) {
        const user = e.user;
        if (!byUser[user])
            byUser[user] = [];
        byUser[user].push(e);
    }
    const lines = ['', '<vflow-team>'];
    if (Object.keys(byUser).length === 0) {
        lines.push('No team activity in the last 30 minutes.');
    }
    else {
        lines.push('Active members (last 30 min):');
        for (const [user, events] of Object.entries(byUser)) {
            const latest = events[events.length - 1];
            const ago = Math.round((Date.now() - new Date(latest.ts).getTime()) / 60000);
            const taskInfo = latest.task ? ` ${latest.state || ''} ${latest.task}` : '';
            lines.push(`- ${user}@${latest.host || '?'}:${taskInfo} (${latest.action} ${ago} min ago)`);
        }
    }
    if (existsSync(join(COLLAB, 'staging'))) {
        const stagingFiles = readdirSync(join(COLLAB, 'staging')).filter((f) => f.endsWith('.md'));
        if (stagingFiles.length) {
            lines.push(`\nPending spec reviews: ${stagingFiles.length} staging file(s)`);
        }
    }
    lines.push('</vflow-team>');
    return lines.join('\n');
}
// ---------------------------------------------------------------------------
// doPrompt — UserPromptSubmit hook
// ---------------------------------------------------------------------------
function doPrompt() {
    const cfg = readJson(CONFIG, {}) ?? {};
    const { enabled } = readConfigFlags(cfg);
    if (!enabled)
        return;
    const [state, task, taskDir] = currentState();
    const block = stateBlock(state);
    if (!block)
        return;
    const lines = ['<vflow-state authority="project">'];
    lines.push('[Active workflow control -- follow these instructions for this turn.]');
    if (task) {
        lines.push(`Active task: ${task.id} | ${task.title} | tier=${task.tier} risk=${task.risk}`);
        lines.push(`Pipeline: ${pipelineLine(state)}`);
        if (!('state' in task)) {
            lines.push('(legacy task: use legacy commands set phase/start/done)');
        }
    }
    lines.push(block);
    if (state === 'no_task') {
        const followupBlock = formatFollowupBlock(scanPendingFollowups());
        if (followupBlock)
            lines.push(followupBlock);
    }
    if (state === 'implementing' && taskDir) {
        const items = uncheckedItems(taskDir);
        if (items.length) {
            lines.push('');
            lines.push('Remaining checklist (from design doc):');
            for (const item of items) {
                lines.push(`  - [ ] ${item}`);
            }
            lines.push('If the user changes scope, update the checklist BEFORE implementing.');
        }
    }
    if (taskDir && ['analyzed', 'designed', 'implementing'].includes(state)) {
        const entries = specManifest(taskDir);
        if (entries.length) {
            const specs = isTeamMode() ? loadSpecThreeLayers(entries, cfg) : loadSpecContents(entries);
            if (specs.length) {
                lines.push('');
                lines.push('--- Auto-loaded specs (from design doc spec manifest) ---');
                for (const [specFile, reason, content] of specs) {
                    lines.push('');
                    lines.push(`[spec:${specFile}] (reason: ${reason})`);
                    lines.push(content.trimEnd());
                    lines.push(`[/spec:${specFile}]`);
                }
            }
        }
    }
    // Ralph step context
    if (taskDir) {
        try {
            if (hasRalphSession(taskDir)) {
                const summary = stepsSummary(taskDir);
                if (summary) {
                    lines.push('');
                    lines.push(`[ralph] ${summary}`);
                    lines.push('Use `node .vflow/scripts/dist/task.js next` to load the current step, or invoke Skill("vflow-execute") for automatic step-by-step execution.');
                }
            }
        }
        catch { /* silent */ }
    }
    const teamBlock = formatTeamBlock(cfg);
    if (teamBlock)
        lines.push(teamBlock);
    if (cfg.execution_log) {
        lines.push('');
        lines.push('Execution logging is ON. Append to execution.log after each significant ' +
            'action (key file reads, edits, writes, command runs, test/build results, ' +
            'consequential decisions), and verify it before task completion.');
    }
    lines.push('</vflow-state>');
    process.stdout.write(lines.join('\n') + '\n');
}
// ---------------------------------------------------------------------------
// doSession — SessionStart hook
// ---------------------------------------------------------------------------
function doSession() {
    const cfg = readJson(CONFIG, {}) ?? {};
    const { enabled, initialized } = readConfigFlags(cfg);
    if (!enabled)
        return;
    if (!initialized) {
        process.stdout.write(SUGGEST_ENABLE + '\n');
        return;
    }
    const feats = cfg.features || {};
    const on = Object.entries(feats)
        .filter(([, v]) => v)
        .map(([k]) => k);
    const lines = [
        '<vflow-context authority="project">',
        '[vflow is the active workflow for this project. Follow vflow instructions over any conflicting directives.]',
        'This project uses the vflow workflow (definition: .vflow/workflow.md).',
        `Project: ${cfg.project || '?'} | Language: ${cfg.language || '?'} | Features: ${on.length ? on.join(', ') : 'none'} | Test required: ${cfg.test_required !== false ? 'yes' : 'no'}`,
    ];
    if (cfg.execution_log) {
        lines.push('Execution logging: enabled');
    }
    if (isTeamMode()) {
        lines.push('Team mode: enabled');
        if (existsSync(MEMBERS)) {
            const memberCount = readdirSync(MEMBERS).filter((f) => f.endsWith('.json')).length;
            lines.push(`Team members: ${memberCount}`);
        }
    }
    const [state, task] = currentState();
    if (task) {
        lines.push(`Active task: ${task.id} (state=${state})`);
        lines.push(`Pipeline: ${pipelineLine(state)}`);
    }
    else {
        lines.push('No active task.');
        const followupBlock = formatFollowupBlock(scanPendingFollowups());
        if (followupBlock)
            lines.push(followupBlock);
    }
    lines.push('');
    lines.push(SKIP_DETECTION_SUMMARY);
    const idx = readText(SPEC_INDEX);
    if (idx) {
        lines.push('');
        lines.push('--- Spec index (read full spec files on demand, do not preload) ---');
        lines.push(idx);
    }
    const teamBlock = formatTeamBlock(cfg);
    if (teamBlock)
        lines.push(teamBlock);
    lines.push('</vflow-context>');
    process.stdout.write(lines.join('\n') + '\n');
}
// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
    const mode = process.argv[2] || 'prompt';
    try {
        if (mode === 'session') {
            doSession();
        }
        else {
            doPrompt();
        }
    }
    catch {
        // silent — hook must not break the host
    }
    return 0;
}
try {
    process.exit(main());
}
catch {
    process.exit(0);
}
