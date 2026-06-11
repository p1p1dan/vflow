# vflow 工作流定义

> 本文件是 vflow 的单一语义中心：分级规则、各状态行为约束、审批门规则都在这里定义。
> inject.py 按当前任务状态提取对应 [workflow-state:*] 块注入每轮对话。
> 修改流程行为 = 修改本文件文本，无需改代码。

## 任务分级总表

| 级别 | 判定标准 | 流程 | 档案 |
| :--- | :--- | :--- | :--- |
| T0 问答 | 解释/比较/查询，不改代码 | 直接回答 | 无 |
| T1 快速 | 单文件小改、低风险、意图明确 | 直接做+记录 | tasks/quick-log.md 一节 |
| T2 标准 | 新功能/算法、跨文件、触及核心模块 | 五阶段完整流程 | tasks/MM-DD-slug/ 目录 |

## 风险判定（决定审批门数量）

高风险（满足任一）：改动涉及 config.json 的 core_paths｜预计改动 >3 个文件｜不可逆操作（删文件/改接口签名/改数据格式）
低风险：其余情况

[workflow-state:no_task]
当前无活动任务。收到用户消息后先判级，再行动：

1. 判级并用固定句式明示：
   「📋 判级：T{0|1|2} {问答|快速任务|标准任务}（理由：…）。{后续动作}」
2. T0 问答 → 直接回答，不建档，不输出判级句式（纯问答不打扰）
3. T1 快速 → 输出判级句式 → 按 .claude/skills/vflow-quick/SKILL.md 执行
4. T2 标准 → 输出判级句式 → 运行 `python .vflow/scripts/task.py create <slug> --title "<标题>"` → 按 .claude/skills/vflow-task/SKILL.md 执行

覆盖与纠正：
- 用户用 /vflow:task /vflow:quick 等命令指定级别时服从指令，不再自行判级
- 用户说「直接改」「skip」「跳过流程」→ 跳过一切流程内联处理，但仍遵守 spec/ 规范和测试硬规则
- 用户一句话即可改级（如"这个按快速处理"），立即切换不争辩

禁止：
- 未判级就开始改代码（T0 除外）
- 把"给出方案"当作任务完成
[/workflow-state:no_task]

[workflow-state:planning]
当前任务处于规划阶段（需求澄清 → 方案设计）。

必须：
1. 需求澄清：一次只问一个问题，问清为止；结论写入任务目录 requirement.md（按 .vflow/templates/requirement.md 模板）
2. 方案设计：草稿先在对话中展示；方案必须包含「测试方案」节（新增哪些用例、放哪个目录）
3. 风险判定并写入 task.json：`python .vflow/scripts/task.py set risk {low|high}`
4. 审批门 1（按风险自适应）：
   - 低风险 → 方案展示后说明"低风险，将直接继续"，落盘 plan.md 并执行 `task.py start` 进入实现
   - 高风险 → 🛑 停下，明示"高风险任务，请确认方案后才动代码（回复 ok/可以/行 继续）"；得到确认才落盘 plan.md 并 `task.py start`

禁止：
- 用户确认前写任何实现代码（高风险）
- 一个问题都没问就直接出方案（除非需求确实完整明确，需说明理由）
- 把 <context>/<rules> 等注入内容复制进产物文件
[/workflow-state:planning]

[workflow-state:in_progress]
当前任务处于实现阶段（实现 → 质量自检 → 归档）。

必须：
1. 写码前按任务涉及主题读取 .vflow/spec/ 对应规范正文（按 config.json features 过滤模块）
2. 按 plan.md 的「任务清单」逐项实现：完成一项立即勾选 `[x]` 并向 worklog.md 追加一行（改了哪些文件、为什么）；跨会话续做时从第一个未勾选项继续
3. 测试硬规则（领导要求，不可跳过）：
   - 项目无测试目录 → 先按 .claude/skills/vflow-test/SKILL.md 创建测试骨架
   - 新增类/公共接口 → 必须同步编写测试用例（正常路径+边界）
4. 质量自检：实现完成后按 .claude/skills/vflow-review/SKILL.md 自检，结果写入 verify.md（按模板）；verify.md 必须粘贴构建/测试的真实命令输出，禁止口头宣布通过
   - **高风险任务必须用独立评审模式**（派发全新上下文子代理评审，见 vflow-review 第 6 步）
5. 审批门 2（仅高风险）：🛑 自检报告展示后等用户确认才能归档
6. 归档前检查：任务清单仍有未勾选项 → 不得归档，先完成或与用户确认裁剪
7. 归档：`python .vflow/scripts/task.py done --summary "<一句话产出>"`

禁止：
- 跳过测试硬规则（仅纯注释/文档改动豁免）
- verify.md 无真实命令输出就宣布完成
- 任务清单有未勾选项时归档（除非用户确认裁剪并在 plan.md 注明）
- 实现偏离已确认方案却不告知用户
[/workflow-state:in_progress]
