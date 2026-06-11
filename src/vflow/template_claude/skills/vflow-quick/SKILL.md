---
name: vflow-quick
description: "vflow quick task (T1) flow: single-file small changes, low-risk tasks executed directly with a quick-log.md record. Use when task is classified as T1 or user invokes /vflow:quick."
---

# vflow Quick Task Flow

Complete small tasks with low friction. One log section for the record, no task directory created.

## Input Contract

- User's task description (classified as T1: single file, low risk, clear intent)
- `.vflow/config.json` (build commands)

## Steps

### 1. Intent Check [required·once]
If ambiguous, ask one clarifying question. If clear, proceed directly.

### 2. Implement [required·once]
Before coding: if the change touches spec-sensitive areas (naming / error handling / memory), briefly check the corresponding spec/ entries.

### 3. Test Hard Rule [required·once]
(Exempt when config.test_required=false)
- Code logic change → update or add corresponding test cases
- Pure comment / doc / formatting change → exempt (note exemption reason in the log entry)

### 4. Verify [required·once]
Run build (and relevant tests), save real output.

### 5. Log [required·once]
Insert a new section at the top (below the title line) of `.vflow/tasks/quick-log.md` using the `.vflow/templates/quick-entry.md` template.

## Output Template

After completion:
"⚡ Quick task done: {change summary}. Logged to quick-log.md. Verification: {build/test result one-liner}"

## Guardrails

- If during implementation the change exceeds T1 scope (>3 files or touches core_paths) → stop and state "Task exceeds T1 scope, recommend upgrading to standard task", ask the user
- Verification must not be skipped even for quick tasks
- The quick-log entry is mandatory — it is the only record of a T1 task
