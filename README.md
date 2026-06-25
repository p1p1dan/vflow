# vflow

轻量级 AI 研发工作流引擎（Claude Code）：任务分级 + 步进执行 + 档案留痕 + 规范驱动 + 文档强制校验。

## 安装

**前置条件**：Node.js >= 18

```bash
npm install -g @p1lab/vflow
```

> 国内镜像：`npm install -g @p1lab/vflow --registry=https://registry.npmmirror.com`

升级：

```bash
npm update -g @p1lab/vflow
```

## 快速开始

### 1. 初始化项目

```bash
cd <你的项目目录>
vflow init .
```

这会在项目中创建 `.vflow/` 和 `.claude/` 目录（工作流配置、hooks、skills）。

### 2. 启动 Claude Code

打开 Claude Code，首次进入会自动触发 `/vflow:init`——AI 扫描项目，探测构建系统、语言、核心路径，写入配置。确认后即可使用。

### 3. 开始工作

直接用自然语言描述需求，vflow 自动判级分流：

```
你: "给登录接口加上 rate limiting"
vflow: 📋 Tier: T2 Standard (reason: 新功能, 跨文件, risk: low). 创建任务...
       → 自动生成执行步骤 → 按步推进 → 文档校验 → 知识回写
```

## 任务分级

| 级别 | 场景 | 流程 |
| :--- | :--- | :--- |
| **T0 Q&A** | 解释、比较、问答，不改代码 | 直接回答，无流程 |
| **T1 Quick** | 单文件小改，低风险 | 极简：改代码 → 验证 → 记录一行 |
| **T2 Standard** | 新功能、跨文件、核心模块 | 完整：需求分析 → 设计 → 实现 → 验证 → 知识回写 |

## 对话内命令

| 命令 | 说明 |
| :--- | :--- |
| `/vflow:go <需求>` | 智能入口：描述需求，自动判级执行 |
| `/vflow:task <描述>` | 强制走 T2 标准流程 |
| `/vflow:quick <描述>` | 强制走 T1 快速通道 |
| `/vflow:init` | 项目配置探测（首次使用时自动触发） |
| `/vflow:commit` | 智能提交：分类改动 → 中文提交信息 → 确认 |
| `/vflow:context` | 查看当前任务状态、档案历史、日志 |

## 步进执行引擎（v0.10.0+）

T2 任务由 ralph 步进引擎驱动，每步有明确的输入、输出和完成校验：

```
task.js next      → 加载当前步骤 + 注入所需文件内容
AI 执行步骤       → 按步骤指令工作
task.js complete N → 机械性校验文档是否更新，通过才进下一步
```

**步骤序列**（T2 标准流程）：

```
plan_req → gate_req → plan_design → implement → verify → gate_accept → spec_writeback
   ↑          ↑           ↑            ↑          ↑         ↑              ↑
 填需求    用户确认    填设计方案    写代码+记录  跑测试   用户确认      知识回写
```

**文档强制校验**——不更新文档不给进下一步：

| 步骤 | 校验项 |
| :--- | :--- |
| 需求分析 | task-spec.md §2 必须有 R-ID |
| 设计 | task-spec.md §6 必须有 checklist，且覆盖全部 R-ID |
| 实现 | ledger.md §1 必须有实施记录 |
| 验证 | ledger.md §4 必须逐条闭环所有 R-ID |
| 知识回写 | knowledge.md 必须有新增内容 |

### CLI 命令

```bash
# 任务管理
vflow init <路径> [--yes]        # 项目启用
vflow update <路径> [--spec]     # 升级项目受管文件
vflow decline <路径>             # 标记不启用
vflow status [路径]              # 查看任务状态

# 步进执行（在项目目录下）
node .vflow/scripts/dist/task.js create <slug> --title "标题"   # 创建任务
node .vflow/scripts/dist/task.js next                            # 加载下一步
node .vflow/scripts/dist/task.js complete <N> --status DONE      # 标记步骤完成
node .vflow/scripts/dist/task.js advance                         # 推进任务状态
node .vflow/scripts/dist/task.js status                          # 查看任务状态
node .vflow/scripts/dist/task.js done --summary "完成摘要"       # 归档任务
```

## 不装也能用

项目启用 vflow 后，`.vflow/` + `.claude/` 随 git 提交。同事 clone 后打开 Claude Code **直接可用**——只需 Node.js >= 18。

## 目录结构

```
<项目>/
├── .vflow/                    # 工作流引擎
│   ├── config.json            # 项目配置（语言、构建、特性）
│   ├── workflow.md            # 状态机定义
│   ├── knowledge.md           # 项目知识库（init 探测 + 任务回写累积）
│   ├── graphs/                # 执行图定义（t2-standard.json）
│   ├── scripts/               # TypeScript 脚本（task.ts, inject.ts 等）
│   ├── skills/                # 工作流 skills（task/quick/review/test/spec 等）
│   ├── spec/                  # 规范库（编码约定、领域知识）
│   └── tasks/                 # 任务档案
└── .claude/
    ├── commands/vflow/        # /vflow:* 命令定义
    ├── skills/                # Claude Code skills（execute/go/brainstorm/context-save/codex-review 等）
    └── settings.json          # hooks 配置（自动注入工作流上下文）
```

## 团队协同（v0.8.0+）

基于 Git 的零基础设施协同，advisory 模式：

```bash
node .vflow/scripts/dist/collab.js join      # 加入团队
node .vflow/scripts/dist/collab.js status    # 查看团队状态
node .vflow/scripts/dist/collab.js claim <slug>   # 认领任务
node .vflow/scripts/dist/collab.js release <slug>  # 释放任务
```

## 多会话隔离（v0.11.0+）

开多个终端窗口并发工作时，每个 Claude Code 会话自动绑定**自己的**活跃任务，互不串台——
终端 A 创建任务 X、终端 B 创建任务 Y，各自的 `status` / `advance` / `done` 只作用于本会话绑定的任务。

- **零配置**：复用 Claude Code 原生 `session_id`，无需手动指定
- **向后兼容**：单终端行为完全不变；无 session 信息的环境（如子代理）自动降级到全局指针
- **归档即清理**：任务归档时自动清除对应会话绑定，不留悬挂状态

## License

MIT
