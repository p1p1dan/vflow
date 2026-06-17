---
name: vflow-go
description: "Smart entry point for vflow tasks. Analyzes user intent, reads git status and recent history, classifies task tier (T0/T1/T2), and routes to the appropriate workflow. Use when starting a new task, the user says '开始', '帮我做', '新功能', '新任务', 'start', 'begin', 'help me with', or describes any work to be done."
---

# vflow-go — Smart Entry Point

Analyze user intent → classify tier → route to the appropriate workflow. Users don't need to memorize commands — just describe what they want to do.

## Phase 0: Escape Hatches & Quick Routes

Check if user intent matches:

**Escape hatches** (skip classification, inline execution; spec & test hard rules still apply):
- "直接做" / "直接改" / "just do it" / "skip" / "不用分析"

**Quick routes** (skip intent analysis):
- Starts with `commit` / `提交` → load vflow-commit skill
- Starts with `review` / `审查` / `检查规范` → load vflow-review skill
- Starts with `测试` / `test` targeting existing code → load vflow-test skill

If matched, jump directly to the corresponding flow. Otherwise continue to Phase 1.

## Phase 1: Intent Analysis [required]

**Act first, judge later** — never assess without context:

1. `git status` — current changes and branch
2. `git log --oneline -10` — recent commit history for context recovery
3. Read `.vflow/config.json` — project features, core_paths, build commands
4. If unfamiliar with project structure: quick directory browse (`ls` top-level + key src dirs)

Then classify across 3 dimensions:

| Dimension | Options |
| :--- | :--- |
| Task type | Q&A / bug fix / new feature / refactor / optimize / git ops / review / test |
| Tier | T0 Q&A (no code changes) / T1 Quick (single file, low risk, clear intent) / T2 Standard (new feature / cross-file / core module) |
| Risk | Touches core_paths OR >3 files OR irreversible = high, otherwise low |

**When uncertain, default to the higher tier** (T1↔T2 hesitation → choose T2).

## Phase 2: Classification Output & Execution

T0 → Answer directly, no classification statement.

T1/T2 → Output fixed format (user can correct with a single phrase; **can escalate but not descend** — warn once before obeying a downgrade):

```
📋 Tier: T{1|2} {Quick|Standard} (reason: ..., risk: {low|high}). {next action}
```

- T1 → Execute per `.vflow/skills/vflow-quick/SKILL.md`
- T2 → `node .vflow/scripts/task.mjs create <slug> --title "<title>"` → Execute per `.vflow/skills/vflow-task/SKILL.md`

## Hard Rules

1. Must not classify without project context (Phase 1 steps 1-3 are mandatory)
2. Must not invent new escape hatch phrases
3. Tier can escalate but not descend (unless user explicitly requests and has been warned)
4. T2 must create task archive before starting — no task.json means no state injection, losing traceability
5. When in doubt, choose the higher tier
