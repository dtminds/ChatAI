import { describe, expect, it, vi } from "vitest";
import { AgentSkillResourceService } from "../../../src/modules/ai-hosting/agent-skill-resource.service.js";

describe("AgentSkillResourceService", () => {
  it("resolves each resource type in batches and follows tag pagination", async () => {
    const executeKnowledgeBaseQuery = vi.fn(async () => [
      { id: 1, name: "可用知识库", status: 1 },
      { id: 2, name: "已删除知识库", status: 0 },
    ]);
    const db = createKnowledgeBaseDb(executeKnowledgeBaseQuery);
    const listFields = vi.fn(async () => ({
      fields: [
        { id: 11, key: "11", options: [], sort: 1, title: "客户等级", type: 1 },
        { id: 12, key: "12", options: [], sort: 2, title: "客户来源", type: 1 },
      ],
    }));
    const listGroups = vi.fn(async () => ({
      groups: [
        { attr: 1, id: 21, name: "意向标签", tagCount: 1 },
        { attr: 1, id: 22, name: "会员标签", tagCount: 1 },
      ],
    }));
    const listTags = vi.fn(async (_uid: number, options: { page?: number }) =>
      options.page === 1
        ? {
            pagination: { hasNext: true, page: 1, pageSize: 200, total: 2 },
            tags: [
              {
                groupAttr: 1,
                groupId: 21,
                groupName: "意向标签",
                groupSort: 2,
                id: 211,
                name: "高意向",
                type: 0,
              },
            ],
          }
        : {
            pagination: { hasNext: false, page: 2, pageSize: 200, total: 2 },
            tags: [
              {
                groupAttr: 1,
                groupId: 22,
                groupName: "会员标签",
                groupSort: 1,
                id: 221,
                name: "金卡",
                type: 0,
              },
            ],
          },
    );
    const service = new AgentSkillResourceService(
      db as never,
      {
        cdpTagService: { listGroups: vi.fn() },
        customFieldService: { listFields },
        systemVariableService: { listAvailable: vi.fn() },
        workTagService: { listGroups, listTags },
      } as never,
    );

    const resources = await service.resolveResources(9001, {
      content:
        '<resource type="knowledge_base" kbId="3" name="旧知识库" />' +
        '<resource type="tool" toolId="missing_tool" name="旧工具" />',
      kbs: [1, 2, 3],
      tools: ["search_order", "missing_tool"],
      variables: [
        { name: "旧等级", select_id: 11, type: "custom_field" },
        { name: "旧来源", select_id: 12, type: "custom_field" },
        {
          name: "旧标签",
          select_id: 21,
          select_sub_ids: [211],
          type: "work_tag",
        },
        {
          name: "旧标签组",
          select_id: 22,
          select_sub_ids: [],
          type: "work_tag",
        },
      ],
    });

    expect(executeKnowledgeBaseQuery).toHaveBeenCalledTimes(1);
    expect(listFields).toHaveBeenCalledTimes(1);
    expect(listGroups).toHaveBeenCalledTimes(1);
    expect(listTags).toHaveBeenCalledTimes(2);
    expect(resources.knowledgeBases).toEqual([
      expect.objectContaining({ kbId: 1, name: "可用知识库", status: "available" }),
      expect.objectContaining({
        invalidReason: "deleted",
        kbId: 2,
        status: "invalid",
      }),
      expect.objectContaining({
        invalidReason: "unavailable",
        kbId: 3,
        name: "旧知识库",
        status: "invalid",
      }),
    ]);
    expect(resources.tools).toEqual([
      expect.objectContaining({ name: "订单查询", status: "available" }),
      expect.objectContaining({
        invalidReason: "unavailable",
        name: "旧工具",
        status: "invalid",
      }),
    ]);
    expect(resources.variables).toEqual([
      expect.objectContaining({ name: "自定义属性 · 客户等级", status: "available" }),
      expect.objectContaining({ name: "自定义属性 · 客户来源", status: "available" }),
      expect.objectContaining({ name: "企微标签 · 意向标签 | 高意向", status: "available" }),
      expect.objectContaining({ name: "企微标签 · 会员标签", status: "available" }),
    ]);
    expect(resources.variables[2]?.id).toBe("work_tag:21");
    expect(resources.variables[3]?.id).toBe("work_tag:22");
  });

  it("marks only the failed upstream resource type unavailable", async () => {
    const service = new AgentSkillResourceService(
      createKnowledgeBaseDb(vi.fn(async () => [])) as never,
      {
        cdpTagService: { listGroups: vi.fn() },
        customFieldService: {
          listFields: vi.fn(async () => {
            throw new Error("upstream unavailable");
          }),
        },
        systemVariableService: {
          listAvailable: vi.fn(async () => ({
            variables: [{ key: "customer_nickname", name: "客户昵称" }],
          })),
        },
        workTagService: { listGroups: vi.fn(), listTags: vi.fn() },
      } as never,
    );

    const resources = await service.resolveResources(9001, {
      content: "",
      kbs: [],
      tools: [],
      variables: [
        { name: "客户等级", select_id: 11, type: "custom_field" },
        {
          name: "昵称",
          select_key: "customer_nickname",
          type: "system_variable",
        },
      ],
    });

    expect(resources.variables).toEqual([
      expect.objectContaining({
        invalidReason: "unavailable",
        status: "invalid",
      }),
      expect.objectContaining({
        name: "系统变量 · 客户昵称",
        status: "available",
      }),
    ]);
  });
});

function createKnowledgeBaseDb(execute: () => Promise<unknown[]>) {
  return {
    selectFrom(table: string) {
      expect(table).toBe("xy_wap_embed_agent_kb");
      const builder = {
        execute,
        select() {
          return builder;
        },
        where() {
          return builder;
        },
      };
      return builder;
    },
  };
}
