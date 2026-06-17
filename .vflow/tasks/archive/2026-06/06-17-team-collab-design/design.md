# 设计（SWE.2 架构 + SWE.3 详细设计）

## 架构影响（SWE.2）

本任务为纯设计分析，不涉及代码改动。交付物为融合架构设计文档，指导后续多个实施任务。

## 方案概述

基于 maestro-flow Team Lite 的"零基础设施、纯 Git、advisory 模式"方案，设计 vflow 团队协同层。核心思路：在 `.vflow/` 下新增 `collab/` 目录，通过 Git 身份派生 uid、JSONL 活动总线、per-member 文件隔离来实现团队协同，同时保持对单人模式的完全向后兼容。

## 改动清单

| 文件 | 改动类型 | 说明 |
| :--- | :--- | :--- |
| design.md（本文） | 新建 | 融合架构设计文档，为本任务主交付物 |

## 关联规范（实现与审查按此定向加载）

| spec 文件 | 适用理由 |
| :--- | :--- |
| spec/common/general.md | 设计文档遵循简洁原则 |
| spec/common/structure.md | 数据模型设计参考结构规范 |

## 关键设计决策（ADR-lite）

### ADR-1: 团队模式作为可选层，非默认行为

- **Context**: vflow 定位是"单人 + AI 结对"也能用的轻量工具，不能因为加团队功能而让单人场景变复杂
- **Decision**: 团队功能通过 `vflow collab join` 显式启用，未 join 的项目行为完全不变。config.json 新增 `team.enabled` 字段，默认 false
- **Consequences**: 需要在每个团队功能入口做 team mode 检查；hook 在非团队模式下静默退出

### ADR-2: Git email 作为唯一身份源

- **Context**: maestro-flow 用 git email local-part 作为 uid，零注册成本
- **Decision**: 沿用此方案。`uid = git config user.email` 的 local-part 小写化，冲突时追加 `-2`、`-3`
- **Consequences**: 要求团队成员 git email 配置正确；同一人多机器用相同 email 则共享 uid（通过 host 字段区分）

### ADR-3: 活动日志用 JSONL + union merge

- **Context**: 多人并行写同一文件必然冲突。maestro-flow 用 JSONL 追加 + `.gitattributes merge=union` 解决
- **Decision**: 采用相同方案。活动日志路径 `.vflow/collab/activity.jsonl`，10MB 自动轮转
- **Consequences**: union merge 可能产生重复行（可容忍，读取时去重）；需要配套 `.gitattributes`

### ADR-4: Advisory 模式（警告不阻塞）

- **Context**: 严格锁定在 Git 分布式环境下实现成本极高且影响开发流畅度
- **Decision**: 冲突检测和命名空间守卫均为 advisory——发现问题时警告，不阻塞操作
- **Consequences**: 团队需要基本的沟通习惯配合；极端情况下两人可能同时改同一任务

### ADR-5: vflow 任务系统保持独立，collab task 作为轻量补充

- **Context**: vflow 已有完整的 6-state task pipeline（task.json + requirement/design/worklog/verify），maestro-flow 有独立的 collab task 系统。两者定位不同。
- **Decision**: 不合并两套任务系统。vflow task.json 扩展 owner/claimed_by 字段用于标识任务归属；collab task 仅用于团队间轻量任务分配（bug 反馈、code review 请求等不走完整 pipeline 的场景）
- **Consequences**: 团队成员需理解两层任务的区别；vflow task 是重型开发流程，collab task 是轻量协调

## 测试方案（必填）

本任务为设计分析，无代码交付。验证方式为文档审查——检查每个 R-ID 对应的分析/设计章节是否完整、可操作。

| 用例 | 验证什么 | 位置 |
| :--- | :--- | :--- |
| 文档完整性检查 | 6 个 R-ID 全部有对应章节 | design.md 各章节 |
| Schema 可用性检查 | JSON schema 有字段说明和示例 | R3 对应章节 |
| 兼容性论证检查 | 与 6-state pipeline 兼容性有明确说明 | R4 对应章节 |

## 任务清单（SWE.3，实现阶段逐项勾选）

- [x] 1.1 撰写 maestro-flow Team Lite 模块适用性评估表（≥8 模块） (R1)
- [x] 1.2 撰写 vflow 四维度差距分析（数据模型、状态管理、hook、spec） (R2)
- [x] 2.1 设计成员注册 schema（member.json） (R3)
- [x] 2.2 设计 task.json 扩展字段（owner/claimed_by/reviewer） (R3)
- [x] 2.3 设计活动日志 JSONL 格式（ActivityEvent schema） (R3)
- [x] 3.1 设计 CLI 命令接口（join/status/sync/preflight + 扩展命令） (R4)
- [x] 3.2 设计 hook 集成方案并论证与 6-state pipeline 兼容性 (R4)
- [x] 4.1 设计 spec 三层加载方案 (R5)
- [x] 4.2 设计 spec writeback review 机制 (R5)
- [x] 5.1 输出 P0/P1/P2 路线图（交付物、工作量、验收标准） (R6)

---

# 附录：融合架构设计文档（主交付物）

## A. maestro-flow Team Lite 模块适用性评估（R1）

| # | 模块 | maestro-flow 实现 | vflow 适用性 | 理由 |
| :-- | :--- | :--- | :--- | :--- |
| 1 | **成员注册** (members) | git email → uid，per-member JSON 文件，role 区分 admin/member | ✅ 直接适用 | 零注册成本，与 vflow"clone 即可用"理念完全一致。per-member 文件消灭 merge conflict |
| 2 | **活动日志** (activity) | JSONL 追加写入，union merge，60s 去重，10MB 轮转 | ✅ 直接适用 | 追加写入 + union merge 是 Git 环境下多人并发写日志的最优解 |
| 3 | **冲突预警** (preflight) | 扫活动日志最近 500 条，同 phase 不同 user 则警告 | 🔧 需改造 | maestro-flow 按 phase（阶段）检测；vflow 需改为按 task slug 检测（"同一任务是否有其他人在做"） |
| 4 | **一键同步** (sync) | stash → pull --rebase → pop → push，快速路径跳过无变更场景 | 🔧 需改造 | 核心算法直接适用，但需去掉 maestro 特有的 overlay import 步骤，简化为纯 Git sync |
| 5 | **任务认领** (task assign) | 独立的 collab task 系统，TASK-NNN 自增 ID，6 状态流转 | 🔧 需改造 | vflow 已有 6-state pipeline，不需要第二套任务系统。改为：vflow task.json 加 owner 字段 + claim/release 命令 |
| 6 | **命名空间守卫** (namespace guard) | advisory 模式，检测文件写入是否越界，警告不阻塞 | ⏳ 不适用（P2） | vflow 当前没有 per-member 文件划分场景，守卫规则无从定义。待团队模式成熟后再考虑 |
| 7 | **Spec 三层加载** (spec-loader) | baseline → team → personal，按 category 过滤，hook 自动注入 | 🔧 需改造 | vflow 已有 spec/ 加载（inject.mjs），需扩展为三层但保持现有加载逻辑不变 |
| 8 | **通知适配器** (adapters) | 钉钉/Slack/Linear/GitHub webhook，fire-and-forget | ⏳ 不适用（P2） | 属于锦上添花，核心协同能力优先。可作为 P2 扩展 |
| 9 | **Overlay 系统** (overlays) | per-member 命令扩展包，sync 时自动导入 | ❌ 不适用 | vflow 的 skill 系统已覆盖此需求（.agents/skills/），不需要额外的 overlay 机制 |
| 10 | **团队状态面板** (status --team) | 扫活动日志，按用户分组显示最近操作 | ✅ 直接适用 | 实现简单（tail JSONL + 分组），团队可见性的最小可行方案 |
| 11 | **活动日志轮转** (rotation) | 按文件大小（10MB）自动归档，ISO week 命名 | ✅ 直接适用 | 防止日志文件无限膨胀，算法简单可靠 |
| 12 | **Check Log** (task check) | 任务的 confirmed/rejected/commented 追踪 | 🔧 需改造 | vflow 的 verify.md 已有 review 记录功能，将 check log 融入现有 Gate 审批流程 |

**统计**: 直接适用 4 / 需改造 5 / 不适用（含延后）3

## B. vflow 四维度差距分析（R2）

### B.1 数据模型差距

| 维度 | vflow 现状 | 目标能力 | 差距 |
| :--- | :--- | :--- | :--- |
| **task.json 身份** | 无 owner/assignee/reviewer 字段 | 知道"谁在做这个任务" | 需新增 owner、claimed_at、reviewer 字段 |
| **config.json 团队** | 无团队相关配置 | 团队模式开关、成员配置 | 需新增 `team` 配置块 |
| **成员数据** | 不存在 | per-member 身份文件 | 需新建 `.vflow/collab/members/{uid}.json` |
| **活动数据** | 不存在 | 追加式活动日志 | 需新建 `.vflow/collab/activity.jsonl` |

### B.2 状态管理差距

| 维度 | vflow 现状 | 目标能力 | 差距 |
| :--- | :--- | :--- | :--- |
| **活跃任务** | `.vflow/.runtime/current-task` 单值文件 | 多人各自有活跃任务 | 需改为 per-member 指针：`.vflow/.runtime/current-task-{uid}` 或将指针移入 member 文件 |
| **任务并行** | 同一时刻只能有 1 个活跃任务 | 多人同时各做各的任务 | current-task 改为 per-uid 后自然解决 |
| **任务目录** | `.vflow/tasks/{slug}/` 无所有权标识 | 目录名或元数据标识归属 | task.json 加 owner 字段即可，不需改目录结构 |

### B.3 Hook 系统差距

| 维度 | vflow 现状 | 目标能力 | 差距 |
| :--- | :--- | :--- | :--- |
| **SessionStart** | inject.mjs 注入 vflow-state | 额外注入团队上下文（谁在做什么） | inject.mjs 需在团队模式下追加 `<vflow-team>` 块 |
| **UserPromptSubmit** | inject.mjs 注入 vflow-state | 同上 + 活动心跳记录 | 需新增活动上报逻辑（或独立 hook） |
| **PostToolUse** | 不存在 | 活动心跳（每次工具调用后上报） | 需新增 team-monitor hook |
| **hook 性能** | inject.mjs 约 50-100ms | 加团队逻辑后不能显著变慢 | 活动上报必须 fire-and-forget，不阻塞主流程 |

### B.4 Spec 管理差距

| 维度 | vflow 现状 | 目标能力 | 差距 |
| :--- | :--- | :--- | :--- |
| **加载层级** | 仅项目级 `.vflow/spec/` | 项目级 → 团队级 → 个人级 | 需新增 `.vflow/collab/specs/`（团队）和 `.vflow/collab/specs/{uid}/`（个人） |
| **Writeback** | vflow-spec skill 直接写入 `spec/` | 团队 spec 变更需 review | 需要 spec writeback 走 staging → review → merge 流程 |
| **Spec 冲突** | 不存在（单人写） | 多人可能同时 writeback | per-uid spec 目录避免冲突；团队级 spec 用 delta 机制 |

## C. 团队协同数据模型设计（R3）

### C.1 成员注册 Schema — `.vflow/collab/members/{uid}.json`

```json
{
  "uid": "alice",
  "name": "Alice Lee",
  "email": "alice@example.com",
  "host": "alice-laptop",
  "role": "admin",
  "joinedAt": "2026-06-17T10:00:00",
  "projectRoles": ["frontend", "reviewer"]
}
```

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| uid | string | ✅ | git email local-part 小写化，冲突追加 `-N` |
| name | string | ✅ | `git config user.name` |
| email | string | ✅ | `git config user.email` |
| host | string | ✅ | `os.hostname()`，区分同一用户的多台机器 |
| role | "admin" \| "member" | ✅ | 首个 join 的成员为 admin |
| joinedAt | string (ISO 8601) | ✅ | 加入时间 |
| projectRoles | string[] | ❌ | 项目角色标签（frontend/backend/reviewer 等） |

**UID 派生算法**:
1. 读取 `git config user.email` → 取 `@` 前部分 → 小写化
2. 扫描 `collab/members/` 已有文件，若 uid 已存在且 email 不匹配 → 追加 `-2`、`-3` ...
3. 若 uid 已存在且 email 匹配 → 视为同一用户（幂等），更新 host/name

### C.2 task.json 扩展字段

在现有 task.json 基础上新增团队字段（**仅在团队模式下填充**，单人模式不受影响）：

```json
{
  "id": "06-17-team-collab-design",
  "title": "分析 maestro-flow 团队协同方案",
  "tier": "T2",
  "state": "implementing",
  "risk": "low",
  "created": "2026-06-17T15:49:41",

  "owner": "alice",
  "claimed_at": "2026-06-17T15:50:00",
  "reviewer": "bob"
}
```

| 新增字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| owner | string \| null | ❌ | 任务所有者 uid。`task.mjs create` 时若团队模式启用则自动填入当前 uid |
| claimed_at | string \| null | ❌ | 认领时间。与 owner 同时设置 |
| reviewer | string \| null | ❌ | 审查者 uid。高风险任务在 Gate 2/3 时可指定 |

**向后兼容**: 这三个字段均为可选，`task.mjs` 的所有现有逻辑不依赖它们。未启用团队模式时这些字段不存在。

**current-task 改造**: `.vflow/.runtime/current-task` 改为 `.vflow/.runtime/current-task-{uid}`。`task.mjs` 读取时：
- 若团队模式启用 → 读取 `current-task-{selfUid}`
- 若未启用 → 向后兼容，读取 `current-task`（无 uid 后缀）

### C.3 活动日志 JSONL Schema — `.vflow/collab/activity.jsonl`

```jsonl
{"ts":"2026-06-17T10:23:00","user":"alice","host":"alice-laptop","action":"advance","task":"06-17-feature-x","state":"implementing"}
{"ts":"2026-06-17T10:24:15","user":"bob","host":"bob-pc","action":"create","task":"06-17-bugfix-y","state":"created"}
{"ts":"2026-06-17T10:30:00","user":"alice","host":"alice-laptop","action":"tool","task":"06-17-feature-x","state":"implementing"}
```

| 字段 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| ts | string (ISO 8601) | ✅ | 事件时间（本地时间） |
| user | string | ✅ | 操作者 uid |
| host | string | ✅ | 机器标识，区分同一用户多设备 |
| action | string | ✅ | 操作类型：create/advance/back/done/tool/sync/claim/release |
| task | string \| null | ❌ | 关联任务 slug（无活跃任务时为 null） |
| state | string \| null | ❌ | 任务当前状态（方便快速显示不用再读 task.json） |

**写入时机**:
- `task.mjs create/advance/back/done` 执行成功后追加一行
- PostToolUse hook 每 60s 追加一行心跳（去重窗口）
- `vflow collab sync` 执行后追加一行

**轮转策略**: 文件超过 10MB 时归档到 `.vflow/collab/activity-archives/activity-{YYYY}W{WW}.jsonl`

**Git 配置**: `.gitattributes` 添加：
```
.vflow/collab/activity.jsonl merge=union
.vflow/collab/members/*.json merge=union
```

### C.4 config.json 扩展

```json
{
  "project": "my-project",
  "enabled": true,
  "initialized": true,
  "team": {
    "enabled": false,
    "adapters": {}
  }
}
```

| 新增字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| team.enabled | boolean | 团队模式开关，`vflow collab join` 时设为 true |
| team.adapters | object | 通知适配器配置（P2 扩展） |

### C.5 目录结构总览

```
.vflow/
├── config.json                    # 项目配置（新增 team 块）
├── collab/                        # [NEW] 团队协同层
│   ├── members/                   # per-member 身份文件
│   │   ├── alice.json
│   │   └── bob.json
│   ├── activity.jsonl             # 追加式活动日志
│   ├── activity-archives/         # 轮转归档
│   ├── specs/                     # 团队级 spec（shared）
│   │   ├── team-conventions.md    # 团队共享规范
│   │   ├── alice/                 # Alice 的个人 spec overlay
│   │   └── bob/                   # Bob 的个人 spec overlay
│   └── staging/                   # spec writeback 暂存区
│       └── alice-{hash}.md        # 待 review 的 spec 变更
├── .runtime/
│   ├── current-task-alice         # [改造] per-uid 活跃任务指针
│   └── current-task-bob
├── tasks/                         # 现有任务目录（不变）
├── spec/                          # 项目级 spec（不变，作为 baseline）
├── scripts/
│   ├── task.mjs                   # 现有状态机（扩展团队字段）
│   ├── inject.mjs                 # 现有注入脚本（扩展团队上下文）
│   └── collab.mjs                 # [NEW] 团队协同脚本
└── skills/                        # 现有 skills（不变）
```

## D. CLI 命令接口与 Hook 集成设计（R4）

### D.1 CLI 命令接口

所有团队命令统一前缀 `vflow collab`，通过新增 `collab.mjs` 脚本实现：

| 命令 | 用途 | 退出码 | 优先级 |
| :--- | :--- | :--- | :--- |
| `node .vflow/scripts/collab.mjs join [--role admin\|member]` | 注册 git 身份为团队成员（幂等） | 0 成功 / 1 错误 | P0 |
| `node .vflow/scripts/collab.mjs whoami` | 显示当前成员信息 | 0 / 1 | P0 |
| `node .vflow/scripts/collab.mjs status [--window N]` | 显示最近 N 分钟团队活动（默认 30 分钟） | 0 / 1 | P0 |
| `node .vflow/scripts/collab.mjs preflight [--task <slug>]` | 检测指定任务是否有其他人在做 | 0 无冲突 / 1 有冲突 | P0 |
| `node .vflow/scripts/collab.mjs sync [--dry-run]` | 一键同步：stash → pull --rebase → pop → push | 0-5 见下文 | P0 |
| `node .vflow/scripts/collab.mjs claim <slug>` | 认领任务（设置 task.json owner） | 0 / 1 | P1 |
| `node .vflow/scripts/collab.mjs release <slug>` | 释放任务认领 | 0 / 1 | P1 |

**sync 退出码**:
- 0: 成功
- 1: 团队模式未启用
- 2: detached HEAD 或 rebase 失败
- 3: push 被拒（重试后仍失败）
- 4: stash pop 冲突
- 5: detached HEAD

### D.2 与 Claude Code 集成

团队命令通过两种方式在 Claude Code 中触发：

1. **Skill 方式**（推荐）：新建 `.agents/skills/vflow-collab/SKILL.md`，用户输入 `/vflow:collab join` 等
2. **inject.mjs 集成**：团队状态注入到每个对话 turn

### D.3 Hook 集成方案

#### 现有 hook 扩展（inject.mjs）

inject.mjs 的 `prompt` 模式在输出 `<vflow-state>` 后，如果团队模式启用，追加 `<vflow-team>` 块：

```xml
<vflow-team>
Active members (last 30 min):
- alice@alice-laptop: implementing 06-17-feature-x (advance 3 min ago)
- bob@bob-pc: designing 06-17-bugfix-y (tool 1 min ago)

Conflict alert: none
</vflow-team>
```

实现方式：inject.mjs 读取 `collab/activity.jsonl` 最近 500 行，按 user 分组，取最新事件。耗时预计 < 20ms（纯文件 I/O + JSON parse）。

#### 新增 hook：team-monitor（PostToolUse）

```json
{
  "PostToolUse": [{
    "hooks": [{
      "type": "command",
      "command": "cd \"$CLAUDE_PROJECT_DIR\" && node .vflow/scripts/collab.mjs heartbeat --silent"
    }]
  }]
}
```

heartbeat 逻辑：
1. 检查团队模式是否启用 → 否则静默退出
2. 读取当前 uid 和活跃任务
3. 60s 去重窗口（session 级 temp 文件）：同一 (uid, action) 60s 内只写一次
4. 追加一行到 activity.jsonl
5. 永不 throw（fire-and-forget）

#### 现有 hook 中追加活动上报

`task.mjs` 的 create/advance/back/done 命令执行成功后，直接调用活动上报函数（不需要额外 hook）：

```javascript
// task.mjs 新增
function reportActivity(action, taskSlug, state) {
  if (!isTeamMode()) return;
  const self = resolveSelf();
  if (!self) return;
  appendJsonl(ACTIVITY_PATH, {
    ts: isoNow(),
    user: self.uid,
    host: self.host,
    action,
    task: taskSlug,
    state,
  });
}
```

### D.4 与 6-state Pipeline 兼容性论证

| Pipeline 节点 | 团队模式影响 | 兼容性说明 |
| :--- | :--- | :--- |
| **task.mjs create** | 自动设置 owner=selfUid，写入 `current-task-{uid}` | 现有逻辑无变化，仅新增字段和文件路径分支 |
| **task.mjs advance** | 上报活动日志 | advance 的机械检查逻辑完全不变（R-ID 链、checklist、测试执行） |
| **task.mjs back** | 上报活动日志 | 回退逻辑不变 |
| **task.mjs done** | 上报活动日志，归档路径不变 | archive 移动逻辑不变 |
| **Gate 1/2/3** | 审批者可在 task.json reviewer 字段指定 | Gate 逻辑不变（仍由当前 Claude Code 用户确认） |
| **R-ID 追溯链** | 不影响 | R-ID 是文档层面的机械检查，与团队身份无关 |
| **mtime 交叉校验** | 不影响 | 校验的是文件修改时间 vs verified_at，与 owner 无关 |
| **inject.mjs** | 追加 `<vflow-team>` 块 | 现有 `<vflow-state>` 注入完全保留 |

**结论**: 团队功能是 **纯增量层**，不修改任何现有 pipeline 逻辑。开关关闭时所有代码路径与当前完全一致。

## E. Spec 多层加载与 Writeback Review（R5）

### E.1 三层加载方案

```
优先级（低 → 高）:
  Layer 1: .vflow/spec/           → 项目级 baseline（现有，不变）
  Layer 2: .vflow/collab/specs/   → 团队级 shared（团队共识规范）
  Layer 3: .vflow/collab/specs/{uid}/ → 个人级 override（个人偏好）
```

**加载规则**:
- 同名文件高层覆盖低层（整文件替换，不合并）
- 不同名文件全部加载（累加）
- inject.mjs 读取 spec 时按 Layer 1 → 2 → 3 顺序加载，后加载的同名文件替换先加载的
- 非团队模式：仅加载 Layer 1（现有行为不变）

**示例**:
```
.vflow/spec/common/naming.md          → Layer 1 baseline
.vflow/collab/specs/naming.md          → Layer 2 覆盖（团队认为需要更严格的命名规范）
.vflow/collab/specs/alice/naming.md    → Layer 3 覆盖（Alice 个人偏好）
```

Alice 的会话加载 Layer 3 版本；Bob 的会话（无个人 override）加载 Layer 2 版本。

### E.2 Spec Writeback Review 机制

**问题**: 当前 vflow-spec skill 在任务完成时直接写入 `spec/`，单人 AI 可能污染团队规范。

**解决方案**: Staging → Review → Merge 三步流程

#### Step 1: Staging（自动）
vflow-spec skill 在 writeback 时，如果团队模式启用：
- 不再直接写入 `spec/`
- 而是写入 `.vflow/collab/staging/{uid}-{hash}.md`，含 YAML frontmatter：

```yaml
---
author: alice
target: spec/common/error-handling.md
action: append  # append | replace | new
created: 2026-06-17T15:00:00
summary: "新增异常处理规范：捕获后必须记录日志"
---

## S12: 异常日志记录

捕获异常后必须调用日志记录，禁止空 catch。
```

#### Step 2: Review（团队成员）
- `vflow collab status` 显示待 review 的 staging 文件数量
- 团队成员可在 Claude Code 中查看 staging 内容，通过 `/vflow:spec review` 命令：
  - approve → 合并到目标 spec 文件
  - reject → 删除 staging 文件
  - comment → 标注需修改，等待作者更新

#### Step 3: Merge（自动）
- approved 的 staging 文件自动合并到目标 spec 文件
- 合并后删除 staging 文件
- 记录一条活动日志：`{"action": "spec-merge", "target": "spec/common/error-handling.md"}`

**降级模式**: 如果团队只有 1 人，或用户嫌麻烦，可配置 `team.spec_review: false` 跳过 staging 直接写入（与当前行为一致）。

### E.3 个人 Spec 管理

个人 spec 目录 `.vflow/collab/specs/{uid}/` 由成员自行管理：
- 仅影响该成员自己的 Claude Code 会话
- 不需要 review（个人偏好）
- 用于覆盖团队规范中不适合自己的规则

## F. 分阶段实施路线图（R6）

### P0: 最小可用团队功能（1-2 周，3 个实施任务）

| # | 交付物 | 涉及文件 | 工作量 | 验收标准 |
| :-- | :--- | :--- | :--- | :--- |
| P0.1 | collab.mjs（join/whoami/status/preflight/sync） | 新建 `.vflow/scripts/collab.mjs` | 3 天 | 两人 join 后能看到对方状态；preflight 能检测冲突 |
| P0.2 | task.mjs 扩展（owner 字段 + per-uid current-task） | 修改 `task.mjs` | 2 天 | create 自动设 owner；status 显示 owner；current-task 按 uid 隔离 |
| P0.3 | inject.mjs 扩展（`<vflow-team>` 注入 + heartbeat hook） | 修改 `inject.mjs`，新建 hook 配置 | 2 天 | 每个 turn 显示团队状态；PostToolUse 心跳写入 activity.jsonl |

**P0 完成标志**: 两个开发者在同一项目中各自创建任务、推进 pipeline，能看到彼此的状态和活跃任务，preflight 能警告任务冲突。

### P1: 规范协同与任务管理（2-4 周，4 个实施任务）

| # | 交付物 | 涉及文件 | 工作量 | 验收标准 |
| :-- | :--- | :--- | :--- | :--- |
| P1.1 | spec 三层加载 | 修改 `inject.mjs` 的 spec 加载逻辑 | 2 天 | 个人 spec 覆盖团队 spec 覆盖项目 spec |
| P1.2 | spec writeback staging + review | 修改 vflow-spec skill，新建 review 命令 | 3 天 | writeback 进入 staging；approve 后合并；reject 后删除 |
| P1.3 | claim/release 命令 | 扩展 `collab.mjs` | 1 天 | 能认领和释放任务 |
| P1.4 | vflow-collab skill + onboard skill | 新建 `.agents/skills/vflow-collab/SKILL.md` | 2 天 | Claude Code 中 `/vflow:collab` 触发团队命令 |

**P1 完成标志**: spec 变更走 review 流程，新成员有 onboarding 入口，任务可以认领/释放。

### P2: 增强体验（4+ 周，可选）

| # | 交付物 | 说明 | 优先级 |
| :-- | :--- | :--- | :--- |
| P2.1 | 通知适配器（钉钉/Slack） | 任务状态变更推送 | 中 |
| P2.2 | 命名空间守卫 | advisory 模式文件写入检测 | 低 |
| P2.3 | vflow daily 自动汇总 | 每日 archive + active 摘要 | 中 |
| P2.4 | archive 全文搜索 | `vflow search` 跨 archive 搜索 | 高 |
| P2.5 | milestone 层 | milestone.json + task 挂载 | 中 |

## 风险与审批

- 风险级别：low（理由：纯设计文档，不涉及代码改动，不影响现有功能）
- 审批记录：
