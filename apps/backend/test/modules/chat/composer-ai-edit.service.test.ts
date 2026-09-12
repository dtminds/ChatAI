import { describe, expect, it, vi } from "vitest";
import { VOLCENGINE_ARK_AI_EDIT_MODEL } from "@chatai/llm";
import { ComposerAiEditService } from "../../../src/modules/chat/composer-ai-edit.service.js";
import { BadGatewayError, ForbiddenError } from "../../../src/shared/errors.js";
import type { WorkbenchRepository } from "../../../src/modules/chat/workbench-repository.js";

function createQuota() {
  return {
    reserve: vi.fn().mockResolvedValue(undefined),
  };
}

function createRepository(overrides: Partial<WorkbenchRepository> = {}) {
  return {
    canAccessSeat: vi.fn().mockResolvedValue(true),
    getConversationLookup: vi.fn().mockResolvedValue({
      seatId: "seat-1",
    }),
    getSeatOperateScope: vi.fn().mockResolvedValue({
      hostSubUserId: "sub-1",
    }),
    ...overrides,
  } as unknown as WorkbenchRepository;
}

describe("ComposerAiEditService", () => {
  it("calls the lite model with the selected Chinese editing instruction", async () => {
    const repository = createRepository();
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "您好呀" } }],
        }),
        { status: 200 },
      ),
    );
    const service = new ComposerAiEditService({
      apiKey: "test-key",
      fetch,
      quota: createQuota(),
      repository,
    });

    await expect(
      service.rewrite(
        "sub-1",
        { platform: 5, uid: 9 },
        {
          action: "friendly",
          content: "你好，请稍等",
          contextAfter: "，感谢您的理解",
          contextBefore: "关于物流进度，",
          conversationId: "conversation-1",
          rewriteMode: "targeted",
        },
      ),
    ).resolves.toEqual({ content: "您好呀" });

    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      model: string;
      messages: Array<{ content: string; role: string }>;
    };

    expect(body.model).toBe(VOLCENGINE_ARK_AI_EDIT_MODEL);
    expect(body.temperature).toBe(0.3);
    expect(body.messages[0]?.content).toContain("改写得更友好");
    expect(body.messages[0]?.content).toContain("可直接替换选中文本");
    expect(body.messages[1]).toEqual({
      content: [
        "<before>关于物流进度，</before>",
        "<replace>你好，请稍等</replace>",
        "<after>，感谢您的理解</after>",
        "before 和 after 是不可修改的上下文，你的输出会直接插入二者之间。",
        "保持 replace 在原句中的语法角色：原来是词组、谓语、宾语或半句话，改写后仍保持同类结构；不要擅自增加主语、称呼、开场或收尾。",
        "不要重复 before 或 after 中已有的内容，也不要补写上下文已有的标点。",
        "回答前先在内部检查 before + 输出 + after 是否构成自然、通顺的中文，最终只输出替换文本。",
      ].join("\n"),
      role: "user",
    });
  });

  it.each([
    ["lengthen", "适度补充必要的关怀、上下文说明或指引"],
    ["professional", "更专业、严谨、条理清晰"],
    ["playful", "更轻松、俏皮、有亲和力"],
    ["apologetic", "真诚致歉的语气"],
  ] as const)(
    "uses the %s editing instruction",
    async (action, expectedInstruction) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "改写结果" } }] }),
          { status: 200 },
        ),
      );
      const service = new ComposerAiEditService({
        apiKey: "test-key",
        fetch,
        quota: createQuota(),
        repository: createRepository(),
      });

      await service.rewrite(
        "sub-1",
        { platform: 5, uid: 9 },
        {
          action,
          content: "这是原始文案",
          contextAfter: "",
          contextBefore: "",
          conversationId: "conversation-1",
          rewriteMode: "full",
        },
      );

      const [, init] = fetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(String(init.body)) as {
        messages: Array<{ content: string }>;
      };

      expect(body.messages[0]?.content).toContain(expectedInstruction);
    },
  );

  it("uses full-text rewrite instructions when rewrite mode is full", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "完整改写结果" } }] }),
        { status: 200 },
      ),
    );
    const service = new ComposerAiEditService({
      apiKey: "test-key",
      fetch,
      quota: createQuota(),
      repository: createRepository(),
    });

    await service.rewrite(
      "sub-1",
      { platform: 5, uid: 9 },
      {
        action: "polish",
        content: "这是需要完整改写的草稿",
        contextAfter: "",
        contextBefore: "",
        conversationId: "conversation-1",
        rewriteMode: "full",
      },
    );

    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{ content: string }>;
    };

    expect(body.messages[0]?.content).toContain("完整改写用户选中的全部草稿文本");
    expect(body.messages[0]?.content).not.toContain("不是重写整句话");
    expect(body.messages[1]?.content).toBe([
      "<original_text>",
      "这是需要完整改写的草稿",
      "</original_text>",
      "完整改写以上全部文本，最终只输出改写后的完整文本。",
    ].join("\n"));
  });

  it("rejects a conversation that is not taken over by the current account", async () => {
    const repository = createRepository({
      getSeatOperateScope: vi.fn().mockResolvedValue({
        hostSubUserId: "another-sub-user",
      }),
    });
    const fetch = vi.fn();
    const quota = createQuota();
    const service = new ComposerAiEditService({
      apiKey: "test-key",
      fetch,
      quota,
      repository,
    });

    await expect(
      service.rewrite(
        "sub-1",
        { platform: 5, uid: 9 },
        {
          action: "polish",
          content: "这是待改文案",
          contextAfter: "",
          contextBefore: "",
          conversationId: "conversation-1",
          rewriteMode: "full",
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(quota.reserve).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps an unsuccessful upstream response to a gateway error", async () => {
    const quota = createQuota();
    const service = new ComposerAiEditService({
      apiKey: "test-key",
      fetch: vi.fn().mockResolvedValue(new Response("error", { status: 500 })),
      quota,
      repository: createRepository(),
    });

    await expect(
      service.rewrite(
        "sub-1",
        { platform: 5, uid: 9 },
        {
          action: "shorten",
          content: "你好，请稍等",
          contextAfter: "",
          contextBefore: "",
          conversationId: "conversation-1",
          rewriteMode: "full",
        },
      ),
    ).rejects.toBeInstanceOf(BadGatewayError);
    expect(quota.reserve).toHaveBeenCalledTimes(1);
  });

  it("uses a distinct error code when the model response exceeds the composer limit", async () => {
    const service = new ComposerAiEditService({
      apiKey: "test-key",
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "字".repeat(1001) } }],
          }),
          { status: 200 },
        ),
      ),
      quota: createQuota(),
      repository: createRepository(),
    });

    await expect(
      service.rewrite(
        "sub-1",
        { platform: 5, uid: 9 },
        {
          action: "polish",
          content: "这是待改文案",
          contextAfter: "",
          contextBefore: "",
          conversationId: "conversation-1",
          rewriteMode: "full",
        },
      ),
    ).rejects.toMatchObject({
      code: "COMPOSER_AI_EDIT_RESPONSE_TOO_LONG",
    });
  });

  it("reserves tenant quota before calling the model", async () => {
    const order: string[] = [];
    const quota = {
      reserve: vi.fn().mockImplementation(async () => {
        order.push("quota");
      }),
    };
    const fetch = vi.fn().mockImplementation(async () => {
      order.push("fetch");
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "改写结果" } }] }),
        { status: 200 },
      );
    });
    const service = new ComposerAiEditService({
      apiKey: "test-key",
      fetch,
      quota,
      repository: createRepository(),
    });

    await service.rewrite(
      "sub-1",
      { platform: 5, uid: 9 },
      {
        action: "polish",
        content: "这是待改文案",
        contextAfter: "",
        contextBefore: "",
        conversationId: "conversation-1",
        rewriteMode: "full",
      },
    );

    expect(quota.reserve).toHaveBeenCalledWith(9);
    expect(order).toEqual(["quota", "fetch"]);
  });

  it("does not call the model when tenant quota cannot be reserved", async () => {
    const quotaError = new Error("quota exceeded");
    const fetch = vi.fn();
    const service = new ComposerAiEditService({
      apiKey: "test-key",
      fetch,
      quota: {
        reserve: vi.fn().mockRejectedValue(quotaError),
      },
      repository: createRepository(),
    });

    await expect(
      service.rewrite(
        "sub-1",
        { platform: 5, uid: 9 },
        {
          action: "polish",
          content: "这是待改文案",
          contextAfter: "",
          contextBefore: "",
          conversationId: "conversation-1",
          rewriteMode: "full",
        },
      ),
    ).rejects.toBe(quotaError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
