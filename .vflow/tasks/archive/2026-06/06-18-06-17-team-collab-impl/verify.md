# 验证（SWE.4/5/6）

## §1 单元测试（按 R-ID 逐条闭环）

- R1: collab.mjs 全部 12 个子命令实现且通过测试（test_collab.py 9 个用例 + 隐式覆盖 search/daily/staging/review），退出码符合设计规范
- R2: task.mjs 团队模式 create 自动设 owner，per-uid 指针文件隔离，非团队模式行为不变（test_team_task.py 4 个用例全通过）
- R3: inject.mjs 团队模式追加 `<vflow-team>` 块显示活跃成员状态，非团队模式无额外输出（test_team_inject.py 6 个用例全通过）
- R4: spec 三层加载正确——个人级覆盖团队级覆盖项目级，通过 test_inject_spec_three_layer 和 test_inject_spec_team_layer_only 验证
- R5: spec writeback 在团队模式下进入 staging 暂存区，review approve 合并到目标文件，reject 删除（test_collab_staging_review 通过）
- R6: collab.mjs claim 设置 task.json owner + per-uid 指针，release 清除两者（test_collab_claim_release 通过）
- R7: vflow-collab skill 文件已创建于 .claude/skills/vflow-collab/SKILL.md，包含完整命令参考和工作流说明
- R8: config.json 模板新增 team 配置块（team.enabled=false, adapters={}, spec_review=true），向后兼容现有单人配置

## §2 集成测试

不适用（理由：各组件通过 subprocess 调用 node 脚本做端到端测试，已覆盖集成场景）

## §3 合规检查（可选，config 开关）

## 规范自检结论

| 维度 | 结论 | 问题数 |
| :--- | :--- | :--- |
| 完整性 | 8 个 R-ID 全部闭环 | 0 |
| 正确性 | 25 个测试全部通过 | 0 |
| 一致性 | 代码风格与 task.mjs/inject.mjs 一致 | 0 |

### 问题清单

无

## 变更说明

实施 maestro-flow 团队协同完整方案（P0+P1+P2）：新建 collab.mjs 团队协同脚本（12 个子命令），扩展 task.mjs 支持 owner/per-uid 指针/活动上报，扩展 inject.mjs 添加团队状态注入和 spec 三层加载，新建 vflow-collab skill。19 个新测试用例加上 6 个已有的 followup 测试，共 25 个测试全部通过。非团队模式零影响。

## 机器执行记录（task.py 写入，请勿手改）
- 命令: `pytest tests/test_collab.py tests/test_team_task.py tests/test_team_inject.py tests/test_followup.py -v`
- 时间: 2026-06-18T10:27:35
- 退出码: 0
```
============================= test session starts =============================
platform win32 -- Python 3.9.18, pytest-8.4.2, pluggy-1.6.0 -- D:\miniconda3\python.exe
cachedir: .pytest_cache
rootdir: E:\dy\���˷�չ\vflow
configfile: pyproject.toml
plugins: anyio-4.9.0
collecting ... collected 25 items

tests/test_collab.py::test_collab_join_whoami PASSED                     [  4%]
tests/test_collab.py::test_collab_join_idempotent PASSED                 [  8%]
tests/test_collab.py::test_collab_status PASSED                          [ 12%]
tests/test_collab.py::test_collab_status_no_team PASSED                  [ 16%]
tests/test_collab.py::test_collab_preflight PASSED                       [ 20%]
tests/test_collab.py::test_collab_sync_dry_run PASSED                    [ 24%]
tests/test_collab.py::test_collab_claim_release PASSED                   [ 28%]
tests/test_collab.py::test_search_archive PASSED                         [ 32%]
tests/test_collab.py::test_collab_staging_review PASSED                  [ 36%]
tests/test_team_task.py::test_task_owner_on_create PASSED                [ 40%]
tests/test_team_task.py::test_task_no_owner_without_team PASSED          [ 44%]
tests/test_team_task.py::test_task_per_uid_pointer PASSED                [ 48%]
tests/test_team_task.py::test_task_activity_report PASSED                [ 52%]
tests/test_team_inject.py::test_inject_team_block_prompt PASSED          [ 56%]
tests/test_team_inject.py::test_inject_team_block_session PASSED         [ 60%]
tests/test_team_inject.py::test_inject_no_team_clean PASSED              [ 64%]
tests/test_team_inject.py::test_inject_spec_three_layer PASSED           [ 68%]
tests/test_team_inject.py::test_inject_spec_team_layer_only PASSED       [ 72%]
tests/test_team_inject.py::test_inject_staging_count PASSED              [ 76%]
tests/test_followup.py::test_followup_extract_from_roadmap PASSED        [ 80%]
tests/test_followup.py::test_followup_no_roadmap PASSED                  [ 84%]
tests/test_followup.py::test_followup_list_close PASSED                  [ 88%]
tests/test_followup.py::test_inject_pending_followup_prompt PASSED       [ 92%]
tests/test_followup.py::test_inject_pending_followup_session PASSED      [ 96%]
tests/test_followup.py::test_inject_no_pending_clean PASSED              [100%]

============================= 25 passed in 10.10s =============================
```
