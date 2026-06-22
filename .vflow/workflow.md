# vflow Workflow Definition

> This file is the single semantic center of vflow: task classification rules,
> per-state behavioral constraints, and execution modes are all defined here.
> inject.ts extracts the matching [workflow-state:*] block based on current task
> state and injects it into each conversation turn.
> To change workflow behavior, edit this file — no code changes needed.

## Pipeline

```
created -> analyzed -> designed -> implementing -> verified -> archived
```

**v2 mode (task-spec.md)**: Tasks are driven by execution graphs (`.vflow/graphs/`).
The graph coordinator (`coordinate.ts`) handles step sequencing — the AI follows
the graph's command nodes instead of manual state management.

**v1 mode (requirement.md + design.md)**: Legacy 6-state pipeline with per-state
HARD STOPs. Task state moves via `node .vflow/scripts/dist/task.js advance`.

## Task Classification

| Tier | Criteria | Artifact thickness | Human gates |
| :--- | :--- | :--- | :--- |
| T0 Q&A | Explanation / comparison / query, no code changes | None (no task) | — |
| T1 Quick | Single-file small change, low risk, clear intent | Thin: 1-2 R-IDs, one-line sections | None (AI advances autonomously, report at end) |
| T2 Standard | New feature / algorithm, cross-file, touches core modules | Full: 3-8 R-IDs, complete sections | Gate 1 (requirement) + Gate 3 (acceptance); high risk adds Gate 2 (design) |

## Risk Determination (controls number of approval gates)

High risk (any one): change touches config.json core_paths | expected changes >3 files | irreversible operation (delete file / change interface signature / change data format)
Low risk: everything else

## Human Gates

| Risk | Gate 1 (after requirement) | Gate 2 (after design) | Gate 3 (before archive) |
| :--- | :--- | :--- | :--- |
| T1 | — | — | — (one-line report after archive) |
| T2 low | ✅ confirm R-IDs | — | ✅ confirm verify report |
| T2 high | ✅ | ✅ confirm design | ✅ |

Use AskUserQuestion for gate confirmations whenever possible.

## Skip Detection Rule

ONLY these exact user phrases constitute a skip signal:
  "skip" | "直接做" | "跳过" | "不用规划" | "不走流程"

### Anti-patterns (these are NOT skip signals)

- Implementation strategy: "use goal mode", "fix file by file", "start from XX"
- Urgency: "hurry", "快点", "赶紧做"
- Confirmation: "go ahead", "就这样做", "可以开始了"
- Scope refinement: "focus on XX first", "先做XX部分"

When uncertain whether the user means to skip: ASK.
Even when skipping ceremony (`advance --skip-check`), spec/ conventions and
the test hard rule still apply.

---

[workflow-state:no_task]
No active task. After receiving a user message, classify first, then act.

### Team Awareness
If a `<vflow-team>` block is present, team mode is active.
Before creating a task, run `node .vflow/scripts/dist/collab.js preflight --task <slug>` to check for conflicts.
After creating a task, run `node .vflow/scripts/dist/collab.js claim <slug>` to register ownership.

### Followup Awareness
If "Pending followup tasks" appears above, these are unfinished roadmap items from previous design tasks.
When the user's request relates to a pending followup, create the implementation task for it.
After the implementation task is archived, close the followup: `node .vflow/scripts/dist/task.js followup close <source> <id>`.

### Classification [required·once]
1. Classify and state explicitly using this fixed phrase:
   "📋 Tier: T{0|1|2} {Q&A|Quick|Standard} (reason: ...). {next action}"
2. T0 Q&A → answer directly, no archive, no tier output (pure Q&A, don't interrupt)
3. T1 Quick → output tier statement → run `node .vflow/scripts/dist/task.js create <slug> --title "<title>" --tier T1` → execute per .vflow/skills/vflow-quick/SKILL.md
4. T2 Standard → output tier statement → run `node .vflow/scripts/dist/task.js create <slug> --title "<title>"` → execute per .vflow/skills/vflow-task/SKILL.md

### Override and Correction
- When the user specifies a tier via /vflow:task or /vflow:quick, obey — do not re-classify
- When the user uses a skip phrase (see Skip Detection Rule above) → bypass workflow ceremony, but still follow spec/ conventions and test hard rules
- The user can change tier with a single phrase (e.g. "handle this as quick"), switch immediately without argument

### Prohibited
- Starting code changes before classification (T0 exempt)
- Treating "here's a proposed plan" as task completion
[/workflow-state:no_task]

[workflow-state:created]
Task created. Fill task-spec.md §1 (requirements) and §2 (R-ID acceptance entries).

### Requirement Analysis [required·once]
1. T2: explore context, ask gated questions (one at a time, AskUserQuestion preferred), converge. T1: skip questioning if intent is clear.
2. Fill task-spec.md §1 (original request) and §2 (R-ID acceptance entries: `- R<n>: ...`). T1: 1-2 R-IDs. T2: 3-8 R-IDs covering edge conditions.
3. Gate 1 (T2 only): show R-IDs, ask user to confirm requirement understanding (AskUserQuestion).
4. Run `node .vflow/scripts/dist/task.js advance` (validates task-spec.md §2 has at least one R-ID).

### Prohibited
- Writing ANY code (production or test) in this state
- Advancing with placeholder R-IDs
[/workflow-state:created]

[workflow-state:analyzed]
Requirement confirmed. Fill task-spec.md §3-§6 (design + task checklist).

### Design [required·once]
1. Fill task-spec.md: §3 design, §4 change list, §5 spec manifest, §6 task checklist.
2. Checklist items MUST carry trailing R-ID tags: `- [ ] 1.1 ... (R1)`. Every R-ID from §2 must be covered.
3. Set risk: `node .vflow/scripts/dist/task.js set risk {low|high}`
4. Gate 2 (high risk only): show design, wait for user confirmation before advancing.
5. Run `node .vflow/scripts/dist/task.js advance` (validates checklist + R-ID coverage).

### Prohibited
- Writing implementation code in this state
- Checklist items without R-ID tags
[/workflow-state:analyzed]

[workflow-state:designed]
Design confirmed. Run `node .vflow/scripts/dist/task.js advance` to enter implementation.
[/workflow-state:designed]

[workflow-state:implementing]
Implementation phase. Follow task-spec.md §6 checklist.

### Implementation [required·repeatable]
1. Read spec files listed in task-spec.md §5 (spec manifest).
2. Implement items from §6 one by one: check `[x]` after each, append to ledger.md §1.
3. On cross-session resume, continue from the first unchecked item in §6.

### Scope Change Handling
If the user changes scope: update task-spec.md §2 and §6 BEFORE implementing the change.

### Test Hard Rule
(Default: enabled. Exempt when config.json test_required=false)
- No test directory → create scaffold first
- New class / public interface → write test cases

### Verification [required·once]
When all checklist items are checked:
1. Fill ledger.md §4 (one `- R<n>: ...` result per R-ID).
2. Run `node .vflow/scripts/dist/task.js advance` — script executes tests mechanically.
3. If tests fail: fix code, log in ledger.md §1, advance again.

### Prohibited
- Skipping test hard rule
- Editing the machine execution record in ledger.md §5
[/workflow-state:implementing]

[workflow-state:verified]
Machine verification passed. Review and archive.

### Quality Review [required·once]
1. Spec accumulation: review ledger.md §1 for new conventions → if found, write to spec/.
2. Fill ledger.md §3 (design writeback) if implementation diverged from original design.

### Gate 3 [required·once]
T2: show verify report (R-ID closure + test summary), wait for user confirmation. T1: skip.

### Archive [required·once]
Run `node .vflow/scripts/dist/task.js done --summary "<one-line outcome>"`

### Prohibited
- Archiving without showing the verify report (T2)
- Using `done --force` without explicit user confirmation
[/workflow-state:verified]
