# 任务规格

## §1 需求

用户体验反馈：vflow v2 重构后，文档记录和更新不积极，基于节点和边的状态机没有正常运行。
核心原因：昨天的提交（8b1d0dd）从 maestro-flow 移植了 coordinate（图遍历器）模型，但 maestro-flow 日常用的是 ralph（步进器）模型。coordinate 需要外部编排进程 spawn 多个 Claude 子进程，在 vflow 的单会话模型中无法运行。

方向：保留现有 coordinate 代码，补充移植 ralph 步进模型的核心能力——CLI 驱动的分步执行 + status/steps 状态管理 + Skill 自调用循环 + required_reading 注入 + 完成校验强制文档更新 + knowledge.md 生命周期管理。

参考实现：E:\dy\个人发展\reference-repos\maestro-flow 的 ralph 子系统（cmd-next.ts、cmd-complete.ts、status-schema.ts、status-store.ts、skill-resolver.ts、maestro-ralph-execute/SKILL.md）。

## §2 验收条目

- R1: **步进 CLI 命令** — 实现 `task.js next`（加载当前 step 指令 + 内联 required_reading 文件内容输出到 stdout）和 `task.js complete N --status <S>`（校验 + 标记完成 + 清除 active_step_index）。支持 DONE / DONE_WITH_CONCERNS / NEEDS_RETRY / BLOCKED 四种状态
- R2: **执行会话 steps 管理** — task.json 扩展 `steps[]` 数组（每个 step 含 index、skill、status、completion_confirmed、completion_evidence、load.required_files 等字段），`active_step_index` 保证同一时刻只有一个 step 在执行，支持断点续做
- R3: **步骤序列自动构建** — 任务创建时根据 tier + t2-standard.json 节点定义自动生成 steps 序列，每个 graph 节点映射为一个 step 并关联对应的 vflow skill（T1 生成精简序列跳过 gate 节点）
- R4: **Skill 自调用循环** — 实现 `vflow-execute` SKILL.md，流程：调用 `task.js next` → 执行 step 内容 → 调用 `task.js complete N` → 自调用继续。Gate 节点暂停等待用户确认，BLOCKED 暂停报告原因
- R5: **Required Reading 注入** — 每个 step 的 skill 通过 `<required_reading>` 定义需加载的文件（spec 文件、task-spec.md 段落、关联代码），`task.js next` 输出时自动读取并内联文件内容到 prompt
- R6: **完成校验与文档强制** — `task.js complete` 按 step 类型执行机械性校验：需求步骤检查 task-spec.md §2 有 R-ID、设计步骤检查 §6 有 checklist 且覆盖全部 R-ID、实现步骤检查 ledger.md §1 有记录、验证步骤检查 §4 R-ID 逐条闭环。校验不通过则拒绝完成并输出缺失项
- R7: **knowledge.md 生命周期** — steps 序列包含 `spec_writeback` step，其完成条件检查 knowledge.md 有本次任务的新增内容；`/vflow:init` 探测阶段将项目认知写入 knowledge.md 而非留空模板

## §3 方案

### 概述

在 vflow 现有单会话 + hook 注入架构上，移植 maestro-flow 的 ralph 步进执行模型。核心思路：task.json 扩展为包含 steps[] 的执行会话，task.js 增加 next/complete 子命令驱动分步执行，新建 vflow-execute SKILL.md 实现自调用循环，inject.ts 在有活跃 ralph session 时注入步骤级上下文。

### ADR-1: steps 嵌入 task.json vs 独立 status.json

- **Context**: maestro-flow 用独立 `.workflow/.maestro/{session}/status.json`。vflow 每个任务已有 task.json 作为单一真源。
- **Decision**: 将 steps[] 直接嵌入 task.json，不创建独立文件。
- **Consequences**: 简化文件管理，保持 vflow 一个任务一个 JSON 的约定。task.json 会变大，但 steps 数量有限（T2 约 8-10 个），可接受。

### ADR-2: 图节点 → steps 映射策略

- **Context**: t2-standard.json 定义了 command/gate/decision/terminal 四种节点类型。需要转化为线性 steps 序列。
- **Decision**: 遍历图的 `next` 链，command 节点 → 普通 step（关联 skill），gate 节点 → gate step（暂停等待确认），decision 节点 → 内联到前一个 step 的后处理。terminal 节点不生成 step。
- **Consequences**: 适用于当前线性结构的 t2-standard.json。如果将来需要并行分支，需扩展。

### ADR-3: Skill 自调用 vs inject.ts 自动推进

- **Context**: 两种方式实现连续执行：(A) Skill 自调用（maestro-flow 方式），(B) inject.ts 在每次 prompt 时检测并推进。
- **Decision**: 采用 Skill 自调用（A）。vflow-execute SKILL.md 在完成当前 step 后自调用自身。
- **Consequences**: 与 maestro-flow 一致，AI 行为可预测。inject.ts 只负责状态感知，不驱动执行。

### ADR-4: required_reading 定义位置

- **Context**: maestro-flow 的 required_reading 定义在每个 SKILL.md 内。vflow 的 skill 也在 .claude/skills/ 和 .vflow/skills/ 下。
- **Decision**: 在 t2-standard.json 的每个节点定义 `required_reading[]` 路径列表（相对于 .vflow/ 或任务目录）。`task.js next` 读取节点配置并内联文件内容。不修改现有 SKILL.md。
- **Consequences**: 集中管理 required_reading，修改图配置即可调整注入内容，不需要改动 skill 文件。

## §4 改动清单

| 文件 | 类型 | 说明 |
| :--- | :--- | :--- |
| .vflow/scripts/lib/ralph-schema.ts | 新增 | Step/StepLoad/CompletionStatus 类型定义 |
| .vflow/scripts/lib/ralph-store.ts | 新增 | task.json 中 steps 的读写、active_step_index 管理 |
| .vflow/scripts/lib/ralph-checker.ts | 新增 | step 完成校验逻辑（按 step 类型检查文档更新），E 错误码 |
| .vflow/scripts/lib/ralph-skill-loader.ts | 新增 | 加载 skill 文件、解析 required_reading @path、内联文件内容 |
| .vflow/scripts/lib/cmd-next.ts | 新增 | next 命令：找到下一个 pending step → 加载 skill + required_reading → 输出到 stdout |
| .vflow/scripts/lib/cmd-complete.ts | 新增 | complete 命令：校验 active_step_index → 按 step 类型做文档校验 → 更新状态 |
| .vflow/scripts/task.ts | 修改 | 添加 next/complete 子命令路由；cmdCreate 中增加 steps 序列生成 |
| .vflow/scripts/inject.ts | 修改 | 有活跃 ralph session 时注入当前 step 上下文（step N/total, skill, status） |
| .vflow/graphs/t2-standard.json | 修改 | 每个节点增加 skill_ref 和 required_reading[] 字段 |
| .claude/skills/vflow-execute/SKILL.md | 新增 | 自调用循环 skill：next → 执行 → complete → 自调用 |
| .vflow/skills/vflow-go/SKILL.md | 修改 | 任务创建后触发 vflow-execute 启动循环 |
| .vflow/scripts/lib/steps-builder.ts | 新增 | 从 graph JSON 生成线性 steps 序列的逻辑 |

## §5 关联规范

| spec 文件 | 适用理由 |
| :--- | :--- |
| maestro-flow/src/ralph/status-schema.ts | 参考：Step 类型定义和状态枚举 |
| maestro-flow/src/ralph/cmd-next.ts | 参考：next 命令的完整逻辑和输出格式 |
| maestro-flow/src/ralph/cmd-complete.ts | 参考：complete 命令的校验规则和状态转换 |
| maestro-flow/src/ralph/skill-resolver.ts | 参考：required_reading 解析和 @path 展开 |
| maestro-flow/.codex/skills/maestro-ralph-execute/SKILL.md | 参考：自调用循环的 Skill 设计模式 |

## §6 任务清单

- [x] 1.1 定义 ralph-schema.ts：Step、StepLoad、CompletionStatus 等类型 (R2)
- [x] 1.2 实现 ralph-store.ts：读写 task.json 中的 steps[]、管理 active_step_index (R2)
- [x] 2.1 实现 steps-builder.ts：从 t2-standard.json 遍历图生成线性 steps 序列 (R3)
- [x] 2.2 更新 t2-standard.json：每个节点增加 skill_ref、required_reading[]、completion_checks 字段 (R3,R5,R6)
- [x] 2.3 修改 task.ts cmdCreate：创建任务时调用 steps-builder 生成 steps 写入 task.json (R3)
- [x] 3.1 实现 ralph-skill-loader.ts：加载 skill 文件、解析 @path 引用、内联文件内容 (R5)
- [x] 3.2 实现 cmd-next.ts：定位 pending step → 加载 skill + 内联 required_reading → 输出完成协议注释 → 写 active_step_index (R1,R5)
- [x] 3.3 实现 cmd-complete.ts：校验 active_step_index 匹配 → 状态转换（DONE/DONE_WITH_CONCERNS/NEEDS_RETRY/BLOCKED）→ 清除 active_step_index (R1)
- [x] 3.4 实现 ralph-checker.ts：按 step 类型做文档校验（需求→R-ID、设计→checklist、实现→ledger、验证→R-ID闭环）(R6)
- [x] 3.5 修改 task.ts：添加 next/complete 子命令路由，连接 cmd-next/cmd-complete (R1)
- [x] 4.1 创建 vflow-execute SKILL.md：定义自调用循环（next → 执行 → complete → 自调用），Gate 节点暂停逻辑，终止条件 (R4)
- [x] 4.2 更新 vflow-go SKILL.md：任务创建后自动触发 vflow-execute (R4)
- [x] 5.1 修改 inject.ts：有活跃 steps session 时注入 ralph 步骤上下文 (R2,R5)
- [x] 6.1 更新 vflow:init skill：探测阶段将项目认知写入 knowledge.md (R7)
- [x] 6.2 在 t2-standard.json 的 spec_writeback 节点定义 knowledge.md 校验规则 (R7)
