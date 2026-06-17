# Implementation Log

| Time | File | Change |
| :--- | :--- | :--- |
| 17:30 | src/vflow/template_claude/skills/* | 从 template_agents/skills/ 移入 13 个 SKILL.md |
| 17:30 | src/vflow/template_agents/ | 删除整个目录 |
| 17:31 | package.json | 移除 template_agents/**/* 条目 |
| 17:32 | src/vflow/cli.mjs | 移除 SRC_AGENTS；installProjectAgents→installProjectSkills 目标改 .claude；新增 MIGRATED_AGENTS_SKILLS 迁移清理 |
| 17:35 | src/vflow/cli.py | 同 cli.mjs：移除 SRC_AGENTS；install_project_agents→install_project_skills；新增迁移清理 |
| 17:38 | tests/test_cli_hooks.py | 路径断言改 .claude/skills；新增 test_migrated_agents_skills_cleaned_on_install；更新 mjs 常量检查 |
