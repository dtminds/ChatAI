import { describe, expect, it } from "vitest";
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
        ],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 1,
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
    expect(db.historyListExecuteCount).toBe(0);
    expect(db.modelListWheres).toContainEqual(["status", "=", 1]);
    expect(db.modelUidFilter).toEqual([9001, 0]);

    await app.close();
  });

  it("saves drafts without writing publish history and publishes only changed model or prompt", async () => {
    const { app, authorization, db } = await createAiHostingApp();

    const save = await app.inject({
      headers: { authorization },
      method: "PUT",
      payload: {
        modelId: "11",
        name: "护肤小助理改",
        promptConfig: {
          conditionLogic: "如何客户咨询成分，那么说明功效",
          keynote: {
            length: "简洁",
            style: ["亲切自然"],
          },
          role: "你是护肤顾问",
          style: "亲切自然",
          transferToHuman: "客户要求真人",
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
    expect(db.updatedAgent).toMatchObject({
      id: 301,
      values: {
        last_operator_id: 1,
        model_id: 11,
        name: "护肤小助理改",
        update_time: expect.any(Date),
      },
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
      model_id: 11,
      operator_id: 1,
      uid: 9001,
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
          keynote: {
            length: "简洁",
            style: ["亲切自然"],
          },
          role: "你是售后客服",
          style: "亲切自然",
          transferToHuman: "退款投诉",
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
});

async function createAiHostingApp() {
  const app = await buildMockedApp();
  const token = app.jwt.sign({
    roles: ["admin"],
    sessionId: "501",
    sessionVersion: 1,
    subUserId: "1",
  });
  const db = createAiHostingDbMock();

  app.db = db as never;

  return {
    app,
    authorization: `Bearer ${token}`,
    db,
  };
}

function createAiHostingDbMock() {
  const subUsers = [
    {
      id: 1,
      platform: 5,
      status: 1,
      uid: 9001,
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
      last_operator_id: 1,
      model_id: 11,
      name: "护肤小助理",
      operator_id: 1,
      prompt_config: buildPromptConfig(agentPrompt),
      status: 1,
      uid: 9001,
      update_time: new Date("2024-06-10T08:01:00Z"),
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
  const state = {
    agentListWheres: [] as Array<[string, string, unknown]>,
    deletedAgent: undefined as
      | { id: number | undefined; values: Record<string, unknown> }
      | undefined,
    insertedAgent: undefined as Record<string, unknown> | undefined,
    insertedHistories: [] as Array<Record<string, unknown>>,
    joinCalls: [] as string[],
    historyListExecuteCount: 0,
    modelListWheres: [] as Array<[string, string, unknown]>,
    modelUidFilter: undefined as unknown,
    updatedAgent: undefined as
      | { id: number | undefined; values: Record<string, unknown> }
      | undefined,
    setAgentPrompt: (prompt: string) => {
      agentPrompt = prompt;
      agents[0].prompt_config = buildPromptConfig(prompt);
    },
    selectFrom(table: string) {
      const wheres: Array<[string, string, unknown]> = [];
      const orderByCalls: Array<[string, string | undefined]> = [];
      const builder = {
        execute: async () => {
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

          throw new Error(`Unexpected execute table: ${table}`);
        },
        executeTakeFirst: async () => {
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
            return { total: agents.filter((agent) => agent.status === 1).length };
          }

          if (table === "xy_wap_embed_agent") {
            const id = Number(wheres.find(([column]) => column === "id")?.[2]);
            return agents.find((agent) => agent.id === id && agent.status === 1);
          }

          if (table === "xy_wap_embed_agent_history") {
            const agentId = Number(wheres.find(([column]) => column === "agent_id")?.[2]);
            return histories
              .filter((history) => history.agent_id === agentId)
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

          throw new Error(`Unexpected executeTakeFirst table: ${table}`);
        },
        innerJoin: (tableName: string) => {
          state.joinCalls.push(tableName);
          return builder;
        },
        limit: () => builder,
        offset: () => builder,
        orderBy: (column: string, direction?: string) => {
          orderByCalls.push([column, direction]);
          return builder;
        },
        select: () => builder,
        where: (column: string, operator: string, value: unknown) => {
          wheres.push([column, operator, value]);
          return builder;
        },
      };

      return builder;
    },
    insertInto(table: string) {
      const builder = {
        executeTakeFirstOrThrow: async () => ({ insertId: table === "xy_wap_embed_agent" ? 302 : 702 }),
        values: (values: Record<string, unknown>) => {
          if (table === "xy_wap_embed_agent") {
            state.insertedAgent = values;
            agents.push({
              create_time: new Date("2024-06-11T08:00:00Z"),
              id: 302,
              last_operator_id: Number(values.last_operator_id),
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

          if (table === "xy_wap_embed_agent_history") {
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
      if (table !== "xy_wap_embed_agent") {
        throw new Error(`Unexpected update table: ${table}`);
      }

      const wheres: Array<[string, string, unknown]> = [];
      let updateValues: Record<string, unknown> = {};
      const builder = {
        execute: async () => {
          const id = Number(wheres.find(([column]) => column === "id")?.[2]);
          const agent = agents.find((item) => item.id === id);

          if (agent) {
            Object.assign(agent, updateValues);
          }

          if (updateValues.status === 0) {
            state.deletedAgent = { id, values: updateValues };
          } else {
            state.updatedAgent = { id, values: updateValues };
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
  };

  return state;
}

function buildPromptConfig(conditionLogic: string) {
  return JSON.stringify({
    condition_logic: conditionLogic,
    keynote: {
      length: "简洁",
      style: ["亲切自然"],
    },
    role: "你是护肤顾问",
    style: "亲切自然",
    trans_manual: "客户要求真人",
  });
}
