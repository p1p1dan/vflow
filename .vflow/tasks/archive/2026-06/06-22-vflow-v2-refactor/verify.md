# 验证（SWE.4/5/6）

## §1 单元测试（按 R-ID 逐条闭环）

<!-- 每个 R-ID 一行结果解读，行首格式固定 "- R<n>: "。
     原始测试输出由 task.mjs 机器执行记录背书（见文末），此处写人类可读的结果解读 -->

- R1:

## §2 集成测试

<!-- 真实集成运行结果；轻任务/纯单元改动写"不适用"+ 理由 -->

不适用（理由：）

## §3 合规检查（可选，config 开关）

<!-- 默认关闭。开启时由 vflow-review 按 spec 逐条对照输出 -->

## 规范自检结论

| 维度 | 结论 | 问题数 |
| :--- | :--- | :--- |
| 完整性 | | |
| 正确性 | | |
| 一致性 | | |

### 问题清单

<!-- 仅列置信度高的问题，格式：[级别] 文件:行号 问题 → 建议 -->

## 变更说明

<!-- 一段话总结：改了什么、为什么、影响范围 -->

<!-- 文末为 task.mjs 自动追加的「机器执行记录」区域：命令/时间戳/退出码/输出由脚本写入，
     请勿手改——归档校验以 task.json.verified_at 与文件 mtime 交叉验证为准 -->

## 机器执行记录（task.mjs 写入，请勿手改）
- 命令: `pytest tests/`
- 时间: 2026-06-24T11:06:19
- 退出码: 1
```
============================= test session starts =============================
platform win32 -- Python 3.9.18, pytest-8.4.2, pluggy-1.6.0
rootdir: E:\dy\���˷�չ\vflow
configfile: pyproject.toml
plugins: anyio-4.9.0
collected 75 items

tests\test_cli_hooks.py ................F........                        [ 33%]
tests\test_collab.py .........                                           [ 45%]
tests\test_exec.py ........                                              [ 56%]
tests\test_followup.py ......                                            [ 64%]
tests\test_states.py .........                                           [ 76%]
tests\test_team_inject.py ......                                         [ 84%]
tests\test_team_task.py ....                                             [ 89%]
tests\test_trace.py ........                                             [100%]

================================== FAILURES ===================================
______________________ test_managed_agents_has_13_skills ______________________

    def test_managed_agents_has_13_skills():
        """R1: All 13 skills registered in MANAGED_AGENTS."""
>       assert len(cli.MANAGED_AGENTS) == 13
E       AssertionError: assert 14 == 13
E        +  where 14 = len(['skills/vflow-go/SKILL.md', 'skills/vflow-continue/SKILL.md', 'skills/vflow-commit/SKILL.md', 'skills/vflow-context/SKILL.md', 'skills/vflow-brainstorm/SKILL.md', 'skills/vflow-code/SKILL.md', ...])
E        +    where ['skills/vflow-go/SKILL.md', 'skills/vflow-continue/SKILL.md', 'skills/vflow-commit/SKILL.md', 'skills/vflow-context/SKILL.md', 'skills/vflow-brainstorm/SKILL.md', 'skills/vflow-code/SKILL.md', ...] = cli.MANAGED_AGENTS

tests\test_cli_hooks.py:236: AssertionError
=========================== short test summary info ===========================
FAILED tests/test_cli_hooks.py::test_managed_agents_has_13_skills - Assertion...
======================== 1 failed, 74 passed in 18.94s ========================
```
