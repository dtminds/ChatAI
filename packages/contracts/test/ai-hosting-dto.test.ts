import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import {
  AiHostingAgentDetailSchema,
  AiHostingAgentSaveRequestSchema,
  AiHostingModelListResponseSchema,
} from "../src";

describe("AI hosting DTOs", () => {
  it("accepts Chinese prompt config values for agent saves", () => {
    expect(
      Value.Check(AiHostingAgentSaveRequestSchema, {
        modelId: "11",
        name: "护肤小助理",
        promptConfig: {
          conditionLogic: "如果客户咨询成分，那么说明功效",
          keynote: {
            length: "简洁",
            style: ["亲切自然"],
          },
          role: "你是护肤顾问",
          style: "亲切自然",
          transferToHuman: "客户要求真人",
        },
      }),
    ).toBe(true);
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
          conditionLogic: "如果客户咨询成分，那么说明功效",
          keynote: {
            length: "简洁",
            style: ["亲切自然"],
          },
          role: "你是护肤顾问",
          style: "亲切自然",
          transferToHuman: "客户要求真人",
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
});
