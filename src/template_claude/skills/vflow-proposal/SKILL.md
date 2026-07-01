---
name: vflow-proposal
description: "vflow3 proposal-driven workflow guide. Use when starting or progressing ANY non-trivial code change under vflow, or when the user mentions 'proposal', '提案', 'vflow workflow', '走流程', 'create proposal', '建提案', 'move', 'accept', '验收', or asks how the lifecycle / gates / acceptance work. Covers tier classification, the understand→decide→build→check→done pointer graph, the state.json/ledger.md two-file model, and the pause-report-approve acceptance protocol."
---

# vflow3 Proposal Workflow

Guides the proposal-driven lifecycle for code changes. Every non-trivial change goes through a structured lifecycle ensuring quality, traceability, and user control.

**The authoritative CLI is `node .vflow/scripts/dist/proposal.js <command>`.** Node-specific prompts are also injected automatically by the hook system — read them.

## Tier Classification (do this FIRST)

- **T0**: Pure question/explanation → answer directly, NO proposal
- **T1**: Clear, local, low-risk → 3-line inline plan, zero artifacts beyond a minimal proposal.json (no state.json/ledger.md, no gates)
- **T2**: Standard feature/fix → full pointer graph, 2 hard gates
- **T3**: Architecture/core/high-risk → T2 + mandatory design reconfirmation before build

**Before touching code on a T1+ task, create the proposal FIRST — do not free-run investigation or edits without one.**

## Lifecycle (T2/T3)

```
understand → decide → build → check → done
```

Free backward jump to any node already visited (in `history_stack`) via `move --to <node>`. Forward movement must be to the strict next node. `done` is reached only via `accept`, never via `move`.

## Two files, nothing else (T2/T3)

- **`state.json`** — machine-authoritative: `pointer`, `history_stack`, `scope`, `items[]`, `spec_refs[]`. The CLI is the sole writer; never hand-edit it.
- **`ledger.md`** — human-readable, append-only. The AI hand-writes every transition/checkpoint entry via Write/Edit (`## [ts] from -> to` heading + a `- Satisfied:` line). The CLI only writes the initial header line at `create` time.

T1 proposals have neither file — just `proposal.json` and an inline 3-line plan stated in conversation.

## Quick Reference

```bash
# Create
node .vflow/scripts/dist/proposal.js create <slug> --title "..." --type <bug|feature|refactor|reference_build> --tier <T1|T2|T3>

# Status
node .vflow/scripts/dist/proposal.js status
node .vflow/scripts/dist/proposal.js list

# Move between nodes (T2/T3 only; --scope required when entering build)
node .vflow/scripts/dist/proposal.js move --to decide
node .vflow/scripts/dist/proposal.js move --to build --scope "<one-line problem/scope statement>"
node .vflow/scripts/dist/proposal.js move --to check

# Spec citations (required before entering build — Hard Gate 1)
node .vflow/scripts/dist/proposal.js spec-ref add --file <path> --reason "..."
node .vflow/scripts/dist/proposal.js spec-ref none --reason "..."

# Item loop (build node, serial: one doing at a time)
node .vflow/scripts/dist/proposal.js item add --title "..."
node .vflow/scripts/dist/proposal.js item start --item E-001
node .vflow/scripts/dist/proposal.js item complete --item E-001 --note "..."
node .vflow/scripts/dist/proposal.js item block --item E-001 --note "..."

# Recovery trail during a long build session
node .vflow/scripts/dist/proposal.js checkpoint

# Acceptance (after the user approves in-conversation) + knowledge + archive
node .vflow/scripts/dist/proposal.js accept --user-approved
node .vflow/scripts/dist/proposal.js knowledge suggest
node .vflow/scripts/dist/proposal.js knowledge save --content "..." --reason "..."
node .vflow/scripts/dist/proposal.js archive
```

## T3: Design Reconfirmation (Hard Gate 1a)

On the specific `decide -> build` move, the *last* decide-related ledger entry must be a self-loop `## [ts] decide -> decide` whose `- Satisfied:` line contains the literal marker `confirmed_by_user:true`. There is no CLI command for this — after the user approves the design in conversation, hand-write that ledger entry yourself. A rework back-move into `build` from `check` does NOT re-trigger this gate (it's scoped to the `decide -> build` edge specifically); only Hard Gate 1 (scope + spec_refs) applies universally.

## Acceptance Protocol (check node)

This is where the AI hands control back. **Do not silently run `accept`.**

1. **PAUSE.** Report to the user: goal / current state / diff-from-goal / self-check results / known risks.
2. **ASK** whether the result meets their requirements.
3. **Only after the user approves in this conversation**, relay it: `accept --user-approved`. The event is logged with `from=ai_relay` — auditable.
4. Then process knowledge and archive.

The user may also accept themselves in a terminal (`accept`, interactive yes/no). `accept` requires `pointer=='check'`; on success it pushes `pointer='done'` — hand-write the matching `check -> done` ledger entry afterward.

## Key Invariants

1. `state.json`'s `pointer` is the single source of truth for lifecycle progress (T2/T3); `proposal.json`'s `lifecycle_status` for active/blocked/done/archived
2. `state.json`'s `items[].status` is the single source of truth for execution progress
3. Session runtime is hint-only — never overwrites proposal truth
4. Only one `doing` item per proposal at any time (serial execution, no DAG/dependencies in v3)
5. **The AI may run `accept` only with `--user-approved`, and only after explicitly reporting to and getting the user's in-conversation approval.**
6. `ledger.md` must be caught up (last transition entry ends at the current pointer) before the next `move` is allowed
7. Everything beyond the 2 hard gates (build entry, done entry) is an AI self-check, not a machine-validated schema

## Guardrails

During build, STOP and confirm with the user if the goal changed, scope expanded, risk increased, or the key approach switched. If a major new problem is discovered:

```bash
node .vflow/scripts/dist/proposal.js move --to decide
```
