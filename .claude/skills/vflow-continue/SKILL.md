---
name: vflow-continue
description: "Resume work on the current vflow task. Reads recent git history and task state, determines which pipeline phase to resume at, and provides next-step guidance. Use when returning to work, the user says '继续', '恢复', '接着做', '上次做到哪', 'resume', 'continue', 'pick up where I left off', or starting a new session with an active task."
---

# vflow-continue — Resume Current Task

Resume work on the current vflow task — pick up at the right phase in the 6-state pipeline.

## Steps

### 1. Load Context [required·once]

Gather recent history and current state:

```bash
git log --oneline -10
```

```bash
node .vflow/scripts/task.mjs status
```

If no active task, also check for pending followups:
```bash
node .vflow/scripts/task.mjs followup list
```

If node version unavailable, fall back to:
```bash
python .vflow/scripts/task.py status
```

### 2. Route to Phase [required·once]

Based on task state, determine next action:

| State | Next Action |
| :--- | :--- |
| No active task (no pending followups) | Inform user project is idle, suggest starting with vflow-go |
| No active task (has pending followups) | Show pending followup tasks from `<vflow-context>` or `<vflow-state>` injection, suggest creating implementation task for the highest-priority item |
| created | Requirement analysis — load vflow-brainstorm, fill requirement.md with R-IDs |
| analyzed | Design phase — fill design.md (architecture, change list, checklist with R-ID tags) |
| designed | Begin implementation — `task.mjs advance` to enter implementing, read spec manifest from design.md |
| implementing | Resume coding — read design.md for unchecked items, read worklog.md for last logged change |
| verified | Review & archive — load vflow-review, fill verify.md review section, then `task.mjs done` |
| archived | Task complete — inform user, suggest new task |

### 3. Show Resume Point [required·once]

For **implementing** state (most common resume scenario):
1. Read design.md checklist — identify first unchecked `- [ ]` item
2. Read worklog.md — show last logged change with timestamp
3. Read verify.md — check if any R-IDs are already closed

For other states:
1. Show current state and what's expected next
2. Load the appropriate skill guidance for that phase

### 4. Begin Work [required·once]

After showing the resume point, immediately start executing the appropriate phase workflow. Don't wait for user to say "go ahead" — the user invoked continue because they want to work.

## Output Template

```
📍 Resume: {task-id} | {title}
State: {state} | Risk: {risk} | Tier: {tier}

Recent commits:
{git log --oneline -5}

Progress:
- Completed: {N}/{total} checklist items
- Last logged: {timestamp} {file} {change}
- Next: {first unchecked item description}

Resuming {phase description}...
```

## Hard Rules

1. Always read git log before task status — recent commits provide essential context
2. Never skip the routing step — always check task state, don't assume
3. For implementing state: read BOTH design.md and worklog.md before resuming
4. If task files are missing or corrupted, inform user and suggest recovery options
