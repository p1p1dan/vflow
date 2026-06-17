# Implementation Log

| Time | File | Change |
| :--- | :--- | :--- |
| 2026-06-17 14:05 | src/vflow/cli.mjs | 删除硬编码 VERSION='0.5.1'，改为从 package.json 动态读 (R1) |
| 2026-06-17 14:06 | package.json | version 0.6.0 → 0.6.1 (R3) |
| 2026-06-17 14:07 | README.md | 删除"公司内网 GitLab"×2、方式三 AI Client；"四种"→"三种" (R2) |
| 2026-06-17 14:20 | package.json | npm pkg fix 规范化：bin 去掉 `./`、repo url 加 `git+` 前缀 |
| 2026-06-17 14:22 | (npm registry) | publish @p1lab/vflow@0.6.1（用户用 OTP 自跑）(R3) |
| 2026-06-17 14:30 | .gitignore | 加 .vflow/journal/、.vflow/.runtime/（已有改动）+ 补 .tmp_pkg/、*.tgz |
