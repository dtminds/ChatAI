import type {
  CustomerResponsePreflightRequest,
  CustomerResponsePreflightResponse,
  WorkbenchMessageDto,
} from "@chatai/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  buildCustomerResponsePreflightContext,
  CustomerResponsePreflightService,
} from "../../../src/modules/chat/customer-response-preflight.service";

const request: CustomerResponsePreflightRequest = {
  conversationId: "144",
  triggerMessageId: "20",
};

describe("CustomerResponsePreflightService", () => {
  it("looks up the trigger message with a 20-message context window", async () => {
    const repository = {
      listMessageContext: vi.fn().mockResolvedValue({
        messages: [createMessage({ senderType: "customer", seq: 20 })],
        targetMessageId: request.triggerMessageId,
      }),
    };
    const service = new CustomerResponsePreflightService({ repository });

    const response = await service.assess(9001, request);

    expect(repository.listMessageContext).toHaveBeenCalledWith({
      after: 20,
      before: 19,
      conversationId: request.conversationId,
      messageId: request.triggerMessageId,
      uid: 9001,
    });
    expect(response).toMatchObject({
      assessment: { outcome: "response_needed" },
      source: "fallback",
    });
  });

  it("does not assess an older customer message after later conversation activity", async () => {
    const repository = {
      listMessageContext: vi.fn().mockResolvedValue({
        messages: [
          createMessage({ senderType: "customer", seq: 20 }),
          createMessage({
            createdAt: 2_000,
            senderType: "agent",
            seq: 21,
          }),
        ],
        targetMessageId: request.triggerMessageId,
      }),
    };
    const fetchMock = vi.fn();
    const service = new CustomerResponsePreflightService({
      apiKey: "test-key",
      fetch: fetchMock,
      repository,
    });

    const response = await service.assess(9001, request);

    expect(response).toMatchObject({
      assessment: {
        outcome: "no_response_needed",
        reasoningSummary: "该消息已有后续处理，无需重复回应",
      },
      source: "fallback",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the latest 20 messages in the model context", () => {
    const messages = Array.from({ length: 25 }, (_, index) =>
      createMessage({
        createdAt: 1_000 + index,
        senderType: "customer",
        seq: index + 1,
      }),
    );

    const context = buildCustomerResponsePreflightContext(messages, "25");

    expect(context).toHaveLength(20);
    expect(context[0]?.messageId).toBe("6");
    expect(context.at(-1)?.messageId).toBe("25");
  });

  it("starts a new context after a gap longer than 12 hours", () => {
    const gap = 12 * 60 * 60 * 1_000;
    const messages = [
      createMessage({ createdAt: 1_000, senderType: "customer", seq: 1 }),
      createMessage({ createdAt: 2_000, senderType: "agent", seq: 2 }),
      createMessage({
        createdAt: 2_000 + gap + 1,
        senderType: "customer",
        seq: 3,
      }),
    ];

    const context = buildCustomerResponsePreflightContext(messages, "3");

    expect(context.map((message) => message.messageId)).toEqual(["3"]);
  });

  it("sends images as multimodal content and accepts a valid model result", async () => {
    const imageUrl = "https://example.com/customer.png";
    const repository = {
      listMessageContext: vi.fn().mockResolvedValue({
        messages: [
          createMessage({
            content: { alt: "商品照片", fileUrl: imageUrl },
            contentType: "image",
            rawMsgtype: "image",
            senderType: "customer",
            seq: 20,
          }),
        ],
        targetMessageId: request.triggerMessageId,
      }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    direction: "provide_response",
                    reasoningSummary: "客户发送商品图片，等待进一步判断",
                    outcome: "response_needed",
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );
    const service = new CustomerResponsePreflightService({
      apiKey: "test-key",
      fetch: fetchMock,
      repository,
    });

    const response = await service.assess(9001, request);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      messages: Array<{
        content: Array<{ image_url?: { url: string }; type: string }>;
        role: string;
      }>;
    };

    expect(response).toMatchObject({
      assessment: {
        direction: "provide_response",
        outcome: "response_needed",
      },
      source: "model",
    });
    expect(body.messages.at(-1)).toMatchObject({
      content: expect.arrayContaining([
        { image_url: { url: imageUrl }, type: "image_url" },
      ]),
      role: "user",
    });
  });

  it("reuses a cached assessment without invoking the model", async () => {
    const cachedResponse: CustomerResponsePreflightResponse = {
      assessment: {
        direction: "provide_response",
        reasoningSummary: "客户继续追问退款到账进度",
        outcome: "response_needed",
      },
      conversationId: request.conversationId,
      evaluatedThroughMessageId: request.triggerMessageId,
      nextAction: "confirm",
      source: "model",
    };
    const cache = {
      get: vi.fn().mockResolvedValue(JSON.stringify(cachedResponse)),
      set: vi.fn(),
    };
    const fetchMock = vi.fn();
    const service = new CustomerResponsePreflightService({
      apiKey: "test-key",
      cache,
      fetch: fetchMock,
      repository: {
        listMessageContext: vi.fn().mockResolvedValue({
          messages: [createMessage({ senderType: "customer", seq: 20 })],
          targetMessageId: request.triggerMessageId,
        }),
      },
    });

    const response = await service.assess(9001, request);

    expect(response).toEqual(cachedResponse);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("returns the conservative fallback when the automatic preflight budget is exhausted", async () => {
    const limiter = {
      reserve: vi.fn().mockResolvedValue(false),
    };
    const fetchMock = vi.fn();
    const service = new CustomerResponsePreflightService({
      apiKey: "test-key",
      automaticUsageLimiter: limiter,
      fetch: fetchMock,
      repository: {
        listMessageContext: vi.fn().mockResolvedValue({
          messages: [createMessage({ senderType: "customer", seq: 20 })],
          targetMessageId: request.triggerMessageId,
        }),
      },
    });

    const response = await service.assess(9001, request);

    expect(response).toMatchObject({
      assessment: {
        direction: "handle_request",
        outcome: "response_needed",
      },
      source: "fallback",
    });
    expect(limiter.reserve).toHaveBeenCalledWith({
      key: "chatai:chat:customer-response-preflight:rate:9001:144:initial",
      limit: 3,
      ttlSeconds: 60,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back when the model response is invalid", async () => {
    const repository = {
      listMessageContext: vi.fn().mockResolvedValue({
        messages: [createMessage({ senderType: "customer", seq: 20 })],
        targetMessageId: request.triggerMessageId,
      }),
    };
    const service = new CustomerResponsePreflightService({
      apiKey: "test-key",
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), {
            status: 200,
          }),
        ),
      repository,
    });

    const response = await service.assess(9001, request);

    expect(response).toMatchObject({
      assessment: {
        direction: "handle_request",
        reasoningSummary: "客户发来新消息，尚未形成明确处理结论",
        outcome: "response_needed",
      },
      source: "fallback",
    });
  });
});

function createMessage(
  overrides: Partial<WorkbenchMessageDto> &
    Pick<WorkbenchMessageDto, "senderType" | "seq">,
): WorkbenchMessageDto {
  return {
    content: { text: `消息 ${overrides.seq}` },
    contentType: "text",
    conversationId: "144",
    createdAt: 1_000,
    customerId: "customer-1",
    msgid: `msg-${overrides.seq}`,
    rawMsgtype: "text",
    seatId: "12",
    status: "sent",
    ...overrides,
  };
}
