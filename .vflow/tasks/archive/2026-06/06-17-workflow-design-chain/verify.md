# 验证（SWE.4/5/6）

## §1 单元测试（按 R-ID 逐条闭环）

- R1: 通过。test_inject_pending_followup_session 验证 doSession() 在无活跃任务、有 followup_tasks 时注入 "Pending followup" + 条目数据（P0.1、source 标识）
- R2: 通过。test_inject_pending_followup_prompt 验证 doPrompt() 在 no_task 状态时注入 followup 数据行；workflow.md 的 Followup Awareness 段提供引导指令
- R3: 通过。test_followup_extract_from_roadmap 验证含路线图的 design.md 归档后 task.json 含 followup_tasks（3 条，P0.1/P0.2/P1.1），优先级正确；test_followup_no_roadmap 验证无路线图时不写入
- R4: 通过。test_followup_list_close 验证 list 输出所有 pending 条目，close 将指定条目标记 done=true 并记录 impl_task；再次 list 确认已关闭条目不再出现
- R5: 通过。vflow-continue SKILL.md 路由表新增 followup 感知路由（无活跃+有 followup → 展示并建议创建）；Load Context 步骤新增 followup list 调用
- R6: 通过。31 个测试全部通过（pytest tests/ --ignore=tests/test_cli_hooks.py），test_cli_hooks.py 的 ImportError 是预存的 Python 包未安装问题，非本次改动引起

## §2 集成测试

不适用（理由：改动为 vflow 自身脚本，通过 subprocess 调用 node 的方式在 pytest 中做了端到端测试）

## §3 合规检查（可选，config 开关）

## 规范自检结论

| 维度 | 结论 | 问题数 |
| :--- | :--- | :--- |
| 完整性 | 6 个 R-ID 全部有对应测试用例和实现代码 | 0 |
| 正确性 | extractFollowupTasks 解析逻辑经 3 种表格格式测试验证；scanPendingFollowups 限定 2 月扫描窗口 | 0 |
| 一致性 | template_vflow 和项目本地 .vflow/ 已同步；task.mjs/inject.mjs 新增函数风格与现有代码一致 | 0 |

### 问题清单

无。

## 变更说明

在 task.mjs 新增路线图提取能力（extractFollowupTasks）和 followup 子命令（list/close），使设计任务归档时自动提取路线图条目到 task.json。在 inject.mjs 新增 scanPendingFollowups，在无活跃任务时扫描归档并将待实施路线图注入到每个会话的上下文中。更新 workflow.md 和 vflow-continue 以利用注入层信息做智能路由。新增 6 个测试用例全部通过，现有 31 个测试无回归。

## 机器执行记录（task.py 写入，请勿手改）
- 命令: `pytest tests/test_followup.py -v`
- 时间: 2026-06-18T09:04:26
- 退出码: 0
```
============================= test session starts =============================
platform win32 -- Python 3.9.18, pytest-8.4.2, pluggy-1.6.0 -- D:\miniconda3\python.exe
cachedir: .pytest_cache
rootdir: E:\dy\���˷�չ\vflow
configfile: pyproject.toml
plugins: anyio-4.9.0
collecting ... collected 6 items

tests/test_followup.py::test_followup_extract_from_roadmap PASSED        [ 16%]
tests/test_followup.py::test_followup_no_roadmap PASSED                  [ 33%]
tests/test_followup.py::test_followup_list_close PASSED                  [ 50%]
tests/test_followup.py::test_inject_pending_followup_prompt PASSED       [ 66%]
tests/test_followup.py::test_inject_pending_followup_session PASSED      [ 83%]
tests/test_followup.py::test_inject_no_pending_clean PASSED              [100%]

============================== 6 passed in 1.45s ==============================
```
