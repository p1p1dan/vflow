---
name: vflow-quick
description: "vflow quick task (T1): single-file small changes with thin artifacts. AI advances autonomously, reports once at the end."
---

# vflow Quick Task Flow

T1 tasks run the same pipeline as T2 — only the artifacts are thin (one or two
lines per section) and there are NO human gates. The AI advances autonomously
and reports once at the end.

## Input Contract

- User's task description (classified as T1: single file, low risk, clear intent)
- `.vflow/config.json` (test_command, test_required)

## Steps

### 1. Create [required·once]
`node .vflow/scripts/dist/task.js create <slug> --title "<title>" --tier T1`

### 2. Requirement (created → analyzed) [required·once]
Fill task-spec.md §1 (one line), §2 (**1-2 R-IDs**). Then `node .vflow/scripts/dist/task.js advance`.

### 3. Design (analyzed → designed) [required·once]
Fill task-spec.md §3 (one line), §4 (1-2 rows), §6 (1-3 items **each tagged (R<n>)**).
Set risk: `node .vflow/scripts/dist/task.js set risk low`. Then advance.

### 4. Implement (designed → implementing → verified) [required·once]
Advance to enter implementing. Code the change. Log in ledger.md §1.
Fill ledger.md §4 (one `- R<n>: ...` per R-ID). Then advance — script runs tests.

### 5. Archive (verified → archived) [required·once]
`node .vflow/scripts/dist/task.js done --summary "<one-liner>"`

## Alternative: Quick Log Only

For truly trivial changes (typo, comment, single-line fix):
```bash
# Just do the change, commit, and log
node .vflow/scripts/dist/task.js quick-log --title "fix typo in README" --files "README.md"
```

## Output Template

"⚡ Quick task done: {summary}. Archived: tasks/archive/YYYY-MM/{id}/. Machine verification: {result}"

## Guardrails

- If change exceeds T1 scope (>3 files or core_paths) → stop, recommend upgrade to T2
- Machine verification must not be skipped (test_required=false is the only exemption)
- Do not ask gate questions for T1 — autonomy is the contract
