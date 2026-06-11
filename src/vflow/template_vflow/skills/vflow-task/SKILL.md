---
name: vflow-task
description: "vflow standard task (T2) five-stage workflow: requirement clarification → design → implementation → quality check → archive. Use when task is classified as T2, user invokes /vflow:task, or vflow-state directs standard task flow."
---

# vflow Standard Task Workflow

Execute a standard task through five stages, producing a complete task archive.
All decisions are recorded. All completions have evidence.

## Input Contract

- User's task description (classified as T2)
- Current <vflow-state> injection with state and task info
- `.vflow/config.json` (features filter specs, core_paths determine risk, build commands)

## Steps

### 1. Create Task [required·once]
`python .vflow/scripts/task.py create <slug> --title "<title>"`
(slug: lowercase English with dashes, e.g. roundness-algo)

### 2. Requirement Clarification (phase=requirement) [required·once]
- Ask one question at a time; follow up based on answers until requirements are clear
- Write conclusions to `requirement.md` in the task directory (template is pre-populated, fill in the blanks)
- When done: `python .vflow/scripts/task.py set phase plan`

### 3. Design (phase=plan) [required·once]
- Show the full draft in conversation (change list, key decisions in ADR-lite form — Context/Decision/Consequences, **test plan**, and the spec manifest: which spec/ files implementation and review must read, with reasons)
- Risk determination: touches core_paths / >3 files / irreversible operation = high, else low
- Run: `python .vflow/scripts/task.py set risk {low|high}`
- Low risk: state "Low risk, proceeding directly" → write plan.md → step 4
- High risk: 🛑 STOP. Output "High-risk task. Please confirm the plan (reply ok/confirm/可以/行 to proceed)". Wait for user confirmation → write plan.md (include approval record) → step 4

### 4. Implementation [required·repeatable]
Run: `python .vflow/scripts/task.py start`

NOTE: `task.py start` validates that requirement.md and plan.md are filled with real content.
If validation fails: complete the planning documents first.
If the user explicitly wants to skip planning: use `task.py start --skip` (records planning_skipped in task.json).

- Right after `task.py start`, mirror the plan.md task checklist into Claude's task list (TaskCreate, one task per checklist item) so progress is visible in the task panel
- Before coding, read the spec files listed in plan.md's spec manifest (关联规范); if the manifest is missing, select spec/ files by topic filtered by config features
- Implement items from plan.md task checklist one by one: check `[x]` after each item, append a line to worklog.md, and mark the matching Claude task completed (TaskUpdate). plan.md is the source of truth; the task list is the live progress view
- When resuming across sessions, continue from the first unchecked item and rebuild the Claude task list from unchecked items
- If the user changes scope during implementation, update plan.md checklist BEFORE coding the change (and sync the Claude task list to match)
- Test hard rule (exempt if config.test_required=false): no test dir → create with vflow-test; new class/public interface → write test cases

### 5. Quality Check (phase=verify) [required·once]
Run: `python .vflow/scripts/task.py set phase verify`

- Execute vflow-review flow (**high-risk tasks must use independent review mode**: dispatch a fresh-context sub-agent)
- Write results to verify.md
- Run config.build commands, **paste real output** into verify.md
- High risk: 🛑 STOP. Show review report, wait for user confirmation

### 5.5 Spec Accumulation [required·once]
Before archiving, review worklog.md for new insights:
- New conventions, patterns, forbidden practices, or gotchas discovered during this task
- If any found → trigger vflow-spec flow (draft entry → user confirmation → write to spec/)
- If nothing new → skip silently

### 6. Archive [required·once]
Verify all plan.md checklist items are checked (or user-confirmed scope reduction is noted).

Run: `python .vflow/scripts/task.py done --summary "<one-line outcome including new test count>"`

NOTE: `task.py done` validates verify.md is filled and plan.md has no unchecked items.
Use `--force` only if the user explicitly confirms bypassing checks.

## Output Templates

Stage transitions — state progress in one line:
"✅ Phase complete: {Requirement|Design|Implementation|Review}. Next: {…}"

After archival:
"📦 Task archived: tasks/archive/YYYY-MM/<id>/. Output: {summary}"

## Guardrails

- High-risk tasks: no implementation code before user confirmation
- Cannot run `task.py done` without real command output in verify.md
- Plan deviation during implementation → inform user and update plan.md first
- Skip Detection Rule (from workflow.md): only explicit skip phrases bypass planning. Implementation strategy phrases ("use goal mode", "fix file by file") are NOT skip signals.
- Do not copy injected <vflow-state>/<vflow-context> content into deliverable files
