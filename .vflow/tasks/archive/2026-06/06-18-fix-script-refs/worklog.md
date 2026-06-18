# Implementation Log

| Time | File | Change |
| :--- | :--- | :--- |
| 2026-06-18T16:30 | `src/vflow/cli.py` | MANAGED_VFLOW 改为 .mjs 文件；hook_cmd/smoke_test/do_status 改为 node |
| 2026-06-18T16:32 | `.vflow/workflow.md` | task.py→task.mjs、inject.py→inject.mjs；created/analyzed 状态块增加 HARD STOP 约束 |
| 2026-06-18T16:34 | `.vflow/skills/vflow-task/SKILL.md` | task.py→task.mjs（12 处） |
| 2026-06-18T16:34 | `.vflow/skills/vflow-quick/SKILL.md` | task.py→task.mjs（7 处） |
| 2026-06-18T16:35 | `.vflow/scripts/task.mjs` | 内部错误提示 task.py→task.mjs（5 处） |
| 2026-06-18T16:36 | `.vflow/templates/verify.md` | 注释 task.py→task.mjs |
| 2026-06-18T16:36 | `.vflow/templates/design.md` | 注释 task.py→task.mjs |
| 2026-06-18T16:37 | `.claude/skills/vflow-continue/SKILL.md` | fallback 命令 task.py→task.mjs |
| 2026-06-18T16:37 | `.claude/skills/vflow-meta/SKILL.md` | 全文 task.py/inject.py→.mjs（8 处） |
| 2026-06-18T16:37 | `.claude/skills/vflow-context/SKILL.md` | fallback 命令 task.py→task.mjs |
| 2026-06-18T16:38 | `INSTALL.md` | 环境要求改 Node.js；命令/目录结构/故障排查中 .py→.mjs |
| 2026-06-18T16:39 | `src/vflow/template_vflow/workflow.md` | 同步活跃文件 |
| 2026-06-18T16:39 | `src/vflow/template_vflow/skills/vflow-task/SKILL.md` | 同步活跃文件 |
| 2026-06-18T16:39 | `src/vflow/template_vflow/skills/vflow-quick/SKILL.md` | 同步活跃文件 |
| 2026-06-18T16:39 | `src/vflow/template_vflow/scripts/task.mjs` | 同步活跃文件 |
| 2026-06-18T16:39 | `src/vflow/template_vflow/templates/verify.md` | 同步活跃文件 |
| 2026-06-18T16:39 | `src/vflow/template_vflow/templates/design.md` | 同步活跃文件 |
| 2026-06-18T16:39 | `src/vflow/template_claude/skills/vflow-meta/SKILL.md` | 同步活跃文件 |
| 2026-06-18T16:39 | `src/vflow/template_claude/skills/vflow-continue/SKILL.md` | 同步活跃文件 |
| 2026-06-18T16:39 | `src/vflow/template_claude/skills/vflow-context/SKILL.md` | 同步活跃文件 |
| 2026-06-18T16:40 | `tests/conftest.py` | 更新 docstring 说明 task.py 为 Python 参考实现 |
| 2026-06-18T16:42 | `src/vflow/template_claude/settings.json` | hook 命令 inject.py→inject.mjs |
| 2026-06-18T16:43 | `src/vflow/detect.py` | 支持 inject.mjs 优先、inject.py 回退 |
