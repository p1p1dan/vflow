# 设计（SWE.2 架构 + SWE.3 详细设计）

## 架构影响（SWE.2）

新增团队协同层 `.vflow/collab/`，扩展 task.mjs（per-uid 指针）和 inject.mjs（团队上下文注入 + spec 三层加载）。核心变更：current-task 指针从全局单值变为 per-uid 文件，团队模式开关由 config.json `team.enabled` 控制，关闭时所有代码路径与当前完全一致。

## 方案概述

基于已归档的设计文档（`06-17-team-collab-design/design.md`）实施完整 P0+P1+P2 团队协同功能。新建 `collab.mjs` 处理团队命令（join/whoami/status/preflight/sync/claim/release），扩展 `task.mjs` 支持 owner 字段和 per-uid 指针，扩展 `inject.mjs` 添加 `<vflow-team>` 注入块和 spec 三层加载，新建 `vflow-collab` skill。P2 范围内包含 archive 全文搜索和 daily 汇总。

## 改动清单

| 文件 | 改动类型 | 说明 |
| :--- | :--- | :--- |
| src/vflow/template_vflow/scripts/collab.mjs | 新建 | 团队协同脚本：join/whoami/status/preflight/sync/claim/release/heartbeat/search/daily |
| src/vflow/template_vflow/scripts/task.mjs | 修改 | owner 字段、per-uid current-task 指针、活动上报 |
| src/vflow/template_vflow/scripts/inject.mjs | 修改 | `<vflow-team>` 注入块、spec 三层加载、writeback staging |
| src/vflow/template_vflow/workflow.md | 修改 | no_task 状态添加团队感知提示 |
| .claude/skills/vflow-collab/SKILL.md | 新建 | 团队协同 skill |
| tests/test_collab.py | 新建 | collab.mjs 命令测试 |
| tests/test_team_task.py | 新建 | task.mjs 团队扩展测试 |
| tests/test_team_inject.py | 新建 | inject.mjs 团队注入 + spec 三层加载测试 |

## 关联规范（实现与审查按此定向加载）

| spec 文件 | 适用理由 |
| :--- | :--- |
| spec/common/general.md | 简洁原则、模块化设计 |
| spec/common/structure.md | 数据模型结构规范 |
| spec/common/error-handling.md | CLI 退出码和错误处理 |

## 关键设计决策（ADR-lite）

### ADR-1: per-uid 指针向后兼容策略

- **Context**: 现有 `current-task` 是全局单文件，团队模式需要 per-uid 隔离
- **Decision**: team.enabled=true 时读写 `current-task-{uid}`，false 时读写 `current-task`（原逻辑）。resolveSelf() 函数统一处理 uid 派生
- **Consequences**: task.mjs 的 currentTaskDir() 需要分支；单人模式零开销

### ADR-2: 活动日志 fire-and-forget

- **Context**: inject.mjs 每 turn 执行，不能因活动日志 I/O 阻塞
- **Decision**: 活动上报函数 catch all errors，JSONL 追加写入，60s 去重窗口
- **Consequences**: 极端情况下可能丢失心跳记录（可容忍）

### ADR-3: spec 三层覆盖用整文件替换

- **Context**: 多层 spec 合并可以是行级或文件级
- **Decision**: 同名文件高层整文件替换低层，不做行级合并
- **Consequences**: 简单可预测；个人 spec 需完整重写而非增量修改

## 测试方案（必填）

测试范围：`pytest tests/test_collab.py tests/test_team_task.py tests/test_team_inject.py`

| 用例 | 验证什么 | 位置 |
| :--- | :--- | :--- |
| test_collab_join_whoami | join 创建 member 文件，whoami 显示信息 | test_collab.py |
| test_collab_status | status 显示活跃成员和最近活动 | test_collab.py |
| test_collab_preflight | preflight 检测任务冲突 | test_collab.py |
| test_collab_sync_dry_run | sync --dry-run 不实际执行 push | test_collab.py |
| test_collab_claim_release | claim 设置 owner，release 清除 | test_collab.py |
| test_task_owner_on_create | 团队模式 create 自动设 owner | test_team_task.py |
| test_task_per_uid_pointer | per-uid current-task 文件隔离 | test_team_task.py |
| test_task_activity_report | state 变更写入 activity.jsonl | test_team_task.py |
| test_inject_team_block | 团队模式 prompt 注入 `<vflow-team>` | test_team_inject.py |
| test_inject_spec_three_layer | 三层 spec 加载覆盖正确 | test_team_inject.py |
| test_inject_no_team_clean | 非团队模式无额外输出 | test_team_inject.py |
| test_spec_writeback_staging | writeback 进入 staging 暂存区 | test_team_inject.py |
| test_search_archive | archive 全文搜索返回匹配结果 | test_collab.py |

## 任务清单（SWE.3，实现阶段逐项勾选）

### P0: 基础团队功能

- [x] 1.1 config.json 模板添加 team 配置块（team.enabled=false, team.adapters={}） (R8)
- [x] 1.2 collab.mjs 框架：CLI 解析、resolveSelf()（git email→uid）、isTeamMode()、appendActivity() (R1,R8)
- [x] 1.3 collab.mjs join 命令：创建 member JSON + 设置 config team.enabled=true + .gitattributes (R1)
- [x] 1.4 collab.mjs whoami 命令：显示当前成员信息 (R1)
- [x] 1.5 collab.mjs status 命令：扫描 activity.jsonl 按用户分组显示最近活动 (R1)
- [x] 1.6 collab.mjs preflight 命令：检测指定任务是否有其他人在做 (R1)
- [x] 1.7 collab.mjs sync 命令：stash→pull --rebase→pop→push 一键同步 (R1)
- [x] 2.1 task.mjs 扩展：create 时团队模式自动设 owner 字段 (R2)
- [x] 2.2 task.mjs 扩展：currentTaskDir() 改为 per-uid 指针（team 模式用 current-task-{uid}） (R2)
- [x] 2.3 task.mjs 扩展：state 变更成功后调用 appendActivity() 上报 (R2)
- [x] 3.1 inject.mjs 扩展：doPrompt() 团队模式追加 `<vflow-team>` 块 (R3)
- [x] 3.2 inject.mjs 扩展：doSession() 团队模式追加团队上下文 (R3)
- [x] 3.3 heartbeat 命令：collab.mjs heartbeat --silent（PostToolUse hook 用） (R3)

### P1: 规范协同与任务管理

- [x] 4.1 inject.mjs spec 三层加载：项目级→团队级→个人级，同名文件高层覆盖 (R4)
- [x] 4.2 collab.mjs staging 命令：spec writeback 写入 staging 暂存区 (R5)
- [x] 4.3 collab.mjs review 命令：approve/reject staging 中的 spec 变更 (R5)
- [x] 5.1 collab.mjs claim/release 命令：认领和释放任务 (R6)
- [x] 5.2 vflow-collab skill：创建 .claude/skills/vflow-collab/SKILL.md (R7)

### P2: 增强体验

- [x] 6.1 collab.mjs search 命令：archive 全文搜索 (R1)
- [x] 6.2 collab.mjs daily 命令：自动汇总当日活动 (R1)

### 测试与同步

- [x] 7.1 编写 test_collab.py 测试 collab.mjs 核心命令 (R1,R6)
- [x] 7.2 编写 test_team_task.py 测试 task.mjs 团队扩展 (R2)
- [x] 7.3 编写 test_team_inject.py 测试团队注入和 spec 三层加载 (R3,R4,R5)
- [x] 7.4 同步模板到 .vflow/ 运行时目录 (R1,R2,R3,R4,R5,R6,R7,R8)

## 风险与审批

- 风险级别：high（理由：触及 core_paths src/vflow，修改 task.mjs/inject.mjs 核心接口，预计改动 >8 个文件）
- 审批记录：
