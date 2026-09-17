import type {
  ChatAgentAssessment,
  ChatAgentPreflightRequest,
  WorkbenchMessageDto,
} from "@chatai/contracts";
import { describe, expect, it, vi } from "vitest";
import type {
  MysqlChatAgentPreflightRepository,
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
    const repository = createMessageRepository([
      createMessage({ senderType: "customer", seq: 20 }),
    ]);
    const resultRepository = createResultRepository();
    const service = new ChatAgentPreflightService({
      repository,
      resultRepository,
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
    expect(resultRepository.insert).toHaveBeenCalledTimes(1);
  });

  it("does not assess an older customer message after later conversation activity", async () => {
    const repository = createMessageRepository([
      createMessage({ senderType: "customer", seq: 20 }),
      createMessage({ createdAt: 2_000, senderType: "agent", seq: 21 }),
    ]);
    const resultRepository = createResultRepository();
    const fetchMock = vi.fn();
    const service = new ChatAgentPreflightService({
      apiKey: "test-key",
      fetch: fetchMock,
      repository,
      resultRepository,
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
    expect(resultRepository.insert).not.toHaveBeenCalled();
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

  it("sends images as multimodal content and saves model usage", async () => {
    const imageUrl = "https://example.com/customer.png";
    const repository = createMessageRepository([
      createMessage({
        content: { alt: "商品照片", fileUrl: imageUrl },
        contentType: "image",
        rawMsgtype: "image",
        senderType: "customer",
        seq: 20,
      }),
    ]);
    const fetchMock = vi.fn().mockResolvedValue(
      createModelResponse(
        {
          direction: "provide_response",
          reasoningSummary: "客户发送商品图片，等待进一步判断",
          outcome: "response_needed",
        },
        {
          completion_tokens: 26,
          prompt_tokens: 118,
          total_tokens: 144,
        },
      ),
    );
    const resultRepository = createResultRepository();
    const service = new ChatAgentPreflightService({
      apiKey: "test-key",
      fetch: fetchMock,
      repository,
      resultRepository,
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
    expect(resultRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenUsage: {
          completion_tokens: 26,
          prompt_tokens: 118,
          total_tokens: 144,
        },
      }),
    );
  });

  it("reuses a persisted assessment without loading context or invoking the model", async () => {
    const persistedResult: StoredChatAgentPreflightResult = {
      assessment: {
        direction: "provide_response",
        reasoningSummary: "客户继续追问退款到账进度",
        outcome: "response_needed",
      },
      source: "model",
    };
    const repository = createMessageRepository([
      createMessage({ senderType: "customer", seq: 20 }),
    ]);
    const resultRepository = createResultRepository(persistedResult);
    const fetchMock = vi.fn();
    const service = new ChatAgentPreflightService({
      apiKey: "test-key",
      fetch: fetchMock,
      repository,
      resultRepository,
    });

    const response = await service.assess(9001, request);

    expect(response).toEqual({
      assessment: persistedResult.assessment,
      conversationId: request.conversationId,
      evaluatedThroughMessageId: request.triggerMessageId,
      nextAction: "confirm",
      source: "model",
    });
    expect(repository.listMessageContext).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(resultRepository.insert).not.toHaveBeenCalled();
  });

  it("cancels the model request without saving a result when the caller aborts", async () => {
    const fetchStarted = createDeferred<void>();
    const fetchMock = vi.fn((_: unknown, init?: RequestInit) => {
      fetchStarted.resolve();
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("The operation was aborted", "AbortError")),
          { once: true },
        );
      });
    });
    const resultRepository = createResultRepository();
    const service = new ChatAgentPreflightService({
      apiKey: "test-key",
      fetch: fetchMock,
      repository: createMessageRepository([
        createMessage({ senderType: "customer", seq: 20 }),
      ]),
      resultRepository,
    });
    const abortController = new AbortController();

    const operation = service.assess(9001, request, abortController.signal);
    await fetchStarted.promise;
    abortController.abort();

    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    expect(resultRepository.insert).not.toHaveBeenCalled();
  });

  it("returns and reuses the conservative fallback when the automatic budget is exhausted", async () => {
    const limiter = { reserve: vi.fn().mockResolvedValue(false) };
    const fetchMock = vi.fn();
    const resultRepository = createResultRepository();
    const service = new ChatAgentPreflightService({
      apiKey: "test-key",
      automaticUsageLimiter: limiter,
      fetch: fetchMock,
      repository: createMessageRepository([
        createMessage({ senderType: "customer", seq: 20 }),
      ]),
      resultRepository,
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

  it("continues with the model when the automatic limiter is unavailable", async () => {
    const limiter = {
      reserve: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
    };
    const fetchMock = vi.fn().mockResolvedValue(createValidModelResponse());
    const service = new ChatAgentPreflightService({
      apiKey: "test-key",
      automaticUsageLimiter: limiter,
      fetch: fetchMock,
      repository: createMessageRepository([
        createMessage({ senderType: "customer", seq: 20 }),
      ]),
      resultRepository: createResultRepository(),
    });

    const response = await service.assess(9001, request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.source).toBe("model");
  });

  it("saves a fallback with usage when the model response is invalid", async () => {
    const resultRepository = createResultRepository();
    const service = new ChatAgentPreflightService({
      apiKey: "test-key",
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "not json" } }],
            usage: { completion_tokens: 3, prompt_tokens: 80, total_tokens: 83 },
          }),
          { status: 200 },
        ),
      ),
      repository: createMessageRepository([
        createMessage({ senderType: "customer", seq: 20 }),
      ]),
      resultRepository,
    });

    const response = await service.assess(9001, request);

    expect(response).toMatchObject({
      assessment: {
        direction: "handle_request",
        outcome: "response_needed",
      },
      source: "fallback",
    });
    expect(resultRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenUsage: {
          completion_tokens: 3,
          prompt_tokens: 80,
          total_tokens: 83,
        },
      }),
    );
  });
});

type ResultRepository = Pick<
  MysqlChatAgentPreflightRepository,
  "find" | "insert"
>;

function createResultRepository(initial?: StoredChatAgentPreflightResult) {
  let stored = initial;
  const find = vi.fn(
    async (_input: Parameters<ResultRepository["find"]>[0]) => stored,
  );
  const insert = vi.fn(
    async (input: Parameters<ResultRepository["insert"]>[0]) => {
      if (stored) return false;
      stored = input.result;
      return true;
    },
  );

  return { find, insert };
}

function createMessageRepository(messages: WorkbenchMessageDto[]) {
  return {
    listMessageContext: vi.fn().mockResolvedValue({
      messages,
      targetMessageId: request.triggerMessageId,
    }),
  };
}

function createModelResponse(
  assessment: ChatAgentAssessment,
  usage?: Record<string, unknown>,
) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(assessment) } }],
      ...(usage ? { usage } : {}),
    }),
    { status: 200 },
  );
}

function createValidModelResponse() {
  return createModelResponse({
    direction: "provide_response",
    reasoningSummary: "客户仍在等待问题处理",
    outcome: "response_needed",
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
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
