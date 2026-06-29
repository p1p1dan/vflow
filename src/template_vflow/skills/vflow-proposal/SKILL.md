# vflow2 Proposal Workflow Skill

## Purpose

This skill guides you through the vflow2 proposal-driven workflow for code changes. Every non-trivial code modification goes through a structured lifecycle ensuring quality, traceability, and user control.

## Tier Classification

Before starting, classify the request:

- **T0**: Pure question/explanation → answer directly, no proposal
- **T1**: Clear, local, low-risk → fast path (abbreviated analysis, single execution item)
- **T2**: Standard feature/fix → full stage walk with execution loop
- **T3**: Architecture/core/high-risk → T2 + mandatory design confirmation

## Lifecycle

```
intake → analysis → design → plan → execution → verify → pending_acceptance → done → archived
```

## Quick Reference

### Creating a proposal
```bash
node .vflow/scripts/dist/proposal.js create <slug> --title "..." --type <bug|feature|refactor|reference_build> --tier <T1|T2|T3>
```

### Checking status
```bash
node .vflow/scripts/dist/proposal.js status
node .vflow/scripts/dist/proposal.js list
```

### Advancing stages
```bash
node .vflow/scripts/dist/proposal.js advance
```

### Execution loop
```bash
node .vflow/scripts/dist/proposal.js execution add-item --title "..." [--depends E-001]
node .vflow/scripts/dist/proposal.js execution start-item --item E-001
node .vflow/scripts/dist/proposal.js execution complete-item --item E-001 --evidence "..."
```

### Verification and acceptance
```bash
node .vflow/scripts/dist/proposal.js verify run
node .vflow/scripts/dist/proposal.js confirm-design    # T3 only, user confirms design before plan
node .vflow/scripts/dist/proposal.js accept             # user only
node .vflow/scripts/dist/proposal.js archive [--html]
```

## Key Invariants

1. `proposal.stage` is the single source of truth for lifecycle progress
2. `execution.items[].status` is the single source of truth for execution progress
3. Stage and item status never cross-contaminate
4. Session runtime is hint-only — never overwrites proposal truth
5. Only one `doing` item per proposal at any time (serial execution)
6. AI cannot advance past `pending_acceptance` — only user `accept` moves to `done`
7. `review.md` is derived at archive time from structured history, not maintained during runtime
8. T3 design confirmation is invalidated on back-to-design — must re-confirm after changes

## T1 Fast Path

For T1 proposals:
1. Create proposal with --tier T1
2. Write brief analysis (problem + scope)
3. Write single design decision
4. Write plan with 1 verify check
5. Add single execution item, start, complete
6. Verify run → advance → accept → archive

## T2/T3 Full Path

For T2/T3 proposals:
1. Thorough analysis with investigation
2. Multiple design decisions with tradeoffs
3. Detailed plan with multiple verify checks
4. Multiple execution items with dependencies (DAG)
5. Serial execution loop (start → implement → complete with evidence)
6. Full verification pass
7. Present to user for acceptance
8. Archive with knowledge extraction

## Guardrails

During execution, STOP and confirm with user if:
- Goal has changed
- Scope has expanded
- Risk level has increased
- Key approach has switched

If a major new problem is discovered during execution:
```bash
node .vflow/scripts/dist/proposal.js back --to design
```
