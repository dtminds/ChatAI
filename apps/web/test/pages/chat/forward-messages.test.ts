import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/pages/chat/chat-types";
import { forwardMessagesToRecipients } from "@/pages/chat/lib/forward-messages";
import type { MessageForwardRecipient } from "@/pages/chat/lib/message-forward";

const { sendTextMessageMock, getOrCreateConversationMock } = vi.hoisted(() => ({
  getOrCreateConversationMock: vi.fn(),
  sendTextMessageMock: vi.fn(),
}));

vi.mock("@/pages/chat/api/workbench-gateway", () => ({
  sendTextMessage: sendTextMessageMock,
}));

vi.mock("@/pages/chat/api/workbench-service", () => ({
  getWorkbenchService: () => ({
    getOrCreateConversation: getOrCreateConversationMock,
  }),
}));

function createTextMessage(text: string, key: string): ChatMessage {
  return {
    author: "客服",
    content: { text, type: "text" },
    conversationId: "conv-1",
    isOwnMessage: true,
    role: "agent",
    sender: { id: "agent-1", name: "客服" },
    sentAt: "2026-06-25T10:00:00.000Z",
    status: "sent",
    uiMessageKey: key,
  };
}

const recipient: MessageForwardRecipient = {
  avatar: "",
  conversationId: "conv-target",
  id: "single:ext-1",
  mode: "single",
  name: "客户甲",
  thirdExternalUserId: "ext-1",
};

describe("forwardMessagesToRecipients", () => {
  beforeEach(() => {
    sendTextMessageMock.mockReset();
    getOrCreateConversationMock.mockReset();
    sendTextMessageMock.mockResolvedValue({ optNo: "opt-1", status: "accepted" });
  });

  it("waits between each send with the configured delay", async () => {
    const sleep = vi.fn(async () => undefined);
    const getSendDelayMs = vi.fn(() => 500);
    const messages = [
      createTextMessage("第一条", "msg-1"),
      createTextMessage("第二条", "msg-2"),
      createTextMessage("第三条", "msg-3"),
    ];

    await forwardMessagesToRecipients(
      {
        comment: "请查收",
        messages,
        recipients: [recipient],
        seatId: "seat-1",
      },
      { getSendDelayMs, sleep },
    );

    expect(sendTextMessageMock).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(getSendDelayMs).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 500);
    expect(sendTextMessageMock.mock.calls[3]?.[0]).toMatchObject({
      segment: { text: "请查收", type: "text" },
    });
  });

  it("caps recipients and messages to the forward limits", async () => {
    const sleep = vi.fn(async () => undefined);
    const recipients = Array.from({ length: 12 }, (_, index) => ({
      ...recipient,
      conversationId: `conv-${index}`,
      id: `single:ext-${index}`,
      name: `客户${index}`,
      thirdExternalUserId: `ext-${index}`,
    }));
    const messages = Array.from({ length: 25 }, (_, index) =>
      createTextMessage(`消息${index}`, `msg-${index}`),
    );

    await forwardMessagesToRecipients(
      {
        messages,
        recipients,
        seatId: "seat-1",
      },
      { getSendDelayMs: () => 500, sleep },
    );

    expect(sendTextMessageMock).toHaveBeenCalledTimes(9 * 20);
  });
});
