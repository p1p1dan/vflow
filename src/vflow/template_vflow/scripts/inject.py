#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""vflow hook 注入脚本。

用法（由 .claude/settings.json 注册，cwd = 项目根目录）:
  python .vflow/scripts/inject.py prompt    # UserPromptSubmit: 注入当前状态面包屑
  python .vflow/scripts/inject.py session   # SessionStart: 注入项目上下文 + 规范索引
输出到 stdout 的文本会被加入对话上下文。任何异常都静默退出，不阻塞对话。
"""
import json
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .vflow/
POINTER = os.path.join(ROOT, ".runtime", "current-task")
WORKFLOW = os.path.join(ROOT, "workflow.md")
SPEC_INDEX = os.path.join(ROOT, "spec", "index.md")
CONFIG = os.path.join(ROOT, "config.json")


def read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except Exception:
        return ""


def current_status():
    name = read(POINTER).strip()
    if not name:
        return "no_task", None
    tj = os.path.join(ROOT, "tasks", name, "task.json")
    try:
        t = json.loads(read(tj))
        status = t.get("status", "no_task")
        if status == "completed":
            return "no_task", None
        return status, t
    except Exception:
        return "no_task", None


def state_block(status):
    text = read(WORKFLOW)
    m = re.search(r"\[workflow-state:%s\](.*?)\[/workflow-state:%s\]" % (status, status),
                  text, re.S)
    return m.group(1).strip() if m else ""


def do_prompt():
    status, task = current_status()
    block = state_block(status)
    if not block:
        return
    lines = ["<vflow-state>"]
    if task:
        lines.append("当前任务: %s | %s | tier=%s phase=%s risk=%s" % (
            task.get("id"), task.get("title"), task.get("tier"),
            task.get("phase"), task.get("risk")))
    lines.append(block)
    lines.append("</vflow-state>")
    print("\n".join(lines))


def do_session():
    cfg = {}
    try:
        cfg = json.loads(read(CONFIG))
    except Exception:
        pass
    lines = ["<vflow-context>",
             "本项目启用 vflow 工作流（流程定义: .vflow/workflow.md）。"]
    feats = cfg.get("features") or {}
    on = [k for k, v in feats.items() if v]
    lines.append("项目: %s | 语言: %s | 特性: %s | 测试硬规则: %s" % (
        cfg.get("project", "?"), cfg.get("language", "?"),
        ",".join(map(str, on)) if on else "无",
        "启用" if cfg.get("test_required", True) else "关闭"))
    status, task = current_status()
    if task:
        lines.append("活动任务: %s (status=%s phase=%s)" % (
            task.get("id"), task.get("status"), task.get("phase")))
    else:
        lines.append("当前无活动任务。")
    idx = read(SPEC_INDEX)
    if idx:
        lines.append("\n--- 规范索引（正文按需读取，勿全量预读） ---\n" + idx)
    lines.append("</vflow-context>")
    print("\n".join(lines))


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "prompt"
    try:
        if mode == "session":
            do_session()
        else:
            do_prompt()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
