import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentSkillService } from "../../../src/modules/ai-hosting/agent-skill.service.js";

describe("AgentSkillService", () => {
  const skills = new Map<
    number,
    {
      apply_scene: string | null;
      content: string | null;
      create_time: Date;
      id: number;
      is_del: number;
      kbs: string | null;
      last_operator_id: number;
      name: string;
      operator_id: number;
      status: number;
      tools: string | null;
      uid: number;
      update_time: Date;
      variables: string | null;
    }
  >();
  let nextId = 1;

  beforeEach(() => {
    skills.clear();
    nextId = 1;
  });

  function createService(
    resolveResources = vi.fn(async (_uid: number, input: {
      kbs: number[];
      tools: string[];
      variables: Array<{ name: string; type: string }>;
    }) => ({
      knowledgeBases: input.kbs.map((kbId) => ({
        id: `kb:${kbId}`,
        kbId,
        name: `知识库 ${kbId}`,
        status: "available" as const,
      })),
      tools: input.tools.map((toolKey) => ({
        id: toolKey,
        name: toolKey,
        status: "available" as const,
        toolKey,
      })),
      variables: input.variables.map((variable, index) => ({
        id: `variable:${index}`,
        name: variable.name,
        status: "available" as const,
        variable,
      })),
    })),
  ) {
    const db = {
      insertInto(table: string) {
        expect(table).toBe("xy_wap_embed_agent_skill");
        let values: Record<string, unknown> = {};
        return {
          values(input: Record<string, unknown>) {
            values = input;
            return this;
          },
          async executeTakeFirstOrThrow() {
            const id = nextId;
            nextId += 1;
            const now = new Date("2026-07-28T10:00:00");
            skills.set(id, {
              apply_scene: String(values.apply_scene ?? ""),
              content: String(values.content ?? ""),
              create_time: now,
              id,
              is_del: Number(values.is_del ?? 0),
              kbs: String(values.kbs ?? "[]"),
              last_operator_id: Number(values.last_operator_id ?? 0),
              name: String(values.name ?? ""),
              operator_id: Number(values.operator_id ?? 0),
              status: Number(values.status ?? 0),
              tools: String(values.tools ?? "[]"),
              uid: Number(values.uid ?? 0),
              update_time: now,
              variables: String(values.variables ?? "[]"),
            });
            return { insertId: BigInt(id) };
          },
        };
      },
      selectFrom(table: string) {
        expect(table).toBe("xy_wap_embed_agent_skill");
        const wheres: Array<[string, string, unknown]> = [];
        let limitValue = 100;
        let offsetValue = 0;
        let orderByIdDesc = false;
        const builder = {
          select(_columns: unknown) {
            return builder;
          },
          where(column: string | ((eb: unknown) => unknown), operator?: string, value?: unknown) {
            if (typeof column === "function") {
              return builder;
            }
            wheres.push([column, operator ?? "=", value]);
            return builder;
          },
          orderBy(column: string, direction: string) {
            if (column === "id" && direction === "desc") {
              orderByIdDesc = true;
            }
            return builder;
          },
          limit(value: number) {
            limitValue = value;
            return builder;
          },
          offset(value: number) {
            offsetValue = value;
            return builder;
          },
          async execute() {
            let rows = [...skills.values()];
            for (const [column, , value] of wheres) {
              rows = rows.filter((row) => (row as Record<string, unknown>)[column] === value);
            }
            if (orderByIdDesc) {
              rows.sort((left, right) => right.id - left.id);
            }
            return rows.slice(offsetValue, offsetValue + limitValue);
          },
          async executeTakeFirst() {
            const rows = await builder.execute();
            if (wheres.some(([column]) => column === "id")) {
              return rows[0];
            }
            return { count: rows.length };
          },
        };
        return builder;
      },
      updateTable(table: string) {
        expect(table).toBe("xy_wap_embed_agent_skill");
        const wheres: Array<[string, string, unknown]> = [];
        let values: Record<string, unknown> = {};
        const builder = {
          set(input: Record<string, unknown>) {
            values = input;
            return builder;
          },
          where(column: string, operator: string, value: unknown) {
            wheres.push([column, operator, value]);
            return builder;
          },
          async executeTakeFirstOrThrow() {
            const id = Number(wheres.find(([column]) => column === "id")?.[2]);
            const row = skills.get(id);
            if (!row) {
              throw new Error("missing skill");
            }
            Object.assign(row, values);
            return { numUpdatedRows: BigInt(1) };
          },
        };
        return builder;
      },
    };

    return new AgentSkillService(db as never, { resolveResources } as never);
  }

  it("creates, lists, updates status and soft-deletes skills", async () => {
    const service = createService();

    const created = await service.createSkill(
      { operatorSubUserId: "101", uid: 9001 },
      {
        applyScene: "查物流",
        content: "查询订单物流",
        kbs: [9],
        name: "物流技能",
        tools: ["search_order"],
        variables: [
          {
            name: "客户昵称",
            select_key: "customer_nickname",
            type: "system_variable",
          },
        ],
      },
    );

    expect(created).toEqual({ id: "1" });

    const listed = await service.listSkills(9001, { page: 1, pageSize: 10 });
    expect(listed.pagination.total).toBe(1);
    expect(listed.skills[0]).toMatchObject({
      applyScene: "查物流",
      id: "1",
      name: "物流技能",
      status: "enabled",
    });

    await service.updateSkillStatus(
      { operatorSubUserId: "101", uid: 9001 },
      "1",
      { status: "disabled" },
    );
    const detail = await service.getSkill(9001, "1");
    expect(detail.status).toBe("disabled");
    expect(detail.resources).toEqual({
      knowledgeBases: [
        expect.objectContaining({ kbId: 9, status: "available" }),
      ],
      tools: [
        expect.objectContaining({
          status: "available",
          toolKey: "search_order",
        }),
      ],
      variables: [
        expect.objectContaining({ status: "available" }),
      ],
    });

    await service.deleteSkill({ operatorSubUserId: "101", uid: 9001 }, "1");
    expect((await service.listSkills(9001)).skills).toEqual([]);
  });

  it("rejects skill fields that exceed save limits", async () => {
    const service = createService();
    const context = { operatorSubUserId: "101", uid: 9001 };
    const payload = {
      applyScene: "查物流",
      content: "查询订单物流",
      kbs: [],
      name: "物流技能",
      tools: [],
      variables: [],
    };

    await expect(
      service.createSkill(context, {
        ...payload,
        name: "技".repeat(31),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_SKILL_NAME",
      message: "技能名称不能超过30个字",
    });

    await expect(
      service.createSkill(context, {
        ...payload,
        applyScene: "场".repeat(501),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_SKILL_APPLY_SCENE",
      message: "技能应用场景不能超过500个字",
    });

    await expect(
      service.createSkill(context, {
        ...payload,
        kbs: Array.from({ length: 11 }, (_, index) => index + 1),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_SKILL_KBS",
      message: "一个技能最多可添加10个知识库",
    });

    await expect(
      service.createSkill(context, {
        ...payload,
        content: "描".repeat(8001),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_SKILL_CONTENT",
      message: "技能描述不能超过8000个字",
    });
  });

  it("blocks saving when a referenced resource is invalid", async () => {
    const resolveResources = vi.fn(async () => ({
      knowledgeBases: [
        {
          id: "kb:9",
          invalidReason: "deleted" as const,
          kbId: 9,
          name: "已删除知识库",
          status: "invalid" as const,
        },
      ],
      tools: [],
      variables: [],
    }));
    const service = createService(resolveResources);

    await expect(
      service.createSkill(
        { operatorSubUserId: "101", uid: 9001 },
        {
          applyScene: "查物流",
          content: "查询订单物流",
          kbs: [9],
          name: "物流技能",
          tools: [],
          variables: [],
        },
      ),
    ).rejects.toMatchObject({
      code: "SKILL_RESOURCES_INVALID",
      details: {
        knowledgeBases: [
          expect.objectContaining({
            invalidReason: "deleted",
            kbId: 9,
          }),
        ],
      },
    });
    expect(skills.size).toBe(0);
  });

  it("rejects repeated work-tag and mall-tag groups", async () => {
    const resolveResources = vi.fn();
    const service = createService(resolveResources);

    for (const type of ["work_tag", "mall_tag"] as const) {
      await expect(
        service.createSkill(
          { operatorSubUserId: "101", uid: 9001 },
          {
            applyScene: "按标签回复",
            content: "",
            kbs: [],
            name: "标签技能",
            tools: [],
            variables: [
              {
                name: "意向标签 | 高意向",
                select_id: 11,
                select_sub_ids: [111],
                type,
              },
              {
                name: "意向标签 | 低意向",
                select_id: 11,
                select_sub_ids: [112],
                type,
              },
            ],
          },
        ),
      ).rejects.toMatchObject({ code: "INVALID_SKILL_VARIABLES" });
    }
    expect(resolveResources).not.toHaveBeenCalled();
    expect(skills.size).toBe(0);
  });
});
