# 验证（SWE.4/5/6）

## §1 单元测试（按 R-ID 逐条闭环）

- R1: `test_install_creates_claude_skills` 验证 `do_install` 后 `.claude/skills/` 下存在 13 个 SKILL.md — PASS
- R2: `test_migrated_agents_skills_cleaned_on_install` 验证旧 `.agents/skills/vflow-*` 被清理 — PASS；手动验证 `vflow update` 输出 13 行 `[cleanup] .agents/skills/vflow-*` — PASS
- R3: `test_template_skills_exist` 验证模板文件存在于 `template_claude/skills/` — PASS；package.json 已移除 `template_agents` — 已确认
- R4: grep 确认 cli.mjs/cli.py 不再包含 `SRC_AGENTS`/`template_agents`/`installProjectAgents` — PASS
- R5: 50 项测试全部通过（包含新增的迁移清理测试） — PASS
- R6: `vflow update` 后 system-reminder 中出现全部 13 个 vflow skill（vflow-go 到 vflow-think） — PASS

## §2 集成测试

在当前 vflow 项目执行 `node src/vflow/cli.mjs update .`，验证：
- 13 个 skill 写入 `.claude/skills/`
- 旧 `.agents/skills/` 中 13 个 skill 被清理
- Claude Code 在下一次 system-reminder 中列出所有 13 个 skill

## §3 合规检查（可选，config 开关）

## 规范自检结论

| 维度 | 结论 | 问题数 |
| :--- | :--- | :--- |
| 完整性 | 全部 R-ID 闭环 | 0 |
| 正确性 | 50 测试通过 + 手动验证 OK | 0 |
| 一致性 | cli.mjs/cli.py 双实现同步 | 0 |

### 问题清单

无

## 变更说明

修复 vflow skill 安装路径，从不被 Claude Code 支持的 `.agents/skills/` 改为官方文档指定的 `.claude/skills/`。涉及模板目录迁移、CLI 双语实现（mjs/py）路径更新、旧路径迁移清理逻辑、测试更新。影响所有使用 `vflow init`/`vflow update` 的项目。

<!-- 文末为 task.py 自动追加的「机器执行记录」区域：命令/时间戳/退出码/输出由脚本写入，
     请勿手改——归档校验以 task.json.verified_at 与文件 mtime 交叉验证为准 -->

## 机器执行记录（task.py 写入，请勿手改）
- 命令: `pytest tests/`
- 时间: 2026-06-17T17:23:19
- 退出码: 2
```
============================= test session starts =============================
platform win32 -- Python 3.9.18, pytest-8.4.2, pluggy-1.6.0
rootdir: E:\dy\���˷�չ\vflow
configfile: pyproject.toml
plugins: anyio-4.9.0
collected 25 items / 1 error

=================================== ERRORS ====================================
__________________ ERROR collecting tests/test_cli_hooks.py ___________________
ImportError while importing test module 'E:\dy\���˷�չ\vflow\tests\test_cli_hooks.py'.
Hint: make sure your test modules/packages have valid Python names.
Traceback:
D:\miniconda3\lib\importlib\__init__.py:127: in import_module
    return _bootstrap._gcd_import(name[level:], package, level)
tests\test_cli_hooks.py:11: in <module>
    import vflow.cli as cli
E   ModuleNotFoundError: No module named 'vflow'
=========================== short test summary info ===========================
ERROR tests/test_cli_hooks.py
!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!
============================== 1 error in 0.44s ===============================
```

## 机器执行记录（task.py 写入，请勿手改）
- 命令: `python -m pytest tests/`
- 时间: 2026-06-17T17:24:02
- 退出码: 0
```
============================= test session starts =============================
platform win32 -- Python 3.13.12, pytest-9.0.3, pluggy-1.6.0
rootdir: E:\dy\���˷�չ\vflow
configfile: pyproject.toml
collected 50 items

tests\test_cli_hooks.py .........................                        [ 50%]
tests\test_exec.py ........                                              [ 66%]
tests\test_states.py .........                                           [ 84%]
tests\test_trace.py ........                                             [100%]

============================= 50 passed in 3.00s ==============================
```
