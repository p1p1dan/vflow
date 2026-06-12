# -*- coding: utf-8 -*-
"""hook 注册鲁棒性测试（R8）：$CLAUDE_PROJECT_DIR 定位 + 失败兜底 + 旧注册迁移。"""
import json
from pathlib import Path

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
