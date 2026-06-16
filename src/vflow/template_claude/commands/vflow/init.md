---
description: 'vflow 项目初始化：AI 扫描项目自动探测构建系统/核心模块/特性，填写 config.json'
---

# /vflow:init — 项目配置初始化

$ARGUMENTS

> 与 CLI 的 `vflow init`（拷贝文件）互补：本命令负责**用 AI 读懂项目**，把人工填配置变成 AI 探测+人确认。装完 vflow 后在项目里跑一次。

## 流程

### 阶段 0：启用检查

项目根目录无 `.vflow/` → 先执行 `vflow init . --yes` 完成启用（会自动清除"不启用"标记），再继续阶段 A。

### 阶段 A：全仓清点

按优先级取信息源，**先看 manifest，再扫目录，最后查 git**。

1. **优先读 manifest 文件**（按存在性，任一存在即采纳）：
   `README.md` / `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `CMakeLists.txt` / `*.sln` / `*.pro`
2. **条件读取**（如存在，提取项目描述/约定，权重高于目录推断）：
   `.claude/CLAUDE.md`
3. **顶层目录结构**（`ls` 2 层深度），跳过以下噪声目录：
   - 工具元数据：`.vflow/` `.git/` `.idea/` `.vscode/`
   - 第三方/产物：`node_modules/` `vendor/` `third_party/` `build/` `dist/` `target/` `out/`
4. **git 历史**（仅当 `.git/` 存在，跑命令，不读目录）：
   - `git log --name-only -50 | sort | uniq -c | sort -rn | head -20`
     → 高频改动文件，用于辅助推断 `core_paths`
   - `git log --oneline --since=3.months | wc -l`
     → 项目活跃度参考
5. **统计主要语言**（按扩展名，排除上述跳过目录）：`.cpp/.h/.py/.cs/.js/.ts/.go/.rs` 等

### 阶段 B：特征探测

| 探测项 | 方法 |
| :--- | :--- |
| 构建系统 | CMakeLists.txt → CMake；*.pro → qmake；*.sln/*.vcxproj → VS；setup.py/pyproject → Python；package.json → npm/pnpm/yarn；Cargo.toml → cargo；go.mod → go |
| 构建命令 | 按构建系统给出常用命令草案（如 `cmake --build build`），不臆造路径；优先用 manifest 里 scripts 段已声明的命令 |
| qt 特性 | .pro 文件 / CMake 中 find_package(Qt..) / #include <Q...> |
| embedded 特性 | 零长数组、volatile 寄存器、__attribute__、fpga/driver 等目录名 |
| binding 特性 | pybind11/SWIG/P-Invoke/extern "C" 导出 |
| 测试现状 | tests/ 目录是否存在、用什么框架 |
| test_required | 默认 true（新增代码必须有测试）；探测结果中向用户确认是否保持 |
| core_paths | 双信号源：(1) git log 热点文件目录（首选，准确度高）(2) 被引用最多的核心目录（fallback，从命名和 include 关系推断）|

**空项目快速路径**：若阶段 A 的 manifest 全无、源码文件 ≤ 2 个、且无 git 历史 → 跳过阶段 B 详细探测，直接进入阶段 C 展示"空项目（无可探测特征）"草案。

### 阶段 C：确认与写入 [HARD STOP]

展示探测结果草案：

```
🔍 vflow 项目探测结果
  项目: {名称}  主语言: {…}  构建: {系统 + 命令草案}
  特性: qt={y/n} embedded={y/n} binding={…}
  测试: {有/无测试目录，框架} | 测试硬规则: {启用(默认)/关闭}
  core_paths 候选: [...]（这些路径的改动将触发高风险双审批）
确认无误回复 ok，或直接指出需要修改的项。
```

用户确认后写入 `.vflow/config.json`（保留已有的 journal 等配置，只更新探测字段），并将 `initialized` 设为 `true` 标记探测完成。`enabled` 保持原值不动（默认 true；若用户主动设为 false 表示禁用 vflow，探测不应覆盖此选择）。

### 阶段 D：收尾建议

- 无测试目录 → 提示"可运行 /vflow:go 给项目搭测试骨架（vflow-test）"
- 输出一行使用引导："之后直接说需求即可自动判级，或用 /vflow:go"

## 安全边界

1. 只读源码 + 只写 `.vflow/config.json`，不改任何源代码
2. 跳过第三方库目录（third_party/vendor/external 等）和工具元数据目录（.vflow/.git/.idea/.vscode 等），不将其计入 core_paths
3. 探测不确定的项标注"待确认"，不臆造
4. git 命令仅用于读取历史信息（log/diff/blame），禁止任何写操作（commit/push/reset 等）
