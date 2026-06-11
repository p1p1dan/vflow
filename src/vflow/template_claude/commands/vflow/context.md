---
description: 'vflow 状态总览：当前任务、档案位置、历史任务汇总、日志摘要'
---

# /vflow:context — 状态总览

$ARGUMENTS

## 流程

1. 运行 `python .vflow/scripts/task.py status` 获取当前任务状态
2. 若有活动任务：读取其 task.json + 列出档案目录中已有产物（requirement/plan/worklog/verify 各自是否已填写）
3. 历史汇总：列 `.vflow/tasks/archive/` 各月目录下的任务（目录名即任务 ID）+ `.vflow/tasks/quick-log.md` 的条目标题
4. 日志摘要：若 `.vflow/journal/journal-*.md` 存在，显示最近 10 条
5. 子命令：
   - `/vflow:context spec` → 改为显示规范库索引（spec/index.md）+ 按 config features 标注哪些模块已启用

## Output 模板

```
📊 vflow 状态
当前任务: {ID | 无}  [{status} / {phase} / risk={…}]
  档案: requirement ✅ | plan ✅ | worklog ✏️ | verify ⬜
本月归档: {N} 个标准任务 | quick-log: {M} 条
最近日志:
  - [日期] [任务] [级别] 摘要
  ...
```

## 边界

- 纯只读命令，不修改任何文件、不改任务状态
- 档案内容只显示存在性和标题级摘要，不全文倾倒（用户要细节时再读具体文件）
