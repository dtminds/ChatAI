import { describe, expect, it } from "vitest";
import {
  buildEditableResourcesFromRecommendations,
  buildSkillVariableResourceItem,
  collectCompleteSkillResourcesFromContent,
  getSkillResourceChipName,
  isIncompleteSkillResource,
  listIncompleteSkillResources,
  matchIncompleteResourcesToRecommendations,
  mergeSkillResourceItems,
  parseSkillContentSegments,
  replaceSkillContentResource,
  resolveTemplateVariableType,
  toSkillContentResourceSegment,
} from "@/pages/chat/ai-hosting/ai-skill-resource";

describe("ai skill incomplete resources", () => {
  it("formats tag resource chips with the selected tag count", () => {
    const workTag = buildSkillVariableResourceItem({
      name: "意向标签组 | 高意向、待跟进",
      select_id: 11,
      select_sub_ids: [101, 102],
      type: "work_tag",
    });
    const mallTag = buildSkillVariableResourceItem({
      name: "会员标签 | 金卡会员",
      select_id: 12,
      select_sub_ids: [201],
      type: "mall_tag",
    });
    const sameWorkTagGroup = buildSkillVariableResourceItem({
      name: "意向标签组 | 金卡",
      select_id: 11,
      select_sub_ids: [103],
      type: "work_tag",
    });

    expect(workTag.id).toBe("work_tag:11");
    expect(sameWorkTagGroup.id).toBe(workTag.id);
    expect(mallTag.id).toBe("mall_tag:12");
    expect(getSkillResourceChipName(workTag)).toBe(
      "企微标签 · 意向标签组 · 2个标签",
    );
    expect(getSkillResourceChipName(mallTag)).toBe(
      "小店标签 · 会员标签 · 1个标签",
    );
    expect(toSkillContentResourceSegment(workTag)).toMatchObject({
      name: "企微标签 · 意向标签组 · 2个标签",
      placeholder: expect.stringContaining(
        'name="企微标签 · 意向标签组 · 2个标签"',
      ),
    });
  });

  it("checks toolId, kbId and variable bindings by variableType", () => {
    const content = [
      '<resource type="tool" toolId="" name="订单查询" />',
      '<resource type="knowledge_base" kbId="" name="售后知识" />',
      '<resource type="variable" variableType="work_tag" variableId="" name="企微标签" />',
      '<resource type="variable" variableType="mall_tag" variableId="" name="小店标签" />',
      '<resource type="variable" variableType="custom_field" variableId="" name="自定义属性" />',
      '<resource type="variable" variableType="auto_tag" variableKey="" name="自动化标签" />',
      '<resource type="variable" variableType="" name="未定类型" />',
      '<resource type="tool" toolId="search_order" name="订单查询" />',
      '<resource type="variable" variableType="work_tag" variableId="12" name="已绑企微" />',
      '<resource type="variable" variableType="custom_field" variableId="8" name="已绑自定义属性" />',
      '<resource type="variable" variableType="auto_tag" variableKey="g1" name="已绑自动化" />',
    ].join("");

    const incomplete = listIncompleteSkillResources(content);
    expect(incomplete.map((item) => item.name)).toEqual([
      "订单查询",
      "售后知识",
      "企微标签",
      "小店标签",
      "自定义属性",
      "自动化标签",
      "未定类型",
    ]);
  });

  it("pairs incomplete blue blocks with recommendations when available", () => {
    const incomplete = listIncompleteSkillResources(
      [
        '<resource type="variable" variableType="work_tag" variableId="" name="企微标签" />',
        '<resource type="variable" variableType="custom_field" variableId="" name="自定义属性" />',
        '<resource type="variable" variableType="mall_tag" variableId="" name="小店标签" />',
        '<resource type="knowledge_base" kbId="" name="售后知识" />',
      ].join(""),
    );

    const matched = matchIncompleteResourcesToRecommendations(incomplete, [
      {
        type: "variable",
        variableType: "work_tag",
        title: "企微标签",
        description: "建议选择包含客户基础信息的标签",
      },
      {
        type: "variable",
        variableType: "custom_field",
        title: "自定义属性",
        description: "建议选择包含客户基础信息的自定义信息字段",
      },
    ]);

    expect(matched.map((item) => item.fieldLabel)).toEqual([
      "企微标签",
      "自定义属性",
      "小店标签",
      "售后知识",
    ]);
    expect(matched.map((item) => item.variableType)).toEqual([
      "work_tag",
      "custom_field",
      "mall_tag",
      null,
    ]);
    expect(matched.map((item) => item.recommend?.title ?? null)).toEqual([
      "企微标签",
      "自定义属性",
      null,
      null,
    ]);
    expect(matched).toHaveLength(4);
  });

  it("builds preview editable resources from recommendResources only", () => {
    const editable = buildEditableResourcesFromRecommendations([
      {
        type: "variable",
        variableType: "work_tag",
        title: "企微标签",
        description: "建议选择包含客户基础信息的标签",
      },
      {
        type: "variable",
        title: "客户标签查询",
        description: "无 variableType 时按标题推断",
      },
      {
        type: "tool",
        title: "订单查询",
        description: "查订单",
      },
      {
        type: "knowledge_base",
        title: "美妆护肤",
        description: "知识库",
      },
    ]);

    expect(editable.map((item) => item.fieldLabel)).toEqual([
      "企微标签",
      "客户标签查询",
      "订单查询",
      "美妆护肤",
    ]);
    expect(editable.map((item) => item.description)).toEqual([
      "建议选择包含客户基础信息的标签",
      "无 variableType 时按标题推断",
      "查订单",
      "知识库",
    ]);
    expect(editable.map((item) => item.segment.kind)).toEqual([
      "variable",
      "variable",
      "tool",
      "knowledge_base",
    ]);
    expect(editable.map((item) => item.variableType)).toEqual([
      "work_tag",
      "work_tag",
      null,
      null,
    ]);
    expect(editable.every((item) => item.segment.placeholder.includes("recommendKey="))).toBe(
      true,
    );
  });

  it("returns no editable resources when recommendResources is empty", () => {
    expect(buildEditableResourcesFromRecommendations([])).toEqual([]);
  });

  it("treats empty toolId as incomplete and keeps filled tool complete", () => {
    expect(
      listIncompleteSkillResources(
        '<resource type="tool" toolId="" name="订单查询" />',
      ),
    ).toEqual([
      expect.objectContaining({ kind: "tool", name: "订单查询" }),
    ]);

    expect(
      listIncompleteSkillResources(
        '<resource type="tool" toolId="search_order" name="订单查询" />',
      ),
    ).toHaveLength(0);
  });

  it("treats empty custom_field variableId as incomplete", () => {
    expect(
      listIncompleteSkillResources(
        '<resource type="variable" variableType="custom_field" variableId="" name="自定义属性" />',
      ),
    ).toEqual([
      expect.objectContaining({ kind: "variable", name: "自定义属性" }),
    ]);

    expect(
      listIncompleteSkillResources(
        '<resource type="variable" variableType="custom_field" variableId="8" name="性别" />',
      ),
    ).toHaveLength(0);
  });

  it("treats empty knowledge_base kbId as incomplete and keeps filled kb complete", () => {
    const incompleteOnly = listIncompleteSkillResources(
      '<resource type="knowledge_base" kbId="" name="售后知识" />',
    );
    expect(incompleteOnly).toHaveLength(1);
    expect(incompleteOnly[0]?.kind).toBe("knowledge_base");
    expect(incompleteOnly[0]?.name).toBe("售后知识");

    const filled = listIncompleteSkillResources(
      '<resource type="knowledge_base" kbId="21" name="售后知识" />',
    );
    expect(filled).toHaveLength(0);

    const replaced = replaceSkillContentResource(
      '参考 <resource type="knowledge_base" kbId="" name="售后知识" />',
      '<resource type="knowledge_base" kbId="" name="售后知识" />',
      '<resource type="knowledge_base" kbId="21" name="真实售后库" />',
    );
    expect(replaced).toBe(
      '参考 <resource type="knowledge_base" kbId="21" name="真实售后库" />',
    );
    expect(listIncompleteSkillResources(replaced)).toHaveLength(0);
  });

  it("ignores system_variable resources even when bindings look empty", () => {
    const content = [
      '<resource type="variable" variableType="system_variable" variableKey="" name="系统变量" />',
      '<resource type="variable" variableType="system_variable" variableKey="now" name="当前时间" />',
      '<resource type="variable" variableType="work_tag" variableId="" name="企微标签" />',
    ].join("");

    const incomplete = listIncompleteSkillResources(content);
    expect(incomplete).toHaveLength(1);
    expect(incomplete[0]?.name).toBe("企微标签");
  });

  it("resolves variable type from attribute or name heuristics", () => {
    const [variable] = parseSkillContentSegments(
      '<resource type="variable" variableType="" name="企微标签" />',
    ).filter((segment) => segment.type === "resource");

    expect(variable?.type).toBe("resource");
    if (variable?.type !== "resource") {
      return;
    }

    expect(isIncompleteSkillResource(variable)).toBe(true);
    expect(resolveTemplateVariableType(variable)).toBe("work_tag");
  });

  it("normalizes legacy variable names when parsing and rebuilding", () => {
    const content =
      '使用 <resource type="variable" variableType="work_tag" variableId="11" name="客户标签 · 企微标签 · 意向标签组 · 高意向" /> 回复';
    const segments = parseSkillContentSegments(content);
    const variable = segments.find((segment) => segment.type === "resource");

    expect(variable?.type).toBe("resource");
    if (variable?.type !== "resource") {
      return;
    }

    expect(variable.name).toBe("企微标签 · 意向标签组 | 高意向");
    expect(variable.placeholder).toContain('name="企微标签 · 意向标签组 | 高意向"');
    expect(segments.at(-1)).toEqual({ type: "text", value: " 回复" });

    const resources = collectCompleteSkillResourcesFromContent(content);
    expect(resources.variables).toHaveLength(1);
    expect(resources.variables[0]?.title).toBe("企微标签 · 意向标签组 | 高意向");
    expect(resources.variables[0]?.variable?.name).toBe("意向标签组 | 高意向");
    expect(getSkillResourceChipName(resources.variables[0]!)).toBe(
      "企微标签 · 意向标签组 | 高意向",
    );
    expect(toSkillContentResourceSegment(resources.variables[0]!).placeholder).toBe(
      resources.variables[0]?.placeholder,
    );
  });

  it("merges repeated tag groups using the latest configured selection", () => {
    const restored = buildSkillVariableResourceItem({
      name: "意向标签组",
      select_id: 11,
      select_sub_ids: [],
      type: "work_tag",
    });
    const configured = buildSkillVariableResourceItem({
      name: "意向标签组 | 高意向",
      select_id: 11,
      select_sub_ids: [101],
      type: "work_tag",
    });

    expect(mergeSkillResourceItems([restored], [configured])).toEqual([
      configured,
    ]);
  });

  it("removes repeated system variable prefixes from loaded resources", () => {
    const resource = buildSkillVariableResourceItem({
      name: "系统变量 · 系统变量 · 会话类型",
      select_key: "chat_type",
      type: "system_variable",
    });

    expect(resource.title).toBe("系统变量 · 会话类型");
    expect(resource.placeholder).toContain('name="系统变量 · 会话类型"');
    expect(resource.variable?.name).toBe("会话类型");
  });

  it("replaces incomplete placeholders and collects complete resources", () => {
    const source =
      '请参考 <resource type="knowledge_base" kbId="" name="售后知识" />';
    const next =
      '<resource type="knowledge_base" kbId="21" name="真实售后库" />';
    const updated = replaceSkillContentResource(
      source,
      '<resource type="knowledge_base" kbId="" name="售后知识" />',
      next,
    );

    expect(updated).toContain('kbId="21"');
    expect(listIncompleteSkillResources(updated)).toHaveLength(0);

    const resources = collectCompleteSkillResourcesFromContent(updated);
    expect(resources["knowledge-bases"]).toHaveLength(1);
    expect(resources["knowledge-bases"][0]?.kbId).toBe(21);
  });
});
