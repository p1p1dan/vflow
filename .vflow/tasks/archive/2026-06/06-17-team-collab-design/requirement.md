# 需求分析（SWE.1）

## 原始需求

领导关注 vibe coding 场景下的四个维度：知识沉淀、团队协同、多人进度同步、开发规范性。vflow 在知识沉淀和规范性上已经很强，但团队协同和多人同步基本为零。用户要求全面分析 maestro-flow 的 Team Lite 团队协同方案，提取可融入 vflow 的精华，产出融合架构设计文档，作为后续实施的蓝图。

## 澄清问答

| # | 问题 | 用户回答 |
| :-- | :--- | :--- |
| 1 | 是否需要考虑跨 AI 平台（Cursor/Codex 等）？ | 仅考虑团队全部使用 Claude Code |
| 2 | maestro-flow 的哪些模块重点关注？ | 全面分析，吸收精华 |
| 3 | 本任务交付物是什么？ | 分析文档 + 融合架构设计，不涉及代码实现 |

## 验收条目（R-ID，机械校验锚点）

- R1: 产出 maestro-flow Team Lite 各模块的逐项适用性评估表，每个模块标注"直接适用 / 需改造 / 不适用"及理由，覆盖至少 8 个核心模块
- R2: 产出 vflow 当前架构与目标团队能力的差距分析，覆盖数据模型（task.json / config.json）、状态管理（current-task 单值问题）、hook 系统、spec 管理四个维度
- R3: 设计 vflow 团队协同层的完整数据模型，包含成员注册 schema、task.json 扩展字段、活动日志 JSONL 格式，每个 schema 有字段说明和示例
- R4: 设计团队协同的 CLI 命令接口（至少 join/status/sync/preflight 四个核心命令）和 hook 集成方案，证明与 vflow 现有 6-state pipeline 兼容
- R5: 设计 spec 多层加载方案（项目级 → 团队级 → 个人级），说明 spec writeback 的 review 机制，解决"单人 AI 污染团队规范"问题
- R6: 输出分阶段实施路线图（P0/P1/P2），每阶段有明确交付物清单、工作量估算和验收标准，P0 可在 1-2 周内完成

## 范围边界

- 范围内：maestro-flow Team Lite 全模块分析、vflow 差距评估、融合架构设计、数据模型设计、命令接口设计、spec 分层方案、实施路线图
- 范围外：代码实现、其他参考项目（Trellis/OpenSpec 等仅作辅助参考）、非 Claude Code 平台支持、服务端基础设施方案
