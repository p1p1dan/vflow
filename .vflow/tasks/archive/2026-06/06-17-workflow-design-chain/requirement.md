# 需求分析（SWE.1）

## 原始需求

vflow 缺乏项目级任务态势感知能力。当前 inject.mjs 在无活跃任务时只输出"No active task"，AI 对项目任务全貌一无所知。参考 Trellis 的 per-turn breadcrumb 注入和 maestro-flow 的 artifact registry 派生 status，vflow 应在会话启动和每个 turn 的注入中包含项目任务态势——活跃任务 + 归档中待实施路线图 + 最近中断的任务——让 AI 每次会话自然知道该引导用户做什么。

核心场景：
1. 新开会话 → AI 自动知道有待实施的设计路线图，引导用户创建实施任务
2. 中断恢复 → AI 自动知道上次做到哪，引导恢复
3. 设计任务归档 → 路线图条目被提取并持久化，后续会话可感知

## 澄清问答

| # | 问题 | 用户回答 |
| :-- | :--- | :--- |
| 1 | 工作流改进和 collab 实施的优先级？ | 先做工作流改进 |
| 2 | 路线图项是自动创建任务还是仅提示？ | 引导用户，由用户决定 |
| 3 | 信息在什么层面感知？ | 注入层（inject.mjs），参考 Trellis/maestro-flow 的 per-turn 注入 |

## 验收条目（R-ID，机械校验锚点）

- R1: `inject.mjs doSession()` 在无活跃任务时，扫描归档目录中 task.json 含 `followup_tasks` 且有未完成条目的设计任务，将待实施路线图摘要注入 `<vflow-context>` 中（格式：任务来源 + 优先级 + 标题），AI 无需用户操作即可感知待办
- R2: `inject.mjs doPrompt()` 在无活跃任务时，将待实施路线图摘要注入 `<vflow-state>` 的 no_task block 中，引导 AI 向用户建议创建实施任务或恢复中断任务
- R3: `task.mjs done` 归档时，自动扫描 design.md 中的路线图表格（含 P0/P1/P2 或"路线图"关键字的章节），提取条目写入 task.json 的 `followup_tasks` 数组（每项含 id、title、priority、done 字段），并在归档输出中提示"有 N 项后续任务待实施"
- R4: 新增 `task.mjs followup list` 和 `task.mjs followup close <source-task> <item-id>` 命令——list 列出所有未闭合的 followup 条目，close 将指定条目标记为 done（记录关联的实施任务 slug）
- R5: vflow-continue skill 重构——无活跃任务时利用注入层已提供的态势信息（不重复扫描），直接根据 `<vflow-context>` 中的待办摘要路由到正确的引导流程
- R6: 上述所有改动对现有流程无回归——不含路线图的任务归档行为不变，有活跃任务时 inject.mjs 的注入内容和格式不变，注入耗时增量 < 50ms

## 范围边界

- 范围内：inject.mjs 注入层扩展（doSession + doPrompt）、task.mjs done 路线图提取、task.mjs followup 子命令、vflow-continue skill 重构、template_vflow 模板同步
- 范围外：路线图条目自动创建任务（仅引导提示）、maestro-flow epic/milestone 完整移植、团队协同相关改动（属于下一个任务）
