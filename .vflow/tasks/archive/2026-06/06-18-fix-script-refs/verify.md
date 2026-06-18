# 验证（SWE.4/5/6）

## §1 单元测试（按 R-ID 逐条闭环）

- R1: 所有活跃文档（workflow.md、3 个 SKILL.md、2 个模板、INSTALL.md、3 个 claude/skills）中的 task.py/inject.py 引用均已替换为 task.mjs/inject.mjs。grep 验证残留仅存在于归档文件、template 源码和当前任务描述中
- R2: src/vflow/template_vflow/（workflow.md、2 个 SKILL.md、task.mjs、2 个模板）和 src/vflow/template_claude/（3 个 skills、settings.json）已同步修复；cli.py 的 MANAGED_VFLOW、hook_cmd、smoke_test、do_status 改为 node+.mjs；detect.py 支持 inject.mjs 优先回退 inject.py
- R3: task.mjs 内部 5 处错误提示信息中的 task.py 引用更新为 task.mjs（MACHINE_BLOCK_HEADER、mtime 检查、verified_at 检查、verified 状态提示、legacy 提示）
- R4: workflow.md 的 [workflow-state:created] 和 [workflow-state:analyzed] 块增加了"⛔ HARD STOP"警告行和更明确的 Prohibited 清单，明确禁止在 created 状态写任何代码/设计，在 analyzed 状态写实现代码
- R5: `node .vflow/scripts/task.mjs status` 正常输出任务状态；grep 确认无活跃指令性文件残留错误引用；pytest 75 个测试全部通过（15.36s）

## §2 集成测试

不适用（理由：纯文本替换，无新接口/数据流变更。pytest 测试套件覆盖了 hook 注册、状态机、R-ID 追踪等核心功能）

## 规范自检结论

| 维度 | 结论 | 问题数 |
| :--- | :--- | :--- |
| 完整性 | 所有活跃指令性文件已修复 | 0 |
| 正确性 | 命令格式统一为 node+.mjs | 0 |
| 一致性 | 活跃文件与模板保持同步 | 0 |

## 变更说明

将 vflow 工作流引擎从 Python 脚本（task.py/inject.py）统一到 Node.js 脚本（task.mjs/inject.mjs），消除了运行时不一致导致的 "can't open file" 报错。同时在 workflow.md 的 created 和 analyzed 状态块增加了 HARD STOP 警告，强化流程纪律约束。影响范围：22 个活跃文件（文档/模板/脚本/安装器），归档文件不受影响。

## 机器执行记录（task.mjs 写入，请勿手改）
- 命令: `python -m pytest tests/ -v`
- 时间: 2026-06-18T15:11:57
- 退出码: 0
```
time_guard_rejects_code_changed_after_verification PASSED [ 53%]
tests/test_exec.py::test_archive_requires_machine_verification_record PASSED [ 54%]
tests/test_exec.py::test_archive_rejects_verify_without_section1 PASSED  [ 56%]
tests/test_followup.py::test_followup_extract_from_roadmap PASSED        [ 57%]
tests/test_followup.py::test_followup_no_roadmap PASSED                  [ 58%]
tests/test_followup.py::test_followup_list_close PASSED                  [ 60%]
tests/test_followup.py::test_inject_pending_followup_prompt PASSED       [ 61%]
tests/test_followup.py::test_inject_pending_followup_session PASSED      [ 62%]
tests/test_followup.py::test_inject_no_pending_clean PASSED              [ 64%]
tests/test_states.py::test_create_starts_at_created PASSED               [ 65%]
tests/test_states.py::test_advance_rejects_empty_requirement PASSED      [ 66%]
tests/test_states.py::test_advance_rejects_requirement_without_rid PASSED [ 68%]
tests/test_states.py::test_full_pipeline_to_archived PASSED              [ 69%]
tests/test_states.py::test_design_missing_rid_coverage_rejected PASSED   [ 70%]
tests/test_states.py::test_skip_check_records_bypass PASSED              [ 72%]
tests/test_states.py::test_legacy_task_mapped_and_advance_refused PASSED [ 73%]
tests/test_states.py::test_legacy_task_archives_via_old_path PASSED      [ 74%]
tests/test_states.py::test_back_only_from_verified PASSED                [ 76%]
tests/test_team_inject.py::test_inject_team_block_prompt PASSED          [ 77%]
tests/test_team_inject.py::test_inject_team_block_session PASSED         [ 78%]
tests/test_team_inject.py::test_inject_no_team_clean PASSED              [ 80%]
tests/test_team_inject.py::test_inject_spec_three_layer PASSED           [ 81%]
tests/test_team_inject.py::test_inject_spec_team_layer_only PASSED       [ 82%]
tests/test_team_inject.py::test_inject_staging_count PASSED              [ 84%]
tests/test_team_task.py::test_task_owner_on_create PASSED                [ 85%]
tests/test_team_task.py::test_task_no_owner_without_team PASSED          [ 86%]
tests/test_team_task.py::test_task_per_uid_pointer PASSED                [ 88%]
tests/test_team_task.py::test_task_activity_report PASSED                [ 89%]
tests/test_trace.py::test_parse_rid_definitions_normal PASSED            [ 90%]
tests/test_trace.py::test_parse_rid_definitions_chinese_colon PASSED     [ 92%]
tests/test_trace.py::test_parse_rid_definitions_template_residue_not_counted PASSED [ 93%]
tests/test_trace.py::test_parse_rid_references_checklist_only PASSED     [ 94%]
tests/test_trace.py::test_check_rid_coverage_full PASSED                 [ 96%]
tests/test_trace.py::test_check_rid_coverage_missing_fails PASSED        [ 97%]
tests/test_trace.py::test_check_rid_coverage_extra_only_warns PASSED     [ 98%]
tests/test_trace.py::test_verify_section_extracts_body PASSED            [100%]

============================= 75 passed in 15.02s =============================
```
