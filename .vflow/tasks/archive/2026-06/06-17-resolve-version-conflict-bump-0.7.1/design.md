# 设计（SWE.2 + SWE.3）

## 架构影响

无架构影响

## 方案概述

`git pull --rebase origin main` 将本地两个 commit 重放到 8ba1292 之上；package.json 冲突时取 0.7.1（既高于已发 npm 的 0.6.1，又高于远端 bump 的 0.7.0），保留 cli.mjs 修复和 README 清理；rebase 完成后 `npm publish` 0.7.1（用户提供 OTP），最后 `git push`。

## 改动清单

| 文件 | 改动类型 | 说明 |
| :--- | :--- | :--- |
| `package.json` | rebase 冲突解决 | version 取 0.7.1 |
| git 历史 | rebase | 本地 2 commit 重放到 origin/main 之上 |

## 关键设计决策

- **不用 force push**：rebase 把远端 commit 保留在历史中（R1）。
- **版本号选 0.7.1 而非 0.7.0**：避免与 npm 已发的 0.6.1 之间的"版本号倒退"嫌疑，且越过远端期待的 0.7.0，未来谁拉都拿到统一带修复的版本。

## 测试方案

| 用例 | 验证什么 | 位置 |
| :--- | :--- | :--- |
| `node src/vflow/cli.mjs --version` → 0.7.1 | 版本号读取正确 | 本机 |
| `npm view @p1lab/vflow version` → 0.7.1 | 发布生效 | 本机 |

> test_scope 沿用同一冒烟命令

## 任务清单

- [x] 1.1 git pull --rebase origin main（package.json 冲突手解 → 0.7.1）(R1)
- [x] 1.2 npm publish --access public --otp=XXXXXX (R2)
- [x] 1.3 git push origin main (R1,R3)

## 风险与审批

- 风险级别：low（rebase 仅本地两个未推送 commit；package.json 单文件冲突无歧义）
- 审批记录：用户原话"A"（2026-06-17 14:35），选定方案 A
