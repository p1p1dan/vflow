---
name: vflow-task
description: vflow 标准任务（T2）五阶段全流程编排：需求澄清→方案设计→实现→质量自检→归档。当任务判级为 T2、用户使用 /task 命令、或 vflow-state 指示进入标准任务流程时使用。
---

# vflow 标准任务流程

按五阶段执行标准任务，产出完整任务档案。所有决策留痕，所有完成有证据。

## Input 契约

- 用户的任务描述（已判级为 T2）
- 当前 <vflow-state> 注入的状态与任务信息
- `.vflow/config.json`（features 过滤规范、core_paths 判风险、build 命令）

## Steps

1. **建档**：`python .vflow/scripts/task.py create <slug> --title "<标题>"`（slug 用英文短横线，如 roundness-algo）
2. **需求澄清**（phase=requirement）：
   - 一次只问一个问题，根据回答追问，直到需求明确
   - 结论写入任务目录 `requirement.md`（已按模板预置，填空即可）
   - 完成后 `python .vflow/scripts/task.py set phase plan`
3. **方案设计**（phase=plan）：
   - 草稿先在对话中完整展示（含改动清单、关键决策、**测试方案**）
   - 风险判定：涉及 core_paths / >3 文件 / 不可逆操作 = high，否则 low；执行 `task.py set risk {low|high}`
   - 低风险：声明"低风险，将直接继续" → 落盘 plan.md → 第 4 步
   - 高风险：🛑 输出"高风险任务，请确认方案（回复 ok/可以/行 继续）"并停止；得到确认才落盘 plan.md（含审批记录）→ 第 4 步
4. **实现**（`python .vflow/scripts/task.py start`）：
   - 写码前读取 spec/ 中与本任务相关主题的正文（按 config features 过滤）
   - 每完成一个文件的改动，向 worklog.md 追加一行
   - 测试硬规则：无测试目录 → 先用 vflow-test 建骨架；新增类/公共接口 → 同步写测试用例
5. **质量自检**（`task.py set phase verify`）：
   - 调用 vflow-review 流程自检，结果写入 verify.md
   - 运行 config.build 的构建与测试命令，**真实输出**粘贴进 verify.md
   - 高风险：🛑 展示自检报告，等用户确认
6. **归档**：`python .vflow/scripts/task.py done --summary "<一句话产出，含新增测试数>"`

## Output 模板

阶段转换时用一行明示进度：
「✅ 阶段完成：{需求澄清|方案设计|实现|自检}。下一步：{...}」

归档后输出：
「📦 任务已归档：tasks/archive/YYYY-MM/<id>/，日志已记录。产出：{摘要}」

## Guardrails

- 高风险任务未获确认前禁止写实现代码
- verify.md 没有真实命令输出时禁止执行 done
- 实现中发现方案需要调整 → 先告知用户并更新 plan.md，再继续
- 任何阶段用户说「直接改」→ 尊重逃生短语，但测试硬规则和规范仍然有效
- 禁止把注入的 <vflow-state>/<vflow-context> 内容复制进产物文件
