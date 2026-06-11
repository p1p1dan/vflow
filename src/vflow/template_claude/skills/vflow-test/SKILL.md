---
name: vflow-test
description: 测试基建创建与用例生成：项目无测试目录时创建测试骨架（gtest/Qt Test/pytest + 构建集成），或为指定类/接口生成单元测试用例。实现阶段检测到无测试基建时自动使用；用户也可说"给XX加测试"独立调用。
---

# vflow 测试基建与用例生成

落实"新增代码必须有测试"的硬规则：先有骨架，再有用例，最后有真实运行证据。

## Input 契约

- 模式 A（建骨架）：项目根目录 + 构建系统类型（CMake/qmake/VS 工程，从项目文件自动探测）
- 模式 B（生成用例）：目标类/接口的源码 + 头文件
- `.vflow/config.json`（language、features.qt、build.test_command）

## Steps

### 模式 A：创建测试骨架（仅首次）

1. 探测构建系统：CMakeLists.txt → CMake；*.pro → qmake；*.vcxproj/*.sln → VS
2. 框架选型：Qt 项目（features.qt=true）→ Qt Test（零额外依赖）；非 Qt C++ → gtest（无包管理环境备选 doctest 单头文件）；Python → pytest
3. 创建 `tests/` 目录（镜像源码结构）+ 一条冒烟测试（如 1+1==2）+ 构建集成（CMake: enable_testing+add_subdirectory；qmake: subdirs+QT+=testlib；VS: 测试工程）
4. **编译并运行冒烟测试**，确认骨架可用——失败则修到通过，不留半成品
5. 把测试运行命令写入 config.json 的 build.test_command

### 模式 B：生成测试用例

1. 读目标类/接口源码，列出公共接口清单
2. 每个接口设计用例：正常路径 ≥1 + 边界条件（空输入/极值/非法参数）≥1；算法类补充已知输入→已知输出的样本断言
3. 命名遵循 spec/common/testing.md 第 4 条：`被测行为_条件_预期`
4. 写入 tests/ 对应位置，**编译并运行**，粘贴真实输出

## Output 模板

「🧪 测试骨架已建立：{框架} + {构建系统}，冒烟测试通过（输出：...）」
「🧪 已为 {类名} 新增 {N} 个用例（{M} 通过 / {K} 失败），输出：...」

## Guardrails

- 不允许只写测试代码不运行就报告完成
- 测试失败时：先判断是测试写错还是被测代码有 bug——是 bug 则报告用户，不为了变绿而改弱断言
- 需要图像样本的测试：样本放 tests/data/，禁止依赖机器上的绝对路径
- 不为 getter/setter 之类无逻辑代码生成凑数用例
