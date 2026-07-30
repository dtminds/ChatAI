import { describe, expect, it } from "vitest";
import {
  collectCompleteSkillResourcesFromContent,
  isIncompleteSkillResource,
  listIncompleteSkillResources,
  matchIncompleteResourcesToRecommendations,
  parseSkillContentSegments,
  replaceSkillContentResource,
  resolveTemplateVariableType,
} from "@/pages/chat/ai-hosting/ai-skill-resource";

describe("ai skill incomplete resources", () => {
  it("checks kbId and variable bindings by variableType, skips tools", () => {
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
      '<resource type="variable" variableType="auto_tag" variableKey="g1" name="已绑自动化" />',
    ].join("");

    const incomplete = listIncompleteSkillResources(content);
    expect(incomplete.map((item) => item.name)).toEqual([
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

  it("ignores tool resources even when toolId is empty", () => {
    expect(
      listIncompleteSkillResources(
        '<resource type="tool" toolId="" name="订单查询" />',
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
