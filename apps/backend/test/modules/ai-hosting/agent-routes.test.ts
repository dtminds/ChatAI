import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMockedApp } from "../../helpers/build-mocked-app";

describe("AI hosting agent routes", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("lists tenant agents with referenced knowledge bases from one extra query", async () => {
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
            autoLearnEnabled: false,
            id: "301",
            kbList: [
              {
                id: "1",
                name: "商品咨询知识库",
              },
              {
                id: "3",
                name: "活动政策知识库",
              },
            ],
            model: {
              id: "11",
              label: "Doubao-2.0-lite",
              model: "doubao-2.0-lite",
              name: "Doubao-2.0-lite",
            },
            name: "护肤小助理",
            pendingSuggestionCount: 0,
            updatedAt: 1_718_006_460_000,
          },
          {
            autoLearnEnabled: false,
            id: "303",
            kbList: [
              {
                id: "1",
                name: "商品咨询知识库",
              },
              {
                id: "3",
                name: "活动政策知识库",
              },
            ],
            model: {
              id: "11",
              label: "Doubao-2.0-lite",
              model: "doubao-2.0-lite",
              name: "Doubao-2.0-lite",
            },
            name: "未发布小助理",
            pendingSuggestionCount: 0,
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
    expect(db.agentListSelects).toContain(
      "JSON_EXTRACT(agent.prompt_config, '$.available_kb_ids') as available_kb_ids",
    );
    expect(db.kbListExecuteCount).toBe(1);
    expect(db.kbListWheres).toEqual([
      ["uid", "=", 9001],
      ["status", "=", 1],
      ["id", "in", [1, 3]],
    ]);
    expect(db.historyListExecuteCount).toBe(0);
    expect(db.modelListWheres).toContainEqual(["status", "=", 1]);
    expect(db.modelUidFilter).toEqual([9001, 0]);
    expect(db.queriedTables).toContain("xy_wap_embed_agent_kb_learning_candidate");

    await app.close();
  });

  it("updates agent auto-learn switch", async () => {
    const { app, authorization, db } = await createAiHostingApp();

    const response = await app.inject({
      headers: { authorization },
      method: "PATCH",
      payload: { enabled: true },
      url: "/api/server/ai-hosting/agents/301/auto-learn",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        autoLearnEnabled: true,
        pendingSuggestionCount: 0,
      },
      success: true,
    });
    expect(db.updatedAgent?.values).toMatchObject({
      auto_learn_enabled: 1,
    });

    await app.close();
  });

  it("deduplicates referenced knowledge bases when listing tenant agents", async () => {
    const { app, authorization, db } = await createAiHostingApp();

    db.setAgentPromptConfig({
      availableKbIds: [1, 3, 1],
      conditionLogic: "如果客户咨询成分，那么说明功效",
    });

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/ai-hosting/agents",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.agents[0].kbList).toEqual([
      {
        id: "1",
        name: "商品咨询知识库",
      },
      {
        id: "3",
        name: "活动政策知识库",
      },
    ]);
    expect(db.kbListWheres).toContainEqual(["id", "in", [1, 3]]);

    await app.close();
  });

  it("returns quota overview with active rows and document storage usage", async () => {
    const { app, authorization } = await createAiHostingApp(["admin"], {
      activeAgentCount: 5,
      activeKbCount: 3,
      deletedAgentCount: 2,
      deletedKbCount: 4,
      docSizeBytes: [64 * 1024 * 1024, 128 * 1024 * 1024],
    });

    const response = await app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/ai-hosting/quota",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        agents: {
          limit: 20,
          used: 5,
        },
        kbDocs: {
          limit: 1024 * 1024 * 1024,
          used: 192 * 1024 * 1024,
        },
        kbs: {
          limit: 20,
          used: 3,
        },
      },
      success: true,
    });

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

  it("does not query quota while listing agents", async () => {
    const probe = createBlockedAgentListProbe();
    const { app, authorization } = await createAiHostingApp(["admin"], {
      beforeExecute: probe.beforeExecute,
    });

    const responsePromise = app.inject({
      headers: { authorization },
      method: "GET",
      url: "/api/server/ai-hosting/agents?query=%25_",
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
          availableKbIds: [1, 3],
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
      available_kb_ids: [1, 3],
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
          availableKbIds: [],
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
      available_kb_ids: [],
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

  it("rejects creating agents when the tenant has reached the fixed quota", async () => {
    const { app, authorization, db } = await createAiHostingApp(["admin"], {
      activeAgentCount: 20,
      deletedAgentCount: 2,
    });

    const response = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        modelId: "10",
        name: "超额小助理",
        promptConfig: {
          availableKbIds: [],
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

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "AGENT_QUOTA_EXCEEDED",
        message: "Agent 数量已达上限",
      },
      success: false,
    });
    expect(db.insertedAgent).toBeUndefined();

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
        availableKbIds: [1, 3],
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
        fullAutoAuthAvailable: false,
      },
      success: true,
    });
    expect(db.joinCalls).toEqual([]);
    expect(db.agentListLimitValues).toContain(100);
    expect(db.seatListWheres).toContainEqual(["seat.uid", "=", 9001]);
    expect(db.seatListWheres).toContainEqual(["seat.platform", "=", 5]);
    expect(db.queriedTables).not.toContain("xy_wap_embed_sub_user");
    expect(db.seatListLimitValues).toContain(200);
    expect(db.hostingConfigListWheres).toContainEqual(["uid", "=", 9001]);
    expect(db.hostingConfigListWheres).toContainEqual(["user_seat_id", "in", [102, 101]]);
    expect(db.historyListExecuteCount).toBe(0);

    await app.close();
  });

  it("saves hosting settings with bulk writes after checking existing seat-agent rows", async () => {
    const { app, authorization, db } = await createAiHostingApp(["admin"], {
      bulkHostingSeats: true,
      dataUid: 272,
      uid: 272,
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
    expect(db.hostingConfigLookupWheres).toContainEqual(["uid", "=", 272]);
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
          uid: 272,
          user_seat_id: 101,
        },
        {
          agent_id: 301,
          full_auto_auth: 1,
          semi_auto_auth: 1,
          uid: 272,
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

  it("blocks non-allowlisted tenants from enabling full-auto hosting auth", async () => {
    process.env.NODE_ENV = "development";
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
        userSeatIds: ["101"],
      },
      url: "/api/server/ai-hosting/hosting-settings",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: "AI_HOSTING_FULL_AUTO_NOT_AVAILABLE",
        message: "该功能内测中，如需开通请联系客服",
      },
      success: false,
    });
    expect(db.insertedHostingConfigs).toEqual([]);
    expect(db.updatedHostingConfigs).toEqual([]);

    await app.close();
  });

  it("allows non-allowlisted tenants to keep or disable existing full-auto hosting auth", async () => {
    process.env.NODE_ENV = "development";
    const { app, authorization, db } = await createAiHostingApp();

    const keepEnabled = await app.inject({
      headers: { authorization },
      method: "PUT",
      payload: {
        agentId: "301",
        fullAutoAuth: true,
        semiAutoAuth: true,
        userSeatIds: ["102"],
      },
      url: "/api/server/ai-hosting/hosting-settings",
    });

    expect(keepEnabled.statusCode).toBe(200);
    expect(db.updatedHostingConfigs.at(-1)).toMatchObject({
      userSeatIds: [102],
      values: {
        full_auto_auth: 1,
        semi_auto_auth: 1,
      },
    });

    const disableEnabled = await app.inject({
      headers: { authorization },
      method: "PUT",
      payload: {
        agentId: "301",
        fullAutoAuth: false,
        semiAutoAuth: true,
        userSeatIds: ["102"],
      },
      url: "/api/server/ai-hosting/hosting-settings",
    });

    expect(disableEnabled.statusCode).toBe(200);
    expect(db.updatedHostingConfigs.at(-1)).toMatchObject({
      userSeatIds: [102],
      values: {
        full_auto_auth: 0,
        semi_auto_auth: 1,
      },
    });

    await app.close();
  });

  it("allows development uid 272 and production uid 101 to enable full-auto hosting auth", async () => {
    process.env.NODE_ENV = "development";
    const developmentApp = await createAiHostingApp(["admin"], {
      dataUid: 272,
      uid: 272,
    });

    const developmentResponse = await developmentApp.app.inject({
      headers: { authorization: developmentApp.authorization },
      method: "PUT",
      payload: {
        agentId: "301",
        fullAutoAuth: true,
        semiAutoAuth: true,
        userSeatIds: ["101"],
      },
      url: "/api/server/ai-hosting/hosting-settings",
    });

    expect(developmentResponse.statusCode).toBe(200);
    expect(developmentResponse.json().data.fullAutoAuthAvailable).toBe(true);
    await developmentApp.app.close();

    process.env.NODE_ENV = "production";
    const productionApp = await createAiHostingApp(["admin"], {
      dataUid: 101,
      uid: 101,
    });

    const productionResponse = await productionApp.app.inject({
      headers: { authorization: productionApp.authorization },
      method: "PUT",
      payload: {
        agentId: "301",
        fullAutoAuth: true,
        semiAutoAuth: true,
        userSeatIds: ["101"],
      },
      url: "/api/server/ai-hosting/hosting-settings",
    });

    expect(productionResponse.statusCode).toBe(200);
    expect(productionResponse.json().data.fullAutoAuthAvailable).toBe(true);
    await productionApp.app.close();
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
          availableKbIds: [1, 3],
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
        available_kb_ids: [1, 3],
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

  it("maps Java handoff simulation results without returning a gateway error", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: `{
    "action": "handoff",
    "reason": "客户明确表达转人工需求"
}`,
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
            contents: [{ type: "text", text: "转人工" }],
            role: "user",
          },
        ],
        modelId: "11",
        promptConfig: {
          availableKbIds: [],
          conditionLogic: "",
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
        action: "handoff",
        reply: [{ type: "text", content: "已触发转人工" }],
      },
      success: true,
    });

    fetchMock.mockRestore();
    await app.close();
  });

  it("returns a successful empty reply when Java test-agent data is not renderable", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            action: "reply",
            reply: [],
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
            contents: [{ type: "text", text: "测试" }],
            role: "user",
          },
        ],
        modelId: "11",
        promptConfig: {
          availableKbIds: [],
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
    expect(response.json()).toEqual({
      data: {
        action: "reply",
        reply: [],
      },
      success: true,
    });

    fetchMock.mockRestore();
    await app.close();
  });

  it("rejects agent simulation tests for non-manage roles", async () => {
    process.env.JAVA_INTERNAL_API_BASE_URL = "https://java.internal/";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            action: "reply",
            reply: [{ type: "text", content: "不应调用" }],
          },
          success: true,
        }),
        { status: 200 },
      ),
    );
    const { app, authorization } = await createAiHostingApp(["operator"]);

    const response = await app.inject({
      headers: { authorization },
      method: "POST",
      payload: {
        messages: [
          {
            contents: [{ type: "text", text: "我想测试 Agent" }],
            role: "user",
          },
        ],
        modelId: "11",
        promptConfig: {
          availableKbIds: [1],
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

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: "FORBIDDEN",
        message: "无权限访问",
      },
      success: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();

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
          availableKbIds: [],
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
  activeAgentCount?: number;
  activeKbCount?: number;
  beforeExecute?: (event: QueryExecutionEvent) => Promise<void> | void;
  bulkHostingSeats?: boolean;
  dataUid?: number;
  deletedAgentCount?: number;
  deletedKbCount?: number;
  docSizeBytes?: number[];
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
  const uid = options.uid ?? 9001;
  const dataUid = options.dataUid ?? 9001;
  const subUsers = [
    {
      id: 1,
      platform: 5,
      status: 1,
      uid: dataUid,
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
      uid: dataUid,
    },
  ];
  let agentPrompt = "如何客户咨询成分，那么说明功效";
  const agents = [
    {
      auto_learn_enabled: 0,
      create_time: new Date("2024-06-10T08:00:00Z"),
      id: 301,
      last_publish_time: new Date("2024-06-10T08:00:00Z").getTime(),
      last_operator_id: 1,
      model_id: 11,
      name: "护肤小助理",
      operator_id: 1,
      prompt_config: buildPromptConfig(agentPrompt),
      status: 1,
      uid: dataUid,
      update_time: new Date("2024-06-10T08:01:00Z"),
    },
    {
      auto_learn_enabled: 0,
      create_time: new Date("2024-06-12T08:00:00Z"),
      id: 303,
      last_publish_time: 0,
      last_operator_id: 1,
      model_id: 11,
      name: "未发布小助理",
      operator_id: 1,
      prompt_config: buildPromptConfig(agentPrompt),
      status: 1,
      uid: dataUid,
      update_time: new Date("2024-06-12T08:01:00Z"),
    },
  ];
  for (let index = agents.length; index < (options.activeAgentCount ?? agents.length); index += 1) {
    agents.push({
      auto_learn_enabled: 0,
      create_time: new Date("2024-06-13T08:00:00Z"),
      id: 400 + index,
      last_publish_time: 0,
      last_operator_id: 1,
      model_id: 11,
      name: `配额测试小助理${index}`,
      operator_id: 1,
      prompt_config: buildPromptConfig(agentPrompt),
      status: 1,
      uid: dataUid,
      update_time: new Date("2024-06-13T08:01:00Z"),
    });
  }
  for (let index = 0; index < (options.deletedAgentCount ?? 0); index += 1) {
    agents.push({
      auto_learn_enabled: 0,
      create_time: new Date("2024-06-14T08:00:00Z"),
      id: 500 + index,
      last_publish_time: 0,
      last_operator_id: 1,
      model_id: 11,
      name: `已删除小助理${index}`,
      operator_id: 1,
      prompt_config: buildPromptConfig(agentPrompt),
      status: 0,
      uid: dataUid,
      update_time: new Date("2024-06-14T08:01:00Z"),
    });
  }
  const histories = [
    {
      agent_id: 301,
      create_time: new Date("2024-06-10T08:00:00Z"),
      id: 701,
      model_id: 11,
      operator_id: 1,
      prompt_config: buildPromptConfig(agentPrompt),
      uid: dataUid,
    },
  ];
  const seats = [
    {
      avatarUrl: "https://example.com/seat-102.png",
      id: 102,
      platform: 5,
      third_avatar: "https://example.com/seat-102.png",
      third_user_name: "小助理2",
      uid: dataUid,
    },
    {
      avatarUrl: "",
      id: 101,
      platform: 5,
      third_avatar: "",
      third_user_name: "小助理1",
      uid: dataUid,
    },
    ...(options.bulkHostingSeats
      ? [
          {
            avatarUrl: "https://example.com/seat-104.png",
            id: 104,
            platform: 5,
            third_avatar: "https://example.com/seat-104.png",
            third_user_name: "小助理4",
            uid: dataUid,
          },
          {
            avatarUrl: "https://example.com/seat-103.png",
            id: 103,
            platform: 5,
            third_avatar: "https://example.com/seat-103.png",
            third_user_name: "小助理3",
            uid: dataUid,
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
      uid: dataUid,
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
            uid: dataUid,
            user_seat_id: 104,
          },
        ]
      : []),
  ];
  const kbs = Array.from({ length: options.activeKbCount ?? 3 }, (_, index) => ({
    create_time: new Date("2024-06-15T08:00:00Z"),
    id: index + 1,
    last_operator_id: 1,
    name: ["商品咨询知识库", "售后政策知识库", "活动政策知识库"][index] ?? `知识库${index + 1}`,
    operator_id: 1,
    remark: "",
    status: 1,
    uid: dataUid,
    update_time: new Date("2024-06-15T08:01:00Z"),
  }));
  for (let index = 0; index < (options.deletedKbCount ?? 0); index += 1) {
    kbs.push({
      create_time: new Date("2024-06-16T08:00:00Z"),
      id: 100 + index,
      last_operator_id: 1,
      name: `已删除知识库${index}`,
      operator_id: 1,
      remark: "",
      status: 0,
      uid: dataUid,
      update_time: new Date("2024-06-16T08:01:00Z"),
    });
  }
  const docs = (options.docSizeBytes ?? [12 * 1024 * 1024, 8 * 1024 * 1024]).map(
    (docSize, index) => ({
      doc_size: docSize,
      id: 1001 + index,
      status: 1,
      uid: dataUid,
    }),
  );
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
    kbListExecuteCount: 0,
    kbListWheres: [] as Array<[string, string, unknown]>,
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
    setAgentPromptConfig: (prompt: { availableKbIds: number[]; conditionLogic: string }) => {
      agentPrompt = prompt.conditionLogic;
      agents[0].prompt_config = buildPromptConfig(prompt.conditionLogic, prompt.availableKbIds);
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

            return agents.map((agent) => ({
              ...agent,
              available_kb_ids: JSON.stringify(
                JSON.parse(agent.prompt_config).available_kb_ids,
              ),
            }));
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

          if (table === "xy_wap_embed_agent_kb") {
            state.kbListExecuteCount += 1;
            state.kbListWheres = wheres;
            const uid = Number(wheres.find(([column]) => column === "uid")?.[2]);
            const status = Number(wheres.find(([column]) => column === "status")?.[2]);
            const ids = wheres.find(([column]) => column === "id")?.[2] as
              | number[]
              | undefined;

            return kbs.filter(
              (kb) =>
                (!Number.isFinite(uid) || kb.uid === uid) &&
                (!Number.isFinite(status) || kb.status === status) &&
                (!ids || ids.includes(kb.id)),
            );
          }

          if (table === "xy_wap_embed_agent_kb_doc") {
            return docs;
          }

          if (table === "xy_wap_embed_agent_kb_learning_candidate") {
            return [];
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

          if (table === "xy_wap_embed_agent_kb") {
            const uid = Number(wheres.find(([column]) => column === "uid")?.[2]);
            return {
              total: kbs.filter(
                (kb) => kb.status === 1 && (!Number.isFinite(uid) || kb.uid === uid),
              ).length,
            };
          }

          if (table === "xy_wap_embed_agent_kb_doc") {
            const uid = Number(wheres.find(([column]) => column === "uid")?.[2]);
            return {
              used: docs
                .filter((doc) => doc.status === 1 && (!Number.isFinite(uid) || doc.uid === uid))
                .reduce((total, doc) => total + doc.doc_size, 0),
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
        groupBy: () => builder,
        select: (selection: unknown) => {
          if (typeof selection === "function") {
            isCountQuery = true;
            return builder;
          }

          if (table === "xy_wap_embed_agent as agent") {
            const selections = Array.isArray(selection) ? selection : [selection];
            state.agentListSelects = selections.map(formatSelectExpression);
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
              auto_learn_enabled: Number(values.auto_learn_enabled ?? 0),
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

function buildPromptConfig(conditionLogic: string, availableKbIds = [1, 3]) {
  return JSON.stringify({
    available_kb_ids: availableKbIds,
    condition_logic: conditionLogic,
    reply_style: {
      length: "简洁",
      style_instruction: "亲切自然",
    },
    handoff_rules: "客户要求真人",
    role: "你是护肤顾问",
  });
}

function formatSelectExpression(selection: unknown) {
  if (typeof selection === "string") {
    return selection;
  }

  if (
    selection &&
    typeof selection === "object" &&
    "toOperationNode" in selection &&
    typeof selection.toOperationNode === "function"
  ) {
    const node = selection.toOperationNode() as {
      alias?: { name?: string };
      node?: { sqlFragments?: string[] };
    };
    const sqlText = node.node?.sqlFragments?.join("?") ?? "raw";
    const alias = node.alias?.name;

    return alias ? `${sqlText} as ${alias}` : sqlText;
  }

  return String(selection);
}
