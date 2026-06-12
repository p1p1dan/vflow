# -*- coding: utf-8 -*-
"""6 状态机转换测试（R1）。"""
import json
import os
from pathlib import Path
from types import SimpleNamespace

from conftest import set_test_command

REQUIREMENT = """# 需求澄清

## 需求结论

做一个演示功能，验收条目：

- R1: 支持输入校验
- R2: 错误时返回码 -1
"""

DESIGN = """# 设计

## 方案概述

演示方案，覆盖两个验收条目。

## 任务清单

- [ ] 1.1 实现校验器 (R1)
- [ ] 1.2 错误处理 (R2)
"""

VERIFY_S1 = """# 验证

## §1 单元测试（按 R-ID 逐条闭环）

- R1: test_validator 2/2 通过
- R2: test_error_code 通过

## §2 集成测试

不适用（理由：纯函数改动）。
"""


def create(mod, slug="demo"):
    return mod.cmd_create(SimpleNamespace(slug=slug, title="演示", tier="T2"))


def advance(mod, skip=False):
    return mod.cmd_advance(SimpleNamespace(skip_check=skip))


def write_doc(mod, name, content):
    Path(mod.current_task_dir(), name).write_text(content, encoding="utf-8")


def state_of(mod):
    t = mod.read_json(os.path.join(mod.current_task_dir(), "task.json"))
    return mod.task_state(t)


def test_create_starts_at_created(task_mod):
    assert create(task_mod) == 0
    assert state_of(task_mod) == "created"


def test_advance_rejects_empty_requirement(task_mod):
    create(task_mod)
    assert advance(task_mod) == 1
    assert state_of(task_mod) == "created"


def test_advance_rejects_requirement_without_rid(task_mod):
    create(task_mod)
    write_doc(task_mod, "requirement.md", "# 需求\n\n填了内容但没有验收条目。\n三行以上。\n再来一行。\n")
    assert advance(task_mod) == 1


def test_full_pipeline_to_archived(task_mod, tmp_path):
    create(task_mod)
    write_doc(task_mod, "requirement.md", REQUIREMENT)
    assert advance(task_mod) == 0          # created -> analyzed
    assert advance(task_mod) == 1          # design 未填，拒绝
    write_doc(task_mod, "design.md", DESIGN)
    assert advance(task_mod) == 0          # analyzed -> designed
    assert advance(task_mod) == 0          # designed -> implementing
    assert state_of(task_mod) == "implementing"

    # checklist 未勾选 → 拒绝进 verified
    assert advance(task_mod) == 1
    write_doc(task_mod, "design.md", DESIGN.replace("- [ ]", "- [x]"))
    set_test_command(task_mod, 'python -c "print(42)"')
    write_doc(task_mod, "verify.md", VERIFY_S1)
    assert advance(task_mod) == 0          # implementing -> verified（机器执行）
    assert state_of(task_mod) == "verified"

    assert task_mod.cmd_done(SimpleNamespace(summary="演示完成", force=False)) == 0
    archive = Path(task_mod.TASKS) / "archive"
    assert any(archive.rglob("task.json"))


def test_design_missing_rid_coverage_rejected(task_mod):
    create(task_mod)
    write_doc(task_mod, "requirement.md", REQUIREMENT)
    advance(task_mod)
    write_doc(task_mod, "design.md", "# 设计\n\n概述。\n\n- [ ] 1.1 只覆盖一个 (R1)\n")
    assert advance(task_mod) == 1          # R2 缺失


def test_skip_check_records_bypass(task_mod):
    create(task_mod)
    assert advance(task_mod, skip=True) == 0
    t = task_mod.read_json(os.path.join(task_mod.current_task_dir(), "task.json"))
    assert t["bypasses"][0]["transition"] == "created->analyzed"


def test_legacy_task_mapped_and_advance_refused(task_mod):
    create(task_mod)
    d = task_mod.current_task_dir()
    legacy = {"id": "x", "title": "旧任务", "tier": "T2",
              "status": "in_progress", "phase": "implement", "risk": "low"}
    Path(d, "task.json").write_text(json.dumps(legacy), encoding="utf-8")
    t = task_mod.read_json(os.path.join(d, "task.json"))
    assert task_mod.is_legacy(t)
    assert task_mod.task_state(t) == "implementing"
    assert advance(task_mod) == 1          # legacy 任务拒绝 advance


def test_legacy_task_archives_via_old_path(task_mod):
    create(task_mod)
    d = task_mod.current_task_dir()
    legacy = {"id": "x", "title": "旧任务", "tier": "T2",
              "status": "in_progress", "phase": "verify", "risk": "low"}
    Path(d, "task.json").write_text(json.dumps(legacy), encoding="utf-8")
    Path(d, "plan.md").write_text("# 方案\n\n内容。\n\n- [x] 1.1 已完成\n", encoding="utf-8")
    for f in ("design.md", "design.md.hash", "verify.md.hash"):
        p = Path(d, f)
        if p.exists():
            p.unlink()
    Path(d, "verify.md").write_text(
        "# 验证\n\n构建输出：\n\n```\nok\n```\n真实输出已粘贴。\n", encoding="utf-8")
    assert task_mod.cmd_done(SimpleNamespace(summary="旧任务归档", force=False)) == 0


def test_back_only_from_verified(task_mod):
    create(task_mod)
    assert task_mod.cmd_back(SimpleNamespace()) == 1
