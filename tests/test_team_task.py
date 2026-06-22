# -*- coding: utf-8 -*-
"""task.ts team extension tests: owner on create, per-uid pointer, activity reporting."""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
TEMPLATE_VFLOW = REPO / "src" / "vflow" / "template_vflow"


def _setup_team_task_env(tmp_path, team_enabled=True):
    """Create minimal .vflow structure with team mode for task testing."""
    vflow = tmp_path / ".vflow"
    scripts = vflow / "scripts"
    scripts.mkdir(parents=True)
    shutil.copytree(str(TEMPLATE_VFLOW / "scripts" / "dist"), str(scripts / "dist"))

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
        "team": {"enabled": team_enabled, "adapters": {}},
    }
    (vflow / "config.json").write_text(json.dumps(cfg), encoding="utf-8")

    # git init for uid derivation
    subprocess.run(["git", "init"], cwd=str(tmp_path), capture_output=True)
    subprocess.run(["git", "config", "user.email", "dev@example.com"], cwd=str(tmp_path), capture_output=True)
    subprocess.run(["git", "config", "user.name", "Dev"], cwd=str(tmp_path), capture_output=True)

    return vflow


def _run_task(tmp_path, *args):
    cmd = ["node", str(tmp_path / ".vflow" / "scripts" / "dist" / "task.js")] + list(args)
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", cwd=str(tmp_path))


# ── owner on create ──

def test_task_owner_on_create(tmp_path):
    """Team mode create sets owner field automatically."""
    vflow = _setup_team_task_env(tmp_path, team_enabled=True)

    r = _run_task(tmp_path, "create", "team-test", "--title", "Team Test")
    assert r.returncode == 0

    task_dirs = list((vflow / "tasks").glob("*team-test*"))
    assert len(task_dirs) > 0
    tj = json.loads((task_dirs[0] / "task.json").read_text(encoding="utf-8"))
    assert tj["owner"] == "dev"
    assert "claimed_at" in tj


def test_task_no_owner_without_team(tmp_path):
    """Non-team mode create does NOT set owner."""
    vflow = _setup_team_task_env(tmp_path, team_enabled=False)

    r = _run_task(tmp_path, "create", "solo-test", "--title", "Solo")
    assert r.returncode == 0

    task_dirs = list((vflow / "tasks").glob("*solo-test*"))
    tj = json.loads((task_dirs[0] / "task.json").read_text(encoding="utf-8"))
    assert "owner" not in tj


# ── per-uid pointer ──

def test_task_per_uid_pointer(tmp_path):
    """Team mode uses per-uid current-task pointer file."""
    vflow = _setup_team_task_env(tmp_path, team_enabled=True)

    r = _run_task(tmp_path, "create", "uid-test", "--title", "UID Test")
    assert r.returncode == 0

    # per-uid pointer should exist
    uid_pointer = vflow / ".runtime" / "current-task-dev"
    assert uid_pointer.exists()
    name = uid_pointer.read_text(encoding="utf-8").strip()
    assert "uid-test" in name

    # global pointer should also be written (compatibility)
    global_pointer = vflow / ".runtime" / "current-task"
    assert global_pointer.exists()

    # status should work via per-uid pointer
    r = _run_task(tmp_path, "status")
    assert r.returncode == 0
    assert "uid-test" in r.stdout


# ── activity reporting ──

def test_task_activity_report(tmp_path):
    """State changes write to activity.jsonl in team mode."""
    vflow = _setup_team_task_env(tmp_path, team_enabled=True)

    # create + advance through states
    _run_task(tmp_path, "create", "activity-test", "--title", "Activity")
    for _ in range(3):
        _run_task(tmp_path, "advance", "--skip-check")

    activity_file = vflow / "collab" / "activity.jsonl"
    assert activity_file.exists()

    lines = activity_file.read_text(encoding="utf-8").strip().split("\n")
    entries = [json.loads(l) for l in lines if l.strip()]

    # should have at least create + 3 advances = 4 entries
    assert len(entries) >= 4

    actions = [e["action"] for e in entries]
    assert "create" in actions
    assert "advance" in actions

    # all entries should have user = "dev"
    for e in entries:
        assert e["user"] == "dev"
        assert e["task"] is not None
