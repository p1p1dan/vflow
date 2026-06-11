#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""vflow task state management (sole state writer).

Usage:
  python .vflow/scripts/task.py create <slug> --title "title" [--tier T2]
  python .vflow/scripts/task.py set <key> <value>      # key: risk|phase
  python .vflow/scripts/task.py start [--skip]          # planning -> in_progress
  python .vflow/scripts/task.py done --summary "..." [--force]
  python .vflow/scripts/task.py status
"""
import argparse
import datetime
import json
import os
import re
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


def _is_filled(path):
    """Check if a template file has been filled with real content.

    Strategy: store a hash of the original template at creation time,
    then compare. Also catch empty/near-empty files.
    """
    if not os.path.exists(path):
        return False
    with open(path, encoding="utf-8") as f:
        content = f.read()
    stripped = content.strip()
    if not stripped:
        return False
    hash_file = path + ".hash"
    if os.path.exists(hash_file):
        with open(hash_file, encoding="utf-8") as f:
            original_hash = f.read().strip()
        import hashlib
        current_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]
        return current_hash != original_hash
    non_empty = [l for l in content.splitlines()
                 if l.strip()
                 and not l.strip().startswith("#")
                 and not l.strip().startswith("<!--")
                 and not l.strip().startswith("|")
                 and not l.strip().startswith("---")
                 and not l.strip().startswith(">")
                 and not l.strip().startswith("- [ ]")]
    meaningful = [l for l in non_empty if not re.match(r"^-\s*\S+：\s*$", l.strip())]
    return len(meaningful) >= 3


def _unchecked_items(task_dir):
    """Return list of unchecked checklist items from plan.md."""
    plan = os.path.join(task_dir, "plan.md")
    if not os.path.exists(plan):
        return []
    items = []
    with open(plan, encoding="utf-8") as f:
        for line in f:
            if line.strip().startswith("- [ ]"):
                items.append(line.strip()[6:].strip())
    return items


def cmd_create(args):
    today = datetime.date.today()
    name = "%02d-%02d-%s" % (today.month, today.day, args.slug)
    d = os.path.join(TASKS, name)
    if os.path.exists(d):
        print("[vflow] Task already exists: %s" % name)
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
    import hashlib
    for f in ("requirement.md", "plan.md"):
        src = os.path.join(tpl, f)
        if os.path.exists(src):
            dst = os.path.join(d, f)
            shutil.copy(src, dst)
            with open(dst, encoding="utf-8") as fh:
                h = hashlib.sha256(fh.read().encode("utf-8")).hexdigest()[:16]
            with open(dst + ".hash", "w", encoding="utf-8") as fh:
                fh.write(h)
    cfg = read_json(CONFIG, {})
    if cfg.get("execution_log"):
        with open(os.path.join(d, "execution.log"), "w", encoding="utf-8") as f:
            f.write("")
    os.makedirs(RUNTIME, exist_ok=True)
    with open(POINTER, "w", encoding="utf-8") as f:
        f.write(name)
    print("[vflow] Created task %s (status=planning, phase=requirement)" % name)
    return 0


def cmd_set(args):
    d = current_task_dir()
    if not d:
        print("[vflow] No active task")
        return 1
    p = os.path.join(d, "task.json")
    t = read_json(p)
    if args.key not in ("risk", "phase"):
        print("[vflow] Only 'risk' and 'phase' can be set")
        return 1
    t[args.key] = args.value
    write_json(p, t)
    print("[vflow] %s = %s" % (args.key, args.value))
    return 0


def cmd_start(args):
    d = current_task_dir()
    if not d:
        print("[vflow] No active task")
        return 1
    p = os.path.join(d, "task.json")
    t = read_json(p)

    if args.skip:
        t["planning_skipped"] = True
        print("[vflow] Planning skipped by user request (--skip)")
    else:
        req = os.path.join(d, "requirement.md")
        plan = os.path.join(d, "plan.md")
        errors = []
        if not _is_filled(req):
            errors.append("requirement.md is not filled (still template or missing)")
        if not _is_filled(plan):
            errors.append("plan.md is not filled (still template or missing)")
        if errors:
            print("[vflow] ERROR: Cannot start implementation. Planning docs incomplete:")
            for e in errors:
                print("  - %s" % e)
            print("Complete planning first, or use --skip to bypass (records planning_skipped in task.json).")
            return 1

    t["status"] = "in_progress"
    t["phase"] = "implement"
    write_json(p, t)
    tpl = os.path.join(ROOT, "templates")
    import hashlib
    for f in ("verify.md",):
        src = os.path.join(tpl, f)
        dst = os.path.join(d, f)
        if os.path.exists(src) and not os.path.exists(dst):
            shutil.copy(src, dst)
            with open(dst, encoding="utf-8") as fh:
                h = hashlib.sha256(fh.read().encode("utf-8")).hexdigest()[:16]
            with open(dst + ".hash", "w", encoding="utf-8") as fh:
                fh.write(h)
    wl = os.path.join(d, "worklog.md")
    if not os.path.exists(wl):
        with open(wl, "w", encoding="utf-8") as f:
            f.write("# Implementation Log\n\n| Time | File | Change |\n| :--- | :--- | :--- |\n")
    print("[vflow] Task entered implementation phase (status=in_progress)")
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
            f.write("# Developer Journal\n\n")
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
        print("[vflow] No active task")
        return 1
    p = os.path.join(d, "task.json")
    t = read_json(p)

    if args.force:
        t["force_archived"] = True
        print("[vflow] Archiving with --force (skipping completion checks)")
    else:
        errors = []
        verify = os.path.join(d, "verify.md")
        if not _is_filled(verify):
            errors.append("verify.md is not filled (must contain real build/test output)")
        unchecked = _unchecked_items(d)
        if unchecked:
            errors.append("%d unchecked items in plan.md:" % len(unchecked))
            for item in unchecked:
                errors.append("  - [ ] %s" % item)
        if errors:
            print("[vflow] ERROR: Cannot archive. Completion checks failed:")
            for e in errors:
                print("  %s" % e)
            print("Complete remaining items, or use --force to bypass (records force_archived in task.json).")
            return 1

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
    print("[vflow] Task archived to %s" % os.path.relpath(dst, ROOT))
    return 0


def cmd_status(args):
    d = current_task_dir()
    if not d:
        print("[vflow] No active task (no_task)")
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
    st = sub.add_parser("start")
    st.add_argument("--skip", action="store_true",
                     help="Skip planning validation (records planning_skipped in task.json)")
    dn = sub.add_parser("done")
    dn.add_argument("--summary", default="")
    dn.add_argument("--force", action="store_true",
                     help="Skip completion checks (records force_archived in task.json)")
    sub.add_parser("status")
    args = ap.parse_args()
    return {"create": cmd_create, "set": cmd_set, "start": cmd_start,
            "done": cmd_done, "status": cmd_status}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
