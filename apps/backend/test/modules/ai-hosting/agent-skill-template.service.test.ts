import { beforeEach, describe, expect, it } from "vitest";
import {
  AgentSkillTemplateService,
  parseRecommendResources,
} from "../../../src/modules/ai-hosting/agent-skill-template.service.js";

describe("parseRecommendResources", () => {
  it("parses typed recommend resource arrays", () => {
    expect(
      parseRecommendResources(
        JSON.stringify([
          { type: "variable", title: "客户标签查询", description: "按肤质筛选" },
          { type: "tool", title: "订单查询", description: "查物流" },
          { type: "kb", title: "美妆护肤", description: "这是描述" },
        ]),
      ),
    ).toEqual([
      { type: "variable", title: "客户标签查询", description: "按肤质筛选" },
      { type: "tool", title: "订单查询", description: "查物流" },
      { type: "knowledge_base", title: "美妆护肤", description: "这是描述" },
    ]);
  });

  it("parses resourceType + variableType recommend arrays", () => {
    expect(
      parseRecommendResources(
        JSON.stringify([
          {
            resourceType: "variable",
            variableType: "work_tag",
            description: "建议选择包含客户基础信息的标签",
          },
          {
            resourceType: "variable",
            variableType: "custom_field",
            description: "建议选择包含客户基础信息的自定义信息字段",
          },
          {
            resourceType: "tool",
            title: "订单查询",
            description: "根据客户聊天消息中给到的订单号查询订单信息",
          },
          {
            resourceType: "knowledge_base",
            title: "美妆护肤",
            description: "这是描述",
          },
        ]),
      ),
    ).toEqual([
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
      {
        type: "tool",
        title: "订单查询",
        description: "根据客户聊天消息中给到的订单号查询订单信息",
      },
      {
        type: "knowledge_base",
        title: "美妆护肤",
        description: "这是描述",
      },
    ]);
  });

  it("parses grouped recommend resource objects", () => {
    expect(
      parseRecommendResources(
        JSON.stringify({
          variables: [{ title: "客户标签", description: "描述" }],
          tools: [{ name: "订单查询" }],
          knowledge_bases: [{ title: "护肤知识库", desc: "说明" }],
        }),
      ),
    ).toEqual([
      { type: "variable", title: "客户标签", description: "描述" },
      { type: "tool", title: "订单查询", description: "" },
      { type: "knowledge_base", title: "护肤知识库", description: "说明" },
    ]);
  });
});

describe("AgentSkillTemplateService", () => {
  const groups: Array<{ id: number; name: string; sort: number; status: number }> = [];
  const selectedColumns = new Map<string, unknown[]>();
  const templates: Array<{
    apply_scene: string | null;
    content: string | null;
    desc: string;
    group_id: number;
    icon: string;
    id: number;
    name: string;
    recommend_resources: string | null;
    sort: number;
    status: number;
    tip: string;
  }> = [];

  beforeEach(() => {
    groups.length = 0;
    selectedColumns.clear();
    templates.length = 0;

    groups.push(
      { id: 2, name: "美妆护肤", sort: 20, status: 1 },
      { id: 1, name: "私域通用", sort: 10, status: 1 },
      { id: 3, name: "已下线分组", sort: 30, status: 0 },
    );

    templates.push(
      {
        id: 11,
        group_id: 1,
        name: "客户标签查询",
        icon: "",
        desc: "标签说明",
        tip: "我适合什么产品？",
        apply_scene: "咨询肤质时",
        content: "根据标签推荐",
        recommend_resources: JSON.stringify([
          { type: "variable", title: "客户标签", description: "建议选肤质标签组" },
        ]),
        sort: 5,
        status: 1,
      },
      {
        id: 12,
        group_id: 2,
        name: "肤质适配推荐",
        icon: "https://example.com/icon.png",
        desc: "适配说明",
        tip: "敏感肌能用吗？",
        apply_scene: "咨询适配时",
        content: "结合肤质回答",
        recommend_resources: null,
        sort: 8,
        status: 1,
      },
      {
        id: 13,
        group_id: 2,
        name: "未上线模版",
        icon: "",
        desc: "",
        tip: "",
        apply_scene: "",
        content: "",
        recommend_resources: null,
        sort: 9,
        status: 0,
      },
      {
        id: 14,
        group_id: 99,
        name: "无分组模版",
        icon: "",
        desc: "",
        tip: "",
        apply_scene: "",
        content: "",
        recommend_resources: null,
        sort: 1,
        status: 1,
      },
    );
  });

  function createService() {
    const db = {
      selectFrom(table: string) {
        const wheres: Array<[string, string, unknown]> = [];
        const orderBys: Array<[string, "asc" | "desc"]> = [];

        const builder = {
          select(columns: unknown) {
            selectedColumns.set(
              table,
              Array.isArray(columns) ? columns : [columns],
            );
            return builder;
          },
          where(column: string, operator: string, value: unknown) {
            wheres.push([column, operator, value]);
            return builder;
          },
          orderBy(column: string, direction: "asc" | "desc" = "asc") {
            orderBys.push([column, direction]);
            return builder;
          },
          async execute() {
            const source =
              table === "xy_wap_embed_agent_skill_template_group"
                ? groups
                : templates;

            let rows = source.filter((row) =>
              wheres.every(([column, operator, value]) => {
                expect(operator).toBe("=");
                return (row as Record<string, unknown>)[column] === value;
              }),
            );

            for (const [column, direction] of [...orderBys].reverse()) {
              rows = [...rows].sort((left, right) => {
                const leftValue = Number((left as Record<string, unknown>)[column]);
                const rightValue = Number((right as Record<string, unknown>)[column]);
                return direction === "desc"
                  ? rightValue - leftValue
                  : leftValue - rightValue;
              });
            }

            return rows;
          },
          async executeTakeFirst() {
            return (await builder.execute())[0];
          },
        };

        return builder;
      },
    };

    return new AgentSkillTemplateService(db as never);
  }

  it("lists active groups with online templates only", async () => {
    const response = await createService().listMarketplace();

    expect(response.groups).toEqual([
      {
        id: "2",
        name: "美妆护肤",
        templates: [
          {
            id: "12",
            name: "肤质适配推荐",
            icon: "https://example.com/icon.png",
            description: "适配说明",
            tip: "敏感肌能用吗？",
          },
        ],
      },
      {
        id: "1",
        name: "私域通用",
        templates: [
          {
            id: "11",
            name: "客户标签查询",
            icon: "",
            description: "标签说明",
            tip: "我适合什么产品？",
          },
        ],
      },
    ]);
    expect(
      selectedColumns.get("xy_wap_embed_agent_skill_template"),
    ).toEqual([
      "id",
      "group_id",
      "name",
      "icon",
      "desc",
      "tip",
    ]);
  });

  it("loads full detail only for an online template in an active group", async () => {
    await expect(createService().getTemplate("11")).resolves.toEqual({
      id: "11",
      name: "客户标签查询",
      icon: "",
      description: "标签说明",
      tip: "我适合什么产品？",
      applyScene: "咨询肤质时",
      content: "根据标签推荐",
      recommendResources: [
        {
          type: "variable",
          title: "客户标签",
          description: "建议选肤质标签组",
        },
      ],
    });
  });

  it("hides online templates whose group is not active", async () => {
    await expect(createService().getTemplate("14")).rejects.toMatchObject({
      code: "SKILL_TEMPLATE_NOT_FOUND",
    });
  });
});
