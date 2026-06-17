# 需求分析（SWE.1）

## 原始需求

我拉了最新的vflow，现在需要推送到npm，帮我看啊可能 → 排查发现 cli.mjs 硬编码 VERSION='0.5.1'，导致 0.6.0 发布后 `vflow --version` 仍报旧版；同时用户要求 npm 包不得出现 gitlab/aiclient 等公司内部信息。

## 澄清问答

| # | 问题 | 用户回答 |
| :-- | :--- | :--- |
| 1 | 是否要修复 + 发新版？ | 修 |
| 2 | 发布后 git 怎么处理？ | commit + push |

## 验收条目（R-ID）

- R1: `vflow --version` 输出与 package.json 一致（单一真源，从 package.json 动态读）
- R2: npm 包 tarball 内无 `gitlab` / `aiclient` / `192.168.*` / `公司内网` / `公司内部 AI` 等内部信息
- R3: 新版本号 0.6.1 成功发布到 npm registry（@p1lab/vflow@0.6.1）

## 范围边界

- 范围内：cli.mjs 版本号机制、README 清理、npm publish、git commit + push
- 范围外：Python 旧版 cli.py（pip 安装路径，本次不动）、内网 GitLab 远端（不 push）
