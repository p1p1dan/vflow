# -*- coding: utf-8 -*-
"""vflow 测试公共夹具：按路径加载模板 task.py，并将其重定向到沙箱项目。"""
import importlib.util
import json
import shutil
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
TEMPLATE_VFLOW = REPO / "src" / "vflow" / "template_vflow"
TASK_PY = TEMPLATE_VFLOW / "scripts" / "task.py"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, str(path))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="session")
def trace_mod():
    """纯函数测试用：无沙箱，直接加载模板 task.py。"""
    return load_module("vflow_task_trace", TASK_PY)


@pytest.fixture()
def task_mod(tmp_path, monkeypatch):
    """状态机/执行测试用：task.py 重定向到 <tmp>/.vflow 沙箱项目。"""
    mod = load_module("vflow_task_sandbox", TASK_PY)
    root = tmp_path / ".vflow"
    (root / "templates").mkdir(parents=True)
    for f in ("requirement.md", "design.md", "verify.md"):
        shutil.copy(TEMPLATE_VFLOW / "templates" / f, root / "templates" / f)
    (root / "config.json").write_text(
        json.dumps({"test_required": True, "build": {"test_command": ""}}),
        encoding="utf-8")
    monkeypatch.setattr(mod, "ROOT", str(root))
    monkeypatch.setattr(mod, "TASKS", str(root / "tasks"))
    monkeypatch.setattr(mod, "RUNTIME", str(root / ".runtime"))
    monkeypatch.setattr(mod, "POINTER", str(root / ".runtime" / "current-task"))
    monkeypatch.setattr(mod, "JOURNAL_DIR", str(root / "journal"))
    monkeypatch.setattr(mod, "CONFIG", str(root / "config.json"))
    return mod


def set_test_command(mod, command):
    cfg = json.loads(Path(mod.CONFIG).read_text(encoding="utf-8"))
    cfg["build"]["test_command"] = command
    Path(mod.CONFIG).write_text(json.dumps(cfg), encoding="utf-8")
