---
name: vflow-quick
description: vflow 快速任务（T1）流程：单文件小改、低风险任务直接做并在 quick-log.md 留痕。当任务判级为 T1 或用户使用 /quick 命令时使用。
---

# vflow 快速任务流程

低摩擦完成小任务，一节流水记录留痕，不建任务目录。

## Input 契约

- 用户的任务描述（已判级为 T1：单文件、低风险、意图明确）
- `.vflow/config.json`（build 命令）

## Steps

1. 意图确认：如有歧义，问一个问题澄清；无歧义直接做
2. 实现：写码前如涉及规范敏感点（命名/错误处理/内存），快速对照 spec/ 对应条目
3. 测试硬规则（config.test_required=false 时豁免）：改动了代码逻辑 → 对应测试用例同步更新/新增；纯注释/文档/格式改动豁免（需在记录中写明豁免理由）
4. 验证：运行构建（和相关测试），保留真实输出
5. 留痕：按 `.vflow/templates/quick-entry.md` 模板向 `.vflow/tasks/quick-log.md` **顶部**（标题行之下）插入一节

## Output 模板

完成后输出：
「⚡ 快速任务完成：{改动摘要}。已记录至 quick-log.md。验证：{构建/测试结果一行}」

## Guardrails

- 做的过程中发现实际要改 >3 个文件或触及 core_paths → 停下声明"任务超出 T1 范围，建议升级为标准任务"，征求用户意见
- 不允许因为是"快速任务"而跳过验证
- quick-log 记录不可省略——这是 T1 的唯一留痕
