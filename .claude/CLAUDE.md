<!-- vflow:authority:start -->
# vflow3 Project

This project uses the **vflow3 proposal-driven workflow system**.

## Workflow

Every non-trivial code change goes through a 5-node pointer graph, with free backward jump to any previously visited node:
`understand → decide → build → check → done`

The AI assistant should follow the workflow prompts injected by the hook system. The authoritative CLI is:
```
node .vflow/scripts/dist/proposal.js <command>
```

## Key Rules

1. **state.json's `pointer`** is the single source of truth for lifecycle progress (T2/T3); `proposal.json`'s `lifecycle_status` for active/blocked/done/archived
2. **state.json's `items[].status`** is the single source of truth for execution progress
3. **ledger.md** is the human-readable, append-only record. The AI hand-writes every transition/checkpoint entry via Write/Edit — the CLI never generates ledger body text, only the initial header. `ledger.md` must be caught up before the next `move` is allowed
4. Session runtime is hint-only — never overwrites proposal truth
5. At `check` the AI PAUSES, reports goal / current state / diff-from-goal / self-check results / risks, and asks the user. Only after in-conversation approval does the AI run `accept --user-approved` (event logged `from=ai_relay`, auditable); the user may also `accept` in a terminal. No accept/archive without explicit user approval.
6. Serial execution: one `doing` item at a time per proposal
7. T1 proposals have no state.json/ledger.md — just a 3-line inline plan and a minimal proposal.json, no gates

## Build

```bash
cd .vflow/scripts && npm run build
```

## Test

```bash
cd .vflow/scripts && node --test ../tests/proposal-lifecycle.test.mjs
```
<!-- vflow:authority:end -->
