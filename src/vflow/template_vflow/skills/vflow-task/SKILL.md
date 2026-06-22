---
name: vflow-task
description: "vflow standard task (T2): requirement → design → implement → verify → archive. Supports both v2 (task-spec.md + execution graph) and v1 (requirement.md + design.md) modes."
---

# vflow Standard Task Workflow

Execute a standard task through the pipeline, producing a complete task archive
with an R-ID trace chain closed end-to-end.

## Task Directory

Files are stored at `.vflow/tasks/<slug>/`. The current task name is in `.vflow/.runtime/current-task`.

**v2 mode** (new tasks with task-spec.md):
```
.vflow/tasks/<slug>/task-spec.md    # requirements + design + checklist
.vflow/tasks/<slug>/ledger.md       # worklog + verification + machine records
.vflow/tasks/<slug>/context.md      # cross-session context
.vflow/tasks/<slug>/task.json
```

**v1 mode** (legacy tasks with requirement.md):
```
.vflow/tasks/<slug>/requirement.md
.vflow/tasks/<slug>/design.md
.vflow/tasks/<slug>/worklog.md
.vflow/tasks/<slug>/verify.md
.vflow/tasks/<slug>/task.json
```

## Input Contract

- User's task description (classified as T2)
- Current <vflow-state> injection with state and task info
- `.vflow/config.json` (features, core_paths, test_command)

## Steps

### 1. Create Task [required·once]
`node .vflow/scripts/dist/task.js create <slug> --title "<title>"`
(slug: lowercase English with dashes)

### 2. Requirement Analysis (created → analyzed) [required·once]
- Explore context, ask gated questions (one at a time, AskUserQuestion preferred), converge
- Fill task-spec.md §1 (original request) and §2 (R-ID acceptance entries: `- R<n>: ...`, 3-8 entries covering edge conditions)
- **Gate 1**: show R-IDs, confirm requirement understanding with the user
- Run `node .vflow/scripts/dist/task.js advance`

### 3. Design (analyzed → designed) [required·once]
- Fill task-spec.md: §3 (design + ADR-lite decisions), §4 (change list), §5 (spec manifest), §6 (task checklist with R-ID tags: `- [ ] 1.1 ... (R1)`)
- Every R-ID from §2 must be covered in §6 or advance is rejected
- Set risk: `node .vflow/scripts/dist/task.js set risk {low|high}`
- **Gate 2 (high risk only)**: show design, wait for user confirmation
- Run `node .vflow/scripts/dist/task.js advance`

### 4. Implementation (designed → implementing) [required·repeatable]
Run `node .vflow/scripts/dist/task.js advance`, then:
- Read spec files from task-spec.md §5
- Implement items from §6 one by one: check `[x]`, append to ledger.md §1 — **log every changed file**
- Scope change → update task-spec.md §2 and §6 BEFORE implementing
- Test hard rule: no test dir → create scaffold; new class/interface → write tests

### 5. Machine Verification (implementing → verified) [required·once]
- Fill ledger.md §4: one `- R<n>: <result>` per R-ID
- Run `node .vflow/scripts/dist/task.js advance` — script executes tests; exit≠0 → rejected
- On failure: fix code, log in ledger.md §1, advance again

### 6. Review & Archive (verified → archived) [required·once]
- Spec accumulation: new conventions → write to spec/
- Fill ledger.md §3 (design writeback) if implementation diverged
- **Gate 3**: show verify report (R-ID closure + test summary), wait for confirmation
- Run `node .vflow/scripts/dist/task.js done --summary "<one-line outcome>"`

## Execution Graph (Optional)

For autonomous execution, the task can be driven by the t2-standard graph:
```bash
node .vflow/scripts/dist/coordinate.js run --graph t2-standard "task description" -y
```

## Output Templates

State transition: "✅ Station complete: {station}. Next: {…}"
After archival: "📦 Task archived: tasks/archive/YYYY-MM/<id>/. Output: {summary}"

## Guardrails

- High-risk tasks: no implementation before Gate 2 confirmation
- Never bypass advance checks unless user explicitly asks
- Never use `done --force` without explicit user confirmation
- Do not copy injected <vflow-state>/<vflow-context> content into deliverable files
