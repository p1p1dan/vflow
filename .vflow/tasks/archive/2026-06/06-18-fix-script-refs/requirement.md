# 需求分析（SWE.1）

## 原始需求

用户报告 vflow 在使用过程中出现两个问题：
1. AI 没有严格遵守 6-state pipeline 纪律，跳过 analyzed/designed 阶段直接写代码
2. 调用 `python .vflow/scripts/task.py` 持续报错 "can't open file"，因为部署的脚本是 `task.mjs`（Node.js），不是 `task.py`

用户补充：直接不用 Python 版本，统一到 Node.js，避免安装方式不同导致问题再次出现。

## 澄清问答

| # | 问题 | 用户回答 |
| :-- | :--- | :--- |
| 1 | cli.py 是否也需要改为安装 .mjs？ | 是，直接不用 python 版本 |

## 验收条目（R-ID，机械校验锚点）

- R1: 所有活跃文档中的 `python .vflow/scripts/task.py` 和 `task.py` 引用替换为 `node .vflow/scripts/task.mjs` / `task.mjs`；`inject.py` 同理替换为 `inject.mjs`（归档文件不改）
- R2: src/vflow/ 下的模板文件和 cli.py 安装逻辑同步修复（MANAGED_VFLOW、hook 命令、smoke_test、do_status），测试文件适配
- R3: task.mjs 内部的错误提示信息中的 `task.py` 引用更新为 `task.mjs`
- R4: workflow.md 的 [workflow-state] 块中增加更明确的阶段约束措辞，阻止 AI 跳过阶段
- R5: 修复后 `node .vflow/scripts/task.mjs status` 正常执行，grep 验证无残留引用，pytest 测试通过

## 范围边界

- 范围内：活跃文档的 .py→.mjs 引用修复；cli.py 安装器改用 .mjs；模板同步；task.mjs 内部消息修复；workflow 纪律加强；测试适配
- 范围外：归档文件不改；template_vflow/scripts/task.py 和 inject.py 保留（Python 版本源码参考）
