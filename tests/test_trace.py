# -*- coding: utf-8 -*-
"""R-ID 追溯链纯函数测试（R3）。"""


def test_parse_rid_definitions_normal(trace_mod):
    text = "# 需求\n\n- R1: 支持输入校验\n- R2: 错误时返回码 -1\n"
    assert trace_mod.parse_rid_definitions(text) == {"R1", "R2"}


def test_parse_rid_definitions_chinese_colon(trace_mod):
    text = "- R1： 中文冒号也算定义\n"
    assert trace_mod.parse_rid_definitions(text) == {"R1"}


def test_parse_rid_definitions_template_residue_not_counted(trace_mod):
    # 模板残留 "- R1:"（冒号后无内容）不算已定义
    text = "## §1 单元测试\n\n- R1:\n- R2:   \n"
    assert trace_mod.parse_rid_definitions(text) == set()


def test_parse_rid_references_checklist_only(trace_mod):
    text = "\n".join([
        "- [ ] 1.1 实现校验器 (R1)",
        "- [x] 1.2 错误处理 (R2,R3)",
        "- [X] 1.3 中文括号（R4）",
        "- [ ] 1.4 顿号分隔 (R5、R6)",
        "普通行提到 (R9) 不算引用",
        "- 非 checklist 列表项 (R8) 也不算",
    ])
    assert trace_mod.parse_rid_references(text) == {"R1", "R2", "R3", "R4", "R5", "R6"}


def test_check_rid_coverage_full(trace_mod):
    ok, msgs = trace_mod.check_rid_coverage({"R1", "R2"}, {"R1", "R2"}, "design.md")
    assert ok and msgs == []


def test_check_rid_coverage_missing_fails(trace_mod):
    ok, msgs = trace_mod.check_rid_coverage({"R1", "R2"}, {"R1"}, "design.md")
    assert not ok
    assert any("missing R2" in m for m in msgs)


def test_check_rid_coverage_extra_only_warns(trace_mod):
    ok, msgs = trace_mod.check_rid_coverage({"R1"}, {"R1", "R5"}, "design.md")
    assert ok
    assert any(m.startswith("warning:") and "R5" in m for m in msgs)


def test_verify_section_extracts_body(trace_mod):
    text = "\n".join([
        "# 验证",
        "## §1 单元测试",
        "- R1: 通过",
        "## §2 集成测试",
        "不适用",
    ])
    sec1 = trace_mod.verify_section(text, 1)
    assert "- R1: 通过" in sec1
    assert "不适用" not in sec1
    sec3 = trace_mod.verify_section(text, 3)
    assert sec3 == ""
