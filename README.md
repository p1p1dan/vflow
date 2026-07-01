# vflow

> 提案驱动（proposal-driven）的 AI 研发工作流引擎。

vflow 给 Claude Code 装上一套"提案生命周期"：任何非平凡的代码改动，都会被引导走一遍
`intake → analysis → design → plan → execution → verify → pending_acceptance → done → archived`
的结构化流程。目标是让 AI 在动手前先想清楚、动手时按计划走、动手后留下可追溯的记录，而不是凭感觉一把梭。

它通过 Claude Code 的 **hook 机制**工作：每次会话开始 / 每次你提交 prompt 时，vflow 会向 AI 注入当前提案所处阶段的上下文与下一步指令。

---

## 工作原理（两层架构）

vflow 分两层安装，理解这一点能省掉很多困惑：

| 层级 | 装在哪 | 作用 |
| :--- | :--- | :--- |
| **全局层** | `~/.claude/`（你的用户目录） | 一个轻量"检测 hook"。每当你在任意项目里打开 Claude Code，它判断该项目是否启用了 vflow：启用了就放行项目层接管；没启用就询问是否启用（拒绝后不再问）。 |
| **项目层** | 项目里的 `.vflow/` 和 `.claude/` | 真正的引擎：提案 CLI、工作流定义、规范库、注入 hook。**这些资产 check-in 进仓库**，所以同事 clone 下来即可用，无需各自安装 vflow。 |

换句话说：**vflow 全局只装一次；项目只需 `init` 一次并提交，团队成员零配置共享。**

---

## 安装

要求：**Node.js >= 18**。

### 1. 全局安装

```bash
npm install -g @p1lab/vflow
vflow setup
```

`vflow setup` 会：
- 写入 `~/.claude/vflow/detect.mjs`（检测脚本）
- 合并全局 `~/.claude/settings.json` 的 `SessionStart` / `UserPromptSubmit` hooks
- 清理旧版本（v0.x）残留

> 全局 `settings.json` 若已损坏，setup 会**备份原文件并中止**，绝不覆盖你的配置。

### 2. 为项目启用

在项目根目录：

```bash
vflow init .            # 交互式：会问项目名、是否 Qt/嵌入式、构建/测试命令
# 或
vflow init . --yes      # 跳过交互，全取默认值（项目名取目录名）
```

`init` 会向项目写入 `.vflow/`（引擎 + 规范库 + 配置）和 `.claude/`（CLAUDE.md authority block + hooks + 规则），并自动追加 `.gitignore` 条目、跑一次自检。

完成后**提交这些文件**，团队即可共享：

```bash
git add .vflow .claude .gitignore
git commit -m "chore: 启用 vflow 工作流"
```

之后**打开一个新的 Claude Code 会话**即可使用。

---

## 命令速查

```
vflow setup                    全局安装（检测 hooks + detect.mjs）
vflow init <path> [--yes]      为项目启用 vflow
vflow update <path> [--spec]   同步托管文件到最新版本；--spec 仅合并 .vflow/spec
vflow decline <path>           标记项目不启用（该项目不再询问）
vflow status <path>            查看项目当前提案状态
vflow --version                查看版本
```

- `update`：升级 vflow 后，在项目里跑一次，把托管的脚本/模板/规则同步到新版本（**不会**动你的提案数据和 config）。
- `update --spec`：只合并 `.vflow/spec/` 规范库，不碰脚本和 hooks——适合只想拉取最新规范的场景。
- `decline`：某项目你明确不想用 vflow，用这个让它别再弹出询问。`init` 可随时重新启用。

---

## 提案生命周期

启用后，你在 Claude Code 里正常提需求，AI 会按下面的流程推进。每个阶段都有"准入门槛"（gate），不达标无法前进。

| 阶段 | 产出 | 门槛 |
| :--- | :--- | :--- |
| `intake` | analysis.json（problem + scope） | problem、scope 非空 |
| `analysis` | design.json（≥1 条决策） | 至少 1 条设计决策 |
| `design` | plan.json（执行大纲 + 验证项） | 大纲非空 + ≥1 验证检查 |
| `plan` | execution.json（执行项 DAG） | 执行项非空、无环、≥1 项就绪 |
| `execution` | 逐项实现（串行，一次一个 `doing`） | 所有项 done/cancelled |
| `verify` | verify.json（验证结果） | 所有 gating 检查通过 |
| `pending_acceptance` | 结果汇报 | **仅用户可 `accept`，AI 无法越过此阶段** |
| `done` → `archived` | review.md（自动生成） | — |

### 分级（Tier）

AI 会按改动的风险自动定级：

- **T0**：纯问答/解释 —— 不创建提案，直接回答
- **T1**：清晰、局部、低风险 —— 快速通道（单项执行）
- **T2**：标准功能/修复 —— 完整走查 + 执行循环
- **T3**：架构/核心/高风险 —— T2 + 执行前**强制设计确认**

### 底层 CLI

提案数据由项目内的 CLI 维护（AI 会自动调用，一般你无需手敲）：

```bash
node .vflow/scripts/dist/proposal.js <create|continue|status|list|advance|back|set|execution|verify|accept|confirm-design|archive|trace|knowledge>
```

最常用的两个：
- `proposal.js status` —— 看当前提案在哪个阶段
- `proposal.js accept` —— **你本人**验收，把提案推进到 `done`

---

## 提案强制门卫（vflow-go + PreToolUse gate）

vflow 2.1.0+ 引入了三层强制机制，确保 AI 在无 active proposal 时无法自由修改代码：

### 工作原理

1. **SessionStart hook**：会话开始时注入当前提案状态
2. **UserPromptSubmit hook**：用户提交 prompt 时，若无 active proposal 且 gate 开启，注入 MANDATORY 指令强制 AI 调用 `vflow-go` skill
3. **PreToolUse hook**：Write/Edit/NotebookEdit 被调用时检查 active proposal，无则 exit 2 硬阻断（bypass-proof）

### vflow-go skill

新的 intake 入口 skill，负责：
- 分类 tier（T0/T1/T2/T3）
- T0 直接回答，T1+ 自动创建 proposal
- 调用 `vflow-proposal` skill 进入完整生命周期

**手动调用**：
```
Skill("vflow-go")
```

或在 Claude Code 输入框：
```
/vflow-go
```

### 开关配置

编辑 `.vflow/scripts/config.json`：

```json
{
  "features": {
    "gate": true
  }
}
```

- `"gate": true`（默认）：UserPromptSubmit 注入强制指令 + PreToolUse 硬阻断
- `"gate": false`：UserPromptSubmit 仅注入提示信息，PreToolUse 仍然阻断（兜底）

**推荐**：开发 vflow 本身时设为 `false`，日常使用设为 `true`。

### 故障排查

**问题：AI 被 PreToolUse 阻断，提示"No active proposal"**

原因：你提交了代码改动需求，但未建 proposal。

解决：
1. 调用 `Skill("vflow-go")` 让 AI 自动分类并建 proposal
2. 或手动创建：`node .vflow/scripts/dist/proposal.js create <slug> --title "..." --type feature --tier T2`

**问题：想纯问问题，AI 却被强制建 proposal**

原因：gate 开启时，AI 会优先尝试建 proposal。

解决：明确表述成 T0 问题（"解释一下…"、"这块逻辑是…"），AI 会判定为 T0 直接回答。

**问题：gate 关闭后，AI 仍无法 Write/Edit**

原因：PreToolUse 硬阻断始终生效，不受 `features.gate` 开关控制。

解决：这是兜底机制的预期行为——即使开关关闭，AI 仍需通过 `vflow-go` 或手动建 proposal 来解除阻断。

---

## 使用技巧

- **让 AI 推进流程，你只在关键节点把关。** 日常提需求即可；AI 会自动建提案、写 analysis/design/plan、跑 execution。你的主要职责是在 `pending_acceptance` 阶段做验收——这一步只有你能做。
- **T3 改动会停下来等你确认设计。** 涉及架构或核心的改动，AI 在动手前必须拿到你对 design 的明确确认，别急着催它写代码。
- **想纯问问题，别让它建提案。** 表述成"解释一下…/这块逻辑是怎么…"这类 T0 问题，AI 会直接回答不走流程。
- **改大了就该回退。** 执行中若发现目标/范围/方案有重大变化，正确做法是 `back --to design` 重新对齐，而不是硬着头皮往下做。
- **规范库是项目知识的沉淀点。** `.vflow/spec/` 存放本项目的编码规范与领域知识（坐标系、数据格式、物理参数等）。随任务积累，可回写沉淀；升级时用 `update --spec` 单独同步。
- **session 运行时只是提示，不是真相。** 提案的阶段以 `proposal.json` 为唯一权威，`runtime/sessions/` 只是 hint，永远不会覆盖提案数据。
- **hook 报错不致命。** 若注入 hook 失败，AI 会收到降级提示并被引导手动诊断（多半是 node 路径/cwd/编码问题），不会中断你的会话。
- **升级 vflow 后记得 `update`。** 全局 `npm i -g @p1lab/vflow` 升级后，到各项目里跑 `vflow update .` 把托管资产同步到新版（你的提案和 config 不受影响）。

---

## 从源码构建

```bash
npm install
npm run build        # 构建项目模板里的 TypeScript 引擎（dist）
```

测试：

```bash
npm --prefix src/template_vflow/scripts test
```

打包发布：

```bash
npm pack                       # 生成 tgz（prepack 会自动重建模板 dist）
npm publish --access public
```

---

## License

MIT
