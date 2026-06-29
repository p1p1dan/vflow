# vflow2 Workflow Definition

Pipeline: intake → analysis → design → plan → execution → verify → pending_acceptance → done → archived

## Tier Guide

- **T0**: Pure Q&A — no proposal created
- **T1**: Clear, local, low-risk change — fast path (single item execution)
- **T2**: Standard feature/fix — full stage walk with execution loop
- **T3**: Architecture/core/high-risk — T2 + mandatory design confirmation before execution

## Skip Detection

If the user's request is clearly T0 (question, explanation, no code change), do NOT create a proposal. Answer directly.

---

[workflow-state:no_proposal]

No active proposal. Evaluate the user's request:

1. If T0 (pure question/explanation): answer directly, no proposal needed.
2. If T1+ (code change required): create a proposal.

Command: `node .vflow/scripts/dist/proposal.js create <slug> --title "..." --type <bug|feature|refactor|reference_build> --tier <T1|T2|T3>`

[workflow-state:intake]

Proposal created. Record the user's original request clearly.

**Required artifact:** analysis.json with `problem` and `scope` filled.

**Actions:**
1. Understand what the user wants
2. Write analysis.json (problem statement, scope, constraints, investigation)
3. Advance when ready

**Gate to analysis:** analysis.json must have non-empty `problem` and `scope`.

Command: `node .vflow/scripts/dist/proposal.js advance`

[workflow-state:analysis]

Analysis complete. Now produce design decisions.

**Required artifact:** design.json with at least 1 decision.

**Actions:**
1. Identify key design decisions, alternatives, and tradeoffs
2. Write design.json with decisions array
3. For T3: present design to user and get explicit confirmation: `node .vflow/scripts/dist/proposal.js confirm-design`

**Gate to design:** design.json must have ≥1 decision entry.

Command: `node .vflow/scripts/dist/proposal.js advance`

[workflow-state:design]

Design decisions recorded. Now build the execution plan.

**Required artifact:** plan.json with `execution_outline` and `verify_plan.checks` (≥1 check).

**Actions:**
1. Break down implementation into execution items (ordered, with dependencies)
2. Define verification checks (which are gating?)
3. Write plan.json

**Gate to plan:** plan.json must have non-empty `execution_outline` and at least 1 verify check.

Command: `node .vflow/scripts/dist/proposal.js advance`

[workflow-state:plan]

Plan ready. Populate execution items and start executing.

**Required artifact:** execution.json with items (non-empty, DAG valid, ≥1 ready).

**Actions:**
1. Add execution items: `node .vflow/scripts/dist/proposal.js execution add-item --title "..." [--depends E-001,E-002]`
2. Advance to execution stage

**Gate to execution:** execution.json items non-empty, DAG has no cycle, ≥1 item is ready.

Command: `node .vflow/scripts/dist/proposal.js advance`

[workflow-state:execution]

Executing. Work through items serially (one `doing` at a time).

**Loop:**
1. Start next ready item: `node .vflow/scripts/dist/proposal.js execution start-item --item E-NNN`
2. Implement the work described by that item
3. Complete with evidence: `node .vflow/scripts/dist/proposal.js execution complete-item --item E-NNN --evidence "..."`
4. Repeat until all items done/cancelled

**Guardrails:**
- If goal/scope/risk/approach changes significantly → stop, confirm with user
- If major new problem discovered → `node .vflow/scripts/dist/proposal.js back --to design`

**Gate to verify:** All items must be `done` or `cancelled`.

Command: `node .vflow/scripts/dist/proposal.js advance`

[workflow-state:verify]

All execution items complete. Run verification checks.

**Actions:**
1. Execute each check from the verify plan
2. Record results: `node .vflow/scripts/dist/proposal.js verify run`
3. If all gating checks pass → advance to pending_acceptance
4. If gating checks fail → back to execution with items reopened

**Gate to pending_acceptance:** verify.json `all_gating_passed` must be `true`.

**On failure:** `node .vflow/scripts/dist/proposal.js back --to execution` (reopen failed items)

Command: `node .vflow/scripts/dist/proposal.js advance`

[workflow-state:pending_acceptance]

Technical work and verification complete. Present results to user for acceptance.

**Actions:**
1. Summarize what was done, verification results, and any known risks
2. Wait for user to explicitly accept

**IMPORTANT:** AI cannot advance past this stage. Only the user can accept.

Command (user only): `node .vflow/scripts/dist/proposal.js accept`

[workflow-state:done]

User accepted. Ready for archival.

**Actions:**
1. Archive the proposal (generates review.md from structured history)
2. Optionally extract knowledge candidates

Command: `node .vflow/scripts/dist/proposal.js archive [--html]`
Knowledge: `node .vflow/scripts/dist/proposal.js knowledge suggest`
