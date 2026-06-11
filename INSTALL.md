# vflow 安装说明

> vflow：轻量级 AI 研发工作流（任务分级 + 档案留痕 + 规范驱动 + 测试硬规则）
> 环境要求：Claude Code + Python 3.8+（Windows/Linux/macOS 均可）

## 安装步骤（装入一个项目约 3 分钟）

1. **拷贝目录**：把本模板的 `.vflow/` 和 `.claude/` 两个目录复制到目标项目根目录
   - 项目已有 `.claude/settings.json` 时：手工合并 hooks 段，不要直接覆盖
2. **装入规范库**：把 `vflow-spec-v0.1/` 的内容复制为 `<项目>/.vflow/spec/`
3. **填写配置** `.vflow/config.json`：
   - `project`：项目名
   - `features`：按项目实际开关 `qt` / `embedded` / `binding`
   - `build.command` / `build.test_command`：构建与测试命令（测试骨架建好后再填 test_command 也可以）
   - `core_paths`：核心模块路径列表（触发高风险双审批门），如 `["src/algorithm/"]`
   - `journal.notebook_path`：可选，填工作笔记目录（如 `E:/dy/notebook`）则归档时同步追加日志，供 /zb 周报汇总
4. **追加 .gitignore**：
   ```
   .vflow/journal/
   .vflow/.runtime/
   ```
5. **验证**：项目根目录运行
   ```
   python .vflow/scripts/task.py status        # 应输出: [vflow] 无活动任务 (no_task)
   python .vflow/scripts/inject.py session     # 应输出项目上下文+规范索引
   ```
   然后开新 Claude Code 会话，确认能看到 `<vflow-context>` 注入。

## 日常使用

- 直接说需求 → AI 自动判级并明示（「📋 判级：T2 标准任务…」）
- `/task <描述>` 强制标准流程；`/quick <描述>` 强制快速流程
- 说「直接改」跳过流程（规范与测试硬规则仍有效）
- 任务档案：`.vflow/tasks/`（进 git，归档于 archive/YYYY-MM/）
- 个人日志：`.vflow/journal/`（本地）

## 目录结构

```
.vflow/
├── workflow.md        # 流程定义（改流程=改这个文件）
├── config.json        # 项目配置
├── spec/              # 规范库（common/ + lang/ + modules/）
├── templates/         # 产物模板（requirement/plan/verify/quick-entry）
├── tasks/             # 任务档案 + quick-log.md + archive/
├── journal/           # 开发者日志（gitignore）
└── scripts/           # task.py（状态管理）+ inject.py（hook 注入）
.claude/
├── settings.json      # hooks 注册
├── skills/            # vflow-task/quick/review/test/spec
└── commands/          # /task /quick
```

## 故障排查

- 看不到注入 → 确认 `python` 在 PATH 中；hooks 的 cwd 是项目根目录，脚本用相对路径
- 中文乱码 → 脚本已强制 UTF-8 输出；确认规范文件均为 UTF-8 编码
- 状态不对 → 状态只由 task.py 写入；手工修复可编辑当前任务的 task.json 或删除 `.vflow/.runtime/current-task`
