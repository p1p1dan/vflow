# 验证（SWE.4/5/6）

## §1 单元测试（按 R-ID 逐条闭环）

- R1: `node src/vflow/cli.mjs --version` 输出 `0.6.1`，与 package.json `"version": "0.6.1"` 一致，证明从 package.json 动态读版本号生效，单一真源建立。
- R2: 解压 `p1lab-vflow-0.6.1.tgz` 后用 grep 扫 `aiclient|gitlab|192.168|jyw_ai|公司|内网|内部 AI` 全部 0 命中（第二次扫描结果："No matches found"）。
- R3: `npm view @p1lab/vflow version` 返回 `0.6.1`，发布时间 `2026-06-17T06:20:40.707Z`，registry 已收录。

## §2 集成测试

不适用（理由：本任务仅涉及常量来源改写 + 文档清理，无新增业务逻辑分支；R3 的"成功发布"本身就是端到端集成，已通过 `npm view` 验证）

## §3 合规检查（可选）

未开启

## 规范自检结论

| 维度 | 结论 | 问题数 |
| :--- | :--- | :--- |
| 完整性 | 3 个 R-ID 全闭环 | 0 |
| 正确性 | 版本号 / 发布 / 内容扫描三重证据 | 0 |
| 一致性 | package.json / cli.mjs / npm registry 版本号三处一致 | 0 |

### 问题清单

无

## 变更说明

修复 cli.mjs 硬编码 `VERSION='0.5.1'` 导致 0.6.0 发布后 `vflow --version` 误报旧版的 bug；改为运行时读 `package.json`，消除双源。同步删除 README 中两处"公司内网 GitLab"安装方式与"方式三 公司内部 AI Client"，避免内部网络/产品信息随 npm 包外泄。发布 @p1lab/vflow@0.6.1。影响范围：所有未来 npm 用户的 `vflow --version` 行为；公开渠道（npm + README）不再出现内部信息。

## 机器执行记录（task.py 写入，请勿手改）
- 命令: `node src/vflow/cli.mjs --version`
- 时间: 2026-06-17T14:25:51
- 退出码: 0
```
0.6.1
```
