#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""vflow 全局会话检测器（由 vflow setup 安装到 ~/.claude/vflow/detect.py，
通过用户级 settings.json hooks 在所有项目的 Claude Code 会话中运行）。

行为:
  项目已启用 vflow(.vflow/ 存在) -> 透传调用项目内 inject.py
  未启用 + 未拒绝 + session 模式  -> 注入"询问用户是否启用"的指引
  已拒绝                          -> 静默
任何异常静默退出，绝不阻塞会话。
"""
import json
import os
import subprocess
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

STATE_DIR = os.path.join(os.path.expanduser("~"), ".claude", "vflow")

SUGGEST = """<vflow-suggest>
检测到当前项目尚未启用 vflow 工作流（任务分级+档案留痕+规范驱动+测试硬规则）。
请在回答用户本轮问题之后，顺带询问一次（仅此一次，简短一句话）是否为本项目启用：
- 用户同意 -> 执行 `vflow init . --yes`（静默默认配置），完成后建议运行 /vflow:init 让 AI 探测项目配置
- 用户拒绝 -> 执行 `vflow decline .`（记录后以后不再询问；将来想启用说一声"启用 vflow"即可）
- 用户未回应该话题 -> 不追问，不重复提及
</vflow-suggest>"""


def declined(cwd):
    try:
        with open(os.path.join(STATE_DIR, "declined.json"), encoding="utf-8") as f:
            return os.path.abspath(cwd) in json.load(f)
    except Exception:
        return False


def project_has_hooks(cwd):
    try:
        with open(os.path.join(cwd, ".claude", "settings.json"), encoding="utf-8") as f:
            return ".vflow/scripts/inject.py" in f.read()
    except Exception:
        return False


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "prompt"
    cwd = os.getcwd()
    inj = os.path.join(cwd, ".vflow", "scripts", "inject.py")
    if os.path.exists(inj):
        # 项目自带 hooks 时静默，避免双重注入；项目无 hooks（只提交了 .vflow）时代为注入
        if project_has_hooks(cwd):
            return 0
        r = subprocess.run([sys.executable, inj, mode],
                           capture_output=True, text=True, encoding="utf-8", timeout=15)
        if r.stdout:
            print(r.stdout, end="")
    elif mode == "session" and not declined(cwd):
        print(SUGGEST)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)
