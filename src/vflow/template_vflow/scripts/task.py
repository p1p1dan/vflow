#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""vflow 任务状态管理（唯一状态写入者）。

用法:
  python .vflow/scripts/task.py create <slug> --title "标题" [--tier T2]
  python .vflow/scripts/task.py set <key> <value>      # key: risk|phase
  python .vflow/scripts/task.py start                  # planning -> in_progress
  python .vflow/scripts/task.py done --summary "一句话产出"
  python .vflow/scripts/task.py status
"""
import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .vflow/
TASKS = os.path.join(ROOT, "tasks")
RUNTIME = os.path.join(ROOT, ".runtime")
POINTER = os.path.join(RUNTIME, "current-task")
JOURNAL_DIR = os.path.join(ROOT, "journal")
CONFIG = os.path.join(ROOT, "config.json")


def read_json(path, default=None):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def current_task_dir():
    if not os.path.exists(POINTER):
        return None
    with open(POINTER, encoding="utf-8") as f:
        name = f.read().strip()
    d = os.path.join(TASKS, name)
    return d if os.path.isdir(d) else None


def cmd_create(args):
    today = datetime.date.today()
    name = "%02d-%02d-%s" % (today.month, today.day, args.slug)
    d = os.path.join(TASKS, name)
    if os.path.exists(d):
        print("[vflow] 任务已存在: %s" % name)
        return 1
    os.makedirs(d)
    write_json(os.path.join(d, "task.json"), {
        "id": name,
        "title": args.title or args.slug,
        "tier": args.tier,
        "status": "planning",
        "phase": "requirement",
        "risk": "unset",
        "created": datetime.datetime.now().isoformat(timespec="seconds"),
    })
    tpl = os.path.join(ROOT, "templates")
    for f in ("requirement.md", "plan.md"):
        src = os.path.join(tpl, f)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(d, f))
    os.makedirs(RUNTIME, exist_ok=True)
    with open(POINTER, "w", encoding="utf-8") as f:
        f.write(name)
    print("[vflow] 已创建任务 %s (status=planning, phase=requirement)" % name)
    return 0


def cmd_set(args):
    d = current_task_dir()
    if not d:
        print("[vflow] 无活动任务")
        return 1
    p = os.path.join(d, "task.json")
    t = read_json(p)
    if args.key not in ("risk", "phase"):
        print("[vflow] 仅支持 set risk|phase")
        return 1
    t[args.key] = args.value
    write_json(p, t)
    print("[vflow] %s = %s" % (args.key, args.value))
    return 0


def cmd_start(args):
    d = current_task_dir()
    if not d:
        print("[vflow] 无活动任务")
        return 1
    p = os.path.join(d, "task.json")
    t = read_json(p)
    t["status"] = "in_progress"
    t["phase"] = "implement"
    write_json(p, t)
    tpl = os.path.join(ROOT, "templates")
    for f in ("verify.md",):
        src = os.path.join(tpl, f)
        dst = os.path.join(d, f)
        if os.path.exists(src) and not os.path.exists(dst):
            shutil.copy(src, dst)
    wl = os.path.join(d, "worklog.md")
    if not os.path.exists(wl):
        with open(wl, "w", encoding="utf-8") as f:
            f.write("# 实现记录\n\n| 时间 | 文件 | 改动说明 |\n| :--- | :--- | :--- |\n")
    print("[vflow] 任务进入实现阶段 (status=in_progress)")
    return 0


def git_head():
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"],
                             capture_output=True, text=True, timeout=5)
        return out.stdout.strip() if out.returncode == 0 else ""
    except Exception:
        return ""


def append_journal(task, summary):
    os.makedirs(JOURNAL_DIR, exist_ok=True)
    jp = os.path.join(JOURNAL_DIR, "journal-1.md")
    line = "- [%s] [%s] [%s] %s" % (
        datetime.date.today().isoformat(), task["title"], task["tier"], summary)
    commit = git_head()
    if commit:
        line += " (commit:%s)" % commit
    new = not os.path.exists(jp)
    with open(jp, "a", encoding="utf-8") as f:
        if new:
            f.write("# 开发者日志\n\n")
        f.write(line + "\n")
    cfg = read_json(CONFIG, {})
    nb = (cfg.get("journal") or {}).get("notebook_path")
    if nb and os.path.isdir(nb):
        try:
            with open(os.path.join(nb, "vflow-log.md"), "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass


def cmd_done(args):
    d = current_task_dir()
    if not d:
        print("[vflow] 无活动任务")
        return 1
    p = os.path.join(d, "task.json")
    t = read_json(p)
    t["status"] = "completed"
    t["completed"] = datetime.datetime.now().isoformat(timespec="seconds")
    write_json(p, t)
    month_dir = os.path.join(TASKS, "archive", datetime.date.today().strftime("%Y-%m"))
    os.makedirs(month_dir, exist_ok=True)
    dst = os.path.join(month_dir, os.path.basename(d))
    shutil.move(d, dst)
    append_journal(t, args.summary or "")
    if os.path.exists(POINTER):
        os.remove(POINTER)
    print("[vflow] 任务已归档至 %s，日志已记录" % os.path.relpath(dst, ROOT))
    return 0


def cmd_status(args):
    d = current_task_dir()
    if not d:
        print("[vflow] 无活动任务 (no_task)")
        return 0
    t = read_json(os.path.join(d, "task.json"), {})
    print("[vflow] %s | %s | status=%s phase=%s risk=%s" % (
        t.get("id"), t.get("title"), t.get("status"), t.get("phase"), t.get("risk")))
    return 0


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create")
    c.add_argument("slug")
    c.add_argument("--title", default="")
    c.add_argument("--tier", default="T2")
    s = sub.add_parser("set")
    s.add_argument("key")
    s.add_argument("value")
    sub.add_parser("start")
    dn = sub.add_parser("done")
    dn.add_argument("--summary", default="")
    sub.add_parser("status")
    args = ap.parse_args()
    return {"create": cmd_create, "set": cmd_set, "start": cmd_start,
            "done": cmd_done, "status": cmd_status}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
