import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  AiHostingAgentDetailSchema,
  AiHostingAgentRenameRequestSchema,
  AiHostingAgentSaveRequestSchema,
  AiHostingAgentSettingsSaveRequestSchema,
  AiHostingAgentTestRequestSchema,
  AiHostingAgentTestResponseSchema,
  AiHostingModelListResponseSchema,
  AiHostingQuotaOverviewSchema,
  KbDocCreateRequestSchema,
  KbDocListResponseSchema,
  KbCreateResponseSchema,
  KbListResponseSchema,
} from "../src";

describe("AI hosting DTOs", () => {
  it("accepts Chinese prompt config values for agent saves", () => {
    expect(
      Value.Check(AiHostingAgentSaveRequestSchema, {
        modelId: "11",
        name: "护肤小助理",
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
      }),
    ).toBe(true);
  });

  it("limits long text prompt fields to 2000 characters", () => {
    const longText = "a".repeat(2001);
    const basePayload = {
      modelId: "11",
      name: "护肤小助理",
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
    };

    expect(
      Value.Check(AiHostingAgentSaveRequestSchema, {
        ...basePayload,
        promptConfig: {
          ...basePayload.promptConfig,
          role: longText,
        },
      }),
    ).toBe(false);
    expect(
      Value.Check(AiHostingAgentSaveRequestSchema, {
        ...basePayload,
        promptConfig: {
          ...basePayload.promptConfig,
          replyStyle: {
            ...basePayload.promptConfig.replyStyle,
            styleInstruction: longText,
          },
        },
      }),
    ).toBe(false);
    expect(
      Value.Check(AiHostingAgentSaveRequestSchema, {
        ...basePayload,
        promptConfig: {
          ...basePayload.promptConfig,
          handoffRules: longText,
        },
      }),
    ).toBe(false);
  });

  it("keeps agent settings saves separate from name edits", () => {
    expect(
      Value.Check(AiHostingAgentSettingsSaveRequestSchema, {
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
      }),
    ).toBe(true);

    expect(
      Value.Check(AiHostingAgentSettingsSaveRequestSchema, {
        modelId: "11",
        name: "护肤小助理",
        promptConfig: {
          availableKbIds: [1, 3],
          conditionLogic: "",
          replyStyle: {
            length: "简洁",
            styleInstruction: "亲切自然",
          },
          handoffRules: "客户要求真人",
          role: "你是护肤顾问",
        },
      }),
    ).toBe(false);

    expect(Value.Check(AiHostingAgentRenameRequestSchema, { name: "护肤小助理" })).toBe(true);
  });

  it("keeps publish state separate from agent history internals", () => {
    expect(
      Value.Check(AiHostingAgentDetailSchema, {
        hasUnpublishedChanges: true,
        id: "301",
        model: {
          id: "11",
          label: "Doubao-2.0-lite",
          model: "doubao-2.0-lite",
          name: "Doubao-2.0-lite",
        },
        modelId: "11",
        name: "护肤小助理",
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
        publishedAt: 1_718_006_400_000,
        updatedAt: 1_718_006_460_000,
      }),
    ).toBe(true);
  });

  it("returns tenant and fallback models without exposing DB endpoint fields", () => {
    expect(
      Value.Check(AiHostingModelListResponseSchema, {
        models: [
          {
            description: "系统默认",
            id: "10",
            label: "默认模型",
            model: "default-model",
            name: "默认模型",
            supportMultimodal: false,
          },
        ],
      }),
    ).toBe(true);
  });

  it("accepts agent simulation test requests", () => {
    expect(
      Value.Check(AiHostingAgentTestRequestSchema, {
        messages: [
          {
            contents: [
              { type: "text", text: "我想了解晨间护肤" },
              { type: "image", url: "https://cdn.example.com/demo.png" },
            ],
            role: "user",
          },
          {
            contents: [{ type: "text", text: "你好" }],
            role: "assistant",
          },
        ],
        modelId: "11",
        promptConfig: {
          availableKbIds: [],
          conditionLogic: "如果客户咨询成分，那么说明功效",
          replyStyle: {
            length: "简洁",
            styleInstruction: "亲切自然",
          },
          handoffRules: "客户要求真人",
          role: "你是护肤顾问",
        },
      }),
    ).toBe(true);
  });

  it("accepts agent simulation test responses with multiple reply items", () => {
    expect(
      Value.Check(AiHostingAgentTestResponseSchema, {
        action: "reply",
        reply: [
          { type: "text", content: "第一段回复" },
          { type: "text", content: "第二段回复" },
        ],
      }),
    ).toBe(true);
  });

  it("keeps kb creation response command-shaped", () => {
    expect(Value.Check(KbCreateResponseSchema, { kbId: "2" })).toBe(true);
    expect(
      Value.Check(KbCreateResponseSchema, {
        createdAt: "2026-06-27T08:00:00.000Z",
        description: "用于新品上市培训",
        kbId: "2",
        name: "新品培训知识",
        updatedAt: "2026-06-27T08:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("requires document size for quota checks when creating documents", () => {
    const payload = {
      chunkParams: { maxLength: 2000, strategy: "length" },
      chunkStrategy: "length",
      docSize: 1024,
      docSuffix: "pdf",
      docUrl: "kb-docs/demo.pdf",
      kbId: "1",
      name: "产品手册",
      parseMode: "standard",
    };

    expect(Value.Check(KbDocCreateRequestSchema, payload)).toBe(true);
    expect(Value.Check(KbDocCreateRequestSchema, { ...payload, docSize: -1 })).toBe(false);
    expect(Value.Check(KbDocCreateRequestSchema, { ...payload, docSize: undefined })).toBe(false);
  });

  it("keeps list responses separate from quota usage", () => {
    expect(
      Value.Check(KbListResponseSchema, {
        kbs: [],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 0,
        },
      }),
    ).toBe(true);
    expect(
      Value.Check(KbListResponseSchema, {
        kbs: [],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 0,
        },
        quota: {
          limit: 20,
          used: 0,
        },
      }),
    ).toBe(false);
    expect(
      Value.Check(KbDocListResponseSchema, {
        docs: [],
        pagination: {
          page: 1,
          pageSize: 10,
          total: 0,
        },
        quota: {
          limit: 1024,
          used: 0,
        },
      }),
    ).toBe(false);
  });

  it("returns ai hosting quota overview for sidebar display", () => {
    expect(
      Value.Check(AiHostingQuotaOverviewSchema, {
        agents: {
          limit: 20,
          used: 2,
        },
        kbDocs: {
          limit: 1024 * 1024 * 1024,
          used: 20 * 1024 * 1024,
        },
        kbs: {
          limit: 20,
          used: 3,
        },
      }),
    ).toBe(true);
  });
});
