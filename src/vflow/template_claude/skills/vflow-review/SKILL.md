---
name: vflow-review
description: 按 vflow 规范库对代码改动做三维三级自检（完整性/正确性/一致性 × CRITICAL/WARNING/SUGGESTION）。标准任务自检阶段自动使用；用户也可随时说"按规范检查一下"独立调用。
---

# vflow 规范自检与评审

按 .vflow/spec/ 规范逐条对照本次改动，输出可操作的分级问题清单。

## Input 契约

- 评审范围：当前任务改动的文件（git diff 或 worklog.md 列出的文件）；独立调用时由用户指定
- `.vflow/spec/index.md` + 按 config.json features 过滤后的规范正文
- 任务档案（如有）：requirement.md / plan.md 用于核对完整性

## Steps

1. **确定范围**：列出本次改动的文件清单（优先 `git diff --name-only`，否则按 worklog.md）
2. **加载规范**：读 spec/index.md → 按改动涉及主题读取对应正文；按 features 排除未启用模块（如 qt:false 不查 Qt 条目）
3. **三维检查**：
   - 完整性：plan.md 的改动清单是否全部完成？测试方案承诺的用例是否都写了？
   - 正确性：实现是否符合 requirement.md 的验收标准？边界条件是否处理？
   - 一致性：逐条对照规范——违反【规】级 → CRITICAL（核心安全/资源类）或 WARNING（风格/结构类）；违反【建】级 → SUGGESTION
4. **置信度过滤**：只报告置信度高（确定违反、能指出具体条目）的问题；拿不准时降级（WARNING→SUGGESTION）或不报
5. **输出报告**（见模板），任务流程中同时写入 verify.md 的自检节

## Output 模板

```
## 规范自检报告

范围：N 个文件 | 启用规范：common + cpp [+ qt/embedded]

| 维度 | 结论 |
| 完整性 | ✅/⚠ {说明} |
| 正确性 | ✅/⚠ {说明} |
| 一致性 | {X CRITICAL / Y WARNING / Z SUGGESTION} |

### CRITICAL（必须修复）
- file.cpp:42 {问题} → {修复建议}（违反 cpp.md#57 基类虚析构）

### WARNING（应当修复）
...
### SUGGESTION（建议）
...
```

## Guardrails

- 每个问题必须给出 文件:行号 和违反的具体规范条目，禁止"建议整体review一下"式的模糊输出
- 不评审范围外的存量代码（除非用户明确要求）——遵循"新码从严、存量随旧"
- CRITICAL 存在时明确声明"不建议归档，先修复"
- 自己刚写的代码自己查出问题不丢人，漏报才是失职
