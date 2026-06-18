# 设计（SWE.2 架构 + SWE.3 详细设计）

## 架构影响（SWE.2）

对 vflow 注入层和任务引擎做增量扩展。不引入新的中央 registry（保持轻量），而是利用现有归档目录中的 task.json 作为分布式数据源，在注入时按需扫描。

核心数据流变化：
```
task.mjs done → 扫描 design.md 路线图 → 写入 task.json.followup_tasks
                                                    ↓
inject.mjs doSession/doPrompt → 扫描归档中 followup_tasks → 注入 <vflow-context>/<vflow-state>
                                                    ↓
AI 自然感知待办 → 引导用户创建实施任务或恢复中断
```

## 方案概述

参考 maestro-flow 的 artifact registry "状态从数据派生"思想和 Trellis 的 per-turn breadcrumb 注入模式，在 vflow 现有轻量架构上实现项目级任务态势感知。三个改动点：
1. **task.mjs done** 归档时从 design.md 提取路线图条目，写入 task.json 的 `followup_tasks`
2. **inject.mjs** 在无活跃任务时扫描归档，将待实施路线图摘要注入上下文
3. **task.mjs followup** 子命令管理路线图条目生命周期
4. **vflow-continue skill** 重构，利用注入层信息做智能路由

## 改动清单

| 文件 | 改动类型 | 说明 |
| :--- | :--- | :--- |
| `src/vflow/template_vflow/scripts/task.mjs` | 修改 | cmdDone 增加路线图提取；新增 cmdFollowup (list/close) |
| `src/vflow/template_vflow/scripts/inject.mjs` | 修改 | doSession/doPrompt 无活跃任务时扫描归档 followup_tasks |
| `src/vflow/template_vflow/workflow.md` | 修改 | no_task block 增加路线图感知引导指令 |
| `.claude/skills/vflow-continue/SKILL.md` | 修改 | 重构路由逻辑，利用注入层信息 |
| `.vflow/scripts/task.mjs` | 同步 | 项目本地副本同步模板改动 |
| `.vflow/scripts/inject.mjs` | 同步 | 项目本地副本同步模板改动 |
| `.vflow/workflow.md` | 同步 | 项目本地副本同步模板改动 |

## 关联规范（实现与审查按此定向加载）

| spec 文件 | 适用理由 |
| :--- | :--- |
| spec/common/general.md | 保持简洁原则，不引入过度抽象 |
| spec/common/structure.md | 函数长度/复杂度约束（task.mjs 已较长，新增需控制） |

## 关键设计决策（ADR-lite）

### ADR-1: 分布式扫描 vs 中央 Registry

- **Context**: maestro-flow 用中央 `state.json.artifacts[]` 存所有状态，一次读取获得全貌。vflow 的任务数据分散在各 task.json 中。
- **Decision**: 不引入中央 registry。inject.mjs 在无活跃任务时扫描 `tasks/archive/` 下最近月份的 task.json，筛选含 `followup_tasks` 且有未完成条目的记录。
- **Consequences**: 扫描范围限定（最近 2 个月目录），性能可控（< 50ms）；随归档增长不会无限膨胀。缺点是无法一次性获得跨年级别的全貌，但实际使用中路线图不太可能跨几个月还未处理。

### ADR-2: 路线图提取算法

- **Context**: design.md 中的路线图格式不固定，可能是 Markdown 表格、列表、或带 P0/P1/P2 标记的章节。
- **Decision**: 两步提取：(1) 定位路线图章节——匹配 `## ` 标题中含"路线图"、"Roadmap"、"实施"关键字的章节，或含 P0/P1/P2 关键字的表格区域；(2) 从表格行中提取条目——取每行的序号(id)、标题(title)、优先级(priority)。
- **Consequences**: 能覆盖当前 design.md 的格式（如 team-collab-design 的 §F）；对非标格式可能漏提取，但用户可通过 `task.mjs followup list` 检查并手动补充。

### ADR-3: followup_tasks 数据结构

- **Context**: 需要持久化路线图条目并支持跨会话追踪。
- **Decision**: 在归档后的 task.json 中新增 `followup_tasks` 数组：
  ```json
  {
    "followup_tasks": [
      { "id": "P0.1", "title": "collab.mjs join/whoami/status/preflight/sync", "priority": "P0", "done": false, "impl_task": null },
      { "id": "P0.2", "title": "task.mjs 扩展 owner + per-uid", "priority": "P0", "done": false, "impl_task": null }
    ]
  }
  ```
- **Consequences**: 归档目录是只读的常规假设被打破（followup close 会写入归档 task.json），但这与 maestro-flow 的 `harvested` 标记模式一致——归档记录可被标记为"已处理"。

### ADR-4: 注入内容格式

- **Context**: inject.mjs 输出被 AI 作为 system prompt 消费。注入的路线图信息需要 AI 能理解并据此引导用户。
- **Decision**: 在 `<vflow-state>` no_task block 中追加 `Pending followup tasks` 段落，格式为简洁的列表。在 `<vflow-context>` session 注入中追加同样信息。
  ```
  Pending followup tasks (from archived design):
  - [P0] P0.1: collab.mjs join/whoami/status/preflight/sync (source: 06-17-team-collab-design)
  - [P0] P0.2: task.mjs 扩展 owner + per-uid (source: 06-17-team-collab-design)
  When user wants to start one, create a new task with `task.mjs create`.
  After task is archived, close the followup: `task.mjs followup close <source> <id>`.
  ```
- **Consequences**: AI 每个 turn 都能看到待办，无需用户主动调用 continue。注入量按条目数线性增长，但实际路线图条目一般 < 20 条，对 token 影响可忽略。

## 测试方案（必填）

本任务改动涉及 vflow 自身的核心脚本（task.mjs + inject.mjs），通过现有 pytest 框架测试。

| 用例 | 验证什么 | 位置 |
| :--- | :--- | :--- |
| test_followup_extract | design.md 含路线图表格时 done 能正确提取 followup_tasks | tests/test_followup.py |
| test_followup_no_roadmap | design.md 不含路线图时 done 不写入 followup_tasks | tests/test_followup.py |
| test_followup_list_close | followup list 输出正确；close 标记 done=true | tests/test_followup.py |
| test_inject_pending | 有未完成 followup 时 inject.mjs prompt 输出含 "Pending followup" | tests/test_followup.py |
| test_inject_no_pending | 无 followup 时 inject.mjs prompt 输出不含 "Pending followup" | tests/test_followup.py |

测试命令：`pytest tests/test_followup.py -v`

设置 test_scope：

```bash
node .vflow/scripts/task.mjs set test_scope "pytest tests/test_followup.py -v"
```

## 任务清单（SWE.3，实现阶段逐项勾选）

- [x] 1.1 task.mjs: 新增 `extractFollowupTasks(designText)` 函数，从 design.md 文本中提取路线图条目 (R3)
- [x] 1.2 task.mjs: 修改 `cmdDone`，归档前调用提取函数，将结果写入 task.json `followup_tasks`，输出提示 (R3)
- [x] 2.1 task.mjs: 新增 `cmdFollowup` 处理 `followup list` 和 `followup close` 子命令 (R4)
- [x] 2.2 task.mjs: 在 parseArgs 和 main 中注册 followup 命令 (R4)
- [x] 3.1 inject.mjs: 新增 `scanPendingFollowups()` 函数，扫描最近 2 个月归档中的 followup_tasks (R1,R2)
- [x] 3.2 inject.mjs: 修改 `doSession()`，无活跃任务时注入 pending followup 摘要 (R1)
- [x] 3.3 inject.mjs: 修改 `doPrompt()`，无活跃任务时在 no_task block 后追加 pending followup 信息 (R2)
- [x] 4.1 workflow.md: 更新 no_task block，增加路线图感知引导指令 (R2)
- [x] 4.2 vflow-continue SKILL.md: 重构路由逻辑，利用注入层信息做智能路由 (R5)
- [x] 5.1 同步模板改动到项目本地 .vflow/ 副本 (R6)
- [x] 5.2 编写 tests/test_followup.py 测试用例 (R3,R4,R1,R2)
- [x] 5.3 运行测试验证无回归 (R6)

## 风险与审批

- 风险级别：high（理由：改动涉及 task.mjs 和 inject.mjs 两个核心脚本，均在 core_paths `src/vflow` 中，且影响每个会话的注入行为）
- 审批记录：
