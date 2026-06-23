---
name: vflow-execute
description: Ralph-style step executor with self-calling loop. Drives task execution through graph nodes automatically.
---

# vflow-execute — Step Execution Loop

## When to Use

This skill is triggered after a vflow task (T2) has been created and classified.
It drives execution through the task's `steps[]` sequence automatically.

## Invariants

1. **vflow-execute never writes code directly** — it orchestrates steps by loading the right skill context
2. **Each step is atomic**: `task.js next` → execute skill → `task.js complete N`
3. **Gate steps pause**: when `task.js next` returns a gate, wait for user confirmation
4. **Self-call continues the loop**: after completing a step, invoke this skill again

## Execution Protocol

### S_LOAD: Load next step

```bash
node .vflow/scripts/dist/task.js next
```

**Exit codes:**
- `0` — step loaded. The stdout contains the step prompt (required_reading + completion protocol).
- `2` — no pending steps. All steps completed. **Stop the loop.**
- `3` — a step is already running. Complete it first.
- `1` — error.

### S_EXECUTE: Run the step

1. **Read the stdout** from `task.js next` — it contains:
   - `<required_reading>` block with inlined file contents
   - Step metadata comment (`<!-- vflow ralph: step [N/T] ... -->`)
   - Completion protocol instructions

2. **For command steps**: Execute the step's intent based on the description and required reading.
   Follow the skill's guidance (the skill_ref in the step maps to a vflow skill).

3. **For gate steps**: Display the gate message to the user. Wait for their confirmation.
   When confirmed, mark complete.

### S_COMPLETE: Mark step done

After executing the step, run exactly one of:

```bash
# Success
node .vflow/scripts/dist/task.js complete N --status DONE

# Success with concerns
node .vflow/scripts/dist/task.js complete N --status DONE_WITH_CONCERNS --concerns "description"

# Need to retry this step
node .vflow/scripts/dist/task.js complete N --status NEEDS_RETRY

# Blocked — cannot proceed
node .vflow/scripts/dist/task.js complete N --status BLOCKED --reason "why"
```

**Important**: The `complete` command validates document updates (R-IDs, checklist, ledger, knowledge).
If validation fails, fix the issues and try `complete` again.

### S_CONTINUE: Self-call loop

After a successful `complete`:
- **If more steps remain**: Invoke `Skill("vflow-execute")` to continue the loop.
- **If all steps done**: Report completion summary and stop.
- **If BLOCKED**: Report the blocker and stop. User must resolve and re-invoke.

## Loop Termination Conditions

1. `task.js next` returns exit code 2 (no pending steps)
2. A step is marked BLOCKED (session paused)
3. A gate step is waiting for user confirmation (pause until confirmed)

## Error Recovery

- If `task.js complete` fails validation: read the error output, fix the missing documents, retry complete
- If a step fails: mark NEEDS_RETRY, the loop will re-attempt it on next iteration
- If truly stuck: mark BLOCKED with a clear reason

## Example Flow

```
Skill("vflow-execute")
  → Bash("task.js next")                    # loads step 0: plan_req
  → [fill task-spec.md §1, §2]              # execute the step
  → Bash("task.js complete 0 --status DONE") # validates has_rids
  → Skill("vflow-execute")                   # self-call
    → Bash("task.js next")                   # loads step 1: gate_req
    → [show R-IDs to user, wait]             # gate pause
    → Bash("task.js complete 1 --status DONE")
    → Skill("vflow-execute")                 # self-call
      → Bash("task.js next")                 # loads step 2: plan_design
      → ...continues...
```
