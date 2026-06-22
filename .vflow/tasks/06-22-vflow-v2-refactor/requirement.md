# 需求分析（SWE.1）

## 原始需求

用户对当前 vflow 提出系统性批评并要求架构重构：

1. **任务链路断裂**：6 状态流水线在每个状态边界断开，需要用户手动"继续"。应改为生成执行计划后连续自动执行，只在必要审批门暂停。
2. **Spec 形同虚设**：init 不审查项目文档，spec/domain/ 始终为空，执行前不自动加载相关规范。
3. **文档冗余**：requirement.md 和 design.md 应合并为一份 task-spec.md；worklog 和 verify 应合并为 ledger.md。
4. **T1 仪式感过重**：最轻量的任务也要走 node 脚本 + 5 个文件 + hash，不合理。
5. **缺少任务账本**：需要记录实施顺序、子任务卡点、未完成原因、设计回写、commit 关系。
6. **缺少任务组**：大任务应拆分为子任务，共享 group-id，归档时整组保持关联。
7. **缺少文档生命周期管理**：需要需求追溯矩阵、（可选）系统/软件架构文档。
8. **参考项目优势**：吸收 maestro-flow 的 ChainGraph 连续执行 + 决策节点 + 中央状态管理；吸收 Trellis 的 session-scoped 上下文 + JSONL spec 清单 + spec 回写循环 + workspace 知识积累。
9. **T2 可以重**：已做分层，T2 才涉及重流程，T1 极简。

## 澄清问答

| # | 问题 | 用户回答 |
| :-- | :--- | :--- |
| 1 | 重构范围是否包含 collab.mjs 团队协作功能？ | 保留，但不在本次重构核心范围 |
| 2 | 是否接受"先出完整设计、再分阶段实施"？ | 是，先出重构方案 |
| 3 | 流程重一点是否可接受？ | 可以，T2 走重流程没问题 |

## 验收条目（R-ID，机械校验锚点）

- R1: **连续执行引擎** — T2 任务在执行计划确认后，自动按计划连续推进全部步骤（analyze → design → implement → verify），只在用户审批门（Gate）处暂停等待确认，不再每步停下等"继续"
- R2: **文档合并** — requirement.md + design.md 合并为单一 task-spec.md（包含：原始需求、R-ID、方案设计、改动清单、任务清单）；worklog.md + verify.md 合并为 ledger.md（包含：实施记录、验证结果、机器执行记录）；task 目录文件从 7 个减少到 3 个（task.json + task-spec.md + ledger.md）
- R3: **Init 深度项目认知** — `/vflow:init` 扫描项目关键文档（README、ARCHITECTURE、CONTRIBUTING、已有编码规范等），提取项目约定和领域知识，写入 spec/domain/ 和 spec/project/，形成项目专属知识库
- R4: **Spec 自动注入** — 任务执行前根据任务类型和涉及模块自动匹配并加载相关 spec（不依赖手动在文档中声明关联规范表格），inject.mjs 基于任务改动清单中的文件路径 + config.json 模块映射自动解析
- R5: **任务账本（Ledger）** — ledger.md 记录：(a) 实施顺序（按时间线记录每个 checklist item 的开始/完成）；(b) 卡点记录（遇到的阻塞及解决方案）；(c) 设计回写（实施中发现的设计变更，回写到 task-spec.md）；(d) commit 关系（每个 checklist item 对应的 commit hash）
- R6: **任务组（Task Group）** — 大任务可拆分为多个子任务，共享 group-id；子任务独立执行、独立归档；归档目录保持层级关系（group-slug/sub-task-slug/）；group 级别有汇总 ledger
- R7: **T1 极简化** — T1 任务不调用 task.mjs create、不创建目录结构、不生成 hash 文件；完成后仅追加一条记录到 .vflow/tasks/quick-log.jsonl（JSON 行格式：{id, title, files_changed, commit, timestamp}）
- R8: **需求追溯矩阵** — 提供 R-ID 端到端追溯能力：R-ID → task-spec 设计条目 → 代码文件/行号 → 测试用例 → 验证结果；可通过 `task.mjs trace <task-id>` 命令输出追溯矩阵

## 范围边界

- 范围内：workflow.md 重写、task.mjs 重构、inject.mjs 重构、模板系统重建、init skill 重写、task/quick skill 重写、spec 自动匹配机制、任务组支持、追溯矩阵命令
- 范围外：collab.mjs 团队协作（保留现有，后续独立迭代）、跨平台适配（仅 Claude Code）、UI/Web 界面
