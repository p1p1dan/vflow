# -*- coding: utf-8 -*-
"""followup 功能测试：路线图提取、followup 命令、inject 注入。"""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
TEMPLATE_VFLOW = REPO / "src" / "vflow" / "template_vflow"
TASK_MJS = TEMPLATE_VFLOW / "scripts" / "task.mjs"
INJECT_MJS = TEMPLATE_VFLOW / "scripts" / "inject.mjs"

DESIGN_WITH_ROADMAP = """# 设计

## 方案概述

测试方案

## 改动清单

| 文件 | 改动类型 | 说明 |
| :--- | :--- | :--- |

## 任务清单

- [x] 1.1 做某事 (R1)

## F. 分阶段实施路线图

### P0: 基础功能

| # | 交付物 | 涉及文件 | 工作量 | 验收标准 |
| :-- | :--- | :--- | :--- | :--- |
| P0.1 | collab.mjs join/whoami | 新建 scripts/collab.mjs | 3 天 | 能 join |
| P0.2 | task.mjs 扩展 | 修改 task.mjs | 2 天 | owner 字段 |

### P1: 进阶功能

| # | 交付物 | 涉及文件 | 工作量 | 验收标准 |
| :-- | :--- | :--- | :--- | :--- |
| P1.1 | spec 三层加载 | 修改 inject.mjs | 2 天 | 覆盖加载 |
"""

DESIGN_NO_ROADMAP = """# 设计

## 方案概述

简单修复。

## 任务清单

- [x] 1.1 修复 bug (R1)
"""


def _setup_vflow_mjs(tmp_path, with_archive=False, followup_tasks=None):
    """Create minimal .vflow structure for task.mjs/inject.mjs testing."""
    vflow = tmp_path / ".vflow"
    scripts = vflow / "scripts"
    scripts.mkdir(parents=True)
    shutil.copy2(str(TASK_MJS), str(scripts / "task.mjs"))
    shutil.copy2(str(INJECT_MJS), str(scripts / "inject.mjs"))

    tpl = vflow / "templates"
    tpl.mkdir(parents=True)
    for f in ("requirement.md", "design.md", "verify.md"):
        shutil.copy2(str(TEMPLATE_VFLOW / "templates" / f), str(tpl / f))

    cfg = {
        "project": "test", "enabled": True, "initialized": True,
        "language": "javascript", "features": {},
        "build": {"command": "", "test_command": ""},
        "test_required": False,
    }
    (vflow / "config.json").write_text(json.dumps(cfg), encoding="utf-8")

    wf = TEMPLATE_VFLOW / "workflow.md"
    shutil.copy2(str(wf), str(vflow / "workflow.md"))

    spec = vflow / "spec"
    spec.mkdir(parents=True)
    (spec / "index.md").write_text("# Spec Index\n", encoding="utf-8")

    if with_archive:
        archive = vflow / "tasks" / "archive" / "2026-06"
        task_dir = archive / "06-17-design-task"
        task_dir.mkdir(parents=True)
        tj = {
            "id": "06-17-design-task",
            "title": "设计任务",
            "tier": "T2",
            "state": "archived",
            "risk": "low",
            "created": "2026-06-17T10:00:00",
            "completed": "2026-06-17T12:00:00",
        }
        if followup_tasks is not None:
            tj["followup_tasks"] = followup_tasks
        (task_dir / "task.json").write_text(json.dumps(tj), encoding="utf-8")

    return vflow


def _run_task(tmp_path, *args):
    cmd = ["node", str(tmp_path / ".vflow" / "scripts" / "task.mjs")] + list(args)
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                          cwd=str(tmp_path))


def _run_inject(tmp_path, mode):
    cmd = ["node", str(tmp_path / ".vflow" / "scripts" / "inject.mjs"), mode]
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                          cwd=str(tmp_path))


# ── extractFollowupTasks tests ──


def test_followup_extract_from_roadmap(tmp_path):
    """design.md with roadmap table -> followup_tasks extracted on done."""
    vflow = _setup_vflow_mjs(tmp_path)

    r = _run_task(tmp_path, "create", "test-design", "--title", "Test Design")
    assert r.returncode == 0

    task_dir = vflow / "tasks" / r.stdout.strip().split()[-1].replace("(state=created)", "").strip()
    task_dir_actual = list((vflow / "tasks").glob("*test-design*"))[0]

    req_text = "# Req\n\n- R1: something\n"
    (task_dir_actual / "requirement.md").write_text(req_text, encoding="utf-8")
    (task_dir_actual / "design.md").write_text(DESIGN_WITH_ROADMAP, encoding="utf-8")
    (task_dir_actual / "verify.md").write_text(
        "# V\n\n## §1 Unit\n\n- R1: pass\n\n## §2 Int\n\nN/A\n", encoding="utf-8")
    (task_dir_actual / "worklog.md").write_text("# Log\n\n| T | F | C |\n| :- | :- | :- |\n", encoding="utf-8")

    for _ in range(3):
        _run_task(tmp_path, "advance", "--skip-check")

    r = _run_task(tmp_path, "done", "--summary", "test", "--force")
    assert r.returncode == 0
    assert "followup" in r.stdout.lower() or "Extracted" in r.stdout

    archive_dir = list((vflow / "tasks" / "archive").rglob("*test-design*"))
    assert len(archive_dir) > 0
    tj = json.loads((archive_dir[0] / "task.json").read_text(encoding="utf-8"))
    assert "followup_tasks" in tj
    assert len(tj["followup_tasks"]) == 3
    assert tj["followup_tasks"][0]["id"] == "P0.1"
    assert tj["followup_tasks"][0]["priority"] == "P0"
    assert tj["followup_tasks"][2]["priority"] == "P1"


def test_followup_no_roadmap(tmp_path):
    """design.md without roadmap -> no followup_tasks."""
    vflow = _setup_vflow_mjs(tmp_path)

    _run_task(tmp_path, "create", "simple-fix", "--title", "Simple Fix")
    task_dir = list((vflow / "tasks").glob("*simple-fix*"))[0]

    (task_dir / "requirement.md").write_text("# Req\n\n- R1: fix\n", encoding="utf-8")
    (task_dir / "design.md").write_text(DESIGN_NO_ROADMAP, encoding="utf-8")
    (task_dir / "verify.md").write_text(
        "# V\n\n## §1 Unit\n\n- R1: pass\n\n## §2 Int\n\nN/A\n", encoding="utf-8")
    (task_dir / "worklog.md").write_text("# Log\n\n| T | F | C |\n| :- | :- | :- |\n", encoding="utf-8")

    for _ in range(3):
        _run_task(tmp_path, "advance", "--skip-check")

    r = _run_task(tmp_path, "done", "--summary", "fix", "--force")
    assert r.returncode == 0

    archive_dir = list((vflow / "tasks" / "archive").rglob("*simple-fix*"))
    tj = json.loads((archive_dir[0] / "task.json").read_text(encoding="utf-8"))
    assert "followup_tasks" not in tj


# ── followup list/close tests ──


def test_followup_list_close(tmp_path):
    """followup list shows pending; close marks done."""
    pending = [
        {"id": "P0.1", "title": "Task A", "priority": "P0", "done": False, "impl_task": None},
        {"id": "P0.2", "title": "Task B", "priority": "P0", "done": False, "impl_task": None},
    ]
    _setup_vflow_mjs(tmp_path, with_archive=True, followup_tasks=pending)

    r = _run_task(tmp_path, "followup", "list")
    assert r.returncode == 0
    assert "P0.1" in r.stdout
    assert "Task A" in r.stdout

    r = _run_task(tmp_path, "followup", "close", "06-17-design-task", "P0.1", "--impl", "06-18-impl")
    assert r.returncode == 0
    assert "closed" in r.stdout.lower()

    archive_tj = tmp_path / ".vflow" / "tasks" / "archive" / "2026-06" / "06-17-design-task" / "task.json"
    tj = json.loads(archive_tj.read_text(encoding="utf-8"))
    p01 = next(f for f in tj["followup_tasks"] if f["id"] == "P0.1")
    assert p01["done"] is True
    assert p01["impl_task"] == "06-18-impl"

    r = _run_task(tmp_path, "followup", "list")
    assert "P0.1" not in r.stdout
    assert "P0.2" in r.stdout


# ── inject pending followup tests ──


def test_inject_pending_followup_prompt(tmp_path):
    """inject.mjs prompt mode shows pending followups when no active task."""
    pending = [
        {"id": "P0.1", "title": "Collab Join", "priority": "P0", "done": False, "impl_task": None},
    ]
    _setup_vflow_mjs(tmp_path, with_archive=True, followup_tasks=pending)

    r = _run_inject(tmp_path, "prompt")
    assert "Pending followup" in r.stdout
    assert "P0.1" in r.stdout
    assert "Collab Join" in r.stdout


def test_inject_pending_followup_session(tmp_path):
    """inject.mjs session mode shows pending followups when no active task."""
    pending = [
        {"id": "P0.1", "title": "Collab Join", "priority": "P0", "done": False, "impl_task": None},
    ]
    _setup_vflow_mjs(tmp_path, with_archive=True, followup_tasks=pending)

    r = _run_inject(tmp_path, "session")
    assert "Pending followup" in r.stdout
    assert "P0.1" in r.stdout


def test_inject_no_pending_clean(tmp_path):
    """inject.mjs prompt mode without followups has no actual followup data lines."""
    _setup_vflow_mjs(tmp_path, with_archive=True, followup_tasks=None)

    r = _run_inject(tmp_path, "prompt")
    assert "- [P0]" not in r.stdout
    assert "(source: 06-17-design-task)" not in r.stdout
