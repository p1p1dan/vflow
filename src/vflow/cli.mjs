#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const __filename = fileURLToPath(import.meta.url);
const PKG = path.dirname(__filename);
// 单一真源：从 package.json 读版本号，避免硬编码与 package.json 脱节
const VERSION = JSON.parse(
  fs.readFileSync(path.join(PKG, '..', '..', 'package.json'), 'utf8')
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
  'scripts/task.mjs',
  'scripts/inject.mjs',
  'templates/requirement.md',
  'templates/design.md',
  'templates/verify.md',
  'templates/quick-entry.md',
  'skills/vflow-task/SKILL.md',
  'skills/vflow-quick/SKILL.md',
];

const COPY_IF_ABSENT_VFLOW = ['config.json', 'tasks/quick-log.md'];

const MANAGED_AGENTS = [
  'skills/vflow-go/SKILL.md',
  'skills/vflow-continue/SKILL.md',
  'skills/vflow-commit/SKILL.md',
  'skills/vflow-context/SKILL.md',
  'skills/vflow-brainstorm/SKILL.md',
  'skills/vflow-code/SKILL.md',
  'skills/vflow-test/SKILL.md',
  'skills/vflow-review/SKILL.md',
  'skills/vflow-debug/SKILL.md',
  'skills/vflow-think/SKILL.md',
  'skills/vflow-spec/SKILL.md',
  'skills/vflow-docs/SKILL.md',
  'skills/vflow-meta/SKILL.md',
];

const PROJECT_COMMANDS = ['task.md', 'quick.md', 'init.md'];
const PROJECT_SKILLS = [
  'vflow-task', 'vflow-quick', 'vflow-review', 'vflow-test', 'vflow-spec',
  'vflow-brainstorm', 'vflow-debug', 'vflow-meta', 'vflow-think',
];
// v0.6: commands migrated to skills — clean on update
const MIGRATED_COMMANDS = ['go.md', 'commit.md', 'context.md'];
// v0.6→0.7: skills migrated from .vflow/skills/ → .agents/skills/ → .claude/skills/
const MIGRATED_VFLOW_SKILLS = [
  'vflow-brainstorm', 'vflow-code', 'vflow-test', 'vflow-review',
  'vflow-debug', 'vflow-think', 'vflow-spec', 'vflow-docs', 'vflow-meta',
];
// v0.7: .agents/skills/ was wrong path — clean on update
const MIGRATED_AGENTS_SKILLS = [
  'vflow-go', 'vflow-continue', 'vflow-commit', 'vflow-context',
  'vflow-brainstorm', 'vflow-code', 'vflow-test', 'vflow-review',
  'vflow-debug', 'vflow-think', 'vflow-spec', 'vflow-docs', 'vflow-meta',
];

const PROJECT_DEGRADED = (mode) =>
  `<vflow-degraded>vflow inject hook failed. AI: run ` +
  `\`node .vflow/scripts/inject.mjs ${mode}\` manually to diagnose ` +
  `(node missing? cwd? encoding?), report the cause to the user, ` +
  `then continue this turn.</vflow-degraded>`;

function projectHookCmd(mode) {
  return `cd "$CLAUDE_PROJECT_DIR" && node .vflow/scripts/inject.mjs ${mode} || echo '${PROJECT_DEGRADED(mode)}'`;
}

const PROJECT_HOOKS = {
  SessionStart: projectHookCmd('session'),
  UserPromptSubmit: projectHookCmd('prompt'),
};

const GLOBAL_COMMANDS = ['init.md'];
const GITIGNORE_LINES = ['.vflow/journal/', '.vflow/.runtime/'];

const CLAUDE_MD_MARKER_START = '<!-- vflow:authority:start -->';
const CLAUDE_MD_MARKER_END = '<!-- vflow:authority:end -->';

// --- Utilities ---

function readJson(filepath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  } catch {
    return fallback;
  }
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

// --- Global assets ---

const GLOBAL_DEGRADED =
  '<vflow-degraded>vflow detect hook failed. AI: check ' +
  '~/.claude/vflow/detect.mjs and the registered node path, ' +
  'report the cause to the user, then continue this turn.</vflow-degraded>';

function hookCmd(mode) {
  return `"${process.execPath}" "${DETECT_DST}" ${mode} || echo '${GLOBAL_DEGRADED}'`;
}

function mergeGlobalHooks() {
  const settings = readJson(GLOBAL_SETTINGS, {});
  if (!settings.hooks) settings.hooks = {};
  const hooks = settings.hooks;
  let changed = false;

  for (const [event, mode] of [['SessionStart', 'session'], ['UserPromptSubmit', 'prompt']]) {
    if (!hooks[event]) hooks[event] = [];
    const entries = hooks[event];
    for (const e of entries) {
      const hs = e.hooks || [];
      const kept = hs.filter(h => !String(h.command || '').includes('detect.'));
      if (kept.length !== hs.length) {
        e.hooks = kept;
        changed = true;
      }
    }
    hooks[event] = entries.filter(e => (e.hooks || []).length > 0);
    hooks[event].push({ hooks: [{ type: 'command', command: hookCmd(mode) }] });
    changed = true;
  }

  writeJson(GLOBAL_SETTINGS, settings);
  return changed;
}

function doSetup(quiet = false) {
  const say = quiet ? () => {} : (msg) => console.log(msg);

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.copyFileSync(DETECT_SRC, DETECT_DST);
  say('  [写入] ~/.claude/vflow/detect.mjs');

  const cmdDst = path.join(CLAUDE_HOME, 'commands', 'vflow');
  fs.mkdirSync(cmdDst, { recursive: true });
  for (const f of GLOBAL_COMMANDS) {
    fs.copyFileSync(path.join(SRC_CLAUDE, 'commands', 'vflow', f), path.join(cmdDst, f));
  }
  say('  [写入] ~/.claude/commands/vflow/init.md（全局启用入口）');

  for (const f of ['go.md', 'task.md', 'quick.md', 'commit.md', 'context.md']) {
    safeUnlink(path.join(cmdDst, f));
  }
  for (const s of PROJECT_SKILLS) {
    const p = path.join(CLAUDE_HOME, 'skills', s);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  }

  const oldCmdDir = path.join(CLAUDE_HOME, 'commands');
  if (fs.existsSync(oldCmdDir)) {
    for (const f of fs.readdirSync(oldCmdDir)) {
      if (f.startsWith('vflow-') && f.endsWith('.md')) {
        fs.unlinkSync(path.join(oldCmdDir, f));
        say(`  [cleanup] removed old global command ${f}`);
      }
    }
  }

  mergeGlobalHooks();
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

// --- Project-level ---

function copyOne(srcRoot, rel, dstDir, overwrite) {
  const src = path.join(srcRoot, rel);
  const dst = path.join(dstDir, rel);
  if (!fs.existsSync(src)) return;
  if (fs.existsSync(dst) && !overwrite) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`  [写入] .vflow/${rel}`);
}

function installSpec(dstRoot, force) {
  const src = path.join(SRC_VFLOW, 'spec');
  const dst = path.join(dstRoot, '.vflow', 'spec');
  if (fs.existsSync(dst) && !force) {
    console.log('  [保留] .vflow/spec/（含项目回写条目，update --spec 可强制覆盖）');
    return;
  }
  if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
  copytreeSync(src, dst);
  console.log('  [写入] .vflow/spec/（规范库）');
}

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

function installProjectClaude(dstRoot) {
  const cl = path.join(dstRoot, '.claude');
  const cmdDst = path.join(cl, 'commands', 'vflow');
  fs.mkdirSync(cmdDst, { recursive: true });
  for (const f of PROJECT_COMMANDS) {
    fs.copyFileSync(path.join(SRC_CLAUDE, 'commands', 'vflow', f), path.join(cmdDst, f));
  }
  console.log(`  [写入] .claude/（${PROJECT_COMMANDS.length} 命令）`);

  // v0.6: clean commands migrated to skills
  for (const f of MIGRATED_COMMANDS) {
    const p = path.join(cmdDst, f);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log(`  [cleanup] .claude/commands/vflow/${f} (migrated to skills)`);
    }
  }

  installClaudeMd(dstRoot);

  const rulesSrc = path.join(SRC_CLAUDE, 'rules', 'vflow.md');
  if (fs.existsSync(rulesSrc)) {
    const rulesDst = path.join(cl, 'rules');
    fs.mkdirSync(rulesDst, { recursive: true });
    fs.copyFileSync(rulesSrc, path.join(rulesDst, 'vflow.md'));
    console.log('  [写入] .claude/rules/vflow.md');
  }

  const sp = path.join(cl, 'settings.json');
  let settings = readJson(sp, null);
  if (settings === null) {
    if (fs.existsSync(sp)) {
      fs.copyFileSync(sp, sp + '.bak');
      console.log('  [警告] 项目 settings.json 解析失败，已备份 .bak 后重建');
    }
    settings = {};
  }
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
        return !c.includes('.vflow/scripts/inject.') || c === cmd;
      });
      if (kept.length !== hs.length) {
        e.hooks = kept;
        changed = true;
      }
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

  for (const rel of ['commands/task.md', 'commands/quick.md']) {
    const p = path.join(cl, rel);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      console.log(`  [cleanup] .claude/${rel} (migrated to commands/vflow/)`);
    }
  }

  const cmdParent = path.join(cl, 'commands');
  if (fs.existsSync(cmdParent)) {
    for (const f of fs.readdirSync(cmdParent)) {
      if (f.startsWith('vflow-') && f.endsWith('.md')) {
        fs.unlinkSync(path.join(cmdParent, f));
        console.log(`  [cleanup] .claude/commands/${f} (old dash-format)`);
      }
    }
  }

}

function installProjectSkills(dstRoot) {
  for (const rel of MANAGED_AGENTS) {
    copyOne(SRC_CLAUDE, rel, path.join(dstRoot, '.claude'), true);
  }
  console.log(`  [写入] .claude/skills/（${MANAGED_AGENTS.length} 技能）`);
}

function appendGitignore(dstRoot) {
  const p = path.join(dstRoot, '.gitignore');
  let existing = '';
  if (fs.existsSync(p)) {
    existing = fs.readFileSync(p, 'utf-8');
  }
  const missing = GITIGNORE_LINES.filter(l => !existing.includes(l));
  if (missing.length === 0) return;
  let append = '';
  if (existing && !existing.endsWith('\n')) append += '\n';
  append += '\n# vflow\n' + missing.join('\n') + '\n';
  fs.appendFileSync(p, append, 'utf-8');
  console.log(`  [追加] .gitignore: ${missing.join(', ')}`);
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

async function configure(dstRoot, yes, reconfigure, defer = false) {
  const p = path.join(dstRoot, '.vflow', 'config.json');
  const cfg = readJson(p, {});
  const placeholder = String(cfg.project || '').startsWith('<');

  // 统一：默认启用；initialized 初始为 false，由 /vflow:init 完成探测后置 true
  cfg.enabled = true;
  if (cfg.initialized !== true) cfg.initialized = false;

  if (defer) {
    if (placeholder) cfg.project = path.basename(path.resolve(dstRoot));
    writeJson(p, cfg);
    console.log('  [写入] config.json（已启用，待 Claude 会话中运行 /vflow:init 完成探测）');
    return;
  }

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
    cfg.build.command = await ask('构建命令（可留空后补）', cfg.build.command || '');
    const nb = await ask('工作笔记目录（可选，周报集成，留空跳过）', '');
    if (!cfg.journal) cfg.journal = {};
    cfg.journal.notebook_path = nb || null;
    // 用户手工填了关键字段 — 视为人工探测完成
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
  let ok = true;
  const tests = [
    ['node', '.vflow/scripts/task.mjs', 'status'],
    ['node', '.vflow/scripts/inject.mjs', 'session'],
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
    if (r.status !== 0) ok = false;
  }
  return ok;
}

async function doInstall(dst, { update = false, spec = false, yes = false, defer = false, reconfigure = false } = {}) {
  const mode = update ? '更新' : '启用';
  console.log(`[vflow] ${mode}项目 -> ${dst}`);

  for (const rel of MANAGED_VFLOW) {
    copyOne(SRC_VFLOW, rel, path.join(dst, '.vflow'), true);
  }
  for (const rel of COPY_IF_ABSENT_VFLOW) {
    copyOne(SRC_VFLOW, rel, path.join(dst, '.vflow'), false);
  }

  const staleTpl = path.join(dst, '.vflow', 'templates', 'plan.md');
  if (fs.existsSync(staleTpl)) {
    fs.unlinkSync(staleTpl);
    console.log('  [cleanup] .vflow/templates/plan.md (replaced by design.md)');
  }

  installSpec(dst, spec);
  installProjectClaude(dst);
  installProjectSkills(dst);
  // v0.6→0.7: clean skills from old locations
  for (const s of MIGRATED_VFLOW_SKILLS) {
    const old = path.join(dst, '.vflow', 'skills', s);
    if (fs.existsSync(old)) {
      fs.rmSync(old, { recursive: true, force: true });
      console.log(`  [cleanup] .vflow/skills/${s} (migrated to .claude/skills/)`);
    }
  }
  for (const s of MIGRATED_AGENTS_SKILLS) {
    const old = path.join(dst, '.agents', 'skills', s);
    if (fs.existsSync(old)) {
      fs.rmSync(old, { recursive: true, force: true });
      console.log(`  [cleanup] .agents/skills/${s} (migrated to .claude/skills/)`);
    }
  }
  appendGitignore(dst);

  if (!update) {
    await configure(dst, yes, reconfigure, defer);
  }

  clearDeclined(dst);
  smokeTest(dst);
  console.log(`[vflow] ${mode}完成。打开 Claude Code 新会话即可使用。`);
  return 0;
}

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
  const r = spawnSync('node', ['.vflow/scripts/task.mjs', 'status'], {
    cwd: dst,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log(((r.stdout || '') + (r.stderr || '')).trim());
  return 0;
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log('usage: vflow {setup|init|update|decline|status} [options]');
    return 1;
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
    const defer = args.includes('--defer');
    const reconfigure = args.includes('--reconfigure');
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      console.log(`[vflow] 目标目录不存在: ${target}`);
      return 1;
    }
    return doInstall(target, { yes, defer, reconfigure });
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

  console.log(`[vflow] Unknown command: ${cmd}`);
  return 1;
}

main().then((code) => process.exit(code || 0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
