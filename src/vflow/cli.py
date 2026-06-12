#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""vflow CLI：轻量级 AI 研发工作流。

架构（v0.2.0 全局资产模式）:
  全局资产（~/.claude/，setup 安装，所有项目共享）:
    - hooks: detect.py 会话检测（已启用→透传注入；未启用→询问一次；已拒绝→静默）
    - commands: /vflow:go|task|quick|init|commit|context（6 个）
    - skills: vflow-task|quick|review|test|spec（5 个）
  项目资产（<项目>/.vflow/，init 安装，纯数据随项目 git）:
    - workflow.md / config.json / spec/ / templates/ / tasks/ / scripts/

用法:
  vflow setup              # 安装/刷新全局资产（每设备一次；CLI 每次运行也会自动校验刷新）
  vflow init <路径> [--yes] # 项目启用（--yes 静默默认配置）
  vflow update <路径> [--spec]
  vflow decline <路径>      # 标记"该项目不启用"，会话内不再询问
  vflow status [路径]
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

from . import __version__

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

PKG = os.path.dirname(os.path.abspath(__file__))
SRC_VFLOW = os.path.join(PKG, "template_vflow")
SRC_CLAUDE = os.path.join(PKG, "template_claude")
DETECT_SRC = os.path.join(PKG, "detect.py")

CLAUDE_HOME = os.path.join(os.path.expanduser("~"), ".claude")
STATE_DIR = os.path.join(CLAUDE_HOME, "vflow")
DETECT_DST = os.path.join(STATE_DIR, "detect.py")
DECLINED = os.path.join(STATE_DIR, "declined.json")
STAMP = os.path.join(STATE_DIR, "version.json")
GLOBAL_SETTINGS = os.path.join(CLAUDE_HOME, "settings.json")

MANAGED_VFLOW = [
    "workflow.md",
    "scripts/task.py",
    "scripts/inject.py",
    "templates/requirement.md",
    "templates/plan.md",
    "templates/verify.md",
    "templates/quick-entry.md",
    "skills/vflow-task/SKILL.md",
    "skills/vflow-quick/SKILL.md",
    "skills/vflow-review/SKILL.md",
    "skills/vflow-test/SKILL.md",
    "skills/vflow-spec/SKILL.md",
    "skills/vflow-brainstorm/SKILL.md",
    "skills/vflow-debug/SKILL.md",
    "skills/vflow-meta/SKILL.md",
    "skills/vflow-think/SKILL.md",
]
COPY_IF_ABSENT_VFLOW = [
    "config.json",
    "tasks/quick-log.md",
]
# 项目级资产（随项目 git，同事 clone 即得，无需 pip）
PROJECT_COMMANDS = ["go.md", "task.md", "quick.md", "commit.md", "init.md", "context.md"]
PROJECT_SKILLS = ["vflow-task", "vflow-quick", "vflow-review", "vflow-test", "vflow-spec",
                  "vflow-brainstorm", "vflow-debug", "vflow-meta", "vflow-think"]
PROJECT_HOOKS = {
    "SessionStart": "python .vflow/scripts/inject.py session",
    "UserPromptSubmit": "python .vflow/scripts/inject.py prompt",
}
# 全局资产（仅发现与启用层：detect 钩子 + /vflow:init 引导命令）
GLOBAL_COMMANDS = ["init.md"]
GITIGNORE_LINES = [".vflow/journal/", ".vflow/.runtime/"]


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ---------------- 全局资产 ----------------

def hook_cmd(mode):
    return '"%s" "%s" %s' % (sys.executable, DETECT_DST, mode)


def merge_global_hooks():
    settings = read_json(GLOBAL_SETTINGS, {})
    hooks = settings.setdefault("hooks", {})
    changed = False
    for event, mode in (("SessionStart", "session"), ("UserPromptSubmit", "prompt")):
        entries = hooks.setdefault(event, [])
        # 清掉旧版本注册的 detect 钩子（python 路径可能变化）
        for e in entries:
            hs = e.get("hooks") or []
            kept = [h for h in hs if "detect.py" not in str(h.get("command", ""))]
            if len(kept) != len(hs):
                e["hooks"] = kept
                changed = True
        entries[:] = [e for e in entries if e.get("hooks")]
        entries.append({"hooks": [{"type": "command", "command": hook_cmd(mode)}]})
        changed = True
    write_json(GLOBAL_SETTINGS, settings)
    return changed


def do_setup(quiet=False):
    def say(msg):
        if not quiet:
            print(msg)
    os.makedirs(STATE_DIR, exist_ok=True)
    shutil.copy2(DETECT_SRC, DETECT_DST)
    say("  [写入] ~/.claude/vflow/detect.py")
    cmd_dst = os.path.join(CLAUDE_HOME, "commands", "vflow")
    os.makedirs(cmd_dst, exist_ok=True)
    for f in GLOBAL_COMMANDS:
        shutil.copy2(os.path.join(SRC_CLAUDE, "commands", "vflow", f),
                     os.path.join(cmd_dst, f))
    say("  [写入] ~/.claude/commands/vflow/init.md（全局启用入口）")
    # 清理 v0.2.0 早期全量全局安装的多余资产（命令保留 init，技能全部归项目级）
    for f in ("go.md", "task.md", "quick.md", "commit.md", "context.md"):
        p = os.path.join(cmd_dst, f)
        if os.path.exists(p):
            os.remove(p)
    for s in PROJECT_SKILLS:
        p = os.path.join(CLAUDE_HOME, "skills", s)
        if os.path.isdir(p):
            shutil.rmtree(p)
    # Clean up old dash-format commands that may coexist with colon-format
    old_cmd_dir = os.path.join(CLAUDE_HOME, "commands")
    if os.path.isdir(old_cmd_dir):
        for f in os.listdir(old_cmd_dir):
            if f.startswith("vflow-") and f.endswith(".md"):
                os.remove(os.path.join(old_cmd_dir, f))
                say("  [cleanup] removed old global command %s" % f)
    merge_global_hooks()
    say("  [合并] ~/.claude/settings.json（全局检测 hooks）")
    write_json(STAMP, {"version": __version__, "python": sys.executable})
    say("\n[vflow] 全局安装完成 v%s。在任意项目打开 Claude Code：" % __version__)
    say("  - 未启用的项目会自动询问是否启用（拒绝后不再问）")
    say("  - 已启用的项目由项目内资产接管（同事 clone 仓库即可用，无需安装 vflow）")
    return 0


def ensure_setup():
    """CLI 每次运行自动校验全局资产版本，pip 升级后无需手动 setup。"""
    st = read_json(STAMP, {})
    if st.get("version") != __version__ or st.get("python") != sys.executable:
        do_setup(quiet=True)
        print("[vflow] 全局资产已自动刷新至 v%s" % __version__)


# ---------------- 项目级 ----------------

def copy_one(src_root, rel, dst_dir, overwrite):
    src = os.path.join(src_root, rel)
    dst = os.path.join(dst_dir, rel)
    if not os.path.exists(src):
        return
    if os.path.exists(dst) and not overwrite:
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)
    print("  [写入] .vflow/%s" % rel)


def install_spec(dst_root, force):
    src = os.path.join(SRC_VFLOW, "spec")
    dst = os.path.join(dst_root, ".vflow", "spec")
    if os.path.isdir(dst) and not force:
        print("  [保留] .vflow/spec/（含项目回写条目，update --spec 可强制覆盖）")
        return
    if os.path.isdir(dst):
        shutil.rmtree(dst)
    shutil.copytree(src, dst)
    print("  [写入] .vflow/spec/（规范库）")


def install_project_claude(dst_root):
    """项目级 .claude 资产：随项目 git，同事 clone 即得（无需 pip）。"""
    cl = os.path.join(dst_root, ".claude")
    cmd_dst = os.path.join(cl, "commands", "vflow")
    os.makedirs(cmd_dst, exist_ok=True)
    for f in PROJECT_COMMANDS:
        shutil.copy2(os.path.join(SRC_CLAUDE, "commands", "vflow", f),
                     os.path.join(cmd_dst, f))
    print("  [写入] .claude/（%d 命令）" % len(PROJECT_COMMANDS))
    # 合并项目 settings.json hooks（相对路径，跨设备无依赖）
    sp = os.path.join(cl, "settings.json")
    settings = read_json(sp, None)
    if settings is None:
        if os.path.exists(sp):
            shutil.copy2(sp, sp + ".bak")
            print("  [警告] 项目 settings.json 解析失败，已备份 .bak 后重建")
        settings = {}
    hooks = settings.setdefault("hooks", {})
    changed = False
    for event, cmd in PROJECT_HOOKS.items():
        entries = hooks.setdefault(event, [])
        exists = any(h.get("command") == cmd
                     for e in entries for h in (e.get("hooks") or []))
        if not exists:
            entries.append({"hooks": [{"type": "command", "command": cmd}]})
            changed = True
    write_json(sp, settings)
    print("  [%s] .claude/settings.json（项目 hooks）" % ("合并" if changed else "保持"))
    # 清理 v0.1 根目录旧命令
    for rel in ("commands/task.md", "commands/quick.md"):
        p = os.path.join(cl, rel)
        if os.path.exists(p):
            os.remove(p)
            print("  [cleanup] .claude/%s (migrated to commands/vflow/)" % rel)
    # 清理旧 dash-format 命令（vflow-task.md → 应该只存在 vflow/task.md）
    cmd_parent = os.path.join(cl, "commands")
    if os.path.isdir(cmd_parent):
        for f in os.listdir(cmd_parent):
            if f.startswith("vflow-") and f.endswith(".md"):
                os.remove(os.path.join(cmd_parent, f))
                print("  [cleanup] .claude/commands/%s (old dash-format)" % f)
    # v0.3.0: skills moved from .claude/skills/ to .vflow/skills/ — clean up old location
    for s in PROJECT_SKILLS:
        old_skill = os.path.join(cl, "skills", s)
        if os.path.isdir(old_skill):
            shutil.rmtree(old_skill)
            print("  [cleanup] .claude/skills/%s (moved to .vflow/skills/)" % s)


def append_gitignore(dst_root):
    p = os.path.join(dst_root, ".gitignore")
    existing = ""
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            existing = f.read()
    missing = [l for l in GITIGNORE_LINES if l not in existing]
    if not missing:
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


def configure(dst_root, yes, reconfigure):
    p = os.path.join(dst_root, ".vflow", "config.json")
    cfg = read_json(p, {})
    placeholder = str(cfg.get("project", "")).startswith("<")
    if yes:
        if placeholder:
            cfg["project"] = os.path.basename(os.path.abspath(dst_root))
            write_json(p, cfg)
            print("  [写入] config.json（默认配置，建议之后跑 /vflow:init 让 AI 探测）")
        return
    if placeholder or reconfigure:
        print("\n-- 项目配置（回车取默认值）--")
        cfg["project"] = ask("项目名", os.path.basename(os.path.abspath(dst_root)))
        cfg["features"]["qt"] = ask("是否 Qt 项目 (y/n)", "n").lower() == "y"
        cfg["features"]["embedded"] = ask("是否含嵌入式代码 (y/n)", "n").lower() == "y"
        cfg["build"]["command"] = ask("构建命令（可留空后补）", cfg["build"].get("command", ""))
        nb = ask("工作笔记目录（可选，周报集成，留空跳过）", "")
        cfg["journal"]["notebook_path"] = nb or None
        write_json(p, cfg)
        print("  [写入] .vflow/config.json")


def clear_declined(dst):
    lst = read_json(DECLINED, [])
    ab = os.path.abspath(dst)
    if ab in lst:
        lst.remove(ab)
        write_json(DECLINED, lst)
        print("  [清除] 该项目的\"不启用\"标记")


def smoke_test(dst_root):
    ok = True
    for cmd in ([sys.executable, ".vflow/scripts/task.py", "status"],
                [sys.executable, ".vflow/scripts/inject.py", "session"]):
        r = subprocess.run(cmd, cwd=dst_root, capture_output=True, text=True,
                           encoding="utf-8", timeout=15)
        line = (r.stdout or r.stderr or "").strip().splitlines()
        print("  自检 %s -> %s" % (os.path.basename(cmd[1]), line[0] if line else "(无输出)"))
        ok = ok and r.returncode == 0
    return ok


def do_install(dst, update=False, spec=False, yes=False, reconfigure=False):
    mode = "更新" if update else "启用"
    print("[vflow] %s项目 -> %s" % (mode, dst))
    for rel in MANAGED_VFLOW:
        copy_one(SRC_VFLOW, rel, os.path.join(dst, ".vflow"), overwrite=True)
    for rel in COPY_IF_ABSENT_VFLOW:
        copy_one(SRC_VFLOW, rel, os.path.join(dst, ".vflow"), overwrite=False)
    install_spec(dst, force=spec)
    install_project_claude(dst)
    append_gitignore(dst)
    configure(dst, yes, reconfigure)
    clear_declined(dst)
    smoke_test(dst)
    print("[vflow] %s完成。打开 Claude Code 新会话即可使用。" % mode)
    return 0


def do_decline(dst):
    lst = read_json(DECLINED, [])
    ab = os.path.abspath(dst)
    if ab not in lst:
        lst.append(ab)
        write_json(DECLINED, lst)
    print("[vflow] 已记录：%s 不启用 vflow（该项目会话中不再询问；vflow init 可随时启用）" % ab)
    return 0


def do_status(dst):
    vf = os.path.join(dst, ".vflow")
    if not os.path.isdir(vf):
        print("[vflow] 项目未启用: %s" % dst)
        return 1
    r = subprocess.run([sys.executable, ".vflow/scripts/task.py", "status"],
                       cwd=dst, capture_output=True, text=True, encoding="utf-8")
    print((r.stdout or r.stderr).strip())
    return 0


def main():
    ap = argparse.ArgumentParser(prog="vflow", description="vflow 轻量级 AI 研发工作流")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("setup", help="安装/刷新全局资产（hooks/commands/skills）")
    pi = sub.add_parser("init", help="为项目启用 vflow")
    pi.add_argument("target", nargs="?", default=".")
    pi.add_argument("--yes", action="store_true", help="静默默认配置（不交互）")
    pi.add_argument("--reconfigure", action="store_true")
    pu = sub.add_parser("update", help="更新项目的受管文件")
    pu.add_argument("target", nargs="?", default=".")
    pu.add_argument("--spec", action="store_true", help="同时覆盖规范库")
    pd = sub.add_parser("decline", help="标记项目不启用（不再询问）")
    pd.add_argument("target", nargs="?", default=".")
    ps = sub.add_parser("status", help="查看项目状态")
    ps.add_argument("target", nargs="?", default=".")
    args = ap.parse_args()

    if args.cmd == "setup":
        return do_setup()
    ensure_setup()
    dst = os.path.abspath(args.target)
    if args.cmd == "decline":
        return do_decline(dst)
    if args.cmd == "status":
        return do_status(dst)
    if not os.path.isdir(dst):
        print("[vflow] 目标目录不存在: %s" % dst)
        return 1
    if args.cmd == "init":
        return do_install(dst, yes=args.yes, reconfigure=args.reconfigure)
    return do_install(dst, update=True, spec=args.spec)


if __name__ == "__main__":
    sys.exit(main())
