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

1. 顶层目录结构（`ls` / 浏览 2 层深度，跳过 build/node_modules/第三方库目录）
2. 统计主要语言（按扩展名：.cpp/.h/.py/.cs）

### 阶段 B：特征探测

| 探测项 | 方法 |
| :--- | :--- |
| 构建系统 | CMakeLists.txt → CMake；*.pro → qmake；*.sln/*.vcxproj → VS；setup.py/pyproject → Python |
| 构建命令 | 按构建系统给出常用命令草案（如 `cmake --build build`），不臆造路径 |
| qt 特性 | .pro 文件 / CMake 中 find_package(Qt..) / #include <Q...> |
| embedded 特性 | 零长数组、volatile 寄存器、__attribute__、fpga/driver 等目录名 |
| binding 特性 | pybind11/SWIG/P-Invoke/extern "C" 导出 |
| 测试现状 | tests/ 目录是否存在、用什么框架 |
| core_paths | 候选 = 被引用最多的算法/核心目录（如 src/algorithm/）；从命名和 include 关系推断 |

### 阶段 C：确认与写入 [HARD STOP]

展示探测结果草案：

```
🔍 vflow 项目探测结果
  项目: {名称}  主语言: {…}  构建: {系统 + 命令草案}
  特性: qt={y/n} embedded={y/n} binding={…}
  测试: {有/无测试目录，框架}
  core_paths 候选: [...]（这些路径的改动将触发高风险双审批）
确认无误回复 ok，或直接指出需要修改的项。
```

用户确认后写入 `.vflow/config.json`（保留已有的 journal 等配置，只更新探测字段）。

### 阶段 D：收尾建议

- 无测试目录 → 提示"可运行 /vflow:go 给项目搭测试骨架（vflow-test）"
- 输出一行使用引导："之后直接说需求即可自动判级，或用 /vflow:go"

## 安全边界

1. 只读源码 + 只写 `.vflow/config.json`，不改任何源代码
2. 跳过第三方库目录（third_party/vendor/external 等），不将其计入 core_paths
3. 探测不确定的项标注"待确认"，不臆造
