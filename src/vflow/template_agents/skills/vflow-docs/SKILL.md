---
name: vflow-docs
description: "Multi-level documentation generator: produces module-level, project-level, and algorithm-level documentation from code structure and inline annotations. Use when the user says 'generate docs', 'write docs', '补文档', '生成文档', or when vflow-review flags missing documentation."
---

# vflow Docs — Documentation Generator

Generate structured documentation from code, not from scratch. Read what exists, fill what's missing.

## Input Contract

- Target scope: module, project root, or algorithm function/class
- `.vflow/config.json` (language, core_paths)
- Existing inline specs (Doxygen / docstring) written by vflow-code
- Existing `.vflow/spec/` domain knowledge

## Documentation Levels

Three levels, each with a distinct purpose. Determine which level applies before generating.

| Level | When to Use | Output Location |
| :--- | :--- | :--- |
| **Module** | New module with ≥3 public interfaces, or complex internal collaboration | `docs/<module_name>.md` or `<module_dir>/README.md` |
| **Project** | Project root lacks README, or README is outdated | `README.md` at project root |
| **Algorithm** | Algorithm implementation with domain-specific logic (detection, measurement, calibration, etc.) | `docs/algorithms/<algorithm_name>.md` |

## Steps

### 1. Assess Scope [required·once]

Determine documentation level and target:
- Read the target code: file structure, public interfaces, inline comments
- Check existing documentation: is there a README? docs/ folder? Algorithm descriptions?
- Decide which level(s) are needed

Output: "📄 Documentation scope: {level} for {target}. {N} public interfaces found, {M} already documented."

### 2. Gather Source Material [required·once]

Before writing, extract from the codebase:
- Public interface inventory (from headers / module `__all__` / exported symbols)
- Inline specs written by vflow-code (Doxygen comments, docstrings)
- Domain knowledge from `.vflow/spec/domain/`
- Data flow and dependencies (imports, call graph for key paths)
- Configuration and build information from config files

Do NOT ask the user for information that can be derived from code.

### 3. Generate Documentation [required·once]

Use the appropriate template below. Fill every required section; mark optional sections as "N/A" if not applicable.

### 4. Review and Output [required·once]

- Verify all public interfaces are mentioned
- Verify no placeholder text remains
- Write to the designated output location

Output: "✅ Documentation generated: {file_path} ({N} sections, {M} interfaces documented)."

---

## Template A: Module Documentation

**Required sections:**

```markdown
# <Module Name>

## Overview
<!-- One paragraph: what this module does and why it exists -->

## Key Interfaces
<!-- Table of public classes/functions with one-line descriptions -->

| Interface | Description |
| :--- | :--- |
| `ClassName.method()` | Brief description |

## Data Flow
<!-- How data enters, transforms, and exits this module -->
<!-- For simple modules: one sentence. For complex: ASCII diagram -->

## Usage Example
<!-- Minimal working example showing the primary use case -->

## Dependencies
<!-- External libraries and internal modules this depends on -->

## Limitations
<!-- Known constraints, unsupported scenarios, performance caveats -->
```

**Optional sections** (include when applicable):
- **Configuration**: if the module reads config files or environment variables
- **Thread Safety**: if the module is used in multi-threaded context
- **Migration Guide**: if the module replaces or wraps a legacy module

---

## Template B: Project Documentation (README)

**Required sections:**

```markdown
# <Project Name>

## What This Is
<!-- One paragraph: purpose and scope -->

## Quick Start
<!-- 3-5 steps to get from clone to running -->

## Directory Structure
<!-- Tree showing key directories with one-line descriptions -->

## Build & Test
<!-- Commands to build, run tests, and verify -->

## Key Modules
<!-- Table of core modules with brief descriptions and links -->

| Module | Description | Location |
| :--- | :--- | :--- |
| ... | ... | `src/...` |
```

**Optional sections:**
- **Configuration**: environment variables, config files
- **Contributing**: coding standards, PR process
- **Changelog**: link to CHANGELOG.md or recent changes summary

---

## Template C: Algorithm Documentation

**Required sections:**

```markdown
# <Algorithm Name>

> 更新时间：YYYY-MM-DD
> 项目：<project name>
> 提交者：<author>

<!-- One paragraph: what problem this algorithm solves, in domain terms -->

## 参数配置

| 参数名 | 中文释义 | 描述 | 示例值 |
| :--- | :--- | :--- | :--- |
| param1 | ... | 含义、范围约束、单位 | 30 |

## 输出结果

| 结果名 | 描述 | 判定标准 |
| :--- | :--- | :--- |
| result1 | ... | Pass/Fail 条件 |

## 错误码

| 错误信息 | 描述 |
| :--- | :--- |
| Success | 算法执行成功 |
| ... | ... |

## 算法说明

### 工作原理
<!-- Numbered steps describing the algorithm pipeline -->
<!-- e.g. 1. 图像预处理 → 2. 特征提取 → 3. 计算 → 4. 判定 -->

### 输入要求
<!-- Image type, channel count, resolution constraints, etc. -->

### 数学基础（可选）
<!-- Key formulas with variable definitions -->
```

**Optional sections** (include when applicable):
- **适用场景**: where this algorithm works well
- **不适用场景**: where it fails, with recommended alternatives
- **性能特征**: time complexity, typical execution time, memory usage
- **实现备注**: key design choices, optimization techniques
- **参考资料**: papers, textbooks, or internal documents

---

## Output Location Rules

| Scenario | Location |
| :--- | :--- |
| Module doc for `src/preprocessing/` | `src/preprocessing/README.md` or `docs/preprocessing.md` |
| Project README | `README.md` at project root |
| Algorithm doc for edge detection | `docs/algorithms/edge_detection.md` |
| Algorithm doc when no docs/ exists | Create `docs/algorithms/` first |

**Preference**: If the project already has a `docs/` directory, put documentation there. If not, use module-level README.md files. Do not create `docs/` for a single-module project.

## Guardrails

- Do NOT invent information not present in the code — if something is unclear, mark it as `<!-- TODO: clarify -->` and note it in the output
- Do NOT duplicate inline specs (Doxygen/docstring) into the doc — reference them ("See function docs in `header.h`")
- Algorithm docs must include Input/Output tables — never skip these for algorithm-level documentation
- Keep docs concise — a 500-line doc for a 100-line module is wrong. Match doc depth to code complexity
- When updating existing docs, preserve content the user previously wrote — only add or update sections, do not rewrite from scratch unless asked
