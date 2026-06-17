# 设计（SWE.2 架构 + SWE.3 详细设计）

## 架构影响（SWE.2）

skill 安装目标从 `.agents/skills/` 变更为 `.claude/skills/`。模板源目录从 `template_agents/` 合并入 `template_claude/`。`.agents/` 相关逻辑全部移除，新增 `.agents/` → `.claude/skills/` 迁移清理。

## 方案概述

将 13 个 SKILL.md 的安装目标路径从 `.agents/skills/` 改为 `.claude/skills/`。模板源从 `src/vflow/template_agents/skills/` 移至 `src/vflow/template_claude/skills/`，消除 `template_agents` 目录。`installProjectAgents()` 函数并入 `installProjectClaude()` 或改写目标路径。update 逻辑新增对旧 `.agents/skills/vflow-*` 的迁移清理。

## 改动清单

| 文件 | 改动类型 | 说明 |
| :--- | :--- | :--- |
| `src/vflow/template_agents/skills/*` → `src/vflow/template_claude/skills/*` | move | 模板源目录迁移 (R3) |
| `src/vflow/cli.mjs` | modify | MANAGED_AGENTS 目标改 `.claude`；`installProjectAgents` 改写；新增 `.agents/skills/` 清理 (R1,R2,R4) |
| `src/vflow/cli.py` | modify | 同 cli.mjs (R1,R2,R4) |
| `package.json` | modify | files 列表：移除 `template_agents/**/*`（已合并入 template_claude） (R3) |
| `tests/test_cli_hooks.py` | modify | 路径断言从 `.agents` 改为 `.claude/skills` (R5) |

## 关联规范（实现与审查按此定向加载）

| spec 文件 | 适用理由 |
| :--- | :--- |
| common/general.md | 简单优先、不引入额外复杂度 |

## 关键设计决策（ADR-lite）

**ADR-1: 消除 `template_agents` 还是保留空壳？**
- Context: `template_agents/` 只存放 skill 文件，现在这些文件要移到 `template_claude/skills/`
- Decision: 完全消除 `template_agents/`，skill 模板归入 `template_claude/skills/`。不保留空目录。`SRC_AGENTS` 常量移除，skill 复制逻辑统一使用 `SRC_CLAUDE`
- Consequences: 代码更简单；`package.json` files 列表减少一项；`installProjectAgents()` 可以合并入 `installProjectClaude()`

**ADR-2: `installProjectAgents()` 合并还是保留独立函数？**
- Context: 函数现在写的目标从 `.agents` 变为 `.claude`，与 `installProjectClaude()` 写同一目录
- Decision: 保留独立函数但重命名为 `installProjectSkills()`，目标改为 `.claude`。保持关注点分离（commands/settings vs skills）
- Consequences: 改动最小化，函数职责清晰

## 测试方案（必填）

| 用例 | 验证什么 | 位置 |
| :--- | :--- | :--- |
| `test_managed_agents_has_13_skills` | MANAGED_AGENTS 列表仍有 13 项 (R1) | tests/test_cli_hooks.py |
| `test_template_agents_skills_exist` → rename `test_template_skills_exist` | 模板文件存在于 template_claude/skills/ (R3) | tests/test_cli_hooks.py |
| `test_install_creates_agents_skills` → rename `test_install_creates_claude_skills` | init 后 .claude/skills/ 下有 13 个 SKILL.md (R1) | tests/test_cli_hooks.py |
| `test_migrated_agents_skills_cleaned_on_install` | 旧 .agents/skills/vflow-* 被清理 (R2) | tests/test_cli_hooks.py (新增) |
| `test_cli_mjs_has_matching_constants` | mjs/py 常量一致 (R4) | tests/test_cli_hooks.py |

## 任务清单（SWE.3，实现阶段逐项勾选）

- [x] 1.1 移动 `src/vflow/template_agents/skills/*` 到 `src/vflow/template_claude/skills/`，删除 `template_agents/` 目录 (R3)
- [x] 1.2 更新 `package.json` files 列表，移除 `template_agents` 条目 (R3)
- [x] 1.3 更新 `cli.mjs`：移除 `SRC_AGENTS`，技能安装目标改为 `.claude`，重命名 `installProjectAgents` → `installProjectSkills`，新增 `.agents/skills/` 迁移清理 (R1,R2,R4)
- [x] 1.4 更新 `cli.py`：同 cli.mjs 的对应改动 (R1,R2,R4)
- [x] 1.5 更新 `tests/test_cli_hooks.py`：路径断言改为 `.claude/skills/`，新增迁移清理测试 (R5)
- [x] 1.6 运行测试套件确认全部通过 (R5)
- [x] 1.7 手动验证：在当前 vflow 项目执行 update，确认 skill 出现在 `.claude/skills/` (R6)

## 风险与审批

- 风险级别：low（理由：纯路径变更，无功能逻辑改动；有完整测试覆盖）
- 审批记录：
