#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""vflow hook injection script.

Usage (registered in .claude/settings.json, cwd = project root):
  python .vflow/scripts/inject.py prompt    # UserPromptSubmit: inject current state breadcrumb
  python .vflow/scripts/inject.py session   # SessionStart: inject project context + spec index
Output to stdout is added to conversation context. Errors exit silently.
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

SKIP_DETECTION_SUMMARY = """Skip Detection Rule: ONLY these exact user phrases constitute a skip signal:
  "skip" | "直接做" | "跳过" | "不用规划" | "不走流程"
Implementation strategy phrases (e.g. "use goal mode", "fix file by file") are NOT skip signals."""


def read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except Exception:
        return ""


def read_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def current_status():
    name = read(POINTER).strip()
    if not name:
        return "no_task", None, None
    task_dir = os.path.join(ROOT, "tasks", name)
    tj = os.path.join(task_dir, "task.json")
    try:
        t = json.loads(read(tj))
        status = t.get("status", "no_task")
        if status == "completed":
            return "no_task", None, None
        return status, t, task_dir
    except Exception:
        return "no_task", None, None


def state_block(status):
    text = read(WORKFLOW)
    m = re.search(r"\[workflow-state:%s\](.*?)\[/workflow-state:%s\]" % (status, status),
                  text, re.S)
    return m.group(1).strip() if m else ""


def unchecked_items(task_dir):
    """Read plan.md and return unchecked checklist items."""
    if not task_dir:
        return []
    plan = os.path.join(task_dir, "plan.md")
    if not os.path.exists(plan):
        return []
    items = []
    with open(plan, encoding="utf-8") as f:
        for line in f:
            if line.strip().startswith("- [ ]"):
                items.append(line.strip()[6:].strip())
    return items


def spec_manifest(task_dir):
    """Parse plan.md '关联规范' table and return list of (spec_file, reason)."""
    if not task_dir:
        return []
    plan = os.path.join(task_dir, "plan.md")
    if not os.path.exists(plan):
        return []
    text = read(plan)
    in_section = False
    in_table = False
    entries = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("## 关联规范"):
            in_section = True
            continue
        if in_section and stripped.startswith("## "):
            break
        if in_section and stripped.startswith("| :"):
            in_table = True
            continue
        if in_section and in_table and stripped.startswith("|"):
            cols = [c.strip() for c in stripped.split("|")]
            cols = [c for c in cols if c]
            if len(cols) >= 1 and cols[0] and not cols[0].startswith("（") and not cols[0].startswith("spec"):
                reason = cols[1] if len(cols) >= 2 else ""
                entries.append((cols[0], reason))
        elif in_section and in_table and not stripped.startswith("|"):
            break
    return entries


def load_spec_contents(entries):
    """Read spec file contents for manifest entries. Returns list of (path, reason, content)."""
    results = []
    for spec_file, reason in entries:
        rel = spec_file.strip().lstrip("/")
        if rel.startswith("spec/"):
            rel = rel[5:]
        spec_path = os.path.join(ROOT, "spec", rel)
        if not os.path.exists(spec_path):
            spec_path = os.path.join(ROOT, rel)
        if not os.path.exists(spec_path):
            continue
        content = read(spec_path)
        if content.strip():
            results.append((spec_file, reason, content))
    return results


def do_prompt():
    status, task, task_dir = current_status()
    block = state_block(status)
    if not block:
        return
    lines = ["<vflow-state>"]
    if task:
        lines.append("Active task: %s | %s | tier=%s phase=%s risk=%s" % (
            task.get("id"), task.get("title"), task.get("tier"),
            task.get("phase"), task.get("risk")))

    lines.append(block)

    if status == "in_progress" and task_dir:
        items = unchecked_items(task_dir)
        if items:
            lines.append("")
            lines.append("Remaining checklist (from plan.md):")
            for item in items:
                lines.append("  - [ ] %s" % item)
            lines.append("If the user changes scope, update plan.md checklist BEFORE implementing.")

    if task_dir and status in ("planning", "in_progress"):
        entries = spec_manifest(task_dir)
        if entries:
            specs = load_spec_contents(entries)
            if specs:
                lines.append("")
                lines.append("--- Auto-loaded specs (from plan.md spec manifest) ---")
                for spec_file, reason, content in specs:
                    lines.append("")
                    lines.append("[spec:%s] (reason: %s)" % (spec_file, reason))
                    lines.append(content.rstrip())
                    lines.append("[/spec:%s]" % spec_file)

    cfg = read_json(CONFIG, {})
    if cfg.get("execution_log"):
        lines.append("")
        lines.append("Execution logging is ON. Append to execution.log after each significant "
                      "action (key file reads, edits, writes, command runs, test/build results, "
                      "consequential decisions), and verify it before task completion.")

    lines.append("</vflow-state>")
    print("\n".join(lines))


def do_session():
    cfg = read_json(CONFIG, {})
    feats = cfg.get("features") or {}
    on = [k for k, v in feats.items() if v]
    lines = [
        "<vflow-context>",
        "This project uses the vflow workflow (definition: .vflow/workflow.md).",
        "Project: %s | Language: %s | Features: %s | Test required: %s" % (
            cfg.get("project", "?"), cfg.get("language", "?"),
            ", ".join(map(str, on)) if on else "none",
            "yes" if cfg.get("test_required", True) else "no"),
    ]
    if cfg.get("execution_log"):
        lines.append("Execution logging: enabled")

    status, task, _ = current_status()
    if task:
        lines.append("Active task: %s (status=%s phase=%s)" % (
            task.get("id"), task.get("status"), task.get("phase")))
    else:
        lines.append("No active task.")

    lines.append("")
    lines.append(SKIP_DETECTION_SUMMARY)

    idx = read(SPEC_INDEX)
    if idx:
        lines.append("")
        lines.append("--- Spec index (read full spec files on demand, do not preload) ---")
        lines.append(idx)

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
