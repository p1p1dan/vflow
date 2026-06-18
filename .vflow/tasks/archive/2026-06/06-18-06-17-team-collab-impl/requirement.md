# 需求分析（SWE.1）

## 原始需求

基于已归档的设计任务 `06-17-team-collab-design` 中的融合架构设计文档，实施完整的 P0+P1+P2 团队协同方案。设计文档位于 `.vflow/tasks/archive/2026-06/06-17-team-collab-design/design.md`。

用户原话："不仅仅是 P0，应该是任务文档规划中的完整计划形成一个新的完整的执行任务"

## 澄清问答

| # | 问题 | 用户回答 |
| :-- | :--- | :--- |
| 1 | 先做工作流改进还是先做团队协同？ | 先工作流改进（已完成），然后做完整协同 |
| 2 | 是只做 P0 还是完整计划？ | 完整 P0+P1+P2 |

## 验收条目（R-ID，机械校验锚点）

- R1: collab.mjs 脚本存在且支持 join/whoami/status/preflight/sync 五个子命令，各命令退出码符合设计文档定义
- R2: task.mjs 在团队模式下 create 自动设 owner，status 显示 owner，current-task 按 uid 隔离（per-uid 指针文件）；非团队模式行为不变
- R3: inject.mjs 在团队模式下追加 `<vflow-team>` 块显示活跃成员状态；非团队模式无额外输出
- R4: spec 三层加载（项目级 → 团队级 → 个人级）正确工作，同名文件高层覆盖低层
- R5: spec writeback 在团队模式下进入 staging 暂存区，支持 review/approve/reject 流程
- R6: collab.mjs 支持 claim/release 子命令，能认领和释放任务
- R7: vflow-collab skill 文件存在，可通过 `/vflow:collab` 触发团队命令
- R8: config.json 新增 team 配置块（team.enabled 默认 false），向后兼容现有单人配置

## 范围边界

- 范围内：P0（collab.mjs 核心命令 + task.mjs 团队扩展 + inject.mjs 团队注入）、P1（spec 三层加载 + writeback review + claim/release + skill）、P2 基础项（archive 全文搜索 P2.4 优先级高）
- 范围外：P2.1 通知适配器（需外部服务）、P2.2 命名空间守卫（延后）、P2.5 milestone 层（独立任务）
