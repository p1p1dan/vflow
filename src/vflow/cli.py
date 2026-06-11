#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""vflow CLI：轻量级 AI 研发工作流安装器。

用法:
  vflow init <项目路径>            # 全新安装（交互式填配置）
  vflow update <项目路径>          # 更新受管文件（保留用户数据与规范回写）
  vflow update <项目路径> --spec   # 更新时连规范库一起覆盖（会丢失项目内回写条目）
  vflow status <项目路径>          # 查看项目的 vflow 安装与任务状态

文件分类:
  受管文件（init/update 均覆盖）: workflow.md、scripts/、templates/、skills/vflow-*、commands/task|quick.md
  用户数据（永不覆盖）           : config.json、tasks/、journal/、.runtime/、spec/（除非 --spec）
  智能合并                       : .claude/settings.json（保留已有配置，只补 vflow hooks）
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PKG = os.path.dirname(os.path.abspath(__file__))
SRC_VFLOW = os.path.join(PKG, "template_vflow")
SRC_CLAUDE = os.path.join(PKG, "template_claude")

MANAGED_VFLOW = [
    "workflow.md",
    "scripts/task.py",
    "scripts/inject.py",
    "templates/requirement.md",
    "templates/plan.md",
    "templates/verify.md",
    "templates/quick-entry.md",
]
MANAGED_CLAUDE = [
    "skills/vflow-task/SKILL.md",
    "skills/vflow-quick/SKILL.md",
    "skills/vflow-review/SKILL.md",
    "skills/vflow-test/SKILL.md",
    "skills/vflow-spec/SKILL.md",
    "commands/task.md",
    "commands/quick.md",
]
COPY_IF_ABSENT_VFLOW = [
    "config.json",
    "tasks/quick-log.md",
]
GITIGNORE_LINES = [".vflow/journal/", ".vflow/.runtime/"]
VFLOW_HOOKS = {
    "SessionStart": "python .vflow/scripts/inject.py session",
    "UserPromptSubmit": "python .vflow/scripts/inject.py prompt",
}


def copy_one(src_root, rel, dst_dir, overwrite):
    src = os.path.join(src_root, rel)
    dst = os.path.join(dst_dir, rel)
    if not os.path.exists(src):
        print("  [跳过] 模板缺失 %s" % rel)
        return
    if os.path.exists(dst) and not overwrite:
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)
    print("  [写入] %s" % os.path.relpath(dst))


def install_spec(dst_root, force):
    src = os.path.join(SRC_VFLOW, "spec")
    dst = os.path.join(dst_root, ".vflow", "spec")
    if os.path.isdir(dst) and not force:
        print("  [保留] .vflow/spec/ 已存在（含项目回写条目，update --spec 可强制覆盖）")
        return
    if os.path.isdir(dst):
        shutil.rmtree(dst)
        print("  [覆盖] .vflow/spec/")
    shutil.copytree(src, dst)
    print("  [写入] .vflow/spec/（规范库）")


def merge_settings(dst_root):
    dst = os.path.join(dst_root, ".claude", "settings.json")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    settings = {}
    if os.path.exists(dst):
        try:
            with open(dst, encoding="utf-8") as f:
                settings = json.load(f)
        except Exception:
            backup = dst + ".bak"
            shutil.copy2(dst, backup)
            print("  [警告] settings.json 解析失败，已备份至 %s，将重建" % backup)
            settings = {}
    hooks = settings.setdefault("hooks", {})
    changed = False
    for event, cmd in VFLOW_HOOKS.items():
        entries = hooks.setdefault(event, [])
        exists = any(
            h.get("command") == cmd
            for e in entries for h in (e.get("hooks") or [])
        )
        if not exists:
            entries.append({"hooks": [{"type": "command", "command": cmd}]})
            changed = True
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)
    print("  [%s] .claude/settings.json" % ("合并" if changed else "保持"))


def append_gitignore(dst_root):
    p = os.path.join(dst_root, ".gitignore")
    existing = ""
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            existing = f.read()
    missing = [l for l in GITIGNORE_LINES if l not in existing]
    if not missing:
        print("  [保持] .gitignore")
        return
    with open(p, "a", encoding="utf-8") as f:
        if existing and not existing.endswith("\n"):
            f.write("\n")
        f.write("\n# vflow\n" + "\n".join(missing) + "\n")
    print("  [追加] .gitignore: %s" % ", ".join(missing))


def ask(prompt, default=""):
    try:
        v = input("%s%s: " % (prompt, " [%s]" % default if default else "")).strip()
        return v or default
    except EOFError:
        return default


def configure(dst_root, reconfigure):
    p = os.path.join(dst_root, ".vflow", "config.json")
    with open(p, encoding="utf-8") as f:
        cfg = json.load(f)
    if cfg.get("project", "").startswith("<") or reconfigure:
        print("\n-- 项目配置（回车取默认值）--")
        cfg["project"] = ask("项目名", os.path.basename(os.path.abspath(dst_root)))
        cfg["features"]["qt"] = ask("是否 Qt 项目 (y/n)", "n").lower() == "y"
        cfg["features"]["embedded"] = ask("是否含嵌入式代码 (y/n)", "n").lower() == "y"
        cfg["build"]["command"] = ask("构建命令（可留空后补）", cfg["build"].get("command", ""))
        nb = ask("工作笔记目录（可选，用于周报集成，留空跳过）", "")
        cfg["journal"]["notebook_path"] = nb or None
        with open(p, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        print("  [写入] .vflow/config.json")


def smoke_test(dst_root):
    print("\n-- 自检 --")
    ok = True
    for cmd in ([sys.executable, ".vflow/scripts/task.py", "status"],
                [sys.executable, ".vflow/scripts/inject.py", "session"]):
        r = subprocess.run(cmd, cwd=dst_root, capture_output=True, text=True,
                           encoding="utf-8", timeout=15)
        line = (r.stdout or r.stderr or "").strip().splitlines()
        print("  %s -> %s" % (os.path.basename(cmd[1]) + " " + cmd[2],
                              line[0] if line else "(无输出)"))
        ok = ok and r.returncode == 0
    return ok


def do_install(dst, update=False, spec=False, reconfigure=False):
    mode = "更新" if update else "安装"
    print("[vflow] %s -> %s\n" % (mode, dst))
    print("-- 受管文件 --")
    for rel in MANAGED_VFLOW:
        copy_one(SRC_VFLOW, rel, os.path.join(dst, ".vflow"), overwrite=True)
    for rel in MANAGED_CLAUDE:
        copy_one(SRC_CLAUDE, rel, os.path.join(dst, ".claude"), overwrite=True)
    print("-- 用户数据 --")
    for rel in COPY_IF_ABSENT_VFLOW:
        copy_one(SRC_VFLOW, rel, os.path.join(dst, ".vflow"), overwrite=False)
    install_spec(dst, force=spec)
    merge_settings(dst)
    append_gitignore(dst)
    configure(dst, reconfigure)
    ok = smoke_test(dst)
    print("\n[vflow] %s%s。打开 Claude Code 新会话即可使用（/task /quick 或直接说需求）。"
          % (mode, "完成" if ok else "完成（自检有警告，见上方输出）"))
    return 0


def do_status(dst):
    vf = os.path.join(dst, ".vflow")
    if not os.path.isdir(vf):
        print("[vflow] 未安装: %s" % dst)
        return 1
    r = subprocess.run([sys.executable, ".vflow/scripts/task.py", "status"],
                       cwd=dst, capture_output=True, text=True, encoding="utf-8")
    print(r.stdout.strip() or r.stderr.strip())
    return 0


def main():
    ap = argparse.ArgumentParser(prog="vflow", description="vflow 轻量级 AI 研发工作流")
    sub = ap.add_subparsers(dest="cmd", required=True)
    pi = sub.add_parser("init", help="安装到项目")
    pi.add_argument("target")
    pi.add_argument("--reconfigure", action="store_true")
    pu = sub.add_parser("update", help="更新受管文件")
    pu.add_argument("target")
    pu.add_argument("--spec", action="store_true", help="同时覆盖规范库")
    ps = sub.add_parser("status", help="查看项目状态")
    ps.add_argument("target", nargs="?", default=".")
    args = ap.parse_args()

    dst = os.path.abspath(args.target)
    if args.cmd == "status":
        return do_status(dst)
    if not os.path.isdir(dst):
        print("[vflow] 目标目录不存在: %s" % dst)
        return 1
    if args.cmd == "init":
        return do_install(dst, reconfigure=args.reconfigure)
    return do_install(dst, update=True, spec=args.spec)


if __name__ == "__main__":
    sys.exit(main())
