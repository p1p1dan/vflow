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
           "build": {"command": "", "test_command": ""}, "test_required": True}
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


def test_inject_enabled_null_suggest(tmp_path):
    """enabled=null → do_session outputs vflow-suggest; do_prompt silent (R2)."""
    _setup_vflow(tmp_path, enabled=None)
    r = subprocess.run(
        [sys.executable, str(tmp_path / ".vflow" / "scripts" / "inject.py"), "session"],
        capture_output=True, text=True, encoding="utf-8")
    assert "<vflow-suggest>" in r.stdout
    assert "AskUserQuestion" in r.stdout
    r = subprocess.run(
        [sys.executable, str(tmp_path / ".vflow" / "scripts" / "inject.py"), "prompt"],
        capture_output=True, text=True, encoding="utf-8")
    assert r.stdout.strip() == ""


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
    assert "<vflow-context>" in r.stdout


def test_inject_enabled_true_normal(tmp_path):
    """enabled=true → do_session outputs vflow-context normally."""
    _setup_vflow(tmp_path, enabled=True)
    r = subprocess.run(
        [sys.executable, str(tmp_path / ".vflow" / "scripts" / "inject.py"), "session"],
        capture_output=True, text=True, encoding="utf-8")
    assert "<vflow-context>" in r.stdout
