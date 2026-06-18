# 设计（SWE.2 架构 + SWE.3 详细设计）

## 架构影响（SWE.2）

cli.py 安装器从安装 Python 脚本（task.py/inject.py）改为安装 Node.js 脚本（task.mjs/inject.mjs/collab.mjs），消除对 Python 运行时的依赖。hook 命令从 `python` 改为 `node`。

## 方案概述

全面统一到 Node.js 版本：
1. cli.py 安装逻辑：MANAGED_VFLOW 列表、hook 命令、smoke_test、do_status 全部改为 .mjs
2. 所有活跃文档中的 `task.py`/`inject.py` 引用替换为 `task.mjs`/`inject.mjs`
3. workflow.md 状态块增加阶段约束措辞
4. 更新测试文件适配新的脚本名

## 改动清单

| 文件 | 改动类型 | 说明 |
| :--- | :--- | :--- |
| `src/vflow/cli.py` | 修改 | MANAGED_VFLOW 改为 .mjs 文件；hook_cmd/smoke_test/do_status 用 node |
| `.vflow/workflow.md` | 修改 | task.py→task.mjs + inject.py→inject.mjs + 纪律加强 |
| `.vflow/skills/vflow-task/SKILL.md` | 修改 | task.py→task.mjs |
| `.vflow/skills/vflow-quick/SKILL.md` | 修改 | task.py→task.mjs |
| `.vflow/scripts/task.mjs` | 修改 | 内部消息 task.py→task.mjs |
| `.vflow/templates/verify.md` | 修改 | 注释 task.py→task.mjs |
| `.vflow/templates/design.md` | 修改 | 注释 task.py→task.mjs |
| `.claude/skills/vflow-continue/SKILL.md` | 修改 | task.py→task.mjs |
| `.claude/skills/vflow-meta/SKILL.md` | 修改 | task.py/inject.py→.mjs |
| `.claude/skills/vflow-context/SKILL.md` | 修改 | task.py→task.mjs |
| `INSTALL.md` | 修改 | task.py/inject.py→.mjs |
| `src/vflow/template_vflow/workflow.md` | 修改 | 模板同步 |
| `src/vflow/template_vflow/skills/vflow-task/SKILL.md` | 修改 | 模板同步 |
| `src/vflow/template_vflow/skills/vflow-quick/SKILL.md` | 修改 | 模板同步 |
| `src/vflow/template_vflow/scripts/task.mjs` | 修改 | 模板同步 |
| `src/vflow/template_vflow/templates/verify.md` | 修改 | 模板同步 |
| `src/vflow/template_vflow/templates/design.md` | 修改 | 模板同步 |
| `src/vflow/template_claude/skills/vflow-meta/SKILL.md` | 修改 | 模板同步 |
| `src/vflow/template_claude/skills/vflow-continue/SKILL.md` | 修改 | 模板同步 |
| `src/vflow/template_claude/skills/vflow-context/SKILL.md` | 修改 | 模板同步 |
| `tests/conftest.py` | 修改 | task.py→task.mjs 引用 |
| `tests/test_cli_hooks.py` | 修改 | inject.py→inject.mjs，python→node |

## 关联规范（实现与审查按此定向加载）

| spec 文件 | 适用理由 |
| :--- | :--- |
| （无适用 spec 文件） | 本任务为文本替换 + 安装器修改 |

## 关键设计决策（ADR-lite）

**统一 Node.js 运行时**：
- Context: 项目同时存在 Python (.py) 和 Node.js (.mjs) 两套脚本，文档引用 .py 但部署了 .mjs
- Decision: 统一到 Node.js。cli.py 安装 .mjs 文件，hook 用 `node` 调用。保留 .py 源码但不安装
- Consequences: 消除运行时不一致；需要 Node.js 环境（Claude Code 已依赖 Node.js）

**hook 命令格式**：
- Context: 当前 hook 用 `python .vflow/scripts/inject.py`，需改为 node
- Decision: 改为 `node .vflow/scripts/inject.mjs`，降级消息同步更新
- Consequences: 旧项目通过 `vflow update` 可自动迁移 hook

## 测试方案（必填）

| 用例 | 验证什么 | 位置 |
| :--- | :--- | :--- |
| grep 活跃文件无残留 | 排除 archive/、template_vflow/scripts/task.py 外无 `task.py` 引用 | shell |
| grep 活跃文件无残留 | 排除 archive/ 外无 `inject.py` 引用（template 中保留源码除外） | shell |
| node task.mjs status | 脚本正常执行 | shell |
| pytest 测试套件 | 现有测试通过 | shell |

## 任务清单（SWE.3，实现阶段逐项勾选）

- [x] 1.1 修复 src/vflow/cli.py：MANAGED_VFLOW 改为 .mjs，hook 命令用 node，smoke_test 和 do_status 改为 node+.mjs (R1,R2)
- [x] 1.2 修复 .vflow/workflow.md：task.py→task.mjs、inject.py→inject.mjs + 增加阶段纪律约束 (R1,R4)
- [x] 1.3 修复 .vflow/skills/ 下 vflow-task 和 vflow-quick 的 SKILL.md (R1)
- [x] 1.4 修复 .vflow/scripts/task.mjs 内部错误提示信息 (R3)
- [x] 1.5 修复 .vflow/templates/ 下 design.md 和 verify.md 注释 (R1)
- [x] 1.6 修复 .claude/skills/ 下 vflow-continue、vflow-meta、vflow-context (R1)
- [x] 1.7 修复 INSTALL.md (R1)
- [x] 2.1 同步修复 src/vflow/template_vflow/ 下的模板文件 (R2)
- [x] 2.2 同步修复 src/vflow/template_claude/ 下的模板文件 (R2)
- [x] 2.3 更新 tests/conftest.py 和 tests/test_cli_hooks.py (R2)
- [x] 3.1 运行 grep 验证 + task.mjs status + pytest 测试 (R5)

## 风险与审批

- 风险级别：high（理由：改动涉及 cli.py 安装器、workflow.md、多个 skill 文件，共 22 个文件）
- 审批记录：用户确认"直接不用python版本"，扩大范围含 cli.py
