import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/pages/chat/chat-types";
import { useMessageForward } from "@/pages/chat/hooks/use-message-forward";
import { getMessageFeedItemKey } from "@/pages/chat/lib/message-feed-key";

function createTextMessage(): ChatMessage {
  return {
    author: "客服",
    content: { text: "你好", type: "text" },
    conversationId: "conv-1",
    isOwnMessage: true,
    role: "agent",
    sender: { id: "agent-1", name: "客服" },
    sentAt: "2026-06-25T10:00:00.000Z",
    status: "sent",
    uiMessageKey: "msg-1",
  };
}

function MessageForwardHarness({ message }: { message: ChatMessage }) {
  const messageForward = useMessageForward({ seatId: "seat-1" });
  const messageKey = getMessageFeedItemKey(message);

  return (
    <div>
      <button
        onClick={() => messageForward.enterMultiSelectMode(message)}
        type="button"
      >
        多选
      </button>
      <output aria-label="多选模式">
        {messageForward.multiSelectMode ? "on" : "off"}
      </output>
      <output aria-label="当前消息选中">
        {messageForward.selectedMessageKeySet.has(messageKey) ? "yes" : "no"}
      </output>
    </div>
  );
}

describe("useMessageForward", () => {
  it("selects the source message when entering multi-select mode from it", async () => {
    const user = userEvent.setup();
    const message = createTextMessage();

    render(<MessageForwardHarness message={message} />);

    await user.click(screen.getByRole("button", { name: "多选" }));

    expect(screen.getByLabelText("多选模式")).toHaveTextContent("on");
    expect(screen.getByLabelText("当前消息选中")).toHaveTextContent("yes");
  });
});
