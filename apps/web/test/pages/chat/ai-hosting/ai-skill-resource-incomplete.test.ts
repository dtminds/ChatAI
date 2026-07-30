import { describe, expect, it } from "vitest";
import {
  collectCompleteSkillResourcesFromContent,
  isIncompleteSkillResource,
  listIncompleteSkillResources,
  parseSkillContentSegments,
  replaceSkillContentResource,
  resolveTemplateVariableType,
} from "@/pages/chat/ai-hosting/ai-skill-resource";

describe("ai skill incomplete resources", () => {
  it("detects empty toolId / kbId / variableId / variableType as incomplete", () => {
    const content = [
      '查询 <resource type="tool" toolId="" name="订单查询" />',
      '<resource type="knowledge_base" kbId="" name="售后知识" />',
      '<resource type="variable" variableType="work_tag" variableId="" name="企微标签" />',
      '<resource type="variable" variableType="" variableId="" name="未定类型" />',
      '<resource type="tool" toolId="search_order" name="订单查询" />',
    ].join("");

    const incomplete = listIncompleteSkillResources(content);
    expect(incomplete).toHaveLength(4);
    expect(incomplete.map((item) => item.kind)).toEqual([
      "tool",
      "knowledge_base",
      "variable",
      "variable",
    ]);
    expect(incomplete[2]?.name).toBe("企微标签");
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
      '请调用 <resource type="tool" toolId="" name="订单查询" /> 查询';
    const next =
      '<resource type="tool" toolId="search_order" name="订单查询" />';
    const updated = replaceSkillContentResource(
      source,
      '<resource type="tool" toolId="" name="订单查询" />',
      next,
    );

    expect(updated).toContain('toolId="search_order"');
    expect(listIncompleteSkillResources(updated)).toHaveLength(0);

    const resources = collectCompleteSkillResourcesFromContent(updated);
    expect(resources.tools).toHaveLength(1);
    expect(resources.tools[0]?.toolKey).toBe("search_order");
  });
});
