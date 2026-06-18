# Implementation Log

| Time | File | Change |
| :--- | :--- | :--- |
| 00:10 | `src/vflow/template_vflow/scripts/task.mjs` | 新增 extractFollowupTasks 函数（路线图表格提取）+ cmdDone 集成 followup_tasks 写入 |
| 00:20 | `src/vflow/template_vflow/scripts/task.mjs` | 新增 cmdFollowup（list/close）+ scanFollowups 归档扫描 + parseArgs/main 注册 |
| 00:30 | `src/vflow/template_vflow/scripts/inject.mjs` | 新增 scanPendingFollowups + formatFollowupBlock；doSession/doPrompt 无活跃任务时注入 followup 摘要 |
| 00:35 | `src/vflow/template_vflow/workflow.md` | no_task block 增加 Followup Awareness 引导段 |
| 00:35 | `.claude/skills/vflow-continue/SKILL.md` | 路由表增加 followup 感知路由；Load Context 增加 followup list 调用 |
| 00:40 | `.vflow/scripts/task.mjs` | 同步模板 task.mjs 到项目本地 |
| 00:40 | `.vflow/scripts/inject.mjs` | 同步模板 inject.mjs 到项目本地 |
| 00:40 | `.vflow/workflow.md` | 同步模板 workflow.md 到项目本地 |
| 00:45 | `tests/test_followup.py` | 新建 6 个测试用例（提取/无路线图/list+close/inject prompt/session/clean） |
