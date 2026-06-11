# vflow Workflow Definition

> This file is the single semantic center of vflow: task classification rules,
> per-state behavioral constraints, and approval gate rules are all defined here.
> inject.py extracts the matching [workflow-state:*] block based on current task
> status and injects it into each conversation turn.
> To change workflow behavior, edit this file — no code changes needed.

## Task Classification

| Tier | Criteria | Process | Archive |
| :--- | :--- | :--- | :--- |
| T0 Q&A | Explanation / comparison / query, no code changes | Direct answer | None |
| T1 Quick | Single-file small change, low risk, clear intent | Direct action + log | tasks/quick-log.md |
| T2 Standard | New feature / algorithm, cross-file, touches core modules | Full 5-stage workflow | tasks/MM-DD-slug/ |

## Risk Determination (controls number of approval gates)

High risk (any one): change touches config.json core_paths | expected changes >3 files | irreversible operation (delete file / change interface signature / change data format)
Low risk: everything else

## Skip Detection Rule

ONLY these exact user phrases constitute a skip signal:
  "skip" | "直接做" | "跳过" | "不用规划" | "不走流程"

### Anti-patterns (these are NOT skip signals)

- Implementation strategy: "use goal mode", "fix file by file", "start from XX"
- Urgency: "hurry", "快点", "赶紧做"
- Confirmation: "go ahead", "就这样做", "可以开始了"
- Scope refinement: "focus on XX first", "先做XX部分"

When uncertain whether the user means to skip: ASK
"Do you want to skip the planning phase and implement directly, or use this as an implementation strategy within the plan?"

---

[workflow-state:no_task]
No active task. After receiving a user message, classify first, then act.

### Classification [required·once]
1. Classify and state explicitly using this fixed phrase:
   "📋 Tier: T{0|1|2} {Q&A|Quick|Standard} (reason: ...). {next action}"
2. T0 Q&A → answer directly, no archive, no tier output (pure Q&A, don't interrupt)
3. T1 Quick → output tier statement → execute per .claude/skills/vflow-quick/SKILL.md
4. T2 Standard → output tier statement → run `python .vflow/scripts/task.py create <slug> --title "<title>"` → execute per .claude/skills/vflow-task/SKILL.md

### Override and Correction
- When the user specifies a tier via /vflow:task or /vflow:quick, obey — do not re-classify
- When the user uses a skip phrase (see Skip Detection Rule above) → bypass workflow ceremony, but still follow spec/ conventions and test hard rules
- The user can change tier with a single phrase (e.g. "handle this as quick"), switch immediately without argument

### Prohibited
- Starting code changes before classification (T0 exempt)
- Treating "here's a proposed plan" as task completion
[/workflow-state:no_task]

[workflow-state:planning]
Current task is in the planning phase (requirement clarification → design).

<!-- AI CRITICAL DIRECTIVE: DO NOT skip this phase unless the user uses an
     explicit skip phrase from the Skip Detection Rule. Implementation strategy
     instructions (e.g. "use goal mode", "fix file by file", "start from module X")
     are NOT skip signals — they are guidance for the plan/implementation approach. -->

### Requirement Clarification [required·once]
1. Ask one question at a time until requirements are clear
2. Write conclusions to requirement.md in the task directory (per .vflow/templates/requirement.md)

### Design [required·once]
3. Draft the design in conversation first (must include a **test plan** section; if config.test_required=false, state "test hard rule is disabled for this project")
4. Set risk: `python .vflow/scripts/task.py set risk {low|high}`

### Approval Gate 1 [required·once]
5. Low risk → state "Low risk, proceeding directly" → write plan.md → `task.py start`
6. High risk → 🛑 STOP. State "High-risk task. Please confirm the plan before implementation (reply ok/confirm/可以/行 to proceed)". Write plan.md and run `task.py start` ONLY after user confirmation.

NOTE: `task.py start` validates that requirement.md and plan.md are filled.
If validation fails, complete the documents first.
If the user explicitly wants to skip planning, use `task.py start --skip`.

### Prohibited
- Writing any implementation code before user confirmation (high risk)
- Producing a design without asking any questions (unless requirements are genuinely complete and unambiguous — state the reason)
- Copying injected <context>/<rules>/<vflow-state> content into deliverable files
[/workflow-state:planning]

[workflow-state:in_progress]
Current task is in the implementation phase (implement → quality check → archive).

### Implementation [required·repeatable]
1. Before coding, read the relevant .vflow/spec/ files for topics this task touches (filter modules by config.json features)
2. Implement items from plan.md task checklist one by one: check off `[x]` after completing each item and append a line to worklog.md (which files changed, why); when resuming across sessions, continue from the first unchecked item

### Scope Change Handling [required·continuous]
If the user changes scope or adds/removes requirements during implementation:
- Update plan.md checklist BEFORE implementing the change
- Note the scope change in worklog.md

### Test Hard Rule [required·continuous]
(Default: enabled. Exempt when config.json test_required=false — in that case, only suggest tests verbally)
3. No test directory in project → create test scaffold first per .claude/skills/vflow-test/SKILL.md
4. New class / public interface → must write test cases (happy path + edge cases)
5. User says "disable test requirement" → set config.json test_required to false, confirm, then stop enforcing

### Quality Check [required·once]
6. After implementation, run quality check per .claude/skills/vflow-review/SKILL.md, write results to verify.md (per template)
7. verify.md MUST contain real build/test command output — no verbal-only pass claims
8. **High-risk tasks must use independent review mode** (dispatch a fresh-context sub-agent for review; see vflow-review step 6)

### Approval Gate 2 (high risk only) [required·once]
9. 🛑 STOP. Show the review report, wait for user confirmation before archiving

### Execution Log [optional·continuous]
If config.execution_log is true, append one line to execution.log after each significant action:
- Key file reads (spec files, core source files — not every trivial read)
- File creation / modification
- Command execution (build, test, git)
- Test / build results
- Consequential decisions

Format: [YYYY-MM-DD HH:MM] ACTION target — brief outcome

Before marking the task complete, ensure execution.log is up to date if config.execution_log is true.

### Spec Accumulation [required·once]
10. Before archiving, review worklog.md for new conventions, patterns, forbidden practices, or gotchas discovered during this task. If any found → trigger vflow-spec flow (draft entry → user confirmation → write to spec/)

### Pre-Archive Checks [required·once]
11. Verify all plan.md checklist items are checked (or user-confirmed scope reduction is noted)
12. Archive: `python .vflow/scripts/task.py done --summary "<one-line outcome including new test count>"`

NOTE: `task.py done` validates that verify.md is filled and plan.md has no unchecked items.
Use `task.py done --force` only if the user explicitly confirms bypassing checks.

### Prohibited
- Skipping test hard rule (exempt only for: pure comment/doc changes, or config.test_required=false)
- Declaring completion without real command output in verify.md
- Archiving with unchecked plan items (unless user confirms scope reduction and it's noted in plan.md)
- Deviating from the confirmed plan without informing the user
[/workflow-state:in_progress]
