---
name: vflow-think
description: "First principles thinking: 6-phase systematic analysis with phase gates. Use when the user says 'first principles', '第一性原理', 'challenge assumptions', 'is this the right approach', or needs to evaluate decisions without relying on convention."
---

# vflow Think — First Principles Analysis

Decompose complex problems into irreducible truths and reason upward — avoiding the trap of reasoning by analogy, convention, or "best practice".

## When to Use

- Evaluating whether an architecture, design, or strategy is truly optimal
- Questioning "best practices" that may not fit the current context
- Making foundational decisions with long-term impact
- Challenging inherited assumptions in legacy systems
- Any moment where "we've always done it this way" is the primary justification

## When NOT to Use

- Trivial decisions (just pick the simplest option)
- Time-critical emergencies (act first, analyze later)
- Well-validated problems with proven solutions (don't reinvent the wheel)

## Steps

### 0. Frame — Establish Axioms [required·once]

Define irreducible truths that constrain this domain.

**Axiom test**: Can this be further decomposed? Is this provably true (not just commonly believed)? Would violating this definitely cause failure?

**Gate**: Produce ≥3 axioms before proceeding. Each axiom: one sentence + "why irreducible".

### 1. Essence — Identify the Core Problem [required·once]

Strip away implementation details:

1. State the problem in one sentence
2. Separate symptoms from causes
3. Define measurable success criteria

**Key questions**: What is the fundamental job to be done? If this system didn't exist, what would we actually need?

**Gate**: One-sentence problem statement + measurable success criteria.

### 2. Assumptions — Surface and Challenge [required·once]

This is the highest-leverage phase. Most "best practices" are assumptions disguised as facts.

Produce an assumption table with ≥5 rows:

| Assumption | Why Question It | Axiom(s) Used | Verdict |
| :--- | :--- | :--- | :--- |
| "We need X" | {challenge} | A1, A2 | Keep / Discard / Modify |

**Red flags** (likely false assumptions): "We've always done it this way" / "Industry standard says..." / "Everyone uses X" / "That's too simple to work"

**Gate**: ≥5 assumptions challenged with verdicts. Each verdict references at least one axiom.

### 3. Ground Truths — Establish What IS True [required·once]

From challenged assumptions, identify what is irreducibly true for this specific problem.

**Ground truth test**: Can this be further decomposed? Is this provably true? Would violating this cause failure?

```
❌ "Users need fast response times" (too vague)
✅ "P99 latency must be < 200ms per SLA §3.2" (specific, verifiable)
```

**Gate**: ≥3 ground truths, each specific and falsifiable.

### 4. Reason Upward — Build from Ground Truths [required·once]

```
Ground Truth → Minimal Solution → Justified Additions → Final Design
```

1. Start minimal — what's the simplest thing that satisfies all ground truths?
2. Add only what's necessary — each addition must reference a ground truth
3. Challenge each layer — does this earn its complexity?

**Gate**: Reasoning chain where every step traces to a ground truth.

### 5. Validate and Stress-Test [required·once]

Three validation questions:

| # | Question | If "no" |
| :--- | :--- | :--- |
| 1 | Can every conclusion trace back to a ground truth? | Unjustified assumptions in Phase 4 |
| 2 | Is every ground truth covered by at least one conclusion? | Solution ignores a constraint |
| 3 | Were any phases skipped or done shallowly? | Go back and finish |

Apply at least one stress-test model:

| Model | Question | When it helps |
| :--- | :--- | :--- |
| Pre-Mortem | "12 months later, this failed. Why?" | When you're excited about the solution |
| Inversion | "What would guarantee failure?" | Finding blind spots |
| Second-Order | "If this works, what happens next?" | Systemic effects |

**Gate**: All 3 validation answers = "yes" + at least one stress-test applied.

## Progress Tracker (Anti-Drift, Persistent)

Maintain throughout the analysis. After each phase, output to conversation AND write to `fp-progress.md` in the task directory (creates cross-session persistence).

```
🧭 FP Progress
- [x] Phase 0: Frame — ✅ 3 axioms
- [x] Phase 1: Essence — ✅ "..."
- [→] Phase 2: Assumptions — 3/6 checked
- [ ] Phase 3: Ground Truths
- [ ] Phase 4: Reason Upward
- [ ] Phase 5: Validate
```

**Session resume**: If `fp-progress.md` exists in the task directory, read it first to restore progress and continue from the last incomplete phase. Do NOT restart from Phase 0.

If conversation drifts (user asks a tangent), after addressing it:
> 📍 Returning to FP analysis: Phase N has M items remaining. Continuing.

## Depth Standards

| Phase | Shallow (Fail) | Deep (Pass) |
| :--- | :--- | :--- |
| Assumptions | "Maybe we don't need this" | Table row with challenge + axiom reference + verdict |
| Ground Truths | "Users want fast" | "P99 < 200ms per SLA §3.2" |
| Reasoning | "So we should use X" | "GT#2 + GT#3 → eliminates Y → X is minimal solution" |

## Common Traps

- **Complexity Trap**: Solution more complex than warranted. FP check: remove one component — still works? That component wasn't essential.
- **Analogy Trap**: "Company X does it this way." FP check: is our problem identical in all dimensions?
- **Legacy Trap**: Maintaining compatibility with obsolete decisions. FP check: do original conditions still exist?

## Top 5 Dangerous Biases

| Bias | How It Corrupts FP | Quick Debias |
| :--- | :--- | :--- |
| Confirmation | "Find" ground truths that confirm preferred solution | Seek disconfirming evidence first |
| Anchoring | Conventional approach becomes mental anchor | Generate 3 alternatives before evaluating |
| Sunk Cost | Legacy decisions feel like ground truths | "Starting from zero, would we choose this?" |
| Status Quo | Current state feels like a constraint | Separate true constraints from current choices |
| Overconfidence | Treat assumptions as ground truths | Assign confidence % to each assumption |

## Guardrails

- **No artifact → no next phase.** If a gate is not met, stop and complete it
- Phase gates are mandatory — no skipping even if the user says "just give me the answer"
- The progress tracker must be output after each phase completion
- This skill is independent of the vflow task workflow — it can run standalone at any time

## vflow Integration

When an active vflow task exists, analysis artifacts are persisted to the task directory.

### File Placement

```
.vflow/tasks/{task-id}/
├── task.json              # Existing — fp_analysis metadata added
├── fp-analysis.md         # ← 6-phase analysis output (Phases 0-5)
├── fp-progress.md         # ← Phase progress tracker (cross-session persistence)
├── plan.md                # Existing — FP conclusions feed into design decisions
└── ...
```

### Incremental Writing

- After each phase completion, **append** that phase's output to `fp-analysis.md` (don't wait until Phase 5)
- After each phase completion, **overwrite** `fp-progress.md` with current progress state
- This ensures no work is lost if the session ends mid-analysis

### Completion Recording

After Phase 5 validation passes, update `task.json` by adding:

```json
{
  "fp_analysis": {
    "completed": true,
    "axioms_count": 3,
    "assumptions_challenged": 6,
    "ground_truths_count": 5,
    "validation_passed": true
  }
}
```

### Output Format (fp-analysis.md)

```markdown
## First Principles Analysis: [Topic]

### Axioms
1. [Axiom 1] — [Why irreducible]
2. [Axiom 2] — [Why irreducible]
3. [Axiom 3] — [Why irreducible]

### Problem Essence
**Core problem:** [One sentence]
**Success criteria:** [Measurable outcomes]

### Assumptions Challenged
| Assumption | Challenge | Axiom(s) | Verdict |
| :--- | :--- | :--- | :--- |
| ... | ... | A1, A2 | Keep/Discard/Modify |

### Ground Truths
1. [Specific, falsifiable fact]
2. [Specific, falsifiable fact]
3. [Specific, falsifiable fact]

### Reasoning Chain
GT#1 + GT#3 → [Inference] → [Step] → [Conclusion]

### Conclusion
**Recommended approach:** [Description]
**Key insight:** [What FP analysis revealed that convention missed]
**Trade-offs acknowledged:** [What we accept and why]

### Validation
- [x] Every conclusion traces to a ground truth
- [x] Every ground truth is covered
- [x] No phases skipped
- [x] Stress-tested with: [model name]
```

### Standalone Mode

When no active vflow task exists, output analysis to conversation only (no file persistence). User can request file output explicitly.
