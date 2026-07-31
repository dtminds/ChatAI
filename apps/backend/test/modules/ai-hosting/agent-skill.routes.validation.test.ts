import { afterEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import {
  AgentSkillSaveRequestSchema,
  type AgentSkillSaveRequest,
} from "@chatai/contracts";

describe("agent skill save body schema", () => {
  let app: ReturnType<typeof Fastify> | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("accepts work_tag variables with select_sub_ids", async () => {
    app = Fastify();
    app.post<{ Body: AgentSkillSaveRequest }>(
      "/skills",
      {
        schema: {
          body: AgentSkillSaveRequestSchema,
        },
      },
      async (request) => request.body,
    );

    const response = await app.inject({
      method: "POST",
      payload: {
        applyScene: "",
        content: "111",
        kbs: [21],
        name: "111",
        tools: ["search_mall_order_logistics"],
        variables: [
          {
            name: "客户等级",
            select_id: 3172,
            select_sub_ids: [21311, 21312],
            type: "work_tag",
          },
          {
            name: "基础会员标签",
            select_id: 31,
            select_sub_ids: [311],
            type: "mall_tag",
          },
        ],
      },
      url: "/skills",
    });

    if (response.statusCode !== 200) {
      // eslint-disable-next-line no-console
      console.log(response.body);
    }

    expect(response.statusCode).toBe(200);
    expect(response.json().variables).toEqual([
      {
        name: "客户等级",
        select_id: 3172,
        select_sub_ids: [21311, 21312],
        type: "work_tag",
      },
      {
        name: "基础会员标签",
        select_id: 31,
        select_sub_ids: [311],
        type: "mall_tag",
      },
    ]);
  });

  it.each([
    ["技能名称", { name: "技".repeat(31) }],
    ["技能应用场景", { applyScene: "场".repeat(501) }],
    ["知识库数量", { kbs: Array.from({ length: 11 }, (_, index) => index + 1) }],
  ])("rejects %s exceeding the save limit", async (_field, overrides) => {
    app = Fastify();
    app.post<{ Body: AgentSkillSaveRequest }>(
      "/skills",
      {
        schema: {
          body: AgentSkillSaveRequestSchema,
        },
      },
      async (request) => request.body,
    );

    const response = await app.inject({
      method: "POST",
      payload: {
        applyScene: "",
        content: "查询订单物流",
        kbs: [],
        name: "物流技能",
        tools: [],
        variables: [],
        ...overrides,
      },
      url: "/skills",
    });

    expect(response.statusCode).toBe(400);
  });
});
