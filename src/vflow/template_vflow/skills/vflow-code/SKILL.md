---
name: vflow-code
description: "Code generation gate: before writing any new module, class, or public interface, produce a function-level spec (signature, parameter constraints, return value, boundary conditions, error handling). Auto-used during vflow-task implementation phase; user can also invoke independently with 'generate spec for XX'."
---

# vflow Code Spec Gate

No code without a spec. Every public interface is specified before it is implemented.

## Input Contract

- Target: module, class, or public interface about to be created/modified
- `.vflow/config.json` (language determines spec format)
- Relevant `.vflow/spec/` entries for domain conventions

## Complexity Grading

Not all functions need the same depth. Grade first, then spec accordingly.

| Grade | Criteria | Required Spec Sections |
| :--- | :--- | :--- |
| **Full** | Algorithm functions, core business logic, stateful operations, data transformations with non-trivial rules | All 5 sections |
| **Lite** | Ordinary public functions with straightforward logic | Sections 1-3 (signature + constraints + return); sections 4-5 only when non-obvious |
| **Exempt** | Trivial getters/setters, single-line wrappers, direct delegation without logic | No spec required — standard docstring/comment is sufficient |

When uncertain between grades, choose the higher one.

## Spec Template (5 Sections)

```
Section 1 — Signature
  function_name(param1: type, param2: type, ...) -> return_type

Section 2 — Parameter Constraints
  - param1: [valid range / allowed values / nullability / units]
  - param2: [valid range / allowed values / nullability / units]

Section 3 — Return Value
  - Success: [what is returned, type, value range]
  - Failure: [what is returned or thrown, under what conditions]

Section 4 — Boundary Conditions
  - [empty input behavior]
  - [extreme values behavior]
  - [concurrent access considerations, if applicable]
  - [performance constraints, if applicable]

Section 5 — Error Handling Strategy
  - [which errors are caught internally vs propagated]
  - [error reporting mechanism: return code / exception / logging]
  - [recovery behavior, if any]
```

For **Lite** grade: sections 4-5 are optional — include only when behavior is non-obvious.

## Spec Output Location

Specs live with the source code, not in separate documentation files.

### Location Rules

| Language | Primary Location | Fallback |
| :--- | :--- | :--- |
| **C/C++** | Header file Doxygen comment block (`@brief`, `@param`, `@return`, `@pre`, `@throws`, `@note`) | If header-only: above function definition |
| **Python** | Docstring (Google style or NumPy style) + type hints in signature | Module-level `docs/` README for module overview only |
| **C#** | XML documentation comments (`<summary>`, `<param>`, `<returns>`, `<exception>`) | — |

### Module-Level Overview

When creating a new module (not just a function), also produce a brief module overview:
- **C/C++**: file header comment with `@file` and `@brief` describing module purpose and key interfaces
- **Python**: module docstring at top of file
- **Standalone doc**: `docs/<module_name>.md` only when the module has complex state machines, data flows, or multi-class collaboration that cannot fit in inline comments

## Steps

### 1. Identify Scope [required·once]

List all new public interfaces (functions, methods, classes) about to be created. For each one, assign a complexity grade (Full / Lite / Exempt).

### 2. Write Specs [required·repeatable]

For each non-exempt interface, write the spec in the designated location:
- Fill all required sections per the complexity grade
- Use the language-appropriate format (Doxygen / docstring / XML doc)
- Include physical units for domain values (pixels, mm, degrees, etc.) per spec/common/comments-docs.md rule 9

### 3. Review Specs [required·once]

Before writing implementation code, verify:
- Every Full-grade interface has all 5 sections
- Every Lite-grade interface has at least sections 1-3
- Parameter constraints are specific (not just "valid value")
- Boundary conditions cover at minimum: empty/null input, extreme values
- Error handling strategy is explicit (not "handle errors appropriately")

### 4. Implement [required·repeatable]

Only after specs pass review, write the implementation code. The spec serves as the contract — implementation must satisfy all stated constraints and boundary behaviors.

## Output Template

"📋 Code spec: {N} interfaces graded ({F} full / {L} lite / {E} exempt). Specs written to {locations}."

After implementation:
"✅ Implementation complete. All specs honored."

## Guardrails

- NEVER write implementation code for a Full/Lite interface before its spec exists
- Spec is a contract: if implementation cannot satisfy a stated constraint, update the spec FIRST (and note the change in worklog.md)
- Do not write specs for third-party library wrappers that simply delegate — mark them Exempt
- When modifying an existing public interface: update its spec BEFORE changing the code
- Specs are living documents — keep them in sync with code changes (per spec/common/comments-docs.md rule 6)
