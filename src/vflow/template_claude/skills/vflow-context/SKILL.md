---
name: vflow-context
description: "Read-only overview of vflow project state: active task status, archive history, recent journal entries, and spec library summary. Use when the user asks about '状态', '进度', '当前任务', '做到哪了', 'status', 'progress', 'what am I working on', or wants a project overview."
---

# vflow-context — Status Overview

Read-only summary of vflow project state and history. Never modifies any files.

## Flow

1. Run task status command:
   ```bash
   node .vflow/scripts/task.mjs status
   ```
   Fall back to `node .vflow/scripts/task.mjs status` if first attempt fails.

2. If active task exists: read task.json + list archive artifacts (requirement/design/worklog/verify — filled vs empty)

3. Historical summary: list `.vflow/tasks/archive/` tasks by month (directory name = task ID) + `.vflow/tasks/quick-log.md` entry titles

4. Journal summary: if `.vflow/journal/journal-*.md` exists, show last 10 entries

5. Subcommand `spec` → show spec library index (`spec/index.md`) + mark enabled modules by config features

## Output Template

```
📊 vflow Status
Active task: {ID | none}  [{state} / risk={...}]
  Artifacts: requirement ✅ | design ✅ | worklog ✏️ | verify ⬜
This month: {N} standard tasks archived | quick-log: {M} entries
Recent journal:
  - [date] [task] [level] summary
  ...
```

## Boundaries

- Pure read-only — never modifies files or changes task state
- Show existence and title-level summaries only — don't dump full file contents (read specific files when user asks for details)
