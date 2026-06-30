#!/usr/bin/env node
// cli.mjs — vflow CLI entry point (setup/init/update/decline/status).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';

const __filename = fileURLToPath(import.meta.url);
const PKG = path.dirname(__filename);
const VERSION = JSON.parse(
  fs.readFileSync(path.join(PKG, '..', 'package.json'), 'utf8')
).version;
const SRC_VFLOW = path.join(PKG, 'template_vflow');
const SRC_CLAUDE = path.join(PKG, 'template_claude');
const DETECT_SRC = path.join(PKG, 'detect.mjs');

const CLAUDE_HOME = path.join(os.homedir(), '.claude');
const STATE_DIR = path.join(CLAUDE_HOME, 'vflow');
const DETECT_DST = path.join(STATE_DIR, 'detect.mjs');
const DECLINED = path.join(STATE_DIR, 'declined.json');
const STAMP = path.join(STATE_DIR, 'version.json');
const GLOBAL_SETTINGS = path.join(CLAUDE_HOME, 'settings.json');

const MANAGED_VFLOW = [
  'workflow.md',
  'scripts/tsconfig.json',
  'scripts/package.json',
  'scripts/inject.ts',
  'scripts/hook-runner.ts',
  'scripts/proposal.ts',
  'scripts/lib/checks.ts',
  'scripts/lib/config.ts',
  'scripts/lib/derive.ts',
  'scripts/lib/schema.ts',
  'scripts/lib/session-runtime.ts',
  'scripts/lib/store.ts',
  'templates/proposal/analysis.json',
  'templates/proposal/design.json',
  'templates/proposal/execution.json',
  'templates/proposal/plan.json',
  'templates/proposal/review.md',
  'templates/proposal/verify.json',
  'tests/proposal-lifecycle.test.mjs',
];

const MANAGED_DIRS = ['scripts/dist'];
const MERGE_DIRS = ['spec'];
const COPY_IF_ABSENT = ['config.json'];

// Project-level methodology skills copied into .claude/skills/ (the only path
// Claude Code auto-discovers/triggers). Source: template_claude/skills/<name>/.
// These KEEP the vflow- prefix on purpose, so they must NOT appear in any
// OLD_*_SKILLS cleanup list (see cleanOldVersion) — else init/update would
// install then immediately delete them. A test pins MANAGED ∩ OLD = ∅.
const MANAGED_CLAUDE_SKILLS = [
  'vflow-think', 'vflow-brainstorm', 'vflow-debug', 'vflow-commit',
  'vflow-proposal',
];

const GITIGNORE_LINES = [
  '.vflow/proposals/',
  '.vflow/runtime/',
  '.vflow/knowledge/',
  '.vflow/scripts/node_modules/',
  '.vflow/scripts/dist/',
];

const CLAUDE_MD_MARKER_START = '<!-- vflow:authority:start -->';
const CLAUDE_MD_MARKER_END = '<!-- vflow:authority:end -->';

// Bare command only: no quoting, no operators, no $VAR — parses identically in
// cmd.exe / PowerShell / sh. All shell-specific work lives in hook-runner.js.
function projectHookCmd(mode) {
  return `node .vflow/scripts/dist/hook-runner.js ${mode}`;
}

const PROJECT_HOOKS = {
  SessionStart: projectHookCmd('session'),
  UserPromptSubmit: projectHookCmd('prompt'),
};

// v0.x skills to clean from .claude/skills/.
// NOTE: vflow-think/brainstorm/debug/commit are intentionally absent — they are
// now MANAGED_CLAUDE_SKILLS (kept, reinstalled every init/update). Do not add
// them back here or cleanup will delete freshly-installed skills.
const OLD_CLAUDE_SKILLS = [
  'vflow-go', 'vflow-continue', 'vflow-context',
  'vflow-code', 'vflow-test', 'vflow-review',
  'vflow-spec', 'vflow-docs', 'vflow-meta',
  'vflow-execute', 'codex-review', 'context-resume', 'context-save',
  'vflow-task', 'vflow-quick',
];

// v0.x old scripts
const OLD_SCRIPTS = [
  'scripts/task.ts', 'scripts/coordinate.ts', 'scripts/collab.ts',
  'scripts/task.mjs', 'scripts/inject.mjs', 'scripts/collab.mjs',
  'scripts/inject.py', 'scripts/task.py',
];

// v0.x old templates
const OLD_TEMPLATES = [
  'templates/task-spec.md', 'templates/ledger.md', 'templates/context.md',
  'templates/requirement.md', 'templates/design.md', 'templates/verify.md',
  'templates/quick-entry.md', 'templates/plan.md',
];

// v0.x old .vflow/skills/.
// NOTE: vflow-think/brainstorm/debug/commit intentionally absent — kept as
// MANAGED_CLAUDE_SKILLS (installed to .claude/skills/, not .vflow/skills/).
const OLD_VFLOW_SKILLS = [
  'skills/vflow-task', 'skills/vflow-quick',
  'skills/vflow-code', 'skills/vflow-test', 'skills/vflow-review',
  'skills/vflow-spec', 'skills/vflow-docs', 'skills/vflow-meta',
];

// --- Utilities ---

function formatJsonError(err) {
  if (!err) return '未知错误';
  if (err instanceof SyntaxError) return err.message;
  return err.code ? `${err.code}: ${err.message}` : err.message;
}

function readJsonFile(filepath) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(filepath, 'utf-8')) };
  } catch (err) {
    if (err?.code === 'ENOENT') return { ok: false, missing: true };
    return { ok: false, error: err };
  }
}

function readJson(filepath, fallback) {
  const result = readJsonFile(filepath);
  if (result.ok) return result.value;
  if (result.missing) return fallback;
  console.warn(`[vflow] 警告: JSON 解析失败，使用默认值: ${filepath}`);
  console.warn(`  原因: ${formatJsonError(result.error)}`);
  return fallback;
}

function backupFile(filepath) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${filepath}.bak.${ts}`;
  fs.copyFileSync(filepath, backup);
  return backup;
}

function readGlobalSettingsOrAbort() {
  const result = readJsonFile(GLOBAL_SETTINGS);
  if (result.ok) return result.value;
  if (result.missing) return {};

  const backup = backupFile(GLOBAL_SETTINGS);
  console.error(`[vflow] 错误: 全局 settings.json 解析失败，已备份原文件: ${backup}`);
  console.error(`  原因: ${formatJsonError(result.error)}`);
  console.error('  为避免覆盖用户原配置，setup 已中止。请修复 JSON 后重试。');
  throw new Error('全局 settings.json 解析失败');
}

function readProjectSettingsOrRebuild(filepath) {
  const result = readJsonFile(filepath);
  if (result.ok) return result.value;
  if (result.missing) return {};

  const backup = backupFile(filepath);
  console.warn(`[vflow] 警告: 项目 settings.json 解析失败，已备份原文件: ${backup}`);
  console.warn(`  原因: ${formatJsonError(result.error)}`);
  console.warn('  将重建 .claude/settings.json。');
  return {};
}

function formatSpawnCommand(cmd) {
  return [cmd[0], ...cmd.slice(1)].join(' ');
}

function writeJson(filepath, data) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function copytreeSync(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copytreeSync(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function safeUnlink(p) {
  try { fs.unlinkSync(p); } catch { /* ignore */ }
}

function safeRmDir(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
}

function copyOne(srcRoot, rel, dstDir, overwrite) {
  const src = path.join(srcRoot, rel);
  const dst = path.join(dstDir, rel);
  if (!fs.existsSync(src)) return;
  if (fs.existsSync(dst) && !overwrite) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

// --- Global setup ---

const GLOBAL_DEGRADED =
  '<vflow-degraded>vflow detect hook failed. AI: check ' +
  '~/.claude/vflow/detect.mjs and the registered node path, ' +
  'report the cause to the user, then continue this turn.</vflow-degraded>';

function hookCmd(mode) {
  return `"${process.execPath}" "${DETECT_DST}" ${mode} || echo '${GLOBAL_DEGRADED}'`;
}

function mergeGlobalHooks(settings) {
  if (!settings.hooks) settings.hooks = {};
  const hooks = settings.hooks;

  for (const [event, mode] of [['SessionStart', 'session'], ['UserPromptSubmit', 'prompt']]) {
    if (!hooks[event]) hooks[event] = [];
    const entries = hooks[event];
    for (const e of entries) {
      const hs = e.hooks || [];
      const kept = hs.filter(h => !String(h.command || '').includes('detect.'));
      if (kept.length !== hs.length) e.hooks = kept;
    }
    hooks[event] = entries.filter(e => (e.hooks || []).length > 0);
    hooks[event].push({ hooks: [{ type: 'command', command: hookCmd(mode) }] });
  }

  writeJson(GLOBAL_SETTINGS, settings);
}

function doSetup(quiet = false) {
  const say = quiet ? () => {} : (msg) => console.log(msg);
  const settings = readGlobalSettingsOrAbort();

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.copyFileSync(DETECT_SRC, DETECT_DST);
  say('  [写入] ~/.claude/vflow/detect.mjs');

  // Clean old global commands (v0.x)
  const cmdDir = path.join(CLAUDE_HOME, 'commands', 'vflow');
  safeRmDir(cmdDir);
  const cmdParent = path.join(CLAUDE_HOME, 'commands');
  if (fs.existsSync(cmdParent)) {
    for (const f of fs.readdirSync(cmdParent)) {
      if (f.startsWith('vflow-') && f.endsWith('.md')) {
        safeUnlink(path.join(cmdParent, f));
      }
    }
  }

  // Clean old global skills (v0.x)
  for (const s of OLD_CLAUDE_SKILLS) {
    safeRmDir(path.join(CLAUDE_HOME, 'skills', s));
  }

  mergeGlobalHooks(settings);
  say('  [合并] ~/.claude/settings.json（全局检测 hooks）');
  writeJson(STAMP, { version: VERSION, node: process.execPath });
  say(`\n[vflow] 全局安装完成 v${VERSION}。在任意项目打开 Claude Code：`);
  say('  - 未启用的项目会自动询问是否启用（拒绝后不再问）');
  say('  - 已启用的项目由项目内资产接管（同事 clone 仓库即可用，无需安装 vflow）');
  return 0;
}

function ensureSetup() {
  const st = readJson(STAMP, {});
  if (st.version !== VERSION || st.node !== process.execPath) {
    doSetup(true);
    console.log(`[vflow] 全局资产已自动刷新至 v${VERSION}`);
  }
}

// --- Old version cleanup ---

function cleanOldVersion(dst) {
  const vf = path.join(dst, '.vflow');
  const cl = path.join(dst, '.claude');
  let cleaned = 0;

  // Old scripts
  for (const rel of OLD_SCRIPTS) {
    const p = path.join(vf, rel);
    if (fs.existsSync(p)) { safeUnlink(p); cleaned++; console.log(`  [cleanup] .vflow/${rel}`); }
  }

  // Old directories
  for (const d of ['scripts/__pycache__', 'graphs', 'tasks']) {
    const p = path.join(vf, d);
    if (fs.existsSync(p)) { safeRmDir(p); cleaned++; console.log(`  [cleanup] .vflow/${d}/`); }
  }

  // Old .vflow/skills/
  for (const rel of OLD_VFLOW_SKILLS) {
    const p = path.join(vf, rel);
    if (fs.existsSync(p)) { safeRmDir(p); cleaned++; console.log(`  [cleanup] .vflow/${rel}/`); }
  }

  // Migration: vflow-proposal moved .vflow/skills/ → .claude/skills/ (now a
  // triggerable project skill). Remove the stale .vflow copy so update doesn't
  // leave a dead, non-discoverable duplicate behind.
  const movedProposal = path.join(vf, 'skills', 'vflow-proposal');
  if (fs.existsSync(movedProposal)) { safeRmDir(movedProposal); cleaned++; console.log('  [cleanup] .vflow/skills/vflow-proposal/ (moved to .claude/skills/)'); }

  // Old templates
  for (const rel of OLD_TEMPLATES) {
    const p = path.join(vf, rel);
    if (fs.existsSync(p)) { safeUnlink(p); cleaned++; console.log(`  [cleanup] .vflow/${rel}`); }
  }

  // Old knowledge.md (v1 used file, v2 uses directory)
  const oldKnowledge = path.join(vf, 'knowledge.md');
  if (fs.existsSync(oldKnowledge)) { safeUnlink(oldKnowledge); cleaned++; console.log('  [cleanup] .vflow/knowledge.md'); }

  // Old .claude/commands/vflow/
  const cmdDir = path.join(cl, 'commands', 'vflow');
  if (fs.existsSync(cmdDir)) { safeRmDir(cmdDir); cleaned++; console.log('  [cleanup] .claude/commands/vflow/'); }

  // Old .claude/commands/ stray files
  const cmdParent = path.join(cl, 'commands');
  if (fs.existsSync(cmdParent)) {
    for (const f of ['task.md', 'quick.md']) {
      const p = path.join(cmdParent, f);
      if (fs.existsSync(p)) { safeUnlink(p); cleaned++; }
    }
    for (const f of fs.readdirSync(cmdParent)) {
      if (f.startsWith('vflow-') && f.endsWith('.md')) {
        safeUnlink(path.join(cmdParent, f)); cleaned++;
      }
    }
  }

  // Old .claude/rules/vflow.md (replaced by proposal-truth.md)
  const oldRule = path.join(cl, 'rules', 'vflow.md');
  if (fs.existsSync(oldRule)) { safeUnlink(oldRule); cleaned++; console.log('  [cleanup] .claude/rules/vflow.md'); }

  // Old .claude/skills/
  for (const s of OLD_CLAUDE_SKILLS) {
    const p = path.join(cl, 'skills', s);
    if (fs.existsSync(p)) { safeRmDir(p); cleaned++; console.log(`  [cleanup] .claude/skills/${s}/`); }
  }

  // Old .agents/skills/ (v0.7 migration path)
  for (const s of OLD_CLAUDE_SKILLS) {
    const p = path.join(dst, '.agents', 'skills', s);
    if (fs.existsSync(p)) { safeRmDir(p); cleaned++; }
  }

  if (cleaned > 0) console.log(`  [cleanup] 清理 ${cleaned} 个 v0.x 残留项`);
}

// --- Project-level ---

function installClaudeMd(dstRoot) {
  const clDir = path.join(dstRoot, '.claude');
  fs.mkdirSync(clDir, { recursive: true });
  const target = path.join(clDir, 'CLAUDE.md');
  const templatePath = path.join(SRC_CLAUDE, 'CLAUDE.md');

  let vflowBlock;
  try {
    vflowBlock = fs.readFileSync(templatePath, 'utf-8').trim();
  } catch {
    return;
  }

  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, vflowBlock + '\n', 'utf-8');
    console.log('  [写入] .claude/CLAUDE.md（vflow authority block）');
    return;
  }

  const existing = fs.readFileSync(target, 'utf-8');
  if (existing.includes(CLAUDE_MD_MARKER_START)) {
    const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped(CLAUDE_MD_MARKER_START) + '[\\s\\S]*?' + escaped(CLAUDE_MD_MARKER_END));
    const updated = existing.replace(pattern, vflowBlock);
    fs.writeFileSync(target, updated, 'utf-8');
    console.log('  [更新] .claude/CLAUDE.md（vflow authority block）');
  } else {
    fs.writeFileSync(target, vflowBlock + '\n\n' + existing, 'utf-8');
    console.log('  [追加] .claude/CLAUDE.md（vflow authority block 置顶）');
  }
}

function installClaudeSkills(dstRoot) {
  const srcSkills = path.join(SRC_CLAUDE, 'skills');
  if (!fs.existsSync(srcSkills)) return;
  const dstSkills = path.join(dstRoot, '.claude', 'skills');
  let installed = 0;
  for (const name of MANAGED_CLAUDE_SKILLS) {
    const src = path.join(srcSkills, name);
    if (!fs.existsSync(src)) continue;
    safeRmDir(path.join(dstSkills, name)); // always overwrite (managed)
    copytreeSync(src, path.join(dstSkills, name));
    installed++;
  }
  if (installed > 0) console.log(`  [写入] .claude/skills/（${installed} 个项目级 skill）`);
}

function installProjectHooks(dstRoot) {
  const cl = path.join(dstRoot, '.claude');
  fs.mkdirSync(cl, { recursive: true });
  const sp = path.join(cl, 'settings.json');
  let settings = readProjectSettingsOrRebuild(sp);
  if (!settings.hooks) settings.hooks = {};
  const hooks = settings.hooks;
  let changed = false;

  for (const [event, cmd] of Object.entries(PROJECT_HOOKS)) {
    if (!hooks[event]) hooks[event] = [];
    const entries = hooks[event];
    for (const e of entries) {
      const hs = e.hooks || [];
      const kept = hs.filter(h => {
        const c = String(h.command || '');
        return !c.includes('.vflow/scripts/') || c === cmd;
      });
      if (kept.length !== hs.length) { e.hooks = kept; changed = true; }
    }
    hooks[event] = entries.filter(e => (e.hooks || []).length > 0);
    const exists = hooks[event].some(e =>
      (e.hooks || []).some(h => h.command === cmd)
    );
    if (!exists) {
      hooks[event].push({ hooks: [{ type: 'command', command: cmd }] });
      changed = true;
    }
  }

  writeJson(sp, settings);
  console.log(`  [${changed ? '合并' : '保持'}] .claude/settings.json（项目 hooks）`);
}

function appendGitignore(dstRoot) {
  const p = path.join(dstRoot, '.gitignore');
  let existing = '';
  if (fs.existsSync(p)) existing = fs.readFileSync(p, 'utf-8');
  const missing = GITIGNORE_LINES.filter(l => !existing.includes(l));
  if (missing.length === 0) return;
  let append = '';
  if (existing && !existing.endsWith('\n')) append += '\n';
  append += '\n# vflow\n' + missing.join('\n') + '\n';
  fs.appendFileSync(p, append, 'utf-8');
  console.log(`  [追加] .gitignore: ${missing.length} 条目`);
}

function ask(prompt, defaultVal = '') {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const suffix = defaultVal ? ` [${defaultVal}]` : '';
    rl.question(`${prompt}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal);
    });
  });
}

async function configure(dstRoot, yes, reconfigure) {
  const p = path.join(dstRoot, '.vflow', 'config.json');
  const cfg = readJson(p, {});
  const placeholder = String(cfg.project || '').startsWith('<');

  cfg.enabled = true;
  if (cfg.initialized !== true) cfg.initialized = false;

  if (yes) {
    if (placeholder) cfg.project = path.basename(path.resolve(dstRoot));
    writeJson(p, cfg);
    console.log('  [写入] config.json（已启用，进入 Claude 后可运行 /vflow:init 完成探测）');
    return;
  }

  if (placeholder || reconfigure) {
    console.log('\n-- 项目配置（回车取默认值）--');
    cfg.project = await ask('项目名', path.basename(path.resolve(dstRoot)));
    if (!cfg.features) cfg.features = {};
    cfg.features.qt = (await ask('是否 Qt 项目 (y/n)', 'n')).toLowerCase() === 'y';
    cfg.features.embedded = (await ask('是否含嵌入式代码 (y/n)', 'n')).toLowerCase() === 'y';
    if (!cfg.build) cfg.build = {};
    cfg.build.command = await ask('构建命令（可留空）', cfg.build.command || '');
    cfg.build.test_command = await ask('测试命令（可留空）', cfg.build.test_command || '');
    cfg.initialized = true;
  }

  writeJson(p, cfg);
  console.log('  [写入] .vflow/config.json');
}

function clearDeclined(dst) {
  const lst = readJson(DECLINED, []);
  const ab = path.resolve(dst);
  const idx = lst.indexOf(ab);
  if (idx !== -1) {
    lst.splice(idx, 1);
    writeJson(DECLINED, lst);
    console.log('  [清除] 该项目的"不启用"标记');
  }
}

function smokeTest(dstRoot) {
  const tests = [
    ['node', '.vflow/scripts/dist/proposal.js', 'status'],
    ['node', '.vflow/scripts/dist/inject.js', 'session'],
  ];
  for (const cmd of tests) {
    const r = spawnSync(cmd[0], cmd.slice(1), {
      cwd: dstRoot,
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const output = ((r.stdout || '') + (r.stderr || '')).trim();
    const lines = output.split('\n');
    console.log(`  自检 ${path.basename(cmd[1])} -> ${lines[0] || '(无输出)'}`);
    if (r.error) {
      const kind = r.error.code === 'ETIMEDOUT' ? '超时' : `spawn error: ${r.error.message}`;
      throw new Error(`自检失败: ${formatSpawnCommand(cmd)} ${kind}`);
    }
    if (r.signal === 'SIGTERM' && r.status === null) {
      throw new Error(`自检失败: ${formatSpawnCommand(cmd)} 超时`);
    }
    if (r.status !== 0) {
      throw new Error(`自检失败: ${formatSpawnCommand(cmd)} 退出码 ${r.status}`);
    }
  }
}

async function doInstall(dst, { update = false, spec = false, yes = false, reconfigure = false } = {}) {
  if (update && spec) {
    return doSpecUpdate(dst);
  }

  const mode = update ? '更新' : '启用';
  console.log(`[vflow] ${mode}项目 -> ${dst}`);

  const dstVflow = path.join(dst, '.vflow');

  // Copy MANAGED files (always overwrite)
  for (const rel of MANAGED_VFLOW) {
    copyOne(SRC_VFLOW, rel, dstVflow, true);
  }
  console.log(`  [写入] ${MANAGED_VFLOW.length} 个托管文件`);

  // Copy COPY_IF_ABSENT files (first install only)
  for (const rel of COPY_IF_ABSENT) {
    copyOne(SRC_VFLOW, rel, dstVflow, false);
  }

  // Sync MANAGED_DIRS (rm then copytree)
  for (const rel of MANAGED_DIRS) {
    const src = path.join(SRC_VFLOW, rel);
    const dst2 = path.join(dstVflow, rel);
    if (fs.existsSync(src)) {
      if (fs.existsSync(dst2)) fs.rmSync(dst2, { recursive: true, force: true });
      copytreeSync(src, dst2);
      console.log(`  [同步] .vflow/${rel}/`);
    }
  }

  // Merge MERGE_DIRS (copytree without rm — preserves user additions)
  for (const rel of MERGE_DIRS) {
    const src = path.join(SRC_VFLOW, rel);
    const dst2 = path.join(dstVflow, rel);
    if (fs.existsSync(src)) {
      copytreeSync(src, dst2);
      console.log(`  [合并] .vflow/${rel}/`);
    }
  }

  // Clean old version residuals
  cleanOldVersion(dst);

  // Install .claude/ assets
  installClaudeMd(dst);
  const rulesSrc = path.join(SRC_CLAUDE, 'rules', 'proposal-truth.md');
  if (fs.existsSync(rulesSrc)) {
    const rulesDst = path.join(dst, '.claude', 'rules');
    fs.mkdirSync(rulesDst, { recursive: true });
    fs.copyFileSync(rulesSrc, path.join(rulesDst, 'proposal-truth.md'));
    console.log('  [写入] .claude/rules/proposal-truth.md');
  }
  installClaudeSkills(dst);
  installProjectHooks(dst);

  appendGitignore(dst);

  if (!update) {
    await configure(dst, yes, reconfigure);
  }

  clearDeclined(dst);
  smokeTest(dst);
  console.log(`[vflow] ${mode}完成 v${VERSION}。打开 Claude Code 新会话即可使用。`);
  return 0;
}

function doSpecUpdate(dst) {
  console.log(`[vflow] 更新项目 spec -> ${dst}`);
  const src = path.join(SRC_VFLOW, 'spec');
  const dstSpec = path.join(dst, '.vflow', 'spec');
  if (!fs.existsSync(src)) {
    console.log('[vflow] 模板 spec 不存在');
    return 1;
  }
  copytreeSync(src, dstSpec);
  console.log('  [合并] .vflow/spec/');
  console.log(`[vflow] spec 更新完成 v${VERSION}。`);
  return 0;
}

// --- decline/status ---

function doDecline(dst) {
  const lst = readJson(DECLINED, []);
  const ab = path.resolve(dst);
  if (!lst.includes(ab)) {
    lst.push(ab);
    writeJson(DECLINED, lst);
  }
  console.log(`[vflow] 已记录：${ab} 不启用 vflow（该项目会话中不再询问；vflow init 可随时启用）`);
  return 0;
}

function doStatus(dst) {
  const vf = path.join(dst, '.vflow');
  if (!fs.existsSync(vf)) {
    console.log(`[vflow] 项目未启用: ${dst}`);
    return 1;
  }
  const r = spawnSync('node', ['.vflow/scripts/dist/proposal.js', 'status'], {
    cwd: dst,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log(((r.stdout || '') + (r.stderr || '')).trim());
  return r.status === 0 ? 0 : 1;
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log('usage: vflow {setup|init|update|decline|status} [path] [options]');
    console.log('');
    console.log('Commands:');
    console.log('  setup                 全局安装（检测 hooks + detect.mjs）');
    console.log('  init <path> [--yes]   为项目启用 vflow');
    console.log('  update <path> [--spec] 同步托管文件到最新版本；--spec 仅合并 .vflow/spec');
    console.log('  decline <path>        标记项目不启用 vflow');
    console.log('  status <path>         查看项目状态');
    return 0;
  }

  if (cmd === '--version' || cmd === '-V') {
    console.log(VERSION);
    return 0;
  }

  if (cmd === 'setup') {
    return doSetup();
  }

  ensureSetup();

  if (cmd === 'init') {
    const target = path.resolve(args[1] || '.');
    const yes = args.includes('--yes');
    const reconfigure = args.includes('--reconfigure');
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      console.log(`[vflow] 目标目录不存在: ${target}`);
      return 1;
    }
    return doInstall(target, { yes, reconfigure });
  }

  if (cmd === 'update') {
    const target = path.resolve(args[1] || '.');
    const spec = args.includes('--spec');
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      console.log(`[vflow] 目标目录不存在: ${target}`);
      return 1;
    }
    return doInstall(target, { update: true, spec });
  }

  if (cmd === 'decline') {
    const target = path.resolve(args[1] || '.');
    return doDecline(target);
  }

  if (cmd === 'status') {
    const target = path.resolve(args[1] || '.');
    return doStatus(target);
  }

  console.log(`[vflow] 未知命令: ${cmd}\n运行 vflow --help 查看用法。`);
  return 1;
}

// Run as CLI only when invoked directly (not when imported by tests).
const invokedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().then((code) => process.exit(code || 0)).catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
}

export { MANAGED_CLAUDE_SKILLS, OLD_CLAUDE_SKILLS, OLD_VFLOW_SKILLS, MANAGED_VFLOW };
