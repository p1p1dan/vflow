<!-- vflow:authority:start -->
# vflow2 Project

This project uses the **vflow2 proposal-driven workflow system**.

## Workflow

Every non-trivial code change goes through a structured proposal lifecycle:
`intake → analysis → design → plan → execution → verify → pending_acceptance → done → archived`

The AI assistant should follow the workflow prompts injected by the hook system. The authoritative CLI is:
```
node .vflow/scripts/dist/proposal.js <command>
```

## Key Rules

1. **proposal.stage** is the single source of truth for lifecycle progress
2. **execution.items[].status** is the single source of truth for execution progress
3. Session runtime is hint-only — never overwrites proposal truth
4. AI cannot advance past `pending_acceptance` — only user `accept` moves to `done`
5. Serial execution: one `doing` item at a time per proposal

## Build

```bash
cd .vflow/scripts && npm run build
```

## Test

```bash
cd .vflow/scripts && node --test ../tests/proposal-lifecycle.test.mjs
```
<!-- vflow:authority:end -->
