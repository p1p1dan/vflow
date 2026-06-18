# 需求分析（SWE.1）

## 原始需求

提交 task.py→task.mjs 修复到 GitHub，并准备 npm 发布（bump 版本号）。

## 澄清问答

需求明确无需澄清。

## 验收条目（R-ID，机械校验锚点）

- R1: 版本号统一升级到 0.8.1（package.json + pyproject.toml + __init__.py）
- R2: 所有变更提交并推送到 GitHub

## 范围边界

- 范围内：版本号更新、git commit、git push
- 范围外：npm publish（用户在另一台设备执行）
