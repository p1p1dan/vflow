# 需求分析（SWE.1）

## 原始需求

修复 vflow 源码，解决 `.agents/skills/` 下的 skill 不被 Claude Code 自动发现的问题。

## 澄清问答

| # | 问题 | 用户回答 |
| :-- | :--- | :--- |
| 1 | Claude Code skill 发现路径是什么？ | 官方文档确认：仅 `~/.claude/skills/`、`.claude/skills/`、Plugin skills。`.agents/skills/` 不被支持（Issue #31005 未实现）。 |
| 2 | 参考项目如何实现？ | maestro-flow 将 skill 放在 `.claude/skills/` 下，被正确发现。 |

## 验收条目（R-ID，机械校验锚点）

- R1: `vflow init` 将 13 个 skill 安装到 `.claude/skills/<name>/SKILL.md`（非 `.agents/skills/`）
- R2: `vflow update` 将旧 `.agents/skills/vflow-*` 迁移清理，技能出现在 `.claude/skills/`
- R3: 模板源码从 `template_agents/skills/` 迁移至 `template_claude/skills/`，`package.json` files 列表同步更新
- R4: cli.mjs 与 cli.py 逻辑一致，不再引用 `.agents` 路径用于 skill 安装
- R5: 已有测试全部通过，路径断言更新为 `.claude/skills/`
- R6: 在新 Claude Code 会话中，13 个 skill 出现在可用 skill 列表中

## 范围边界

- 范围内：cli.mjs、cli.py 安装/迁移逻辑、模板目录重组、package.json、测试更新
- 范围外：SKILL.md 内容不改；`.vflow/skills/` 下的 vflow-task/vflow-quick 不动（它们由 hook 注入使用，不依赖 Claude 自动发现）
