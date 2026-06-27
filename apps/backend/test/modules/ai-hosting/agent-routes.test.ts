import { describe, expect, it, vi } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app";

describe("AI hosting agent routes", () => {
  it("lists tenant agents and fallback models without joins", async () => {
    const { app, authorization, db } = await createAiHostingApp();

    const agents = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/ai-hosting/agents",
    });
    const models = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/ai-hosting/models",
    });

    expect(agents.statusCode).toBe(200);
    expect(agents.json()).toEqual({
      data: {
        agents: [
          {
            id: "301",
            knowledgeBases: [],
            model: {
              id: "11",
              label: "Doubao-2.0-lite",
              model: "doubao-2.0-lite",
              name: "Doubao-2.0-lite",
            },
            name: "护肤小助理",
            updatedAt: 1_718_006_460_000,
          },
          {
            id: "303",
            knowledgeBases: [],
            model: {
              id: "11",
              label: "Doubao-2.0-lite",
              model: "doubao-2.0-lite",
              name: "Doubao-2.0-lite",
            },
            name: "未发布小助理",
            updatedAt: 1_718_179_260_000,
          },
        ],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 2,
        },
      },
      success: true,
    });
    expect(models.statusCode).toBe(200);
    expect(models.json()).toEqual({
      data: {
        models: [
          {
            description: "租户自定义",
            id: "11",
            label: "Doubao-2.0-lite",
            model: "doubao-2.0-lite",
            name: "Doubao-2.0-lite",
            supportMultimodal: true,
          },
          {
            description: "系统默认",
            id: "10",
            label: "默认模型",
            model: "default-model",
            name: "默认模型",
            supportMultimodal: false,
          },
        ],
      },
      success: true,
    });
    expect(db.joinCalls).toEqual([]);
    expect(db.agentListWheres).toContainEqual(["agent.uid", "=", 9001]);
    expect(db.agentListSelects).not.toContain("agent.prompt_config as prompt_config");
    expect(db.historyListExecuteCount).toBe(0);
    expect(db.modelListWheres).toContainEqual(["status", "=", 1]);
    expect(db.modelUidFilter).toEqual([9001, 0]);

    await app.close();
  });

  it("escapes wildcard characters in agent name search", async () => {
    const { app, authorization, db } = await createAiHostingApp();

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/ai-hosting/agents?query=%25_",
    });

    expect(response.statusCode).toBe(200);
    expect(db.likeSearchValues).toContain("%\\%\\_%");

    await app.close();
  });

  it("runs agent list rows, count, and model queries in parallel", async () => {
    const probe = createBlockedAgentListProbe();
    const { app, authorization } = await createAiHostingApp(["admin"], {
      beforeExecute: probe.beforeExecute,
    });

    const responsePromise = app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/ai-hosting/agents",
    });

    try {
      await vi.waitFor(() => {
        expect(probe.queryStarts.map((query) => query.kind)).toContain("rows");
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(probe.queryStarts.map((query) => query.kind).sort()).toEqual([
        "count",
        "models",
        "rows",
      ]);
    } finally {
      probe.releaseRowsQuery();
      await responsePromise;
      await app.close();
    }
  });

  it("uses JWT uid for agent management without resolving sub user scope", async () => {
    const { app, authorization, db } = await createAiHostingApp();
    const headers = { authorization };

    const responses = await Promise.all([
      app.inject({
        headers,
        method: "GET",
        url: "/api/server/ai-hosting/agents",
      }),
      app.inject({
        headers,
        method: "GET",
        url: "/api/server/ai-hosting/models",
      }),
      app.inject({
        headers,
        method: "GET",
        url: "/api/server/ai-hosting/agents/301",
      }),
      app.inject({
        headers,
        method: "PATCH",
        payload: {
          name: "护肤专家",
        },
        url: "/api/server/ai-hosting/agents/301/name",
      }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200, 200]);
    expect(db.queriedTables).not.toContain("xy_wap_embed_sub_user");

    await app.close();
  });

  it("saves drafts without writing publish history and publishes only changed model or prompt", async () => {
    const { app, authorization, db } = await createAiHostingApp();

    const save = await app.inject({
      headers: { authorization },
      method: "PUT",
      payload: {
        modelId: "11",
        promptConfig: {
          conditionLogic: "如何客户咨询成分，那么说明功效",
          replyStyle: {
            length: "简洁",
            styleInstruction: "亲切自然",
          },
          handoffRules: "客户要求真人",
          role: "你是护肤顾问",
        },
      },
      url: "/api/server/ai-hosting/agents/301",
    });
    const unchangedPublish = await app.inject({
      headers: { authorization },
      method: "POST",
      url: "/api/server/ai-hosting/agents/301/publish",
    });

    expect(db.insertedHistories).toEqual([]);

    db.setAgentPrompt("如果客户咨询成分，那么说明功效");
    const changedPublish = await app.inject({
      headers: { authorization },
      method: "POST",
      url: "/api/server/ai-hosting/agents/301/publish",
    });

    expect(save.statusCode).toBe(200);
    expect(db.updatedAgents[0]).toMatchObject({
      id: 301,
      values: {
        last_operator_id: 1,
        model_id: 11,
        update_time: expect.any(Date),
      },
    });
    expect(db.updatedAgents[0]?.values).not.toHaveProperty("name");
    expect(JSON.parse(String(db.updatedAgents[0]?.values.prompt_config))).toEqual({
      condition_logic: "如何客户咨询成分，那么说明功效",
      handoff_rules: "客户要求真人",
      reply_style: {
        length: "简洁",
        style_instruction: "亲切自然",
      },
      role: "你是护肤顾问",
    });
    expect(unchangedPublish.statusCode).toBe(400);
    expect(unchangedPublish.json()).toMatchObject({
      error: {
        code: "AGENT_UNCHANGED",
        message: "当前配置已是正式版",
      },
      success: false,
    });
    expect(changedPublish.statusCode).toBe(200);
    expect(db.insertedHistories).toHaveLength(1);
    expect(db.insertedHistories[0]).toMatchObject({
      agent_id: 301,
      create_time: expect.any(Date),
      model_id: 11,
      operator_id: 1,
      uid: 9001,
    });
    expect(db.updatedAgents[1]).toMatchObject({
      id: 301,
      values: {
        last_operator_id: 1,
        last_publish_time: expect.any(Number),
        update_time: expect.any(Date),
      },
    });
    expect(db.updatedAgents[1]?.values.last_publish_time).toBeGreaterThan(0);
    expect(db.historyLatestLimitValues).not.toHaveLength(0);
    expect(db.historyLatestLimitValues.every((value) => value === 1)).toBe(true);

    await app.close();
  });

  it("renames agents through a separate write path", async () => {
    const { app, authorization, db } = await createAiHostingApp();

    const rename = await app.inject({
      headers: { authorization },
      method: "PATCH",
      payload: {
        name: "护肤专家",
      },
      url: "/api/server/ai-hosting/agents/301/name",
    });

    expect(rename.statusCode).toBe(200);
    expect(rename.json()).toMatchObject({
      data: {
        id: "301",
        name: "护肤专家",
      },
      success: true,
    });
    expect(db.updatedAgent).toEqual({
      id: 301,
      values: {
        last_operator_id: 1,
        name: "护肤专家",
        update_time: expect.any(Date),
      },
    });

    await app.close();
  });

  it("creates agents as drafts and removes agents with a soft delete", async () => {
    const { app, authorization, db } = await createAiHostingApp();

    const create = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        modelId: "10",
        name: "售后小助理",
        promptConfig: {
          conditionLogic: "",
          replyStyle: {
            length: "简洁",
            styleInstruction: "亲切自然",
          },
          handoffRules: "退款投诉",
          role: "你是售后客服",
        },
      },
      url: "/api/server/ai-hosting/agents",
    });
    const remove = await app.inject({
      headers: { authorization },
      method: "DELETE",
      url: "/api/server/ai-hosting/agents/302",
    });

    expect(create.statusCode).toBe(200);
    expect(create.json()).toMatchObject({
      data: {
        id: "302",
        name: "售后小助理",
      },
      success: true,
    });
    expect(db.insertedAgent).toMatchObject({
      last_operator_id: 1,
      model_id: 10,
      name: "售后小助理",
      operator_id: 1,
      status: 1,
      uid: 9001,
    });
    expect(JSON.parse(String(db.insertedAgent?.prompt_config))).toEqual({
      condition_logic: "",
      handoff_rules: "退款投诉",
      reply_style: {
        length: "简洁",
        style_instruction: "亲切自然",
      },
      role: "你是售后客服",
    });
    expect(db.insertedHistories).toEqual([]);
    expect(remove.statusCode).toBe(200);
    expect(db.deletedAgent).toEqual({
      id: 302,
      values: {
        last_operator_id: 1,
        status: 0,
        update_time: expect.any(Date),
      },
    });

    await app.close();
  });

  it("allows agent writes when admin is not the first token role", async () => {
    const { app, authorization, db } = await createAiHostingApp(["operator", "admin"]);

    const remove = await app.inject({
      headers: { authorization },
      method: "DELETE",
      url: "/api/server/ai-hosting/agents/303",
    });

    expect(remove.statusCode).toBe(200);
    expect(db.deletedAgent).toEqual({
      id: 303,
      values: {
        last_operator_id: 1,
        status: 0,
        update_time: expect.any(Date),
      },
    });

    await app.close();
  });

  it("rejects agent writes for non-manage roles", async () => {
    for (const role of ["operator", "viewer"]) {
      const { app, authorization, db } = await createAiHostingApp([role]);
      const headers = { authorization };
      const promptConfig = {
        conditionLogic: "",
        replyStyle: {
          length: "简洁",
          styleInstruction: "亲切自然",
        },
        handoffRules: "客户要求真人",
        role: "你是护肤顾问",
      };
      const requests = [
        app.inject({
          headers,
          method: "POST",
          payload: {
            modelId: "11",
            name: "售后小助理",
            promptConfig,
          },
          url: "/api/server/ai-hosting/agents",
        }),
        app.inject({
          headers,
          method: "PUT",
          payload: {
            modelId: "11",
            promptConfig,
          },
          url: "/api/server/ai-hosting/agents/301",
        }),
        app.inject({
          headers,
          method: "PATCH",
          payload: {
            name: "护肤专家",
          },
          url: "/api/server/ai-hosting/agents/301/name",
        }),
        app.inject({
          headers,
          method: "POST",
          url: "/api/server/ai-hosting/agents/301/publish",
        }),
        app.inject({
          headers,
          method: "POST",
          url: "/api/server/ai-hosting/agents/301/restore",
        }),
        app.inject({
          headers,
          method: "DELETE",
          url: "/api/server/ai-hosting/agents/301",
        }),
      ];

      const responses = await Promise.all(requests);

      expect(responses.map((response) => response.statusCode)).toEqual([
        403,
        403,
        403,
        403,
        403,
        403,
      ]);
      for (const response of responses) {
        expect(response.json()).toMatchObject({
          error: {
            code: "FORBIDDEN",
            message: "无权限访问",
          },
          success: false,
        });
      }
      expect(db.deletedAgent).toBeUndefined();
      expect(db.insertedAgent).toBeUndefined();
      expect(db.insertedHistories).toEqual([]);
      expect(db.updatedAgent).toBeUndefined();

      await app.close();
    }
  });

  it("restores the latest published agent version and reports empty history", async () => {
    const { app, authorization, db } = await createAiHostingApp();

    db.setAgentPrompt("草稿内容");
    const restore = await app.inject({
      headers: { authorization },
      method: "POST",
      url: "/api/server/ai-hosting/agents/301/restore",
    });

    expect(restore.statusCode).toBe(200);
    expect(db.updatedAgent).toMatchObject({
      id: 301,
      values: {
        last_operator_id: 1,
        model_id: 11,
        update_time: expect.any(Date),
      },
    });
    expect(JSON.parse(String(db.updatedAgent?.values.prompt_config))).toMatchObject({
      condition_logic: "如何客户咨询成分，那么说明功效",
    });

    db.clearHistories();
    const emptyRestore = await app.inject({
      headers: { authorization },
      method: "POST",
      url: "/api/server/ai-hosting/agents/301/restore",
    });

    expect(emptyRestore.statusCode).toBe(400);
    expect(emptyRestore.json()).toMatchObject({
      error: {
        code: "AGENT_HISTORY_EMPTY",
        message: "暂无正式版内容",
      },
      success: false,
    });

    await app.close();
  });

  it("keeps agent access scoped to the current tenant", async () => {
    const { app, authorization } = await createAiHostingApp(["admin"], { uid: 8001 });

    const detail = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/ai-hosting/agents/301",
    });

    expect(detail.statusCode).toBe(404);
    expect(detail.json()).toMatchObject({
      error: {
        code: "AGENT_NOT_FOUND",
        message: "Agent 不存在",
      },
      success: false,
    });

    await app.close();
  });

  it("hydrates hosting settings from seats, seat-agent configs, and agent publish flags without joins", async () => {
    const { app, authorization, db } = await createAiHostingApp();

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/ai-hosting/hosting-settings",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        accounts: [
          {
            agentId: "301",
            avatarUrl: "https://example.com/seat-102.png",
            fullAutoAuth: true,
            id: "102",
            name: "小助理2",
            semiAutoAuth: false,
          },
          {
            agentId: null,
            avatarUrl: "",
            fullAutoAuth: false,
            id: "101",
            name: "小助理1",
            semiAutoAuth: false,
          },
        ],
        agents: [
          {
            id: "301",
            isPublished: true,
            name: "护肤小助理",
          },
          {
            id: "303",
            isPublished: false,
            name: "未发布小助理",
          },
        ],
      },
      success: true,
    });
    expect(db.joinCalls).toEqual([]);
    expect(db.agentListLimitValues).toContain(100);
    expect(db.seatListWheres).toContainEqual(["seat.uid", "=", 9001]);
    expect(db.seatListWheres).toContainEqual(["seat.platform", "=", 5]);
    expect(db.queriedTables).toContain("xy_wap_embed_sub_user");
    expect(db.seatListLimitValues).toContain(200);
    expect(db.hostingConfigListWheres).toContainEqual(["uid", "=", 9001]);
    expect(db.hostingConfigListWheres).toContainEqual(["user_seat_id", "in", [102, 101]]);
    expect(db.historyListExecuteCount).toBe(0);

    await app.close();
  });

  it("saves hosting settings with bulk writes after checking existing seat-agent rows", async () => {
    const { app, authorization, db } = await createAiHostingApp(["admin"], {
      bulkHostingSeats: true,
    });

    const response = await app.inject({
      headers: { authorization },
      method: "PUT",
      payload: {
        agentId: "301",
        fullAutoAuth: true,
        semiAutoAuth: true,
        userSeatIds: ["101", "102", "103", "104"],
      },
      url: "/api/server/ai-hosting/hosting-settings",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        accounts: expect.arrayContaining([
          expect.objectContaining({
            agentId: "301",
            fullAutoAuth: true,
            id: "102",
            semiAutoAuth: true,
          }),
          expect.objectContaining({
            agentId: "301",
            fullAutoAuth: true,
            id: "101",
            semiAutoAuth: true,
          }),
          expect.objectContaining({
            agentId: "301",
            fullAutoAuth: true,
            id: "104",
            semiAutoAuth: true,
          }),
          expect.objectContaining({
            agentId: "301",
            fullAutoAuth: true,
            id: "103",
            semiAutoAuth: true,
          }),
        ]),
      },
      success: true,
    });
    expect(db.hostingConfigLookupWheres).toContainEqual(["uid", "=", 9001]);
    expect(db.hostingConfigLookupWheres).toContainEqual([
      "user_seat_id",
      "in",
      expect.arrayContaining([101, 102, 103, 104]),
    ]);
    expect(db.insertedHostingConfigBatches).toEqual([
      [
        {
          agent_id: 301,
          full_auto_auth: 1,
          semi_auto_auth: 1,
          uid: 9001,
          user_seat_id: 101,
        },
        {
          agent_id: 301,
          full_auto_auth: 1,
          semi_auto_auth: 1,
          uid: 9001,
          user_seat_id: 103,
        },
      ],
    ]);
    expect(db.insertedHostingConfigs).toEqual(db.insertedHostingConfigBatches[0]);
    expect(db.updatedHostingConfigs).toEqual([
      {
        userSeatIds: [102, 104],
        values: {
          agent_id: 301,
          full_auto_auth: 1,
          semi_auto_auth: 1,
          update_time: expect.any(Date),
        },
      },
    ]);
    expect(db.insertedHostingConfigs[0]).not.toHaveProperty("full_auto_switch");
    expect(db.insertedHostingConfigs[0]).not.toHaveProperty("semi_auto_switch");
    expect(db.updatedHostingConfigs[0]?.values).not.toHaveProperty("full_auto_switch");
    expect(db.updatedHostingConfigs[0]?.values).not.toHaveProperty("semi_auto_switch");

    await app.close();
  });

  it("rejects hosting settings saves for unpublished agents", async () => {
    const { app, authorization, db } = await createAiHostingApp();

    const response = await app.inject({
      headers: { authorization },
      method: "PUT",
      payload: {
        agentId: "303",
        fullAutoAuth: true,
        semiAutoAuth: false,
        userSeatIds: ["101"],
      },
      url: "/api/server/ai-hosting/hosting-settings",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "AGENT_UNPUBLISHED",
        message: "Agent 未发布，不能用于托管设置",
      },
      success: false,
    });
    expect(db.insertedHostingConfigs).toEqual([]);
    expect(db.updatedHostingConfigs).toEqual([]);

    await app.close();
  });

  it("prevents deleting agents referenced by hosting settings", async () => {
    const { app, authorization, db } = await createAiHostingApp();

    const response = await app.inject({
      headers: { authorization },
      method: "DELETE",
      url: "/api/server/ai-hosting/agents/301",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "AGENT_IN_USE",
        message: "Agent 已被托管设置引用，不能删除",
      },
      success: false,
    });
    expect(db.deletedAgent).toBeUndefined();

    await app.close();
  });

  it("proxies agent simulation tests to the Java test-agent endpoint", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            action: "reply",
            reply: [{ type: "text", content: "你好，我是 Agent" }],
          },
          success: true,
        }),
        { status: 200 },
      ),
    );
    const { app, authorization } = await createAiHostingApp();

    const response = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        messages: [
          {
            contents: [{ type: "text", text: "我想了解晨间护肤" }],
            role: "user",
          },
        ],
        modelId: "11",
        promptConfig: {
          conditionLogic: "如果客户咨询成分，那么说明功效",
          replyStyle: {
            length: "简洁",
            styleInstruction: "亲切自然",
          },
          handoffRules: "客户要求真人",
          role: "你是护肤顾问",
        },
      },
      url: "/api/server/ai-hosting/agents/test",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        action: "reply",
        reply: [{ type: "text", content: "你好，我是 Agent" }],
      },
      success: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://java.internal/third-internal/wap-embed-agent/test-agent",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      messages: [
        {
          contents: [{ text: "我想了解晨间护肤", type: "text" }],
          role: "user",
        },
      ],
      modelId: 11,
      promptConfig: JSON.stringify({
        condition_logic: "如果客户咨询成分，那么说明功效",
        handoff_rules: "客户要求真人",
        reply_style: {
          length: "简洁",
          style_instruction: "亲切自然",
        },
        role: "你是护肤顾问",
      }),
      uid: 9001,
    });

    fetchMock.mockRestore();
    await app.close();
  });

  it("only forwards the latest 20 messages to the Java test-agent endpoint", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            action: "reply",
            reply: [{ type: "text", content: "收到" }],
          },
          success: true,
        }),
        { status: 200 },
      ),
    );
    const { app, authorization } = await createAiHostingApp();
    const messages = Array.from({ length: 25 }, (_, index) => ({
      contents: [{ type: "text", text: `消息 ${index + 1}` }],
      role: index % 2 === 0 ? "user" : "assistant",
    }));

    const response = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        messages,
        modelId: "11",
        promptConfig: {
          conditionLogic: "",
          replyStyle: {
            length: "简洁",
            styleInstruction: "亲切自然",
          },
          handoffRules: "",
          role: "你是护肤顾问",
        },
      },
      url: "/api/server/ai-hosting/agents/test",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).messages).toEqual(
      messages.slice(-20).map((message) => ({
        contents: [{ text: message.contents[0]?.text, type: "text" }],
        role: message.role,
      })),
    );

    fetchMock.mockRestore();
    await app.close();
  });
});

async function createAiHostingApp(
  roles = ["admin"],
  options: CreateAiHostingDbMockOptions = {},
) {
  const app = await buildMockedApp();
  const token = app.jwt.sign({
    roles,
    sessionId: "501",
    sessionVersion: 1,
    subUserId: "1",
    uid: options.uid ?? 9001,
  });
  const db = createAiHostingDbMock(options);

  app.db = db as never;

  return {
    app,
    authorization: `Bearer ${token}`,
    db,
  };
}

type QueryExecutionEvent = {
  isCountQuery: boolean;
  table: string;
  type: "execute" | "executeTakeFirst";
};

type CreateAiHostingDbMockOptions = {
  beforeExecute?: (event: QueryExecutionEvent) => Promise<void> | void;
  bulkHostingSeats?: boolean;
  uid?: number;
};

function createBlockedAgentListProbe() {
  const queryStarts: Array<QueryExecutionEvent & { kind: "count" | "models" | "rows" }> = [];
  let releaseRowsQuery: (() => void) | undefined;
  const rowsQueryGate = new Promise<void>((resolve) => {
    releaseRowsQuery = resolve;
  });

  return {
    async beforeExecute(event: QueryExecutionEvent) {
      if (event.table === "xy_wap_embed_agent as agent" && event.type === "execute") {
        queryStarts.push({ ...event, kind: "rows" });
        await rowsQueryGate;
        return;
      }

      if (event.table === "xy_wap_embed_agent as agent" && event.isCountQuery) {
        queryStarts.push({ ...event, kind: "count" });
        return;
      }

      if (event.table === "xy_wap_embed_ai_model" && event.type === "execute") {
        queryStarts.push({ ...event, kind: "models" });
      }
    },
    queryStarts,
    releaseRowsQuery: () => releaseRowsQuery?.(),
  };
}

function createAiHostingDbMock(options: CreateAiHostingDbMockOptions = {}) {
  const subUsers = [
    {
      id: 1,
      platform: 5,
      status: 1,
      uid: options.uid ?? 9001,
    },
  ];
  const models = [
    {
      description: "系统默认",
      id: 10,
      model: "default-model",
      name: "默认模型",
      status: 1,
      support_multimodal: 0,
      uid: 0,
    },
    {
      description: "租户自定义",
      id: 11,
      model: "doubao-2.0-lite",
      name: "Doubao-2.0-lite",
      status: 1,
      support_multimodal: 1,
      uid: 9001,
    },
  ];
  let agentPrompt = "如何客户咨询成分，那么说明功效";
  const agents = [
    {
      create_time: new Date("2024-06-10T08:00:00Z"),
      id: 301,
      last_publish_time: new Date("2024-06-10T08:00:00Z").getTime(),
      last_operator_id: 1,
      model_id: 11,
      name: "护肤小助理",
      operator_id: 1,
      prompt_config: buildPromptConfig(agentPrompt),
      status: 1,
      uid: 9001,
      update_time: new Date("2024-06-10T08:01:00Z"),
    },
    {
      create_time: new Date("2024-06-12T08:00:00Z"),
      id: 303,
      last_publish_time: 0,
      last_operator_id: 1,
      model_id: 11,
      name: "未发布小助理",
      operator_id: 1,
      prompt_config: buildPromptConfig(agentPrompt),
      status: 1,
      uid: 9001,
      update_time: new Date("2024-06-12T08:01:00Z"),
    },
  ];
  const histories = [
    {
      agent_id: 301,
      create_time: new Date("2024-06-10T08:00:00Z"),
      id: 701,
      model_id: 11,
      operator_id: 1,
      prompt_config: buildPromptConfig(agentPrompt),
      uid: 9001,
    },
  ];
  const seats = [
    {
      avatarUrl: "https://example.com/seat-102.png",
      id: 102,
      platform: 5,
      third_avatar: "https://example.com/seat-102.png",
      third_user_name: "小助理2",
      uid: 9001,
    },
    {
      avatarUrl: "",
      id: 101,
      platform: 5,
      third_avatar: "",
      third_user_name: "小助理1",
      uid: 9001,
    },
    ...(options.bulkHostingSeats
      ? [
          {
            avatarUrl: "https://example.com/seat-104.png",
            id: 104,
            platform: 5,
            third_avatar: "https://example.com/seat-104.png",
            third_user_name: "小助理4",
            uid: 9001,
          },
          {
            avatarUrl: "https://example.com/seat-103.png",
            id: 103,
            platform: 5,
            third_avatar: "https://example.com/seat-103.png",
            third_user_name: "小助理3",
            uid: 9001,
          },
        ]
      : []),
  ];
  const hostingConfigs = [
    {
      agent_id: 301,
      full_auto_auth: 1,
      full_auto_switch: 1,
      id: 801,
      semi_auto_auth: 0,
      semi_auto_switch: 1,
      uid: 9001,
      user_seat_id: 102,
    },
    ...(options.bulkHostingSeats
      ? [
          {
            agent_id: 301,
            full_auto_auth: 0,
            full_auto_switch: 0,
            id: 802,
            semi_auto_auth: 1,
            semi_auto_switch: 0,
            uid: 9001,
            user_seat_id: 104,
          },
        ]
      : []),
  ];
  const state = {
    agentListWheres: [] as Array<[string, string, unknown]>,
    agentListLimitValues: [] as number[],
    agentListSelects: [] as string[],
    deletedAgent: undefined as
      | { id: number | undefined; values: Record<string, unknown> }
      | undefined,
    insertedAgent: undefined as Record<string, unknown> | undefined,
    insertedHistories: [] as Array<Record<string, unknown>>,
    joinCalls: [] as string[],
    historyListExecuteCount: 0,
    historyLatestLimitValues: [] as number[],
    hostingConfigListWheres: [] as Array<[string, string, unknown]>,
    hostingConfigLookupWheres: [] as Array<[string, string, unknown]>,
    insertedHostingConfigBatches: [] as Array<Array<Record<string, unknown>>>,
    insertedHostingConfigs: [] as Array<Record<string, unknown>>,
    likeSearchValues: [] as unknown[],
    modelListWheres: [] as Array<[string, string, unknown]>,
    modelUidFilter: undefined as unknown,
    queriedTables: [] as string[],
    updatedAgent: undefined as
      | { id: number | undefined; values: Record<string, unknown> }
      | undefined,
    updatedAgents: [] as Array<{ id: number | undefined; values: Record<string, unknown> }>,
    seatListLimitValues: [] as number[],
    seatListWheres: [] as Array<[string, string, unknown]>,
    updatedHostingConfigs: [] as Array<{
      userSeatIds: number[];
      values: Record<string, unknown>;
    }>,
    setAgentPrompt: (prompt: string) => {
      agentPrompt = prompt;
      agents[0].prompt_config = buildPromptConfig(prompt);
    },
    clearHistories: () => {
      histories.splice(0, histories.length);
    },
    selectFrom(table: string) {
      const wheres: Array<[string, string, unknown]> = [];
      const orderByCalls: Array<[string, string | undefined]> = [];
      let isCountQuery = false;
      const builder = {
        execute: async () => {
          state.queriedTables.push(table);
          await options.beforeExecute?.({
            isCountQuery,
            table,
            type: "execute",
          });

          if (table === "xy_wap_embed_agent" || table === "xy_wap_embed_agent as agent") {
            state.agentListWheres = wheres;

            return agents;
          }

          if (table === "xy_wap_embed_ai_model") {
            state.modelListWheres = wheres;
            state.modelUidFilter = wheres.find(([column]) => column === "uid")?.[2];

            return [...models].sort((left, right) => {
              if (left.uid !== right.uid) {
                return left.uid === 9001 ? -1 : 1;
              }

              return left.id - right.id;
            });
          }

          if (table === "xy_wap_embed_agent_history") {
            state.historyListExecuteCount += 1;
            const agentIdFilter = wheres.find(([column]) => column === "agent_id")?.[2] as
              | number[]
              | undefined;

            return histories
              .filter((history) => !agentIdFilter || agentIdFilter.includes(history.agent_id))
              .sort((left, right) => right.id - left.id);
          }

          if (table === "xy_wap_embed_user_seat as seat") {
            state.seatListWheres = wheres;
            const uid = Number(wheres.find(([column]) => column === "seat.uid")?.[2]);
            const platform = Number(wheres.find(([column]) => column === "seat.platform")?.[2]);
            const seatIds = wheres.find(([column]) => column === "seat.id")?.[2] as
              | number[]
              | undefined;

            return seats.filter(
              (seat) =>
                seat.uid === uid &&
                seat.platform === platform &&
                (!seatIds || seatIds.includes(seat.id)),
            );
          }

          if (table === "xy_wap_embed_user_seat_agent") {
            const seatIds = wheres.find(([column]) => column === "user_seat_id")?.[2] as
              | number[]
              | undefined;
            const uid = Number(wheres.find(([column]) => column === "uid")?.[2]);

            if (seatIds) {
              if (state.hostingConfigListWheres.length === 0) {
                state.hostingConfigListWheres = wheres;
              } else {
                state.hostingConfigLookupWheres = wheres;
              }
            }

            return hostingConfigs.filter(
              (config) =>
                config.uid === uid &&
                (!seatIds || seatIds.includes(config.user_seat_id)),
            );
          }

          throw new Error(`Unexpected execute table: ${table}`);
        },
        executeTakeFirst: async () => {
          state.queriedTables.push(table);
          await options.beforeExecute?.({
            isCountQuery,
            table,
            type: "executeTakeFirst",
          });

          if (table === "xy_wap_embed_sub_user_session") {
            return {
              expires_at: new Date(Date.now() + 1000),
              id: "501",
              refresh_token_hash: "hash",
              revoked_at: null,
              session_version: 1,
              sub_user_id: "1",
            };
          }

          if (table === "xy_wap_embed_sub_user") {
            return subUsers[0];
          }

          if (table === "xy_wap_embed_agent as agent") {
            const uid = Number(wheres.find(([column]) => column === "agent.uid")?.[2]);
            return {
              total: agents.filter(
                (agent) =>
                  agent.status === 1 && (!Number.isFinite(uid) || agent.uid === uid),
              ).length,
            };
          }

          if (table === "xy_wap_embed_agent") {
            const id = Number(wheres.find(([column]) => column === "id")?.[2]);
            const uid = Number(wheres.find(([column]) => column === "uid")?.[2]);
            return agents.find(
              (agent) =>
                agent.id === id &&
                agent.status === 1 &&
                (!Number.isFinite(uid) || agent.uid === uid),
            );
          }

          if (table === "xy_wap_embed_agent_history") {
            const agentId = Number(wheres.find(([column]) => column === "agent_id")?.[2]);
            const uid = Number(wheres.find(([column]) => column === "uid")?.[2]);
            return histories
              .filter(
                (history) =>
                  history.agent_id === agentId &&
                  (!Number.isFinite(uid) || history.uid === uid),
              )
              .sort((left, right) => right.id - left.id)[0];
          }

          if (table === "xy_wap_embed_ai_model") {
            const id = Number(wheres.find(([column]) => column === "id")?.[2]);
            const uidFilter = wheres.find(([column]) => column === "uid")?.[2] as number[] | undefined;

            return models.find(
              (model) =>
                model.id === id &&
                model.status === 1 &&
                (!uidFilter || uidFilter.includes(model.uid)),
            );
          }

          if (table === "xy_wap_embed_user_seat_agent") {
            const uid = Number(wheres.find(([column]) => column === "uid")?.[2]);
            const agentId = Number(wheres.find(([column]) => column === "agent_id")?.[2]);
            const userSeatId = Number(wheres.find(([column]) => column === "user_seat_id")?.[2]);

            return hostingConfigs.find(
              (config) =>
                config.uid === uid &&
                (!Number.isFinite(agentId) || config.agent_id === agentId) &&
                (!Number.isFinite(userSeatId) || config.user_seat_id === userSeatId),
            );
          }

          throw new Error(`Unexpected executeTakeFirst table: ${table}`);
        },
        innerJoin: (tableName: string) => {
          state.joinCalls.push(tableName);
          return builder;
        },
        limit: (value: number) => {
          if (table === "xy_wap_embed_agent_history") {
            state.historyLatestLimitValues.push(value);
          } else if (table === "xy_wap_embed_agent as agent") {
            state.agentListLimitValues.push(value);
          } else if (table === "xy_wap_embed_user_seat as seat") {
            state.seatListLimitValues.push(value);
          }

          return builder;
        },
        offset: () => builder,
        orderBy: (column: string, direction?: string) => {
          orderByCalls.push([column, direction]);
          return builder;
        },
        select: (selection: string | string[] | ((expressionBuilder: unknown) => unknown)) => {
          if (typeof selection === "function") {
            isCountQuery = true;
            return builder;
          }

          if (table === "xy_wap_embed_agent as agent") {
            state.agentListSelects = Array.isArray(selection) ? selection : [selection];
          }

          return builder;
        },
        where: (column: string, operator: string, value: unknown) => {
          wheres.push([column, operator, value]);
          if (operator === "like") {
            state.likeSearchValues.push(value);
          }
          return builder;
        },
      };

      return builder;
    },
    insertInto(table: string) {
      const builder = {
        executeTakeFirstOrThrow: async () => ({ insertId: table === "xy_wap_embed_agent" ? 302 : 702 }),
        values: (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
          if (table === "xy_wap_embed_agent") {
            if (Array.isArray(values)) {
              throw new Error("Agent insert expects one row");
            }
            state.insertedAgent = values;
            agents.push({
              create_time: new Date("2024-06-11T08:00:00Z"),
              id: 302,
              last_operator_id: Number(values.last_operator_id),
              last_publish_time: 0,
              model_id: Number(values.model_id),
              name: String(values.name),
              operator_id: Number(values.operator_id),
              prompt_config: String(values.prompt_config),
              status: Number(values.status),
              uid: Number(values.uid),
              update_time: new Date("2024-06-11T08:00:00Z"),
            });
            return builder;
          }

          if (table === "xy_wap_embed_user_seat_agent") {
            const rows = Array.isArray(values) ? values : [values];
            state.insertedHostingConfigBatches.push(rows);

            for (const row of rows) {
              state.insertedHostingConfigs.push(row);
              hostingConfigs.push({
                agent_id: Number(row.agent_id),
                full_auto_auth: Number(row.full_auto_auth),
                full_auto_switch: Number(row.full_auto_switch ?? 0),
                id: 802 + state.insertedHostingConfigs.length,
                semi_auto_auth: Number(row.semi_auto_auth),
                semi_auto_switch: Number(row.semi_auto_switch ?? 0),
                uid: Number(row.uid),
                user_seat_id: Number(row.user_seat_id),
              });
            }
            return builder;
          }

          if (table === "xy_wap_embed_agent_history") {
            if (Array.isArray(values)) {
              throw new Error("Agent history insert expects one row");
            }
            state.insertedHistories.push(values);
            histories.push({
              agent_id: Number(values.agent_id),
              create_time: new Date("2024-06-11T08:00:00Z"),
              id: 702,
              model_id: Number(values.model_id),
              operator_id: Number(values.operator_id),
              prompt_config: String(values.prompt_config),
              uid: Number(values.uid),
            });
            return builder;
          }

          throw new Error(`Unexpected insert table: ${table}`);
        },
      };

      return builder;
    },
    updateTable(table: string) {
      if (table !== "xy_wap_embed_agent" && table !== "xy_wap_embed_user_seat_agent") {
        throw new Error(`Unexpected update table: ${table}`);
      }

      const wheres: Array<[string, string, unknown]> = [];
      let updateValues: Record<string, unknown> = {};
      const builder = {
        execute: async () => {
          if (table === "xy_wap_embed_user_seat_agent") {
            const uid = Number(wheres.find(([column]) => column === "uid")?.[2]);
            const userSeatWhere = wheres.find(([column]) => column === "user_seat_id");
            const userSeatIds =
              userSeatWhere?.[1] === "in"
                ? (userSeatWhere[2] as number[])
                : [Number(userSeatWhere?.[2])];

            for (const userSeatId of userSeatIds) {
              const config = hostingConfigs.find(
                (item) => item.uid === uid && item.user_seat_id === userSeatId,
              );

              if (config) {
                Object.assign(config, updateValues);
              }
            }

            state.updatedHostingConfigs.push({ userSeatIds, values: updateValues });
            return [];
          }

          const id = Number(wheres.find(([column]) => column === "id")?.[2]);
          const agent = agents.find((item) => item.id === id);

          if (agent) {
            Object.assign(agent, updateValues);
          }

          if (updateValues.status === 0) {
            state.deletedAgent = { id, values: updateValues };
          } else {
            state.updatedAgent = { id, values: updateValues };
            state.updatedAgents.push({ id, values: updateValues });
          }

          return [];
        },
        set: (values: Record<string, unknown>) => {
          updateValues = values;
          return builder;
        },
        where: (column: string, operator: string, value: unknown) => {
          wheres.push([column, operator, value]);
          return builder;
        },
      };

      return builder;
    },
    transaction() {
      return {
        execute: async (callback: (trx: typeof state) => Promise<unknown>) => callback(state),
      };
    },
  };

  return state;
}

function buildPromptConfig(conditionLogic: string) {
  return JSON.stringify({
    condition_logic: conditionLogic,
    reply_style: {
      length: "简洁",
      style_instruction: "亲切自然",
    },
    handoff_rules: "客户要求真人",
    role: "你是护肤顾问",
  });
}
