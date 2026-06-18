# -*- coding: utf-8 -*-
"""inject.mjs team injection + spec three-layer loading tests."""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
TEMPLATE_VFLOW = REPO / "src" / "vflow" / "template_vflow"


def _setup_inject_env(tmp_path, team_enabled=False, with_activity=False, with_task=False):
    """Create .vflow structure for inject.mjs team testing."""
    vflow = tmp_path / ".vflow"
    scripts = vflow / "scripts"
    scripts.mkdir(parents=True)
    for f in ("inject.mjs", "task.mjs", "collab.mjs"):
        shutil.copy2(str(TEMPLATE_VFLOW / "scripts" / f), str(scripts / f))

    tpl = vflow / "templates"
    tpl.mkdir(parents=True)
    for f in ("requirement.md", "design.md", "verify.md"):
        shutil.copy2(str(TEMPLATE_VFLOW / "templates" / f), str(tpl / f))

    wf = TEMPLATE_VFLOW / "workflow.md"
    shutil.copy2(str(wf), str(vflow / "workflow.md"))

    spec = vflow / "spec"
    spec.mkdir(parents=True)
    (spec / "index.md").write_text("# Spec Index\n", encoding="utf-8")

    cfg = {
        "project": "test", "enabled": True, "initialized": True,
        "language": "javascript", "features": {},
        "build": {"command": "", "test_command": ""},
        "test_required": False,
        "team": {"enabled": team_enabled, "adapters": {}, "spec_review": True},
    }
    (vflow / "config.json").write_text(json.dumps(cfg), encoding="utf-8")

    # git init
    subprocess.run(["git", "init"], cwd=str(tmp_path), capture_output=True)
    subprocess.run(["git", "config", "user.email", "alice@example.com"], cwd=str(tmp_path), capture_output=True)
    subprocess.run(["git", "config", "user.name", "Alice"], cwd=str(tmp_path), capture_output=True)

    if team_enabled:
        members = vflow / "collab" / "members"
        members.mkdir(parents=True)
        member = {"uid": "alice", "name": "Alice", "email": "alice@example.com", "host": "test-pc", "role": "admin"}
        (members / "alice.json").write_text(json.dumps(member), encoding="utf-8")

    if with_activity:
        collab = vflow / "collab"
        collab.mkdir(exist_ok=True)
        from datetime import datetime
        ts = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        entries = [
            json.dumps({"ts": ts, "user": "alice", "host": "alice-pc", "action": "advance", "task": "task-a", "state": "implementing"}),
            json.dumps({"ts": ts, "user": "bob", "host": "bob-pc", "action": "create", "task": "task-b", "state": "created"}),
        ]
        (collab / "activity.jsonl").write_text("\n".join(entries) + "\n", encoding="utf-8")

    if with_task:
        task_dir = vflow / "tasks" / "test-active"
        task_dir.mkdir(parents=True)
        tj = {"id": "test-active", "title": "Active Task", "tier": "T2", "state": "implementing", "risk": "low"}
        (task_dir / "task.json").write_text(json.dumps(tj), encoding="utf-8")
        runtime = vflow / ".runtime"
        runtime.mkdir(parents=True)
        (runtime / "current-task").write_text("test-active", encoding="utf-8")

    return vflow


def _run_inject(tmp_path, mode):
    cmd = ["node", str(tmp_path / ".vflow" / "scripts" / "inject.mjs"), mode]
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", cwd=str(tmp_path))


# ── team block injection ──

def test_inject_team_block_prompt(tmp_path):
    """prompt mode includes <vflow-team> when team mode is enabled."""
    _setup_inject_env(tmp_path, team_enabled=True, with_activity=True)

    r = _run_inject(tmp_path, "prompt")
    assert r.returncode == 0
    assert "<vflow-team>" in r.stdout
    assert "alice" in r.stdout
    assert "bob" in r.stdout
    assert "</vflow-team>" in r.stdout


def test_inject_team_block_session(tmp_path):
    """session mode includes <vflow-team> and team info."""
    _setup_inject_env(tmp_path, team_enabled=True, with_activity=True)

    r = _run_inject(tmp_path, "session")
    assert r.returncode == 0
    assert "Team mode: enabled" in r.stdout
    assert "<vflow-team>" in r.stdout


def test_inject_no_team_clean(tmp_path):
    """Non-team mode has no dynamic <vflow-team> block."""
    _setup_inject_env(tmp_path, team_enabled=False)

    r = _run_inject(tmp_path, "prompt")
    assert "</vflow-team>" not in r.stdout

    r = _run_inject(tmp_path, "session")
    assert "</vflow-team>" not in r.stdout
    assert "Team mode" not in r.stdout


# ── spec three-layer loading ──

def test_inject_spec_three_layer(tmp_path):
    """Three-layer spec loading: team overrides project, personal overrides team."""
    vflow = _setup_inject_env(tmp_path, team_enabled=True, with_task=True)

    # Layer 1: project spec
    common = vflow / "spec" / "common"
    common.mkdir(parents=True, exist_ok=True)
    (common / "rules.md").write_text("# Project Rules\nLayer 1 content\n", encoding="utf-8")

    # Layer 2: team spec (overrides project)
    team_spec = vflow / "collab" / "specs" / "common"
    team_spec.mkdir(parents=True)
    (team_spec / "rules.md").write_text("# Team Rules\nLayer 2 override\n", encoding="utf-8")

    # Layer 3: personal spec (overrides team)
    personal_spec = vflow / "collab" / "specs" / "alice" / "common"
    personal_spec.mkdir(parents=True)
    (personal_spec / "rules.md").write_text("# Personal Rules\nLayer 3 override\n", encoding="utf-8")

    # Create design.md with spec manifest pointing to common/rules.md
    task_dir = vflow / "tasks" / "test-active"
    design_content = """# Design

## 方案概述

Test

## 改动清单

| 文件 | 改动类型 | 说明 |
| :--- | :--- | :--- |

## 关联规范（实现与审查按此定向加载）

| spec 文件 | 适用理由 |
| :--- | :--- |
| spec/common/rules.md | test coverage |

## 任务清单（SWE.3，实现阶段逐项勾选）

- [ ] 1.1 test (R1)
"""
    (task_dir / "design.md").write_text(design_content, encoding="utf-8")

    r = _run_inject(tmp_path, "prompt")
    assert r.returncode == 0
    # Should load personal override (Layer 3), not project baseline
    assert "Layer 3 override" in r.stdout
    assert "personal override" in r.stdout


def test_inject_spec_team_layer_only(tmp_path):
    """When no personal spec exists, team layer overrides project."""
    vflow = _setup_inject_env(tmp_path, team_enabled=True, with_task=True)

    # Layer 1: project spec
    common = vflow / "spec" / "common"
    common.mkdir(parents=True, exist_ok=True)
    (common / "naming.md").write_text("# Project Naming\nBaseline naming rules\n", encoding="utf-8")

    # Layer 2: team spec
    team_spec = vflow / "collab" / "specs" / "common"
    team_spec.mkdir(parents=True)
    (team_spec / "naming.md").write_text("# Team Naming\nTeam naming override\n", encoding="utf-8")

    task_dir = vflow / "tasks" / "test-active"
    design_content = """# Design

## 方案概述

Test

## 关联规范（实现与审查按此定向加载）

| spec 文件 | 适用理由 |
| :--- | :--- |
| spec/common/naming.md | naming rules |

## 任务清单（SWE.3，实现阶段逐项勾选）

- [ ] 1.1 test (R1)
"""
    (task_dir / "design.md").write_text(design_content, encoding="utf-8")

    r = _run_inject(tmp_path, "prompt")
    assert r.returncode == 0
    assert "Team naming override" in r.stdout
    assert "team override" in r.stdout


# ── staging visibility ──

def test_inject_staging_count(tmp_path):
    """Team block shows pending spec review count."""
    vflow = _setup_inject_env(tmp_path, team_enabled=True, with_activity=True)

    staging = vflow / "collab" / "staging"
    staging.mkdir(parents=True)
    (staging / "alice-abc123.md").write_text("---\nauthor: alice\n---\ncontent\n", encoding="utf-8")

    r = _run_inject(tmp_path, "prompt")
    assert r.returncode == 0
    assert "Pending spec reviews: 1" in r.stdout
