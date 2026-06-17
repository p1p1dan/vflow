# -*- coding: utf-8 -*-
"""hook 注册鲁棒性测试（R8）：$CLAUDE_PROJECT_DIR 定位 + 失败兜底 + 旧注册迁移。"""
import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

import vflow.cli as cli


def test_project_hooks_are_cwd_independent_and_non_blocking():
    for cmd in cli.PROJECT_HOOKS.values():
        assert '"$CLAUDE_PROJECT_DIR"' in cmd
        # 失败降级为注入提示（指挥 AI 自查），echo 恒零退出 → 永不拦截输入
        assert "|| echo '" in cmd
        assert "<vflow-degraded>" in cmd


def test_global_hook_cmd_has_degraded_fallback():
    for mode in ("session", "prompt"):
        cmd = cli.hook_cmd(mode)
        assert "detect.py" in cmd
        assert "|| echo '" in cmd
        assert "<vflow-degraded>" in cmd


def test_managed_templates_use_design_not_plan():
    assert "templates/design.md" in cli.MANAGED_VFLOW
    assert "templates/plan.md" not in cli.MANAGED_VFLOW


def test_old_relative_hook_registration_migrated(tmp_path):
    cl = tmp_path / ".claude"
    cl.mkdir()
    # 覆盖两代旧格式：裸相对路径、|| true 兜底
    old = {"hooks": {
        "SessionStart": [{"hooks": [
            {"type": "command", "command": "python .vflow/scripts/inject.py session"}]}],
        "UserPromptSubmit": [{"hooks": [
            {"type": "command",
             "command": 'cd "$CLAUDE_PROJECT_DIR" && python .vflow/scripts/inject.py prompt || true'}]}],
    }}
    (cl / "settings.json").write_text(json.dumps(old), encoding="utf-8")

    cli.install_project_claude(str(tmp_path))

    s = json.loads((cl / "settings.json").read_text(encoding="utf-8"))
    for event, expected in cli.PROJECT_HOOKS.items():
        cmds = [h["command"] for e in s["hooks"][event] for h in e["hooks"]]
        assert cmds == [expected]


def test_unrelated_hooks_preserved(tmp_path):
    cl = tmp_path / ".claude"
    cl.mkdir()
    other = {"type": "command", "command": "echo other-tool"}
    old = {"hooks": {"SessionStart": [{"hooks": [other]}]}}
    (cl / "settings.json").write_text(json.dumps(old), encoding="utf-8")

    cli.install_project_claude(str(tmp_path))

    s = json.loads((cl / "settings.json").read_text(encoding="utf-8"))
    cmds = [h["command"] for e in s["hooks"]["SessionStart"] for h in e["hooks"]]
    assert "echo other-tool" in cmds
    assert cli.PROJECT_HOOKS["SessionStart"] in cmds


# ── enabled 三态测试 ──


def _setup_vflow(tmp_path, enabled):
    """Create minimal .vflow structure for inject.py testing."""
    vflow_dir = tmp_path / ".vflow"
    scripts_dir = vflow_dir / "scripts"
    scripts_dir.mkdir(parents=True)
    src = Path(cli.SRC_VFLOW) / "scripts" / "inject.py"
    shutil.copy2(str(src), str(scripts_dir / "inject.py"))
    cfg = {"project": "test", "language": "python", "features": {},
           "build": {"command": "", "test_command": ""}, "test_required": True,
           "initialized": True}
    if enabled != "MISSING":
        cfg["enabled"] = enabled
    (vflow_dir / "config.json").write_text(
        json.dumps(cfg, ensure_ascii=False), encoding="utf-8")
    (vflow_dir / "workflow.md").write_text(
        "[workflow-state:no_task]\nNo active task.\n[/workflow-state:no_task]\n",
        encoding="utf-8")


def test_init_defer_sets_enabled_null(tmp_path):
    """--defer: files laid down + config.enabled = null (R1)."""
    cli.do_install(str(tmp_path), defer=True)
    cfg = json.loads((tmp_path / ".vflow" / "config.json").read_text(encoding="utf-8"))
    assert cfg["enabled"] is None
    assert cfg["project"] == tmp_path.name
    assert (tmp_path / ".vflow" / "workflow.md").exists()
    assert (tmp_path / ".claude" / "settings.json").exists()


def test_init_defer_yes_conflict():
    """--defer and --yes are mutually exclusive (R6)."""
    old_argv = sys.argv
    sys.argv = ["vflow", "init", "--defer", "--yes"]
    try:
        with pytest.raises(SystemExit) as exc_info:
            cli.main()
        assert exc_info.value.code == 2
    finally:
        sys.argv = old_argv


def test_inject_uninitialized_suggest(tmp_path):
    """initialized=false → do_session outputs vflow-auto-init."""
    vflow_dir = tmp_path / ".vflow"
    scripts_dir = vflow_dir / "scripts"
    scripts_dir.mkdir(parents=True)
    src = Path(cli.SRC_VFLOW) / "scripts" / "inject.py"
    shutil.copy2(str(src), str(scripts_dir / "inject.py"))
    cfg = {"project": "test", "language": "python", "features": {},
           "build": {"command": "", "test_command": ""}, "test_required": True,
           "initialized": False}
    (vflow_dir / "config.json").write_text(
        json.dumps(cfg, ensure_ascii=False), encoding="utf-8")
    (vflow_dir / "workflow.md").write_text(
        "[workflow-state:no_task]\nNo active task.\n[/workflow-state:no_task]\n",
        encoding="utf-8")

    r = subprocess.run(
        [sys.executable, str(tmp_path / ".vflow" / "scripts" / "inject.py"), "session"],
        capture_output=True, text=True, encoding="utf-8")
    assert "<vflow-auto-init>" in r.stdout


def test_inject_enabled_false_silent(tmp_path):
    """enabled=false → do_session and do_prompt both silent (R3)."""
    _setup_vflow(tmp_path, enabled=False)
    for mode in ("session", "prompt"):
        r = subprocess.run(
            [sys.executable, str(tmp_path / ".vflow" / "scripts" / "inject.py"), mode],
            capture_output=True, text=True, encoding="utf-8")
        assert r.stdout.strip() == "", "mode=%s should be silent" % mode


def test_inject_enabled_missing_normal(tmp_path):
    """No enabled field → do_session outputs vflow-context (R5 backward compat)."""
    _setup_vflow(tmp_path, enabled="MISSING")
    r = subprocess.run(
        [sys.executable, str(tmp_path / ".vflow" / "scripts" / "inject.py"), "session"],
        capture_output=True, text=True, encoding="utf-8")
    assert "<vflow-context" in r.stdout


def test_inject_enabled_true_normal(tmp_path):
    """enabled=true → do_session outputs vflow-context normally."""
    _setup_vflow(tmp_path, enabled=True)
    r = subprocess.run(
        [sys.executable, str(tmp_path / ".vflow" / "scripts" / "inject.py"), "session"],
        capture_output=True, text=True, encoding="utf-8")
    assert "<vflow-context" in r.stdout


# ── CLAUDE.md 安装测试 ──


def test_claude_md_created_on_init(tmp_path):
    """Fresh init creates .claude/CLAUDE.md with vflow markers."""
    cli.install_claude_md(str(tmp_path))
    md = (tmp_path / ".claude" / "CLAUDE.md").read_text(encoding="utf-8")
    assert cli.CLAUDE_MD_MARKER_START in md
    assert cli.CLAUDE_MD_MARKER_END in md
    assert "vflow" in md


def test_claude_md_prepended_to_existing(tmp_path):
    """When CLAUDE.md exists without markers, vflow block is prepended."""
    cl = tmp_path / ".claude"
    cl.mkdir()
    (cl / "CLAUDE.md").write_text("# My Project\nCustom content here.\n", encoding="utf-8")

    cli.install_claude_md(str(tmp_path))

    md = (cl / "CLAUDE.md").read_text(encoding="utf-8")
    assert md.startswith(cli.CLAUDE_MD_MARKER_START)
    assert "Custom content here." in md
    marker_pos = md.index(cli.CLAUDE_MD_MARKER_END)
    custom_pos = md.index("Custom content here.")
    assert marker_pos < custom_pos


def test_claude_md_idempotent_update(tmp_path):
    """Running install twice produces exactly one vflow block."""
    cli.install_claude_md(str(tmp_path))
    cli.install_claude_md(str(tmp_path))
    md = (tmp_path / ".claude" / "CLAUDE.md").read_text(encoding="utf-8")
    assert md.count(cli.CLAUDE_MD_MARKER_START) == 1
    assert md.count(cli.CLAUDE_MD_MARKER_END) == 1


# ── Rules 安装测试 ──


def test_rules_created_on_init(tmp_path):
    """Fresh init creates .claude/rules/vflow.md."""
    cli.do_install(str(tmp_path), yes=True)
    rules = tmp_path / ".claude" / "rules" / "vflow.md"
    assert rules.exists()
    content = rules.read_text(encoding="utf-8")
    assert "vflow-state" in content


# ── inject authority 属性测试 ──


def test_inject_authority_attribute(tmp_path):
    """Session and prompt output include authority='project' in tags."""
    _setup_vflow(tmp_path, enabled=True)
    r = subprocess.run(
        [sys.executable, str(tmp_path / ".vflow" / "scripts" / "inject.py"), "session"],
        capture_output=True, text=True, encoding="utf-8")
    assert 'authority="project"' in r.stdout

    r = subprocess.run(
        [sys.executable, str(tmp_path / ".vflow" / "scripts" / "inject.py"), "prompt"],
        capture_output=True, text=True, encoding="utf-8")
    assert 'authority="project"' in r.stdout


# ── Skill registration tests (R1/R3/R5/R7) ──


def test_managed_agents_has_13_skills():
    """R1: All 13 skills registered in MANAGED_AGENTS."""
    assert len(cli.MANAGED_AGENTS) == 13
    for rel in cli.MANAGED_AGENTS:
        assert rel.startswith("skills/vflow-")
        assert rel.endswith("/SKILL.md")


def test_project_commands_reduced_to_3():
    """R3: go/commit/context removed from PROJECT_COMMANDS (migrated to skills)."""
    assert set(cli.PROJECT_COMMANDS) == {"task.md", "quick.md", "init.md"}
    for migrated in cli.MIGRATED_COMMANDS:
        assert migrated not in cli.PROJECT_COMMANDS


def test_managed_vflow_skills_only_pipeline():
    """R1: MANAGED_VFLOW retains only pipeline skills (vflow-task, vflow-quick)."""
    skill_entries = [r for r in cli.MANAGED_VFLOW if "skills/" in r]
    names = {r.split("/")[1] for r in skill_entries}
    assert names == {"vflow-task", "vflow-quick"}


def test_template_skills_exist():
    """R5: template_claude/skills/ contains all 13 SKILL.md files."""
    for rel in cli.MANAGED_AGENTS:
        p = Path(cli.SRC_CLAUDE) / rel
        assert p.exists(), f"Missing template: {rel}"
        content = p.read_text(encoding="utf-8")
        assert "name:" in content
        assert "description:" in content


def test_install_creates_claude_skills(tmp_path):
    """R1: do_install copies .claude/skills/ with all 13 skills."""
    cli.do_install(str(tmp_path), yes=True)
    skills_dir = tmp_path / ".claude" / "skills"
    assert skills_dir.is_dir()
    for rel in cli.MANAGED_AGENTS:
        assert (tmp_path / ".claude" / rel).exists()


def test_migrated_commands_cleaned_on_install(tmp_path):
    """R3: Old go.md/commit.md/context.md commands are removed on install."""
    cmd_dir = tmp_path / ".claude" / "commands" / "vflow"
    cmd_dir.mkdir(parents=True)
    for f in cli.MIGRATED_COMMANDS:
        (cmd_dir / f).write_text("old", encoding="utf-8")
    cli.do_install(str(tmp_path), yes=True)
    for f in cli.MIGRATED_COMMANDS:
        assert not (cmd_dir / f).exists(), f"{f} should be cleaned up"


def test_migrated_vflow_skills_cleaned_on_install(tmp_path):
    """R1: Old .vflow/skills/ directories for migrated skills are removed."""
    for s in cli.MIGRATED_VFLOW_SKILLS:
        d = tmp_path / ".vflow" / "skills" / s
        d.mkdir(parents=True)
        (d / "SKILL.md").write_text("old", encoding="utf-8")
    cli.do_install(str(tmp_path), yes=True)
    for s in cli.MIGRATED_VFLOW_SKILLS:
        assert not (tmp_path / ".vflow" / "skills" / s).is_dir()


def test_migrated_agents_skills_cleaned_on_install(tmp_path):
    """R2: Old .agents/skills/vflow-* directories are removed on install."""
    for s in cli.MIGRATED_AGENTS_SKILLS:
        d = tmp_path / ".agents" / "skills" / s
        d.mkdir(parents=True)
        (d / "SKILL.md").write_text("old", encoding="utf-8")
    cli.do_install(str(tmp_path), yes=True)
    for s in cli.MIGRATED_AGENTS_SKILLS:
        assert not (tmp_path / ".agents" / "skills" / s).is_dir()


def test_cli_mjs_has_matching_constants():
    """R7: cli.mjs has same MANAGED_AGENTS and MIGRATED constants."""
    mjs = (Path(cli.PKG) / "cli.mjs").read_text(encoding="utf-8")
    assert "const MANAGED_AGENTS" in mjs
    assert "const MIGRATED_COMMANDS" in mjs
    assert "const MIGRATED_VFLOW_SKILLS" in mjs
    assert "const MIGRATED_AGENTS_SKILLS" in mjs
    assert "installProjectSkills" in mjs
    for rel in cli.MANAGED_AGENTS:
        name = rel.split("/")[1]  # e.g. "vflow-go"
        assert name in mjs, f"{name} not found in cli.mjs"
