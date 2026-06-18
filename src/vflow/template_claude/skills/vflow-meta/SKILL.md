---
name: vflow-meta
description: "Understand and customize the local vflow architecture: workflow rules, skill behavior, hook configuration, and spec library. Use when the user says '修改 vflow', 'vflow 怎么用', 'vflow 架构', 'customize workflow', 'how does vflow work', or needs to modify vflow infrastructure."
---

# vflow Meta — Architecture & Customization Guide

Understand how vflow works and where to make changes. Read this before modifying any vflow infrastructure files.

## Architecture Overview

vflow operates in three layers:

```
Global Layer (~/.claude/)
  detect.py          Session hook: detects .vflow/, asks to enable if absent
  commands/vflow/    /vflow:init (enable entry point for new projects)
  settings.json      Global hooks registration

Project Layer (<project>/.vflow/)
  workflow.md        ★ Source of truth: task classification, state machine, approval gates
  config.json        Project features, build commands, core paths, test toggle
  scripts/           task.mjs (lifecycle) + inject.mjs (context injection)
  skills/            9 skill definitions (SKILL.md per skill)
  spec/              Coding conventions + domain knowledge library
  tasks/             Task archives + quick-log.md
  templates/         Document scaffolds (requirement/plan/verify/quick-entry)

Platform Layer (<project>/.claude/)
  commands/vflow/    6 slash commands (/vflow:go|task|quick|commit|init|context)
  settings.json      Project hooks: inject.mjs session + inject.mjs prompt
```

## File Responsibilities

### Managed Files (overwritten on `vflow update`)

These are maintained by the vflow package. Local edits will be lost on update:

| File | Role |
| :--- | :--- |
| workflow.md | State machine definition, classification rules, approval gates |
| scripts/task.mjs | Task lifecycle: create, start, set phase/risk, done, status |
| scripts/inject.mjs | Context injection: reads task state, injects workflow-state block |
| skills/*/SKILL.md | All 9 skill definitions |
| templates/*.md | Document scaffolds |

### User-Owned Files (preserved on update)

These belong to the project and are never overwritten:

| File | Role |
| :--- | :--- |
| config.json | Project-specific settings (created once, user maintains) |
| spec/ | Coding conventions (grows via vflow-spec writeback) |
| tasks/ | Task archives (grows via task.mjs) |
| tasks/quick-log.md | T1 quick task log |

## Customization Entry Points

| Want to change... | Edit this | Notes |
| :--- | :--- | :--- |
| Task classification rules (T0/T1/T2) | workflow.md § Task Classification | |
| Risk determination logic | workflow.md § Risk Determination | |
| Skip detection phrases | workflow.md § Skip Detection Rule | |
| Per-phase AI behavioral rules | workflow.md [workflow-state:*] blocks | These get injected into every conversation turn |
| Approval gate behavior | workflow.md § Approval Gate 1/2 | |
| Build/test commands | config.json `build` section | |
| Core paths (affect risk level) | config.json `core_paths` | |
| Test requirement toggle | config.json `test_required` | |
| Feature flags (Qt/embedded) | config.json `features` | Controls which spec modules are loaded |
| Coding conventions | spec/common/ + spec/lang/ + spec/modules/ | Grow via vflow-spec |
| Domain knowledge | spec/domain/ | Grow via vflow-spec |
| Skill behavior | skills/*/SKILL.md | Overwritten on update — propose changes upstream |
| Hooks timing/commands | .claude/settings.json | |
| Slash commands | .claude/commands/vflow/*.md | Overwritten on update |

## How Context Injection Works

Two hooks fire automatically:

1. **SessionStart** → `inject.mjs session`: outputs `<vflow-suggest>` if no active task, or `<vflow-state>` with current task + phase
2. **UserPromptSubmit** → `inject.mjs prompt`: outputs `<vflow-state>` with current task state on every user message

The injected `<vflow-state>` block contains:
- Current task name, phase, risk level
- The matching `[workflow-state:*]` section from workflow.md (behavioral rules for this phase)
- Active spec index pointer

AI reads the injected block and follows the behavioral rules for the current phase.

## Current Rules Summary

- **workflow.md** is the single semantic center — task classification, state constraints, and approval gates are all defined there
- **config.json** controls project-specific features but does not define workflow behavior
- **spec/** stores conventions that grow with practice — never shrinks (entries can be deprecated but not deleted without user consent)
- **tasks/** stores task archives that are the primary deliverable for reporting
- **Skills reference each other by name** (e.g., "execute vflow-brainstorm flow") — no code imports between skills

## Do Not

- Do not modify managed files expecting changes to persist — they are overwritten on `vflow update`
- Do not put project-specific rules in skill definitions — put them in spec/ or config.json
- Do not modify inject.mjs or task.mjs for project needs — they are generic infrastructure
- Do not delete spec/ entries without user confirmation — they are team knowledge assets
