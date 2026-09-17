import type {
  ChatAgentAssessment,
  ChatAgentPreflightRequest,
  WorkbenchMessageDto,
} from "@chatai/contracts";
import { describe, expect, it, vi } from "vitest";
import type {
  ChatAgentPreflightRecordStore,
  StoredChatAgentPreflightResult,
} from "../../../src/modules/chat/chat-agent-preflight.repository.js";
import {
  buildChatAgentPreflightContext,
  ChatAgentPreflightService,
} from "../../../src/modules/chat/chat-agent-preflight.service";

const request: ChatAgentPreflightRequest = {
  conversationId: "144",
  triggerMessageId: "20",
};

describe("ChatAgentPreflightService", () => {
  it("looks up the trigger message with a 20-message context window", async () => {
    const repository = {
      listMessageContext: vi.fn().mockResolvedValue({
        messages: [createMessage({ senderType: "customer", seq: 20 })],
        targetMessageId: request.triggerMessageId,
      }),
    };
    const service = new ChatAgentPreflightService({
      recordStore: createRecordStore(),
      repository,
    });

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
    const service = new ChatAgentPreflightService({
      apiKey: "test-key",
      fetch: fetchMock,
      recordStore: createRecordStore(),
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

    const context = buildChatAgentPreflightContext(messages, "25");

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

    const context = buildChatAgentPreflightContext(messages, "3");

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
            usage: {
              completion_tokens: 26,
              prompt_tokens: 118,
              total_tokens: 144,
            },
          }),
          { status: 200 },
        ),
      );
    const recordStore = createRecordStore();
    const service = new ChatAgentPreflightService({
      apiKey: "test-key",
      fetch: fetchMock,
      recordStore,
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
    expect(recordStore.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenUsage: {
          completion_tokens: 26,
          prompt_tokens: 118,
          total_tokens: 144,
        },
      }),
    );
  });

  it("reuses a persisted assessment without invoking the model", async () => {
    const persistedResult: StoredChatAgentPreflightResult = {
      assessment: {
        direction: "provide_response",
        reasoningSummary: "客户继续追问退款到账进度",
        outcome: "response_needed",
      },
      source: "model",
    };
    const recordStore = createRecordStore(persistedResult);
    const fetchMock = vi.fn();
    const service = new ChatAgentPreflightService({
      apiKey: "test-key",
      fetch: fetchMock,
      recordStore,
      repository: {
        listMessageContext: vi.fn().mockResolvedValue({
          messages: [createMessage({ senderType: "customer", seq: 20 })],
          targetMessageId: request.triggerMessageId,
        }),
      },
    });

    const response = await service.assess(9001, request);

    expect(response).toEqual({
      assessment: persistedResult.assessment,
      conversationId: request.conversationId,
      evaluatedThroughMessageId: request.triggerMessageId,
      nextAction: "confirm",
      source: "model",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recordStore.complete).not.toHaveBeenCalled();
  });

  it("keeps one shared model request running when a concurrent caller aborts", async () => {
    const fetchStarted = createDeferred<void>();
    const fetchResult = createDeferred<Response>();
    const fetchMock = vi.fn(async () => {
      fetchStarted.resolve();
      return fetchResult.promise;
    });
    const repository = {
      listMessageContext: vi.fn().mockResolvedValue({
        messages: [createMessage({ senderType: "customer", seq: 20 })],
        targetMessageId: request.triggerMessageId,
      }),
    };
    const recordStore = createRecordStore();
    const service = new ChatAgentPreflightService({
      apiKey: "test-key",
      fetch: fetchMock,
      recordStore,
      repository,
    });
    const abortController = new AbortController();

    const first = service.assess(9001, request, abortController.signal);
    await fetchStarted.promise;
    const second = service.assess(9001, request);
    abortController.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    fetchResult.resolve(createValidModelResponse());

    const secondResponse = await second;

    expect(secondResponse).toMatchObject({
      assessment: { outcome: "response_needed" },
      source: "model",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(repository.listMessageContext).toHaveBeenCalledTimes(1);
    expect(recordStore.claim).toHaveBeenCalledTimes(1);
    expect(recordStore.complete).toHaveBeenCalledTimes(1);
  });

  it("returns the conservative fallback when the automatic preflight budget is exhausted", async () => {
    const limiter = {
      reserve: vi.fn().mockResolvedValue(false),
    };
    const fetchMock = vi.fn();
    const service = new ChatAgentPreflightService({
      apiKey: "test-key",
      automaticUsageLimiter: limiter,
      fetch: fetchMock,
      recordStore: createRecordStore(),
      repository: {
        listMessageContext: vi.fn().mockResolvedValue({
          messages: [createMessage({ senderType: "customer", seq: 20 })],
          targetMessageId: request.triggerMessageId,
        }),
      },
    });

    const response = await service.assess(9001, request);
    const repeatedResponse = await service.assess(9001, request);

    expect(response).toMatchObject({
      assessment: {
        direction: "handle_request",
        outcome: "response_needed",
      },
      source: "fallback",
    });
    expect(limiter.reserve).toHaveBeenCalledWith({
      key: "chatai:chat:chat-agent-preflight:rate:9001:144:initial",
      limit: 3,
      ttlSeconds: 60,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(repeatedResponse).toEqual(response);
    expect(limiter.reserve).toHaveBeenCalledTimes(1);
  });

  it("falls back when the model response is invalid", async () => {
    const repository = {
      listMessageContext: vi.fn().mockResolvedValue({
        messages: [createMessage({ senderType: "customer", seq: 20 })],
        targetMessageId: request.triggerMessageId,
      }),
    };
    const recordStore = createRecordStore();
    const service = new ChatAgentPreflightService({
      apiKey: "test-key",
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "not json" } }],
              usage: { completion_tokens: 3, prompt_tokens: 80, total_tokens: 83 },
            }),
            { status: 200 },
          ),
        ),
      recordStore,
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
    expect(recordStore.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: "invalid_response",
        tokenUsage: {
          completion_tokens: 3,
          prompt_tokens: 80,
          total_tokens: 83,
        },
      }),
    );
  });
});

function createRecordStore(
  completedResult?: StoredChatAgentPreflightResult,
): ChatAgentPreflightRecordStore & {
  claim: ReturnType<typeof vi.fn>;
  complete: ReturnType<typeof vi.fn>;
  findCompleted: ReturnType<typeof vi.fn>;
} {
  let record:
    | { claimToken: string; status: "running" }
    | { result: StoredChatAgentPreflightResult; status: "completed" }
    | undefined = completedResult
    ? { result: completedResult, status: "completed" }
    : undefined;

  return {
    claim: vi.fn(async (input) => {
      if (record?.status === "completed") {
        return { kind: "completed" as const, result: record.result };
      }

      if (record?.status === "running") {
        return { kind: "running" as const };
      }

      record = { claimToken: input.claimToken, status: "running" };
      return { kind: "claimed" as const };
    }),
    complete: vi.fn(async (input) => {
      if (
        record?.status !== "running" ||
        record.claimToken !== input.claimToken
      ) {
        return false;
      }

      record = { result: input.result, status: "completed" };
      return true;
    }),
    findCompleted: vi.fn(async () =>
      record?.status === "completed" ? record.result : undefined,
    ),
  };
}

function createValidModelResponse() {
  const assessment: ChatAgentAssessment = {
    direction: "provide_response",
    reasoningSummary: "客户仍在等待问题处理",
    outcome: "response_needed",
  };

  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(assessment) } }],
    }),
    { status: 200 },
  );
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

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
