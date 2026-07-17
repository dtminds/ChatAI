import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMockWorkbenchService,
  setWorkbenchService,
} from "@/pages/chat/api/workbench-service";
import type { ChatMessage, Conversation } from "@/pages/chat/chat-types";
import { MessageForwardRecipientDialog } from "@/pages/chat/components/message-forward/message-forward-recipient-dialog";

function createTextMessage(): ChatMessage {
  return {
    author: "客服",
    content: { text: "你好", type: "text" },
    conversationId: "conv-current",
    isOwnMessage: true,
    role: "agent",
    sender: { id: "agent-1", name: "客服" },
    sentAt: "2026-06-25T10:00:00.000Z",
    status: "sent",
    uiMessageKey: "msg-1",
  };
}

function createConversation(index: number, mode: "single" | "group" = "single"): Conversation {
  return {
    accountId: "seat-1",
    bizStatus: 1,
    handoffMsgId: 0,
    customerAvatarUrl: "",
    customerId: `customer-${index}`,
    customerName: mode === "group" ? `群聊${index}` : `客户${index}`,
    id: `conv-${mode}-${index}`,
    mode,
    preview: "",
    priority: "medium",
    quietFor: "",
    thirdExternalUserId: mode === "single" ? `ext-${index}` : undefined,
    thirdGroupId: mode === "group" ? `group-${index}` : undefined,
    unread: 0,
    updatedAt: "",
    updatedAtMs: 1000 - index,
  };
}

function renderRecipientDialog(
  overrides: Partial<ComponentProps<typeof MessageForwardRecipientDialog>> = {},
) {
  const props: ComponentProps<typeof MessageForwardRecipientDialog> = {
    messages: [createTextMessage()],
    mode: "single",
    onOpenChange: vi.fn(),
    onSend: vi.fn(),
    open: true,
    recentConversations: [createConversation(1), createConversation(2, "group")],
    seatId: "seat-1",
    ...overrides,
  };

  render(<MessageForwardRecipientDialog {...props} />);

  return props;
}

describe("MessageForwardRecipientDialog", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("searches recipients after the debounce and shows returned contacts and groups", async () => {
    vi.useFakeTimers();
    const search = vi.fn().mockResolvedValue({
      contacts: [
        {
          avatar: "",
          name: "客户原名",
          realName: "客户原名",
          remark: "客户备注",
          thirdExternalUserId: "ext-search-1",
        },
      ],
      groups: [
        {
          avatar: "",
          name: "测试群",
          remark: "群备注",
          thirdGroupId: "group-search-1",
        },
      ],
    });
    setWorkbenchService({
      ...createMockWorkbenchService(),
      search,
    });

    renderRecipientDialog();

    fireEvent.change(screen.getByRole("textbox", { name: "搜索联系人或群聊" }), {
      target: { value: "测试" },
    });
    await act(() => vi.advanceTimersByTimeAsync(249));

    expect(search).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(search).toHaveBeenCalledWith("seat-1", "测试");
    await act(() => Promise.resolve());

    expect(screen.getByText("客户备注（客户原名）")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "群备注" })).toBeInTheDocument();
  });

  it("enables send only after selecting a recipient and submits selected recipients", async () => {
    const user = userEvent.setup();
    const props = renderRecipientDialog();
    const sendButton = screen.getByRole("button", { name: "发送" });

    expect(sendButton).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "客户1" }));

    expect(sendButton).toBeEnabled();

    await user.type(screen.getByRole("textbox", { name: "留言" }), "请查看");
    await user.click(sendButton);

    expect(props.onSend).toHaveBeenCalledWith({
      comment: "请查看",
      recipients: [
        expect.objectContaining({
          mode: "single",
          name: "客户1",
          thirdExternalUserId: "ext-1",
        }),
      ],
    });
  });

  it("replaces the selected recipient when choosing another one", async () => {
    const user = userEvent.setup();
    const conversations = Array.from({ length: 3 }, (_, index) =>
      createConversation(index + 1),
    );
    const props = renderRecipientDialog({ recentConversations: conversations });

    await user.click(screen.getByRole("radio", { name: "客户1" }));
    await user.click(screen.getByRole("radio", { name: "客户2" }));

    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(props.onSend).toHaveBeenCalledWith({
      comment: undefined,
      recipients: [
        expect.objectContaining({
          mode: "single",
          name: "客户2",
          thirdExternalUserId: "ext-2",
        }),
      ],
    });
  });

  it("resets search, selected recipients, comment, and active tab when closed", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MessageForwardRecipientDialog
        messages={[createTextMessage()]}
        mode="single"
        onOpenChange={vi.fn()}
        onSend={vi.fn()}
        open
        recentConversations={[createConversation(1), createConversation(2, "group")]}
        seatId="seat-1"
      />,
    );

    await user.click(screen.getByRole("tab", { name: "群聊" }));
    await user.click(screen.getByRole("radio", { name: "群聊2" }));
    await user.type(screen.getByRole("textbox", { name: "搜索联系人或群聊" }), "客户");
    await user.type(screen.getByRole("textbox", { name: "留言" }), "留言内容");

    rerender(
      <MessageForwardRecipientDialog
        messages={[createTextMessage()]}
        mode="single"
        onOpenChange={vi.fn()}
        onSend={vi.fn()}
        open={false}
        recentConversations={[createConversation(1), createConversation(2, "group")]}
        seatId="seat-1"
      />,
    );
    rerender(
      <MessageForwardRecipientDialog
        messages={[createTextMessage()]}
        mode="single"
        onOpenChange={vi.fn()}
        onSend={vi.fn()}
        open
        recentConversations={[createConversation(1), createConversation(2, "group")]}
        seatId="seat-1"
      />,
    );

    expect(screen.getByRole("textbox", { name: "搜索联系人或群聊" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "留言" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "发送" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "单聊" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(within(screen.getByRole("region", { name: "已选转发对象" })).getByText(
      "暂未选择转发对象",
    )).toBeInTheDocument();
  });
});
