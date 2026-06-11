# vflow

轻量级 AI 研发工作流（Claude Code）：任务分级 + 档案留痕 + 规范驱动 + 测试硬规则。

> 本仓库只包含通用工作流框架与基础规范模板。项目个性化的规范回写、任务档案随各项目自己的 git 管理，不回流本仓库。

## 安装（新设备一条命令）

```bash
pip install git+https://<你的git地址>/vflow.git
```

或本地开发安装：

```bash
git clone <仓库地址> && cd vflow && pip install -e .
```

## 使用

```bash
vflow init D:\path\to\project      # 装入项目（交互式配置）
vflow update D:\path\to\project    # 升级框架（保留任务档案/配置/规范回写）
vflow update D:\path\to\project --spec   # 连规范库一起覆盖（慎用）
vflow status D:\path\to\project    # 查看状态
```

装好后打开 Claude Code：

| 入口 | 用法 |
| :--- | :--- |
| 直接对话 | 说需求即可，hook 自动判级分流 |
| `/vflow:go <需求>` | 显式智能入口（不知道用什么时就用它） |
| `/vflow:task` `/vflow:quick` | 强制标准流程 / 快速通道 |
| `/vflow:init` | AI 扫描项目自动探测配置（构建系统/core_paths/特性） |
| `/vflow:commit` | 智能提交：分类改动→中文提交信息→一次确认 |
| `/vflow:context` | 状态总览：当前任务/档案/历史/日志 |

## 内容

- `src/vflow/cli.py` — 安装器（受管文件覆盖 / 用户数据保留 / settings.json 智能合并）
- `src/vflow/template_vflow/` — `.vflow/` 载荷：workflow.md、规范库、脚本、产物模板
- `src/vflow/template_claude/` — `.claude/` 载荷：5 个 Skill + 2 个命令 + hooks
- `INSTALL.md` — 手工安装说明（无 pip 环境的备用方案）

## 发布新版本

改模板 → 提交推送 → 各设备 `pip install --upgrade git+<地址>` → 各项目 `vflow update <路径>`。
