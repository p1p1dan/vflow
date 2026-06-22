# -*- coding: utf-8 -*-
"""collab.ts command tests: join, whoami, status, preflight, sync, claim, release, search."""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
TEMPLATE_VFLOW = REPO / "src" / "vflow" / "template_vflow"


def _setup_collab_env(tmp_path, team_enabled=False):
    """Create minimal .vflow structure for collab testing."""
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
        "team": {"enabled": team_enabled, "adapters": {}, "spec_review": True},
    }
    (vflow / "config.json").write_text(json.dumps(cfg), encoding="utf-8")

    # init git so git config works
    subprocess.run(["git", "init"], cwd=str(tmp_path), capture_output=True)
    subprocess.run(["git", "config", "user.email", "alice@example.com"], cwd=str(tmp_path), capture_output=True)
    subprocess.run(["git", "config", "user.name", "Alice"], cwd=str(tmp_path), capture_output=True)

    return vflow


def _run_collab(tmp_path, *args):
    cmd = ["node", str(tmp_path / ".vflow" / "scripts" / "dist" / "collab.js")] + list(args)
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", cwd=str(tmp_path))


def _run_task(tmp_path, *args):
    cmd = ["node", str(tmp_path / ".vflow" / "scripts" / "dist" / "task.js")] + list(args)
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", cwd=str(tmp_path))


# ── join & whoami ──

def test_collab_join_whoami(tmp_path):
    """join creates member file and enables team mode; whoami shows info."""
    _setup_collab_env(tmp_path)

    r = _run_collab(tmp_path, "join")
    assert r.returncode == 0
    assert "Joined as alice" in r.stdout
    assert "Team mode enabled" in r.stdout

    # member file created
    member_file = tmp_path / ".vflow" / "collab" / "members" / "alice.json"
    assert member_file.exists()
    m = json.loads(member_file.read_text(encoding="utf-8"))
    assert m["uid"] == "alice"
    assert m["email"] == "alice@example.com"
    assert m["role"] == "admin"  # first member is admin

    # config updated
    cfg = json.loads((tmp_path / ".vflow" / "config.json").read_text(encoding="utf-8"))
    assert cfg["team"]["enabled"] is True

    # .gitattributes created
    ga = (tmp_path / ".gitattributes").read_text(encoding="utf-8")
    assert "activity.jsonl merge=union" in ga

    # whoami
    r = _run_collab(tmp_path, "whoami")
    assert r.returncode == 0
    assert "alice" in r.stdout
    assert "alice@example.com" in r.stdout


def test_collab_join_idempotent(tmp_path):
    """Joining again updates host, doesn't duplicate."""
    _setup_collab_env(tmp_path)
    _run_collab(tmp_path, "join")
    r = _run_collab(tmp_path, "join")
    assert r.returncode == 0
    assert "Updated member alice" in r.stdout


# ── status ──

def test_collab_status(tmp_path):
    """status shows recent activity."""
    vflow = _setup_collab_env(tmp_path, team_enabled=True)
    _run_collab(tmp_path, "join")

    # write some activity
    collab = vflow / "collab"
    collab.mkdir(exist_ok=True)
    from datetime import datetime
    ts = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    entry = json.dumps({"ts": ts, "user": "alice", "host": "test-pc", "action": "create", "task": "test-task", "state": "created"})
    (collab / "activity.jsonl").write_text(entry + "\n", encoding="utf-8")

    r = _run_collab(tmp_path, "status")
    assert r.returncode == 0
    assert "alice" in r.stdout
    assert "create" in r.stdout


def test_collab_status_no_team(tmp_path):
    """status fails when team mode is off."""
    _setup_collab_env(tmp_path, team_enabled=False)
    r = _run_collab(tmp_path, "status")
    assert r.returncode == 1
    assert "not enabled" in r.stdout


# ── preflight ──

def test_collab_preflight(tmp_path):
    """preflight detects conflicts from other users."""
    vflow = _setup_collab_env(tmp_path, team_enabled=True)
    _run_collab(tmp_path, "join")

    collab = vflow / "collab"
    collab.mkdir(exist_ok=True)
    from datetime import datetime
    ts = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    entry = json.dumps({"ts": ts, "user": "bob", "host": "bob-pc", "action": "advance", "task": "my-task", "state": "implementing"})
    (collab / "activity.jsonl").write_text(entry + "\n", encoding="utf-8")

    # conflict: bob is on my-task
    r = _run_collab(tmp_path, "preflight", "--task", "my-task")
    assert r.returncode == 1
    assert "CONFLICT" in r.stdout
    assert "bob" in r.stdout

    # no conflict: nobody on other-task
    r = _run_collab(tmp_path, "preflight", "--task", "other-task")
    assert r.returncode == 0
    assert "No conflicts" in r.stdout


# ── sync dry-run ──

def test_collab_sync_dry_run(tmp_path):
    """sync --dry-run prints commands without executing."""
    _setup_collab_env(tmp_path, team_enabled=True)
    _run_collab(tmp_path, "join")

    r = _run_collab(tmp_path, "sync", "--dry-run")
    assert r.returncode == 0
    assert "dry-run" in r.stdout.lower()


# ── claim & release ──

def test_collab_claim_release(tmp_path):
    """claim sets owner; release clears it."""
    vflow = _setup_collab_env(tmp_path, team_enabled=True)
    _run_collab(tmp_path, "join")

    # create a task
    r = _run_task(tmp_path, "create", "test-task", "--title", "Test")
    assert r.returncode == 0
    task_dirs = list((vflow / "tasks").glob("*test-task*"))
    assert len(task_dirs) > 0
    slug = task_dirs[0].name

    # claim
    r = _run_collab(tmp_path, "claim", slug)
    assert r.returncode == 0
    assert "Claimed" in r.stdout

    tj = json.loads((task_dirs[0] / "task.json").read_text(encoding="utf-8"))
    assert tj["owner"] == "alice"
    assert "claimed_at" in tj

    # per-uid pointer exists
    pointer = vflow / ".runtime" / "current-task-alice"
    assert pointer.exists()
    assert pointer.read_text(encoding="utf-8").strip() == slug

    # release
    r = _run_collab(tmp_path, "release", slug)
    assert r.returncode == 0
    assert "Released" in r.stdout

    tj = json.loads((task_dirs[0] / "task.json").read_text(encoding="utf-8"))
    assert "owner" not in tj


# ── search ──

def test_search_archive(tmp_path):
    """search finds matches across archived tasks."""
    vflow = _setup_collab_env(tmp_path)

    # create archive with content
    archive = vflow / "tasks" / "archive" / "2026-06"
    task_dir = archive / "06-17-searchable"
    task_dir.mkdir(parents=True)
    tj = {"id": "06-17-searchable", "title": "A searchable task", "state": "archived"}
    (task_dir / "task.json").write_text(json.dumps(tj), encoding="utf-8")
    (task_dir / "requirement.md").write_text("# Req\n\nWe need alpha-beta pruning\n", encoding="utf-8")

    r = _run_collab(tmp_path, "search", "alpha-beta")
    assert r.returncode == 0
    assert "06-17-searchable" in r.stdout
    assert "requirement.md" in r.stdout

    # no match
    r = _run_collab(tmp_path, "search", "nonexistent-keyword-xyz")
    assert r.returncode == 0
    assert "No matches" in r.stdout


# ── staging & review ──

def test_collab_staging_review(tmp_path):
    """staging creates a file; review approve merges it."""
    vflow = _setup_collab_env(tmp_path, team_enabled=True)
    _run_collab(tmp_path, "join")

    r = _run_collab(tmp_path, "staging", "New spec content here",
                    "--target", "spec/common/new-rule.md",
                    "--action", "new",
                    "--summary", "test spec")
    assert r.returncode == 0
    assert "Staged" in r.stdout

    staging_dir = vflow / "collab" / "staging"
    assert staging_dir.exists()
    staging_files = list(staging_dir.glob("alice-*.md"))
    assert len(staging_files) == 1

    # approve
    r = _run_collab(tmp_path, "review", staging_files[0].name, "approve")
    assert r.returncode == 0
    assert "Approved" in r.stdout

    # check target file was created
    target = vflow / "spec" / "common" / "new-rule.md"
    assert target.exists()
    assert "New spec content here" in target.read_text(encoding="utf-8")

    # staging file removed
    assert not staging_files[0].exists()
