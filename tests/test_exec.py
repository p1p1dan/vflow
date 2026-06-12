# -*- coding: utf-8 -*-
"""执行权回收（R4）与 mtime 交叉校验（R5）测试。"""
import os
import time
from pathlib import Path
from types import SimpleNamespace

from conftest import set_test_command
from test_states import REQUIREMENT, DESIGN, VERIFY_S1, create, advance, write_doc


def make_task(task_mod):
    create(task_mod)
    return task_mod.current_task_dir()


def test_no_test_command_with_required_rejected(task_mod):
    d = make_task(task_mod)
    ok, msg = task_mod.run_verification(d, {"test_required": True, "build": {}}, {})
    assert not ok
    assert "test_command" in msg


def test_no_test_command_without_required_skips(task_mod):
    d = make_task(task_mod)
    ok, msg = task_mod.run_verification(d, {"test_required": False, "build": {}}, {})
    assert ok


def test_passing_command_writes_machine_block(task_mod):
    d = make_task(task_mod)
    task = {}
    cfg = {"test_required": True,
           "build": {"test_command": 'python -c "print(\'all green\')"'}}
    ok, msg = task_mod.run_verification(d, cfg, task)
    assert ok
    assert task["verified_at"]
    content = Path(d, "verify.md").read_text(encoding="utf-8")
    assert task_mod.MACHINE_BLOCK_HEADER in content
    assert "退出码: 0" in content
    assert "all green" in content


def test_failing_command_rejected(task_mod):
    d = make_task(task_mod)
    task = {}
    cfg = {"test_required": True,
           "build": {"test_command": 'python -c "import sys; sys.exit(3)"'}}
    ok, msg = task_mod.run_verification(d, cfg, task)
    assert not ok
    assert "verified_at" not in task
    assert "退出码: 3" in Path(d, "verify.md").read_text(encoding="utf-8")


def test_test_scope_overrides_config(task_mod):
    d = make_task(task_mod)
    task = {"test_scope": 'python -c "print(\'scoped\')"'}
    cfg = {"test_required": True,
           "build": {"test_command": 'python -c "import sys; sys.exit(1)"'}}
    ok, _ = task_mod.run_verification(d, cfg, task)
    assert ok
    assert "scoped" in Path(d, "verify.md").read_text(encoding="utf-8")


def _drive_to_verified(task_mod, tmp_path):
    create(task_mod)
    write_doc(task_mod, "requirement.md", REQUIREMENT)
    advance(task_mod)
    write_doc(task_mod, "design.md", DESIGN.replace("- [ ]", "- [x]"))
    advance(task_mod)
    advance(task_mod)
    src = tmp_path / "src" / "demo.py"
    src.parent.mkdir(exist_ok=True)
    src.write_text("VALUE = 1\n", encoding="utf-8")
    d = task_mod.current_task_dir()
    with open(os.path.join(d, "worklog.md"), "a", encoding="utf-8") as f:
        f.write("| 06-12 | src/demo.py | 新增 |\n")
    set_test_command(task_mod, 'python -c "print(\'ok\')"')
    write_doc(task_mod, "verify.md", VERIFY_S1)
    assert advance(task_mod) == 0
    return d, src


def test_mtime_guard_rejects_code_changed_after_verification(task_mod, tmp_path):
    d, src = _drive_to_verified(task_mod, tmp_path)
    future = time.time() + 30
    os.utime(src, (future, future))
    assert task_mod.cmd_done(SimpleNamespace(summary="x", force=False)) == 1

    # back -> 重新机器验证（mtime 恢复正常）-> 归档成功
    assert task_mod.cmd_back(SimpleNamespace()) == 0
    past = time.time() - 30
    os.utime(src, (past, past))
    assert advance(task_mod) == 0
    assert task_mod.cmd_done(SimpleNamespace(summary="x", force=False)) == 0


def test_archive_requires_machine_verification_record(task_mod, tmp_path):
    d, _ = _drive_to_verified(task_mod, tmp_path)
    t = task_mod.read_json(os.path.join(d, "task.json"))
    t.pop("verified_at", None)
    task_mod.write_json(os.path.join(d, "task.json"), t)
    assert task_mod.cmd_done(SimpleNamespace(summary="x", force=False)) == 1


def test_archive_rejects_verify_without_section1(task_mod, tmp_path):
    # R-ID 行落在 §1 之外（如机器记录区）不能充当闭环证据
    d, _ = _drive_to_verified(task_mod, tmp_path)
    Path(d, "verify.md").write_text(
        "# 验证\n\n- R1: 散落在无 § 结构的位置\n- R2: 同上\n", encoding="utf-8")
    assert task_mod.cmd_done(SimpleNamespace(summary="x", force=False)) == 1
