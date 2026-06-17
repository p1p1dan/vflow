# 设计（SWE.2 + SWE.3）

## 架构影响

无架构影响

## 方案概述

`cli.mjs` 用 `fs.readFileSync` 从 `package.json` 动态读取版本号，消除双源；同步 bump `package.json` 到 0.6.1；删除 README 中三处公司内部信息（GitLab 内网链接×2、AI Client 方式三）。

## 改动清单

| 文件 | 改动类型 | 说明 |
| :--- | :--- | :--- |
| `src/vflow/cli.mjs` | 修改 | VERSION 改为运行时读 package.json |
| `package.json` | 修改 | 0.6.0 → 0.6.1 |
| `README.md` | 修改 | 删 GitLab×2、AI Client 方式三；"四种"→"三种" |

## 关联规范

| spec 文件 | 适用理由 |
| :--- | :--- |
| `.vflow/spec/common/general.md` | KISS / DRY 单一真源 |

## 关键设计决策

- 版本号读取用 `fs.readFileSync` 而非 import assertion：兼容 Node 18，KISS。

## 测试方案

| 用例 | 验证什么 | 位置 |
| :--- | :--- | :--- |
| 手动 `node cli.mjs --version` | 输出与 package.json 一致 | 本机执行 |
| `tar -tzf` + grep 扫描 | tarball 内无内部信息 | 本机执行 |

> test_scope: 本任务无新增逻辑分支，仅常量来源变更 + 文档清理，不引入新 pytest 用例

## 任务清单

- [x] 1.1 cli.mjs 改读 package.json (R1)
- [x] 1.2 package.json bump 0.6.1 (R3)
- [x] 1.3 README 清理内部信息 (R2)
- [x] 1.4 二次扫描 + 本地 `--version` 验证 (R1,R2)
- [x] 1.5 npm publish (R3)
- [x] 1.6 git commit + push (R2,R3)

## 风险与审批

- 风险级别：low（单点改动 + 文档清理 + 已发布过相同包名）
- 审批记录：用户原话"修"（启动）、"1.发到npm 2.commit并push"（发布授权），时间 2026-06-17 14:0x
