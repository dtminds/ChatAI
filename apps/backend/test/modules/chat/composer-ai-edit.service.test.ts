import { describe, expect, it, vi } from "vitest";
import { VOLCENGINE_ARK_AI_EDIT_MODEL } from "@chatai/llm";
import { ComposerAiEditService } from "../../../src/modules/chat/composer-ai-edit.service.js";
import { BadGatewayError, ForbiddenError } from "../../../src/shared/errors.js";
import type { WorkbenchRepository } from "../../../src/modules/chat/workbench-repository.js";

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
      repository,
    });

    await expect(
      service.rewrite(
        "sub-1",
        { platform: 5, uid: 9 },
        {
          action: "polite",
          content: "你好，请稍等",
          conversationId: "conversation-1",
        },
      ),
    ).resolves.toEqual({ content: "您好呀" });

    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      model: string;
      messages: Array<{ content: string; role: string }>;
    };

    expect(body.model).toBe(VOLCENGINE_ARK_AI_EDIT_MODEL);
    expect(body.messages[0]?.content).toContain("改写得更礼貌");
    expect(body.messages[1]).toEqual({
      content: "<original_text>\n你好，请稍等\n</original_text>",
      role: "user",
    });
  });

  it("rejects a conversation that is not taken over by the current account", async () => {
    const repository = createRepository({
      getSeatOperateScope: vi.fn().mockResolvedValue({
        hostSubUserId: "another-sub-user",
      }),
    });
    const fetch = vi.fn();
    const service = new ComposerAiEditService({
      apiKey: "test-key",
      fetch,
      repository,
    });

    await expect(
      service.rewrite(
        "sub-1",
        { platform: 5, uid: 9 },
        {
          action: "polish",
          content: "你好",
          conversationId: "conversation-1",
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps an unsuccessful upstream response to a gateway error", async () => {
    const service = new ComposerAiEditService({
      apiKey: "test-key",
      fetch: vi.fn().mockResolvedValue(new Response("error", { status: 500 })),
      repository: createRepository(),
    });

    await expect(
      service.rewrite(
        "sub-1",
        { platform: 5, uid: 9 },
        {
          action: "shorten",
          content: "你好，请稍等",
          conversationId: "conversation-1",
        },
      ),
    ).rejects.toBeInstanceOf(BadGatewayError);
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
      repository: createRepository(),
    });

    await expect(
      service.rewrite(
        "sub-1",
        { platform: 5, uid: 9 },
        {
          action: "polish",
          content: "你好",
          conversationId: "conversation-1",
        },
      ),
    ).rejects.toMatchObject({
      code: "COMPOSER_AI_EDIT_RESPONSE_TOO_LONG",
    });
  });
});
