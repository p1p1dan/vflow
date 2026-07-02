---
name: vflow-go
description: "vflow intake gate — classify tier and enforce proposal creation before any code change. Use when: the user submits a new task or request with no active proposal; the UserPromptSubmit hook injects a MANDATORY directive to invoke this skill; or the user explicitly says 'vflow-go', 'go', '走流程', '建议题', 'start workflow'. T0 tasks (pure questions) are answered directly. T1-T3 tasks require a proposal to exist before any Write/Edit/NotebookEdit is allowed."
---

# vflow-go — Intake Gate

Structured entry point for all vflow tasks. Classifies tier, explains reasoning, and creates the proposal before any code changes.

## When This Skill Fires

Either:
- **Auto**: `UserPromptSubmit` hook injected a MANDATORY directive (vflowGate is enabled, no active proposal)
- **Manual**: User typed `vflow-go` or `/vflow-go`

## Step 1: Classify Tier

Read the user's request and classify it. State the tier and your reasoning in one sentence.

| Tier | Criteria | Next action |
| :--- | :--- | :--- |
| **T0** | Pure question, explanation, conceptual discussion — no code change | Answer directly. Done. |
| **T1** | Clear, local, low-risk single-file fix or config tweak | Create proposal (3-line inline plan, no state.json/ledger.md) |
| **T2** | Standard feature, bug fix, multi-file change | Create proposal (full pointer graph: understand → decide → build → check → done) |
| **T3** | Architecture change, core system, high-risk or irreversible | Create proposal + mandatory design reconfirmation before build |

**When in doubt between T1 and T2, classify as T2.** Downgrading is cheap; under-classifying causes skipped steps.

## Step 2: T0 Path

Answer the question directly. Do not create a proposal. Skill ends here.

## Step 3: T1-T3 Path

### 3a. Announce Classification

Tell the user:

```
Tier: T2 (或 T1/T3)
理由：<一句话>
正在建 proposal…
```

### 3b. Derive slug and title

From the user's request, derive:
- `<slug>`: kebab-case, max 5 words, English (e.g., `fix-login-redirect`)
- `--title "..."`: concise Chinese or English description
- `--type`: `feature` | `bug` | `refactor` | `reference_build`
- `--tier`: T1 | T2 | T3

### 3c. Create the proposal

```bash
node .vflow/scripts/dist/proposal.js create <slug> --title "..." --type <type> --tier <tier>
```

Output the created proposal ID (e.g., `P-20260630-002`).

### 3d. Invoke vflow-proposal skill

```
Skill("vflow-proposal")
```

This loads the full lifecycle guide so the current task proceeds through the correct stages.

## Constraints

- **Never skip to implementation** — even if the user says "just do it quickly." The proposal is the contract.
- **Never create more than one proposal per invocation** — if an active proposal already exists, skip creation and read its current pointer from the hook-injected context.
- **Respect existing active proposal** — if `vflow-prompt` context shows an active proposal, do NOT create a new one. Instead, continue from the current pointer.

## Error Recovery

If `proposal create` fails (e.g., slug collision, bad args), report the error and ask the user to confirm the slug/title. Do not proceed without a valid proposal ID.
