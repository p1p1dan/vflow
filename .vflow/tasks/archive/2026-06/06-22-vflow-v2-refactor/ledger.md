# Ledger

## §1 实施记录

- ralph-schema.ts: Step/StepLoad/CompletionStatus 类型定义
- ralph-store.ts: task.json steps[] 读写 + active_step_index 管理
- steps-builder.ts: 从 t2-standard.json 生成线性 steps 序列
- t2-standard.json: 节点增加 skill_ref/required_reading/completion_checks
- task.ts: cmdCreate 集成 steps-builder + next/complete 子命令路由
- ralph-skill-loader.ts: 加载 skill 文件 + @path 引用解析 + 内联文件内容
- cmd-next.ts: 定位 pending step → 加载 skill + required_reading → stdout
- cmd-complete.ts: 校验 active_step_index → 状态转换 → 清除 active_step_index
- ralph-checker.ts: 按 step 类型做文档校验
- vflow-execute SKILL.md: 自调用循环 skill
- vflow-go SKILL.md: 任务创建后触发 vflow-execute
- inject.ts: ralph session 上下文注入

## §4 验证结果

- R1: 已实现 `task.js next` 和 `task.js complete N --status <S>`，支持 DONE/DONE_WITH_CONCERNS/NEEDS_RETRY/BLOCKED 四种状态
- R2: task.json 已扩展 steps[] 数组，含 index/skill/status/completion_confirmed 等字段，active_step_index 保证单步执行
- R3: steps-builder.ts 从 t2-standard.json 遍历图自动生成线性 steps 序列
- R4: vflow-execute SKILL.md 实现自调用循环：next → 执行 → complete → 自调用
- R5: required_reading 在 t2-standard.json 节点中定义，cmd-next 自动读取并内联文件内容
- R6: ralph-checker.ts 按 step 类型做文档校验，校验不通过拒绝完成
- R7: vflow:init 探测阶段写入 knowledge.md，spec_writeback 节点含校验规则
