#!/usr/bin/env node
// vflow global session detector — installed to ~/.claude/vflow/detect.mjs by `vflow setup`.
// Called from user-level settings.json hooks across all projects.
//
// Behavior:
//   Project has vflow (.vflow/scripts/dist/inject.js exists) -> delegate to project inject
//   Not enabled + not declined + session mode -> inject "ask user to enable" guidance
//   Declined -> silent
// Any error exits silently, never blocks a session.

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { execFileSync } from 'child_process';
import { homedir } from 'os';

const STATE_DIR = join(homedir(), '.claude', 'vflow');

const SUGGEST = `<vflow-suggest>
检测到当前项目尚未启用 vflow 工作流（任务分级+档案留痕+规范驱动+测试硬规则）。
收到用户第一条消息时，先用 AskUserQuestion 工具询问（仅问一次）：
  问题："是否为本项目启用 vflow 工作流？"
  选项：启用（推荐）/ 本项目不启用
得到答案后再处理用户的消息。
- 选启用 → 执行 \`vflow init . --yes\`（静默默认配置），完成后建议运行 /vflow:init 让 AI 探测项目配置
- 选不启用 → 执行 \`vflow decline .\`（记录后不再询问；将来想启用说一声"启用 vflow"即可）
- 用户关闭选择框未表态 → 直接处理其消息，本会话不再提及
</vflow-suggest>`;

function declined(cwd) {
  try {
    const data = JSON.parse(readFileSync(join(STATE_DIR, 'declined.json'), 'utf-8'));
    return data.includes(resolve(cwd));
  } catch {
    return false;
  }
}

function projectHasHooks(cwd) {
  try {
    const content = readFileSync(join(cwd, '.claude', 'settings.json'), 'utf-8');
    return content.includes('.vflow/scripts/dist/inject.js');
  } catch {
    return false;
  }
}

function main() {
  const mode = process.argv[2] || 'prompt';
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const injectPath = join(cwd, '.vflow', 'scripts', 'dist', 'inject.js');

  if (existsSync(injectPath)) {
    if (projectHasHooks(cwd)) return 0;
    try {
      const stdout = execFileSync(process.execPath, [injectPath, mode], {
        encoding: 'utf-8',
        timeout: 15000,
      });
      if (stdout) process.stdout.write(stdout);
    } catch {
      // silent
    }
  } else if (mode === 'session' && !declined(cwd)) {
    process.stdout.write(SUGGEST + '\n');
  }
  return 0;
}

try {
  process.exit(main());
} catch {
  process.exit(0);
}
