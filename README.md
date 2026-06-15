# vflow

轻量级 AI 研发工作流（Claude Code）：任务分级 + 档案留痕 + 规范驱动 + 测试硬规则。

> 本仓库只包含通用工作流框架与基础规范模板。项目个性化的规范回写、任务档案随各项目自己的 git 管理，不回流本仓库。

## 三种上车方式

**方式一：pip 安装（推荐发起人/新项目）**

```bash
# GitHub（外网）
pip install git+https://github.com/p1p1dan/vflow.git

# 公司内网 GitLab
pip install git+https://192.168.12.109/Dan/vflow.git

cd <项目目录>
vflow init .
```

> pypi 访问受限时先配镜像：`pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/`

然后启动（或重启）Claude Code → 运行 `/vflow:init` 让 AI 探测项目配置（构建系统/语言/特性），完成后即可正常使用。

**方式二：公司内部 AI Client（v0.2.58+）**

直接启动 Claude 运行会话即可，Client 已集成 vflow。

**方式三：什么都不装（同事/换设备）**

项目启用 vflow 后，全部资产（`.vflow/` + `.claude/`）随项目 git 提交。同事 clone 仓库、打开 Claude Code **直接可用**——只需要电脑上有 Python。

## 对话内使用

| 入口 | 用法 |
| :--- | :--- |
| 直接对话 | 说需求即可，自动判级分流（T0 问答 / T1 快速 / T2 标准） |
| `/vflow:go <需求>` | 显式智能入口（不知道用什么时就用它） |
| `/vflow:task` `/vflow:quick` | 强制标准流程 / 快速通道 |
| `/vflow:init` | 启用项目 + AI 探测配置（构建系统/core_paths/特性） |
| `/vflow:commit` | 智能提交：分类改动→中文提交信息→一次确认 |
| `/vflow:context` | 状态总览：当前任务/档案/历史/日志 |

## 架构（混合式：项目为主，全局为辅）

```
<项目>/（项目资产 = 主体，随 git，clone 即得）
├── .vflow/                  # workflow.md 状态机 + config + spec 规范库 + tasks 档案
│   └── skills/              # 9 个技能（task/quick/review/test/spec/brainstorm/debug/meta/think）
└── .claude/                 # 6 个 /vflow:* 命令 + 项目 hooks（相对路径，零环境依赖）

~/.claude/（全局资产 = 发现与启用层，仅装了 vflow 的人有）
├── vflow/detect.py          # 会话检测：未启用项目→询问一次 / 已拒绝→静默 / 已启用→让位项目 hooks
├── commands/vflow/init.md   # 全局 /vflow:init 入口（拒绝后改主意时可用）
└── settings.json            # 全局 hooks（智能合并，保留原有配置）
```

## CLI 命令

```bash
vflow init <路径> [--yes]    # 项目启用（--yes 静默默认配置）；首次运行自动完成全局 setup
vflow update <路径> [--spec] # 升级项目受管文件（保留档案/配置/规范回写）
vflow decline <路径>         # 标记不启用，不再询问
vflow status [路径]          # 查看任务状态
vflow setup                  # 手动刷新全局资产（一般不需要，init/update 自动触发）
```

## 升级

```bash
# GitHub（外网）
pip install --upgrade git+https://github.com/p1p1dan/vflow.git

# 公司内网 GitLab
pip install --upgrade git+https://192.168.12.109/Dan/vflow.git

# 全局资产自动刷新（下次运行任意 vflow 命令时）；各项目执行 vflow update <路径>
```
