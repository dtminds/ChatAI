import { describe, expect, it } from "vitest";
import { mapJavaAgentTestResponse } from "../../../src/modules/ai-hosting/agent-test-mappers.js";

describe("mapJavaAgentTestResponse", () => {
  it("maps reply arrays with text content", () => {
    expect(
      mapJavaAgentTestResponse({
        action: "reply",
        reply: [
          {
            type: "text",
            content: "您好，请问您是有什么问题需要咨询吗？可以详细说一下哦~",
          },
        ],
      }),
    ).toEqual({
      action: "reply",
      reply: [
        {
          type: "text",
          content: "您好，请问您是有什么问题需要咨询吗？可以详细说一下哦~",
        },
      ],
    });
  });

  it("maps multiple reply items", () => {
    expect(
      mapJavaAgentTestResponse({
        action: "reply",
        reply: [
          { type: "text", content: "第一段回复" },
          { type: "text", content: "第二段回复" },
        ],
      }),
    ).toEqual({
      action: "reply",
      reply: [
        { type: "text", content: "第一段回复" },
        { type: "text", content: "第二段回复" },
      ],
    });
  });

  it("maps nested data payloads", () => {
    expect(
      mapJavaAgentTestResponse({
        data: {
          action: "reply",
          reply: [{ type: "text", content: "已收到" }],
        },
      }),
    ).toEqual({
      action: "reply",
      reply: [{ type: "text", content: "已收到" }],
    });
  });

  it("maps plain reply strings", () => {
    expect(mapJavaAgentTestResponse("  简短回复  ")).toEqual({
      action: "reply",
      reply: [{ type: "text", content: "简短回复" }],
    });
  });

  it("parses stringified reply payloads", () => {
    expect(
      mapJavaAgentTestResponse(
        JSON.stringify({
          action: "reply",
          reply: [{ type: "text", content: "请问有什么可以帮助您的吗？" }],
        }),
      ),
    ).toEqual({
      action: "reply",
      reply: [{ type: "text", content: "请问有什么可以帮助您的吗？" }],
    });
  });

  it("maps stringified handoff payloads returned by Java", () => {
    expect(
      mapJavaAgentTestResponse(`{
    "action": "handoff",
    "reason": "客户明确表达转人工需求"
}`),
    ).toEqual({
      action: "handoff",
      reply: [{ type: "text", content: "已触发转人工" }],
    });
  });

  it("preserves reply content returned with handoff actions", () => {
    expect(
      mapJavaAgentTestResponse({
        action: "handoff",
        reply: [{ type: "text", content: "转人工原因" }],
      }),
    ).toEqual({
      action: "handoff",
      reply: [{ type: "text", content: "转人工原因" }],
    });
  });

  it("parses reply text content that embeds a json payload", () => {
    expect(
      mapJavaAgentTestResponse({
        action: "reply",
        reply: [
          {
            type: "text",
            content: JSON.stringify({
              action: "reply",
              reply: [{ type: "text", content: "请问有什么可以帮助您的吗？" }],
            }),
          },
        ],
      }),
    ).toEqual({
      action: "reply",
      reply: [{ type: "text", content: "请问有什么可以帮助您的吗？" }],
    });
  });

  it("maps empty reply payloads to an empty successful response", () => {
    expect(
      mapJavaAgentTestResponse({
        action: "reply",
        reply: [],
      }),
    ).toEqual({
      action: "reply",
      reply: [],
    });
  });
});
